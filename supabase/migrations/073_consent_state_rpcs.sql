-- ============================================================
-- 073_consent_state_rpcs
-- [P0 #6] 로그인 후 동의 게이트를 위한 본인 동의 상태 조회/기록 RPC.
--
-- 배경:
--   이메일 가입만 동의를 기록하고(AuthScreen → signUp meta → handle_new_user, 059),
--   OAuth(카카오 등) 가입이나 동의 UI 배포 이전 계정은 profiles.terms_agreed_at 이 NULL
--   이라 "동의 없이 이용" 상태가 된다. 또 CONSENT_VERSION 을 올려도 재동의 흐름이 없었다.
--   058 로 consent 컬럼은 공개 SELECT 대상이 아니라, 본인조차 일반 select 로 못 읽는다.
--   → 앱이 "이 사용자가 현재 버전 방침에 동의했는지"를 알 수 있도록 RPC 로 제공하고,
--     동의를 받으면 기록하는 RPC 를 둔다. 클라이언트는 로그인 후 미동의/구버전이면
--     차단형 동의 게이트를 띄운다(범용 — OAuth·구계정·버전 재동의 모두 커버).
--
-- 방식:
--   - get_my_consent_state(): 본인(auth.uid())의 terms_agreed_at/consent_version/marketing_consent 반환.
--   - record_my_consent(p_consent_version, p_marketing): 필수(약관+개인정보) 동의 기록 +
--       선택 마케팅. 본인 profiles 만 갱신. "현재 필수 버전"은 클라이언트(auth.js CONSENT_VERSION)가
--       전달 — 이메일 가입 경로와 동일한 소스를 사용.
--   둘 다 SECURITY DEFINER (consent 컬럼 접근/갱신 권한 확보). 066 가드 트리거는
--   dashboard 컬럼만 클램프하고 definer 실행이라 무관.
--
-- 적용: 059 이후(신규 073). Supabase SQL Editor(postgres 롤).
-- 검증: 비동의 계정 로그인 → get_my_consent_state 가 terms_agreed_at NULL 반환 →
--   앱 게이트 노출 → 동의 → record_my_consent → 재조회 시 채워지면 정상.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_my_consent_state()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'terms_agreed_at',   p.terms_agreed_at,
    'consent_version',   p.consent_version,
    'marketing_consent', COALESCE(p.marketing_consent, false)
  )
  FROM public.profiles p
  WHERE p.id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.record_my_consent(
  p_consent_version text,
  p_marketing boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_now timestamptz := now();
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'auth_required');
  END IF;
  IF NULLIF(trim(COALESCE(p_consent_version, '')), '') IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'version_required');
  END IF;

  UPDATE public.profiles
  SET terms_agreed_at      = v_now,
      consent_version      = p_consent_version,
      marketing_consent    = COALESCE(p_marketing, false),
      marketing_consent_at = CASE WHEN COALESCE(p_marketing, false) THEN v_now ELSE marketing_consent_at END
  WHERE id = v_uid;

  RETURN jsonb_build_object('success', true, 'consent_version', p_consent_version, 'at', v_now);
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_consent_state() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_consent_state() TO authenticated;
REVOKE ALL ON FUNCTION public.record_my_consent(text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_my_consent(text, boolean) TO authenticated;

NOTIFY pgrst, 'reload schema';
