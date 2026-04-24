-- ============================================================
-- LOCA Security Preflight Checks
-- 목적: Security Advisor에서 자주 발생하는 RLS 이슈를 빠르게 점검
-- ============================================================

-- 1) public 스키마 테이블별 RLS/Policy 현황
SELECT
  n.nspname AS schema_name,
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled,
  COUNT(p.polname) AS policy_count
FROM pg_class c
JOIN pg_namespace n
  ON n.oid = c.relnamespace
LEFT JOIN pg_policy p
  ON p.polrelid = c.oid
WHERE n.nspname = 'public'
  AND c.relkind IN ('r', 'p')
GROUP BY n.nspname, c.relname, c.relrowsecurity
ORDER BY c.relname;

-- 2) 정책은 있는데 RLS가 꺼진 테이블 (즉시 조치 대상)
SELECT
  n.nspname AS schema_name,
  c.relname AS table_name
FROM pg_class c
JOIN pg_namespace n
  ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind IN ('r', 'p')
  AND c.relrowsecurity = false
  AND EXISTS (
    SELECT 1
    FROM pg_policy p
    WHERE p.polrelid = c.oid
  )
ORDER BY c.relname;

-- 3) organizations 단일 확인 (현재 이슈 대응)
SELECT
  n.nspname AS schema_name,
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled
FROM pg_class c
JOIN pg_namespace n
  ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname = 'organizations';

-- 4) anon/authenticated 권한 현황 (공개 테이블 점검 보조)
SELECT
  table_schema,
  table_name,
  grantee,
  privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND grantee IN ('anon', 'authenticated')
ORDER BY table_name, grantee, privilege_type;

