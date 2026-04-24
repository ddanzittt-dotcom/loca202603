-- ============================================================
-- LOCA Security Apply + Verify (SQL Editor one-shot)
-- 목적:
-- 1) public 스키마에서 policy가 있는 테이블의 RLS를 일괄 활성화
-- 2) organizations RLS 누락 이슈 즉시 복구
-- 3) 잔여 보안 경고 후보를 바로 검증
-- ============================================================

-- 1) 핵심 즉시 복구 (organizations)
ALTER TABLE IF EXISTS public.organizations ENABLE ROW LEVEL SECURITY;

-- 2) policy가 존재하는 public 테이블에 대해 RLS 일괄 활성화
DO $$
DECLARE
  rec record;
BEGIN
  FOR rec IN
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
  LOOP
    EXECUTE format(
      'ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY',
      rec.schema_name,
      rec.table_name
    );
  END LOOP;
END;
$$;

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- Verify 1) policy는 있는데 RLS가 꺼진 테이블
-- 기대값: 0 rows
-- ============================================================
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

-- ============================================================
-- Verify 2) organizations 단일 상태
-- 기대값: rls_enabled = true
-- ============================================================
SELECT
  n.nspname AS schema_name,
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled
FROM pg_class c
JOIN pg_namespace n
  ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname = 'organizations';

-- ============================================================
-- Verify 3) anon/authenticated 권한 + RLS 비활성 테이블 교집합
-- 기대값: 운영 정책에 따라 최소화(가능하면 0)
-- ============================================================
WITH exposed AS (
  SELECT DISTINCT
    g.table_schema,
    g.table_name
  FROM information_schema.role_table_grants g
  WHERE g.table_schema = 'public'
    AND g.grantee IN ('anon', 'authenticated')
),
rls AS (
  SELECT
    n.nspname AS table_schema,
    c.relname AS table_name,
    c.relrowsecurity AS rls_enabled
  FROM pg_class c
  JOIN pg_namespace n
    ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind IN ('r', 'p')
)
SELECT
  e.table_schema,
  e.table_name,
  r.rls_enabled
FROM exposed e
JOIN rls r
  ON r.table_schema = e.table_schema
 AND r.table_name = e.table_name
WHERE r.rls_enabled = false
ORDER BY e.table_name;

