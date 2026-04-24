-- ============================================================
-- 022_dashboard_tenant_rbac 적용 확인용 SQL
-- 실행 위치: Supabase SQL Editor
-- 목적: 마이그레이션 적용 여부와 운영 데이터 상태를 빠르게 점검
-- ============================================================

-- 1) 핵심 컬럼/테이블/함수 존재 확인
SELECT
  'profiles.dashboard_role' AS item,
  EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'dashboard_role'
  ) AS ok
UNION ALL
SELECT
  'profiles.dashboard_enabled',
  EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'dashboard_enabled'
  )
UNION ALL
SELECT
  'organization_members table',
  to_regclass('public.organization_members') IS NOT NULL
UNION ALL
SELECT
  'is_platform_admin()',
  to_regprocedure('public.is_platform_admin(uuid)') IS NOT NULL
UNION ALL
SELECT
  'is_org_member()',
  to_regprocedure('public.is_org_member(uuid,text,uuid)') IS NOT NULL
UNION ALL
SELECT
  'can_view_map()',
  to_regprocedure('public.can_view_map(uuid,uuid)') IS NOT NULL
UNION ALL
SELECT
  'can_manage_map()',
  to_regprocedure('public.can_manage_map(uuid,uuid)') IS NOT NULL
ORDER BY item;

-- 2) 주요 정책 설치 확인 (RLS)
SELECT schemaname, tablename, policyname
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'organizations',
    'organization_members',
    'maps',
    'map_features',
    'feature_operator_notes',
    'view_logs',
    'event_checkins',
    'event_completions',
    'survey_responses',
    'announcements',
    'event_comments',
    'event_comment_reports',
    'map_publications',
    'map_publication_revisions',
    'map_saves',
    'map_lineage'
  )
ORDER BY tablename, policyname;

-- 3) 대시보드 접근 역할 분포
SELECT
  COALESCE(dashboard_role, 'user') AS dashboard_role,
  COALESCE(dashboard_enabled, true) AS dashboard_enabled,
  COUNT(*) AS user_count
FROM public.profiles
GROUP BY 1, 2
ORDER BY 1, 2;

-- 4) 기관 멤버십 현황
SELECT
  o.name AS organization_name,
  om.organization_id,
  om.user_id,
  om.role,
  om.status,
  om.created_at
FROM public.organization_members om
JOIN public.organizations o ON o.id = om.organization_id
ORDER BY o.name, om.role DESC, om.created_at;

-- 5) 지도-기관 연결 현황
SELECT
  m.id,
  m.title,
  m.user_id,
  m.organization_id,
  o.name AS organization_name,
  m.is_published,
  m.updated_at
FROM public.maps m
LEFT JOIN public.organizations o ON o.id = m.organization_id
ORDER BY m.updated_at DESC
LIMIT 200;

-- 6) 사용자별 지도 수(운영 스코프별 sanity check)
SELECT
  m.user_id,
  COUNT(*) AS total_maps,
  COUNT(*) FILTER (WHERE m.organization_id IS NULL) AS personal_maps,
  COUNT(*) FILTER (WHERE m.organization_id IS NOT NULL) AS org_maps
FROM public.maps m
GROUP BY m.user_id
ORDER BY total_maps DESC
LIMIT 100;

-- 7) 함수 기반 권한 테스트 (UUID를 채워서 실행)
-- 예시:
-- WITH params AS (
--   SELECT
--     '00000000-0000-0000-0000-000000000000'::uuid AS user_id,
--     '11111111-1111-1111-1111-111111111111'::uuid AS map_id
-- )
-- SELECT
--   p.user_id,
--   p.map_id,
--   public.can_view_map(p.map_id, p.user_id) AS can_view,
--   public.can_manage_map(p.map_id, p.user_id) AS can_manage
-- FROM params p;
