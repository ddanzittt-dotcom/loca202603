-- ============================================================
-- 058_profiles_hide_admin_columns
-- profiles 공개 SELECT 에서 관리자 플래그(dashboard_role/dashboard_enabled) 를 가린다.
--
-- 배경: profiles_select_public 정책이 using(true) 라 anon/authenticated 가
-- 전체 컬럼을 조회할 수 있었고, dashboard_role 로 "누가 platform_admin 인지"
-- 열거가 가능했다(저위험 정보노출). RLS 는 행(row) 단위라 컬럼을 못 가리므로
-- 컬럼 단위 GRANT 로 조인다.
--
-- is_platform_admin() 은 SECURITY DEFINER 라 소유자 권한으로 실행 → 컬럼 권한을
-- 회수해도 관리자 판정은 그대로 동작한다. 관리자 통계 함수(056/057)도 동일.
--
-- ⚠️ 적용 후 클라이언트는 profiles 에 select('*') 를 쓰면 안 된다
--    (회수된 컬럼 포함 → permission denied). 앱 코드는 공개 컬럼만 명시 select 하도록 함께 수정됨.
-- ============================================================

-- 테이블 전체 SELECT 회수 후, 공개 컬럼만 다시 부여
REVOKE SELECT ON public.profiles FROM anon, authenticated;

GRANT SELECT (
  id,
  nickname,
  avatar_url,
  bio,
  slug,
  link,
  created_at,
  updated_at
) ON public.profiles TO anon, authenticated;

-- 참고(#5 재현성): is_public 은 046(제거된 마이그레이션)에서 추가·048에서 DROP 되어
--   fresh replay 엔 존재하지 않는다. 이 GRANT 에 있으면 058 이 fresh replay 에서 실패하므로
--   목록에서 제외했다. 컬럼 생성+공개 SELECT 는 071_profiles_is_public_baseline 에서 멱등 처리.
-- dashboard_role / dashboard_enabled 는 의도적으로 미부여 → API 에서 조회 불가.
-- (UPDATE/INSERT 권한과 RLS 정책은 변경 없음)

NOTIFY pgrst, 'reload schema';
