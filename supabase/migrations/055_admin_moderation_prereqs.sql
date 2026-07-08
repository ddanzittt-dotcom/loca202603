-- ============================================================
-- Migration 055: 관리화면(/admin) 최소 전제조건
--
-- 배경:
--   커뮤니티 관리화면(/admin)은 아래 3개 RPC 를 쓴다.
--     - is_platform_admin()                     ← 권한 판정
--     - list_community_moderation_records(...)   ← 신고/대기 기록 목록
--     - update_community_moderation_status(...)  ← 승인/반려/숨김
--   뒤 두 개는 045 에 있으나(앱 커뮤니티 기능이 동작하므로 적용됨),
--   is_platform_admin() 와 그것이 참조하는 profiles.dashboard_role /
--   dashboard_enabled 컬럼은 022(B2B 대시보드) 마이그레이션에만 있어
--   신규/B2C 환경엔 적용되지 않았을 수 있다. 022 전체(조직/RBAC/테넌트)를
--   돌리면 불필요한 B2B 스키마가 생기므로, /admin 에 필요한 최소 조각만 옮긴다.
--
-- 방식:
--   - profiles 에 dashboard_role / dashboard_enabled 컬럼 (IF NOT EXISTS)
--   - is_platform_admin() 함수 (CREATE OR REPLACE) — 022 원본과 동일
--   모두 멱등이라 022 가 이미 적용된 환경에서도 안전(무시/동일 재정의).
--
-- 적용 주의사항:
--   1. 054 이후 실행 (신규 번호 055). Supabase SQL Editor 에서 실행.
--   2. 실행 후, 본인 계정을 관리자로 지정 (아래 예시). 이메일로 uid 를 찾는다:
--        UPDATE public.profiles p
--        SET dashboard_role = 'platform_admin', dashboard_enabled = true
--        FROM auth.users u
--        WHERE u.id = p.id AND u.email = '<본인 로그인 이메일>';
--   3. list/update_community_moderation_records 가 없다는 오류가 나면
--      045_public_admin_security_gate.sql 도 함께 실행할 것(그 경우 흔치 않음).
--   4. 검증: 관리자 계정으로 로그인 후 loca.im/admin 접속 → 목록이 보이면 정상,
--      비관리자 계정은 "접근 권한이 없어요" 로 차단되면 정상.
-- ============================================================

-- 1) 권한 컬럼 (022 에서 발췌)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS dashboard_role text NOT NULL DEFAULT 'user';
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS dashboard_enabled boolean NOT NULL DEFAULT true;

-- 2) 관리자 판정 함수 (022 원본과 동일)
CREATE OR REPLACE FUNCTION public.is_platform_admin(
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = COALESCE(p_user_id, auth.uid())
      AND COALESCE(p.dashboard_enabled, true)
      AND p.dashboard_role = 'platform_admin'
  );
$$;

REVOKE ALL ON FUNCTION public.is_platform_admin(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_platform_admin(uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
