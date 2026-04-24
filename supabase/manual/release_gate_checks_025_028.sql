-- ============================================================
-- Release Gate Checks (025~028)
-- 목적: 프로덕션 반영 전 최소 검증을 SQL Editor에서 즉시 수행
-- ============================================================

-- 1) 필수 RPC 함수 존재 여부
SELECT
  proname
FROM pg_proc
WHERE proname IN (
  'increment_map_publication_like',
  'resolve_feature_change_request_tx',
  'upsert_feature_operator_note'
)
ORDER BY proname;

-- 2) organizations RLS 상태
SELECT
  n.nspname AS schema_name,
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled
FROM pg_class c
JOIN pg_namespace n
  ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname = 'organizations';

-- 3) policy는 있는데 RLS가 꺼진 테이블
-- 기대값: 0 rows
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

-- 4) organizations 정책 목록
SELECT
  schemaname,
  tablename,
  policyname,
  cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'organizations'
ORDER BY policyname;
