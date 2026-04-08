-- ═══════════════════════════════════════════════════
-- 013: 댓글 & 피처 생성 Rate Limit
--
-- event_comments INSERT와 map_features INSERT에
-- 분당 최대 횟수를 제한하여 스팸/어뷰징을 방지한다.
--
-- 방식: RLS INSERT 정책에 rate limit 조건 추가
-- (기존 invitation_code_attempts 패턴과 동일)
-- ═══════════════════════════════════════════════════

-- ───────────────────────────────────
-- 1. 범용 Rate Limit 추적 테이블
-- ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.rate_limit_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_key    text NOT NULL,          -- 'u:{user_id}' 또는 's:{session_id}'
  action_type text NOT NULL,          -- 'comment_create', 'feature_create'
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_log_lookup
  ON public.rate_limit_log(user_key, action_type, created_at);

ALTER TABLE public.rate_limit_log ENABLE ROW LEVEL SECURITY;
-- 클라이언트 직접 접근 불필요 — RPC(SECURITY DEFINER)에서만 사용

-- 30일 이상 된 기록 정리 함수
CREATE OR REPLACE FUNCTION public.cleanup_rate_limit_log()
RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  DELETE FROM public.rate_limit_log WHERE created_at < now() - interval '30 days';
$$;


-- ───────────────────────────────────
-- 2. Rate Limit 체크 범용 함수
-- ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_user_key    text,
  p_action_type text,
  p_max_per_min integer DEFAULT 10,
  p_window      interval DEFAULT interval '1 minute'
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count integer;
BEGIN
  -- 현재 윈도우 내 횟수 조회
  SELECT COUNT(*) INTO v_count
  FROM public.rate_limit_log
  WHERE user_key = p_user_key
    AND action_type = p_action_type
    AND created_at > now() - p_window;

  -- 기록 삽입
  INSERT INTO public.rate_limit_log (user_key, action_type)
  VALUES (p_user_key, p_action_type);

  RETURN v_count < p_max_per_min;
END;
$$;


-- ───────────────────────────────────
-- 3. 댓글 생성 RPC에 rate limit 적용
--    create_event_comment를 래핑
-- ───────────────────────────────────
-- 기존 create_event_comment RPC가 있으면 rate limit 래퍼를 추가한다.
-- 기존 함수 시그니처에 따라 적절히 적용.

CREATE OR REPLACE FUNCTION public.create_event_comment_safe(
  p_map_id      uuid,
  p_feature_id  uuid,
  p_body        text,
  p_author_name text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_session_id text;
  v_user_key text;
  v_allowed boolean;
BEGIN
  -- 사용자 키 결정
  IF v_user_id IS NOT NULL THEN
    v_user_key := 'u:' || v_user_id::text;
  ELSE
    v_session_id := current_setting('request.headers', true)::jsonb->>'x-session-id';
    IF v_session_id IS NULL OR v_session_id = '' THEN
      RETURN jsonb_build_object('success', false, 'error', 'no_identity');
    END IF;
    v_user_key := 's:' || v_session_id;
  END IF;

  -- Rate limit: 분당 10건
  v_allowed := public.check_rate_limit(v_user_key, 'comment_create', 10);
  IF NOT v_allowed THEN
    RETURN jsonb_build_object('success', false, 'error', 'rate_limited',
      'message', '댓글 작성이 너무 빠릅니다. 잠시 후 다시 시도해주세요.');
  END IF;

  -- 기존 create_event_comment 호출
  RETURN public.create_event_comment(p_map_id, p_feature_id, p_body, p_author_name);
END;
$$;


-- ───────────────────────────────────
-- 4. 피처 생성 Rate Limit
--    map_features INSERT 정책에 조건 추가
-- ───────────────────────────────────

-- 피처 생성 rate limit 체크 함수 (RLS 정책에서 호출)
CREATE OR REPLACE FUNCTION public.feature_insert_rate_ok()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_count integer;
BEGIN
  IF v_user_id IS NULL THEN RETURN false; END IF;

  -- 최근 1분간 생성한 피처 수
  SELECT COUNT(*) INTO v_count
  FROM public.map_features
  WHERE created_by = v_user_id
    AND created_at > now() - interval '1 minute';

  -- 분당 30건 제한 (일반 사용에서 충분, 스팸 차단)
  RETURN v_count < 30;
END;
$$;

-- 기존 map_features INSERT 정책에 rate limit 조건 추가
-- (기존 정책이 있으면 drop 후 재생성)
DO $$
BEGIN
  -- 기존 INSERT 정책 삭제 시도 (없으면 무시)
  BEGIN
    DROP POLICY IF EXISTS "Users can insert features in own maps" ON public.map_features;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  -- rate limit 포함 INSERT 정책 생성
  CREATE POLICY "Users can insert features in own maps"
    ON public.map_features
    FOR INSERT
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.maps
        WHERE maps.id = map_features.map_id
          AND maps.user_id = auth.uid()
      )
      AND public.feature_insert_rate_ok()
    );
END;
$$;


-- ═══════════════════════════════════════════════════
-- 적용 주의사항
-- ═══════════════════════════════════════════════════
-- 1. 이 마이그레이션은 Supabase SQL Editor에서 실행
-- 2. create_event_comment_safe는 기존 create_event_comment의 래퍼
--    → 프론트에서 호출 함수명을 변경하거나, 기존 함수를 이 함수로 교체
-- 3. map_features INSERT 정책이 기존과 다르면 조건 조정 필요
-- 4. cleanup_rate_limit_log()를 주기적으로 호출 (pg_cron 또는 수동)
