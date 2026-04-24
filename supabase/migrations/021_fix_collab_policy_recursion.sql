-- ============================================================
-- Migration 021: Fix recursive RLS between maps and map_collaborators
-- ============================================================

-- SECURITY DEFINER helpers to avoid policy recursion.
CREATE OR REPLACE FUNCTION public.is_map_owner(p_map_id uuid)
RETURNS boolean
LANGUAGE sql
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

CREATE OR REPLACE FUNCTION public.is_map_collaborator(p_map_id uuid, p_role text DEFAULT NULL)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.map_collaborators c
    WHERE c.map_id = p_map_id
      AND c.user_id = auth.uid()
      AND (p_role IS NULL OR c.role = p_role)
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_map_owner(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_map_collaborator(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_map_owner(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_map_collaborator(uuid, text) TO service_role;

-- Rebuild map_collaborators policies without direct maps-table subquery recursion.
DROP POLICY IF EXISTS "collaborators_select" ON public.map_collaborators;
CREATE POLICY "collaborators_select"
  ON public.map_collaborators
  FOR SELECT
  USING (
    auth.uid() = user_id
    OR public.is_map_owner(map_id)
  );

DROP POLICY IF EXISTS "collaborators_insert_owner" ON public.map_collaborators;
CREATE POLICY "collaborators_insert_owner"
  ON public.map_collaborators
  FOR INSERT
  WITH CHECK (
    public.is_map_owner(map_id)
    AND invited_by = auth.uid()
  );

DROP POLICY IF EXISTS "collaborators_delete_owner" ON public.map_collaborators;
CREATE POLICY "collaborators_delete_owner"
  ON public.map_collaborators
  FOR DELETE
  USING (
    public.is_map_owner(map_id)
  );

-- Rebuild maps collaborator policy without recursive EXISTS on map_collaborators policies.
DROP POLICY IF EXISTS "maps_select_collaborator" ON public.maps;
CREATE POLICY "maps_select_collaborator"
  ON public.maps
  FOR SELECT
  USING (
    public.is_map_collaborator(id, NULL)
  );

-- Ensure collaborator policies for map_features exist and reference role explicitly.
DROP POLICY IF EXISTS "features_insert_collaborator" ON public.map_features;
CREATE POLICY "features_insert_collaborator"
  ON public.map_features
  FOR INSERT
  WITH CHECK (
    public.is_map_collaborator(map_id, 'editor')
  );

DROP POLICY IF EXISTS "features_update_collaborator" ON public.map_features;
CREATE POLICY "features_update_collaborator"
  ON public.map_features
  FOR UPDATE
  USING (
    public.is_map_collaborator(map_id, 'editor')
  );

DROP POLICY IF EXISTS "features_delete_collaborator" ON public.map_features;
CREATE POLICY "features_delete_collaborator"
  ON public.map_features
  FOR DELETE
  USING (
    public.is_map_collaborator(map_id, 'editor')
  );

NOTIFY pgrst, 'reload schema';

