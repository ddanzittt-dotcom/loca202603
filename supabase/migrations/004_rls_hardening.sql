-- ============================================================
-- LOCA RLS 보안 강화 마이그레이션 v4
-- 실행: Supabase SQL Editor에서 전체 복사 후 실행
-- ============================================================

-- -------------------------------------------------------
-- 1. invitation_codes: 코드 목록 직접 조회 차단
--    기존: 인증된 유저면 전체 코드 조회 가능 → 코드값 노출 위험
--    변경: SELECT 정책 삭제, redeem_invitation_code() RPC만 허용
--    RPC는 SECURITY DEFINER이므로 RLS를 우회함
-- -------------------------------------------------------
DROP POLICY IF EXISTS "invitation_codes_select_authenticated" ON public.invitation_codes;

-- 코드 존재 여부 확인만 필요한 경우를 위해 id/is_active만 노출 (코드값 미포함)
-- → 실제로는 RPC만 사용하므로 SELECT 정책을 아예 안 만듦
-- RLS ON + SELECT 정책 없음 = 모든 SELECT 거부

-- -------------------------------------------------------
-- 2. feature_memos: 지도 소유자가 status 변경 가능 (콘텐츠 관리)
--    기존: update 정책 없음 → 운영자도 메모 숨김/삭제 불가
--    변경: 지도 소유자가 자기 지도의 메모 status를 변경할 수 있게
-- -------------------------------------------------------
DROP POLICY IF EXISTS "memos_update_map_owner" ON public.feature_memos;
CREATE POLICY "memos_update_map_owner"
  ON public.feature_memos
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.map_features
      JOIN public.maps ON maps.id = map_features.map_id
      WHERE map_features.id = feature_memos.feature_id
        AND maps.user_id = auth.uid()
    )
  );

-- -------------------------------------------------------
-- 3. survey_responses: update/delete 명시적 거부
--    RLS ON이면 정책 없는 operation은 자동 거부되지만,
--    명시적으로 거부 정책을 만들어 의도를 문서화함
-- -------------------------------------------------------
-- (정책을 만들지 않는 것 자체가 거부이므로, 주석으로만 문서화)
-- survey_responses: UPDATE 정책 없음 → 설문 응답 수정 불가
-- survey_responses: DELETE 정책 없음 → 설문 응답 삭제 불가

-- -------------------------------------------------------
-- 4. 초대코드 무차별 대입 방지
--    RPC에 분당 시도 횟수 제한 추가
--    invitation_code_attempts 테이블로 추적
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.invitation_code_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  attempted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_code_attempts_user_time
  ON public.invitation_code_attempts(user_id, attempted_at);

ALTER TABLE public.invitation_code_attempts ENABLE ROW LEVEL SECURITY;
-- 클라이언트 접근 불필요 — RPC(SECURITY DEFINER)에서만 사용

-- RPC 교체: rate limit 추가 (분당 5회)
CREATE OR REPLACE FUNCTION public.redeem_invitation_code(code_text text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_code_id uuid;
  v_max_uses integer;
  v_used_count integer;
  v_user_id uuid := auth.uid();
  v_recent_attempts integer;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  -- Rate limit: 최근 1분간 시도 횟수 확인
  SELECT COUNT(*) INTO v_recent_attempts
  FROM public.invitation_code_attempts
  WHERE user_id = v_user_id
    AND attempted_at > now() - interval '1 minute';

  -- 시도 기록 삽입
  INSERT INTO public.invitation_code_attempts (user_id) VALUES (v_user_id);

  IF v_recent_attempts >= 5 THEN
    RETURN jsonb_build_object('success', false, 'error', 'rate_limited');
  END IF;

  -- 코드 조회
  SELECT id, max_uses, used_count INTO v_code_id, v_max_uses, v_used_count
  FROM public.invitation_codes
  WHERE code = code_text AND is_active = true
  FOR UPDATE;

  IF v_code_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_code');
  END IF;

  -- 사용 횟수 초과 확인
  IF v_max_uses IS NOT NULL AND v_used_count >= v_max_uses THEN
    RETURN jsonb_build_object('success', false, 'error', 'code_exhausted');
  END IF;

  -- 이미 사용한 코드인지 확인
  IF EXISTS (
    SELECT 1 FROM public.invitation_redemptions
    WHERE user_id = v_user_id AND code_id = v_code_id
  ) THEN
    RETURN jsonb_build_object('success', true, 'error', 'already_redeemed');
  END IF;

  -- 사용 기록 삽입 + 카운트 증가
  INSERT INTO public.invitation_redemptions (user_id, code_id)
  VALUES (v_user_id, v_code_id);

  UPDATE public.invitation_codes SET used_count = used_count + 1 WHERE id = v_code_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- 오래된 시도 기록 자동 정리 (30일 이상)
-- 수동 실행 또는 Supabase cron으로 스케줄링
CREATE OR REPLACE FUNCTION public.cleanup_code_attempts()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  DELETE FROM public.invitation_code_attempts
  WHERE attempted_at < now() - interval '30 days';
$$;

-- -------------------------------------------------------
-- 5. announcements: 소유자가 자기 지도의 비공개 공지도 볼 수 있게
--    기존: select는 public/unlisted 지도만 → 소유자가 private 지도의 공지를 못 봄
-- -------------------------------------------------------
DROP POLICY IF EXISTS "announcements_select_public" ON public.announcements;
CREATE POLICY "announcements_select_visible_or_owner"
  ON public.announcements
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.maps
      WHERE maps.id = announcements.map_id
        AND (maps.visibility IN ('public', 'unlisted') OR maps.user_id = auth.uid())
    )
  );
