-- ============================================================
-- 061_fix_handle_new_user_consent_null
-- 059 의 handle_new_user() 버그 수정 (긴급 — 가입 전면 실패).
--
-- 증상: 회원가입 시 "Database error saving new user".
-- 원인: 동의 메타데이터가 없는 요청(예: 동의 UI 미배포 상태의 구 프론트, 또는
--   메타 키 누락)에서
--     marketing_ok := (meta ->> 'marketing_consent') = 'true'
--   가 false 가 아니라 NULL 로 평가된다(존재하지 않는 키 ->> 는 NULL, NULL = 'true' → NULL).
--   그 NULL 이 marketing_consent(NOT NULL) 컬럼에 INSERT 되어 제약 위반 →
--   트리거 실패 → auth.users INSERT 롤백 → 가입 실패.
--
-- 수정: 세 동의 플래그를 coalesce(..., false) 로 감싸 항상 boolean 확정.
--   (terms/privacy 는 CASE 에서 NULL 안전하지만 일관성/명확성을 위해 함께 감쌈)
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
declare
  meta          jsonb   := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  terms_ok      boolean := coalesce((meta ->> 'terms_agreed') = 'true', false);
  privacy_ok    boolean := coalesce((meta ->> 'privacy_agreed') = 'true', false);
  marketing_ok  boolean := coalesce((meta ->> 'marketing_consent') = 'true', false);
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

-- 트리거 재바인딩은 불필요(함수 본문만 교체). 확인용으로만 남김.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

NOTIFY pgrst, 'reload schema';
