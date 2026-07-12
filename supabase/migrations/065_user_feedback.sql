-- ============================================================
-- Migration 065: 사용자 피드백 "치즈냥의 귓속말" (user_feedback)
--
-- 개요:
--   앱 상주 마스코트 치즈냥을 눌러 보내는 피드백(이야기)의 저장소 + RPC 3종.
--   테이블 직접 접근은 RLS 로 전면 차단하고, SECURITY DEFINER RPC 로만 접근한다
--   (adminModeration 의 기존 패턴과 동일).
--
--   - submit_user_feedback(...)        : 제출. ★익명(anon) 허용★ — 데모 체험 중
--                                        이탈 전 의견이 가장 귀하므로 로그인 강제하지 않음.
--                                        서버가 유일한 방어선: 카테고리 화이트리스트,
--                                        본문 길이(≤2000자), context 2KB 제한, rate limit.
--   - admin_list_feedback(...)         : 목록 + 상태별 카운트. platform_admin 전용.
--   - admin_update_feedback_status(...): 상태 변경(new/acked/resolved/spam). admin 전용.
--
-- rate limit (10분당 3건, 성공 제출 기준):
--   로그인   → 'u:' || md5(salt || uid)     (키에서 uid 역산 불가)
--   비로그인 → 'a:' || md5(salt || IP)      (원 IP 는 저장하지 않음 — 해시만)
--   IP 는 PostgREST 가 노출하는 request.headers 의 x-forwarded-for 첫 홉.
--   헤더가 없으면 클라이언트 session_id 로 폴백(약하지만 차선).
--   uid 도 해시라서 계정 탈퇴(053) 후 rate_key 로 사용자를 역추적할 수 없다.
--
-- 개인정보:
--   - user_id 는 auth.users ON DELETE SET NULL → 탈퇴 시 피드백은 익명화되어 보존.
--   - context 는 클라이언트가 보내는 화면·기기 요약(경로/뷰포트/UA 일부)만. 서버가
--     2KB 초과분은 통째로 비운다(본문이 본질).
--
-- 적용 주의사항:
--   1. 064 이후 실행 (신규 번호 065). Supabase SQL Editor 에서 실행.
--      ★ 신규 migration 은 066 부터. ★
--   2. 익명 제출을 위해 submit_user_feedback 은 anon 에도 GRANT 됨 (의도된 것).
--   3. 스모크 테스트 (SQL Editor 는 auth.uid() 가 NULL → 익명 경로):
--        SELECT public.submit_user_feedback('idea', '스모크 테스트 이야기', '{}'::jsonb, 'smoke-test');
--        SELECT id, category, body, status, rate_key FROM public.user_feedback ORDER BY created_at DESC LIMIT 3;
--        DELETE FROM public.user_feedback WHERE session_id = 'smoke-test';
--      admin RPC 는 SQL Editor 에선 admin_required 로 막힘(정상) — 앱에서 관리자
--      로그인 후 /admin 피드백 탭(4단계 배포 후)으로 확인.
--   4. 검증: 앱에서 비로그인 상태로 제출 → 행 생성 + user_id NULL 확인.
--      같은 브라우저로 연속 4번째 제출 시 rate_limited 에러면 정상.
-- ============================================================

-- 1) 테이블
CREATE TABLE IF NOT EXISTS public.user_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  session_id text,
  rate_key text NOT NULL,
  category text NOT NULL CHECK (category IN ('bug', 'idea', 'pain', 'praise')),
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'acked', 'resolved', 'spam')),
  admin_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_feedback_rate_key_recent_idx
  ON public.user_feedback (rate_key, created_at DESC);
CREATE INDEX IF NOT EXISTS user_feedback_status_idx
  ON public.user_feedback (status, created_at DESC);

-- 2) RLS — 정책 없이 enable = 모든 직접 접근 차단 (RPC 로만). 테이블 권한도 회수(이중 방어).
ALTER TABLE public.user_feedback ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.user_feedback FROM PUBLIC, anon, authenticated;

