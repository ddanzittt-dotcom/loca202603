-- ============================================================
-- 077_profiles_auto_slug
-- 목적: 모든 계정에 "유일한 공개 아이디(slug)"를 보장한다.
--   협업자 초대를 '아이디로 검색'하려면 모두가 아이디를 가져야 한다.
--
-- 정책:
--   - 이메일 가입: 사용자가 가입 폼에서 아이디를 직접 고른다(실시간 중복확인).
--     선택한 아이디를 signUp 메타(slug)로 넘기면 이 트리거가 그대로 사용한다.
--   - OAuth(카카오/구글) 가입: 폼이 없으므로 이메일/닉네임 기반으로 자동 생성.
--     이후 내 정보 관리에서 원하는 아이디로 수정.
--   - 기존 계정: 아래 백필로 채운 뒤, 역시 내 정보 관리에서 수정 가능.
--   - 이메일은 개인정보(auth.users)라 검색/식별 키로 쓰지 않는다. 공개 아이디(slug)로 통일.
--
-- 이 마이그레이션이 하는 일 (멱등):
--   (1) generate_unique_profile_slug(base) : 충돌 없는 유일 slug 생성 헬퍼.
--   (2) is_slug_available(slug)            : 중복확인 RPC(boolean). anon/authenticated 실행 허용.
--                                            profiles 행을 노출하지 않고 사용 가능 여부만 반환.
--   (3) 기존 slug NULL/'' 계정 전부 백필.
--   (4) handle_new_user() 를 061 기반으로 확장 — 가입 시 메타 slug 우선, 없으면 자동 생성.
--
-- 적용 주의사항:
--   1. 075/076 이후 신규 077. Supabase SQL Editor(postgres 롤)에서 순서대로 실행.
--   2. 백필 DO 블록은 auth.users 를 읽으므로 postgres 롤 필수(anon/authenticated 불가).
--   3. 멱등: 재실행해도 이미 slug 있는 행은 건너뛴다. 함수는 CREATE OR REPLACE.
--   4. 라이브 적용 후 확인:
--        - 이메일 가입: 폼에서 고른 아이디로 profiles.slug 가 생성된다.
--        - OAuth 가입/기존 계정: slug 가 NULL 이 아니다(자동/백필).
--        - 협업자 관리: 아이디로 검색해 편집자 초대가 된다.
-- ============================================================

-- (1) 유일 slug 생성 헬퍼 -----------------------------------------------------
-- base 를 [a-z0-9_] 로 정규화 후, 이미 존재하면 _2, _3... 접미사로 유일화.
CREATE OR REPLACE FUNCTION public.generate_unique_profile_slug(p_base text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  v_base   text;
  v_slug   text;
  v_suffix int := 1;
begin
  v_base := lower(coalesce(p_base, ''));
  v_base := regexp_replace(v_base, '[^a-z0-9]+', '_', 'g'); -- 허용문자 외 → _
  v_base := regexp_replace(v_base, '_+', '_', 'g');         -- 연속 _ 축약
  v_base := btrim(v_base, '_');                             -- 양끝 _ 제거
  if v_base is null or length(v_base) < 2 then
    v_base := 'loca';
  end if;
  if length(v_base) > 20 then
    v_base := substring(v_base from 1 for 20);
  end if;

  v_slug := v_base;
  while exists (select 1 from public.profiles where slug = v_slug) loop
    v_suffix := v_suffix + 1;
    v_slug := v_base || '_' || v_suffix::text;
  end loop;
  return v_slug;
end;
$$;

-- (2) 중복확인 RPC ------------------------------------------------------------
-- 형식이 올바르고(소문자·숫자·밑줄 2~20자) 아직 아무도 안 쓰면 true.
-- boolean 만 반환 → 누가 어떤 아이디를 쓰는지/이메일 등은 절대 노출하지 않는다.
CREATE OR REPLACE FUNCTION public.is_slug_available(p_slug text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  select case
    when p_slug is null then false
    when lower(btrim(p_slug)) !~ '^[a-z0-9_]{2,20}$' then false
    else not exists (
      select 1 from public.profiles where slug = lower(btrim(p_slug))
    )
  end;
$$;

GRANT EXECUTE ON FUNCTION public.is_slug_available(text) TO anon, authenticated;

-- (3) 기존 NULL/'' slug 백필 --------------------------------------------------
DO $$
declare
  r      record;
  v_base text;
begin
  for r in
    select p.id, p.nickname, u.email
    from public.profiles p
    left join auth.users u on u.id = p.id
    where p.slug is null or btrim(p.slug) = ''
    order by p.created_at
  loop
    v_base := coalesce(
      nullif(split_part(coalesce(r.email, ''), '@', 1), ''),
      r.nickname,
      'loca'
    );
    update public.profiles
      set slug = public.generate_unique_profile_slug(v_base),
          updated_at = now()
      where id = r.id;
  end loop;
end $$;

-- (4) 가입 트리거 확장 (061 기반 + slug) -------------------------------------
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
  v_nick        text    := coalesce(meta ->> 'name', split_part(new.email, '@', 1), 'loca-user');
  -- 가입 폼에서 고른 아이디 우선(허용문자만 남김) → 없으면 이메일/닉네임 기반.
  v_seed        text    := coalesce(
                             nullif(regexp_replace(lower(coalesce(meta ->> 'slug', '')), '[^a-z0-9_]+', '', 'g'), ''),
                             nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
                             meta ->> 'name',
                             'loca'
                           );
  v_slug        text    := public.generate_unique_profile_slug(v_seed);
begin
  begin
    insert into public.profiles (
      id, nickname, avatar_url, slug,
      terms_agreed_at, consent_version,
      marketing_consent, marketing_consent_at
    )
    values (
      new.id,
      v_nick,
      coalesce(meta ->> 'avatar_url', ''),
      v_slug,
      case when terms_ok and privacy_ok then now() else null end,
      case when terms_ok and privacy_ok then meta ->> 'consent_version' else null end,
      marketing_ok,
      case when marketing_ok then now() else null end
    )
    on conflict (id) do nothing;
  exception when unique_violation then
    -- slug 경합(동시 가입 등) 시 uuid 파생 접미사로 유일성 확보 후 재시도.
    -- (가입 자체가 절대 실패하지 않도록 하는 안전장치 — 사용자는 이후 수정 가능.)
    insert into public.profiles (
      id, nickname, avatar_url, slug,
      terms_agreed_at, consent_version,
      marketing_consent, marketing_consent_at
    )
    values (
      new.id,
      v_nick,
      coalesce(meta ->> 'avatar_url', ''),
      'loca_' || left(regexp_replace(new.id::text, '-', '', 'g'), 12),
      case when terms_ok and privacy_ok then now() else null end,
      case when terms_ok and privacy_ok then meta ->> 'consent_version' else null end,
      marketing_ok,
      case when marketing_ok then now() else null end
    )
    on conflict (id) do nothing;
  end;

  return new;
end;
$$;

NOTIFY pgrst, 'reload schema';
