-- ============================================================
-- 059_profiles_consent
-- 회원가입 시 약관·개인정보 처리방침 동의와 (선택)마케팅 수신 동의를
-- profiles 에 시각·버전과 함께 기록한다.
--
-- 배경: 기존 가입 플로우(AuthScreen)는 동의 절차가 전혀 없었다.
-- 향후 "가명·익명 통계 작성 및 제3자 제공" 목적을 개인정보 처리방침(필수 동의)에
-- 담아 운영하려면, 각 이용자가 "어느 버전 방침에 언제 동의했는지"를 남겨야
-- 소급 논란 없이 근거를 댈 수 있다.
--
-- 동의 항목 정리:
--   - 필수: 이용약관 + 개인정보 처리방침(익명 통계·제3자 제공 목적 포함)
--           → terms_agreed_at + consent_version 로 기록
--   - 선택: 마케팅 정보 수신(푸시/이메일, 정보통신망법상 별도 opt-in)
--           → marketing_consent + marketing_consent_at
--
-- 데이터 흐름: AuthScreen 체크박스 → signUp options.data(raw_user_meta_data)
--   → handle_new_user() 트리거가 profiles 로 복사(아래에서 함께 갱신).
--
-- ⚠️ 적용 순서: 이 파일은 058 다음. 신규 migration 은 060 부터.
-- ⚠️ 컬럼 GRANT: 058 에서 profiles 공개 SELECT 를 명시 컬럼으로 제한했다.
--    consent 컬럼은 본인/관리자만 필요하고 공개 열거 대상이 아니므로 anon/authenticated
--    공개 SELECT 목록에 추가하지 않는다(본인 행 접근은 소유자 RLS + 서비스 롤로 충분).
-- ============================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS terms_agreed_at        timestamptz,
  ADD COLUMN IF NOT EXISTS consent_version        text,
  ADD COLUMN IF NOT EXISTS marketing_consent      boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS marketing_consent_at   timestamptz;

COMMENT ON COLUMN public.profiles.terms_agreed_at      IS '이용약관+개인정보 처리방침(필수) 동의 시각';
COMMENT ON COLUMN public.profiles.consent_version      IS '동의한 약관/방침 버전 (예: 2026-07-09)';
COMMENT ON COLUMN public.profiles.marketing_consent    IS '마케팅 정보 수신 동의(선택)';
COMMENT ON COLUMN public.profiles.marketing_consent_at IS '마케팅 수신 동의/철회 최종 변경 시각';

-- handle_new_user 트리거 갱신: raw_user_meta_data 의 동의 플래그를 profiles 로 복사.
-- 기존 동작(nickname/avatar_url 채우기)은 유지하고 동의 컬럼만 추가한다.
-- OAuth(구글/카카오) 가입은 동의 메타가 없을 수 있어 모두 nullable/false 기본값으로 안전하게 처리.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
declare
  meta            jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  terms_ok        boolean := (meta ->> 'terms_agreed') = 'true';
  privacy_ok      boolean := (meta ->> 'privacy_agreed') = 'true';
  marketing_ok    boolean := (meta ->> 'marketing_consent') = 'true';
begin
  insert into public.profiles (
    id, nickname, avatar_url,
    terms_agreed_at, consent_version,
    marketing_consent, marketing_consent_at
  )
  values (
    new.id,
    coalesce(meta ->> 'name', split_part(new.email, '@', 1), 'loca-user'),
    coalesce(meta ->> 'avatar_url', ''),
    case when terms_ok and privacy_ok then now() else null end,
    case when terms_ok and privacy_ok then meta ->> 'consent_version' else null end,
    marketing_ok,
    case when marketing_ok then now() else null end
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

NOTIFY pgrst, 'reload schema';