-- 3) 제출 RPC — 익명 허용, 서버측 검증 + rate limit
CREATE OR REPLACE FUNCTION public.submit_user_feedback(
  p_category text,
  p_body text,
  p_context jsonb DEFAULT '{}'::jsonb,
  p_session_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_salt constant text := 'loca_fb_v1:';
  v_uid uuid := auth.uid();
  v_body text;
  v_context jsonb;
  v_session text;
  v_ip text;
  v_key text;
  v_recent int;
  v_id uuid;
BEGIN
  -- 입력 검증 — 익명 허용이므로 서버 검증이 유일한 방어선
  IF p_category IS NULL OR p_category NOT IN ('bug', 'idea', 'pain', 'praise') THEN
    RAISE EXCEPTION 'invalid_category' USING ERRCODE = '22023';
  END IF;
  v_body := btrim(coalesce(p_body, ''));
  IF char_length(v_body) < 1 THEN
    RAISE EXCEPTION 'body_required' USING ERRCODE = '22023';
  END IF;
  IF char_length(v_body) > 2000 THEN
    RAISE EXCEPTION 'body_too_long' USING ERRCODE = '22023';
  END IF;

  -- context 2KB 제한 — 초과하면 통째로 비운다 (본문이 본질)
  v_context := coalesce(p_context, '{}'::jsonb);
  IF jsonb_typeof(v_context) <> 'object' OR pg_column_size(v_context) > 2048 THEN
    v_context := '{}'::jsonb;
  END IF;

  v_session := nullif(left(btrim(coalesce(p_session_id, '')), 64), '');

  -- rate limit 키 — 로그인: uid 해시 / 익명: IP 해시 (원값은 저장하지 않음)
  IF v_uid IS NOT NULL THEN
    v_key := 'u:' || md5(v_salt || v_uid::text);
  ELSE
    v_ip := btrim(split_part(
      coalesce(nullif(current_setting('request.headers', true), '')::json->>'x-forwarded-for', ''),
      ',', 1));
    v_key := 'a:' || md5(v_salt || coalesce(nullif(v_ip, ''), coalesce(v_session, 'unknown')));
  END IF;

  -- rate limit — 같은 키로 10분 내 3건 (성공 제출 기준)
  SELECT count(*) INTO v_recent
  FROM public.user_feedback
  WHERE rate_key = v_key AND created_at > now() - interval '10 minutes';
  IF v_recent >= 3 THEN
    RAISE EXCEPTION 'rate_limited' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.user_feedback (user_id, session_id, rate_key, category, body, context)
  VALUES (v_uid, v_session, v_key, p_category, v_body, v_context)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$$;

REVOKE ALL ON FUNCTION public.submit_user_feedback(text, text, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_user_feedback(text, text, jsonb, text) TO anon, authenticated, service_role;

-- 4) 관리자 목록 RPC — 상태 필터 + 전체 상태별 카운트(탭 뱃지용) 동시 반환
CREATE OR REPLACE FUNCTION public.admin_list_feedback(
  p_status text DEFAULT 'new',
  p_limit int DEFAULT 100
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit int := least(greatest(coalesce(p_limit, 100), 1), 200);
  v_records jsonb;
  v_counts jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'admin_required' USING ERRCODE = '42501';
  END IF;
  IF p_status IS NULL OR p_status NOT IN ('new', 'acked', 'resolved', 'spam') THEN
    RAISE EXCEPTION 'invalid_status' USING ERRCODE = '22023';
  END IF;

  SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.created_at DESC), '[]'::jsonb)
  INTO v_records
  FROM (
    SELECT f.id, f.category, f.body, f.status, f.admin_note, f.context,
           f.created_at, f.updated_at, f.user_id,
           p.nickname
    FROM public.user_feedback f
    LEFT JOIN public.profiles p ON p.id = f.user_id
    WHERE f.status = p_status
    ORDER BY f.created_at DESC
    LIMIT v_limit
  ) r;

  SELECT jsonb_build_object(
    'new',      count(*) FILTER (WHERE status = 'new'),
    'acked',    count(*) FILTER (WHERE status = 'acked'),
    'resolved', count(*) FILTER (WHERE status = 'resolved'),
    'spam',     count(*) FILTER (WHERE status = 'spam')
  ) INTO v_counts
  FROM public.user_feedback;

  RETURN jsonb_build_object('records', v_records, 'counts', v_counts, 'generated_at', now());
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_feedback(text, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_feedback(text, int) TO authenticated, service_role;

-- 5) 관리자 상태 변경 RPC — new(되돌리기 포함)/acked/resolved/spam
CREATE OR REPLACE FUNCTION public.admin_update_feedback_status(
  p_id uuid,
  p_status text,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'admin_required' USING ERRCODE = '42501';
  END IF;
  IF p_status IS NULL OR p_status NOT IN ('new', 'acked', 'resolved', 'spam') THEN
    RAISE EXCEPTION 'invalid_status' USING ERRCODE = '22023';
  END IF;

  UPDATE public.user_feedback
  SET status = p_status,
      admin_note = CASE WHEN p_note IS NOT NULL THEN nullif(left(btrim(p_note), 500), '') ELSE admin_note END,
      updated_at = now()
  WHERE id = p_id
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'record_not_found' USING ERRCODE = 'P0002';
  END IF;

  RETURN jsonb_build_object('ok', true, 'id', v_id, 'status', p_status);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_feedback_status(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_feedback_status(uuid, text, text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
