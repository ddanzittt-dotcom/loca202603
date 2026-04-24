-- ============================================================
-- 020_maps_collab_rls_recursion_fix.sql
-- 목적:
--   maps_select_collaborator <-> collaborators_select 간
--   순환 RLS 참조(infinite recursion) 제거
--
-- 현상:
--   "infinite recursion detected in policy for relation \"maps\""
--
-- 원인:
--   1) maps SELECT 정책이 map_collaborators를 조회
--   2) map_collaborators SELECT 정책이 다시 maps를 조회
--   -> 정책 평가 중 순환
-- ============================================================

BEGIN;

-- map owner 판별을 SECURITY DEFINER 함수로 분리해서
-- policy 평가 시 maps RLS를 재귀적으로 타지 않게 한다.
CREATE OR REPLACE FUNCTION public.is_map_owner(p_map_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.maps m
    WHERE m.id = p_map_id
      AND m.user_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.is_map_owner(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_map_owner(uuid) TO authenticated;

-- 기존 순환 유발 정책 교체
DROP POLICY IF EXISTS "collaborators_select" ON public.map_collaborators;

-- 본인 협업 레코드는 항상 조회 가능
CREATE POLICY "collaborators_select_self"
  ON public.map_collaborators
  FOR SELECT
  USING (auth.uid() = user_id);

-- 지도 owner도 협업자 목록 조회 가능 (재귀 방지 함수 사용)
CREATE POLICY "collaborators_select_owner"
  ON public.map_collaborators
  FOR SELECT
  USING (public.is_map_owner(map_id));

COMMIT;

