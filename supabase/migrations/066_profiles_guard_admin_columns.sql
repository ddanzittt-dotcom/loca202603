-- ============================================================
-- 066_profiles_guard_admin_columns
-- [P0 / 출시 차단] 일반 사용자의 "관리자 자가 승격" 차단.
--
-- 배경:
--   profiles_update_self 정책(loca_v1_schema.sql:149)이 using(auth.uid()=id) 뿐 —
--   with check 도, 컬럼 제한도 없다. Postgres 는 UPDATE 에 with check 가 없으면
--   using 을 그대로 적용하므로, 로그인 사용자는 "본인 행"이기만 하면 아무 컬럼이나
--   바꿀 수 있다. 그래서 클라이언트가
--     PATCH /rest/v1/profiles?id=eq.<본인uid>  {"dashboard_role":"platform_admin","dashboard_enabled":true}
--   로 스스로를 관리자로 올려 is_platform_admin()(055) 을 통과, 모든 관리자
--   RPC(get_admin_overview / get_admin_insights / get_admin_demographics / 모더레이션)
--   와 집계 데이터에 접근할 수 있었다.
--   058 은 SELECT 만 회수해 컬럼을 "숨겼을" 뿐, 쓰기(UPDATE/INSERT)는 막지 않았다.
--
--   Postgres 의 컬럼 권한은 allowlist(추가) 라 "이 두 컬럼만 쓰기 금지"라는
--   denylist 를 GRANT 로 표현할 수 없다. → BEFORE INSERT/UPDATE 트리거로 관리자
--   컬럼 값을 "고정"하는 방식을 택한다.
--
-- 방식:
--   guard_profiles_privilege_columns():
--     호출 역할(current_user)이 anon/authenticated 일 때만 관리자 컬럼을 고정한다.
--       INSERT → dashboard_role='user', dashboard_enabled=true 로 강제
--       UPDATE → 두 컬럼을 OLD 값으로 되돌림(변경 시도 무시 = 조용한 clamp)
--     service_role / postgres(관리자 승격 SQL, handle_new_user, SECURITY DEFINER RPC)는
--     current_user 가 authenticated/anon 이 아니므로 그대로 통과한다.
--
--   ⚠️ 반드시 SECURITY INVOKER(기본값) 로 둔다. SECURITY DEFINER 로 만들면 함수 내부의
--      current_user 가 "함수 소유자"가 되어 가드가 무력화된다.
--
--   에러(RAISE) 대신 조용히 clamp 하는 이유: 정상 클라이언트 업데이트를 절대 깨지
--   않기 위해서다. 클라이언트의 유일한 profiles 쓰기 경로인
--   updateProfileRecord(mapService.write.js) 는 이 두 컬럼을 payload 에 담지 않으므로
--   영향이 없다. raw PATCH 로 두 컬럼을 넣어도 200 응답과 함께 값은 바뀌지 않는다.
--
-- 적용 주의사항:
--   1. 055 이후(신규 066). dashboard_role/dashboard_enabled 컬럼을 전제한다 —
--      없으면 0) 단계에서 즉시 에러로 중단.
--   2. Supabase SQL Editor 에서 "파일 전체"를 한 번에 실행한다(부분 선택 실행 금지).
--      멱등이라 여러 번 재실행해도 안전하다.
--   3. dollar-quote 는 이름 있는 태그($do$, $fn$)를 쓴다 — 에디터가 $$ 경계를
--      잘못 나눠 함수 본문을 top-level 로 실행하던 문제(42601 at "IF") 방지.
--   4. 적용 직후 [감사] 쿼리로 기존 관리자 전수 확인, 예상 밖 계정은 [강등]으로 정리.
-- ============================================================

-- 0) 전제 컬럼 확인 (055 미적용 환경에서 트리거가 매 쓰기마다 깨지는 것을 apply 시점에 차단)
DO $do$
DECLARE
  n int;
BEGIN
  SELECT count(*) INTO n
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'profiles'
    AND column_name IN ('dashboard_role', 'dashboard_enabled');
  IF n < 2 THEN
    RAISE EXCEPTION '066: profiles.dashboard_role / dashboard_enabled 가 필요합니다. 먼저 055 를 적용하세요.';
  END IF;
END
$do$;

-- 1) 가드 함수 (SECURITY INVOKER — 기본값. DEFINER 금지)
CREATE OR REPLACE FUNCTION public.guard_profiles_privilege_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $fn$
BEGIN
  -- 클라이언트 역할(anon/authenticated)의 요청에서만 관리자 컬럼을 고정한다.
  -- service_role / postgres 는 통과(관리자 승격·시스템 트리거·서버 RPC).
  IF current_user IN ('anon', 'authenticated') THEN
    IF TG_OP = 'INSERT' THEN
      NEW.dashboard_role := 'user';
      NEW.dashboard_enabled := true;
    ELSIF TG_OP = 'UPDATE' THEN
      NEW.dashboard_role := OLD.dashboard_role;
      NEW.dashboard_enabled := OLD.dashboard_enabled;
    END IF;
  END IF;
  RETURN NEW;
END
$fn$;

-- 2) 트리거 바인딩 (멱등)
DROP TRIGGER IF EXISTS guard_profiles_privilege_columns ON public.profiles;
CREATE TRIGGER guard_profiles_privilege_columns
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_profiles_privilege_columns();

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- [감사] 적용 후 실행 — 현재 권한 상승된 계정 전수 확인
-- (본인 관리자 계정만 나와야 정상)
-- ------------------------------------------------------------
-- SELECT p.id, u.email, p.dashboard_role, p.dashboard_enabled, p.created_at
-- FROM public.profiles p
-- JOIN auth.users u ON u.id = p.id
-- WHERE p.dashboard_role <> 'user'
-- ORDER BY p.created_at;
--
-- [강등] 위 결과에서 정당한 관리자 uid 만 남기고 나머지 강등 (uid 를 채워 실행)
-- ------------------------------------------------------------
-- UPDATE public.profiles
-- SET dashboard_role = 'user'
-- WHERE dashboard_role <> 'user'
--   AND id NOT IN ('<정당한-관리자-uid-1>' /*, '<uid-2>' */);
-- ============================================================
