-- ============================================================
-- Migration 020: Recover map_collaborators access and RLS
-- ============================================================

-- 0) Schema usage
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;

-- 1) Ensure table exists
CREATE TABLE IF NOT EXISTS public.map_collaborators (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  map_id      UUID NOT NULL REFERENCES public.maps(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role        TEXT NOT NULL DEFAULT 'editor' CHECK (role IN ('editor', 'viewer')),
  invited_by  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(map_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_map_collaborators_map_id ON public.map_collaborators(map_id);
CREATE INDEX IF NOT EXISTS idx_map_collaborators_user_id ON public.map_collaborators(user_id);

ALTER TABLE public.map_collaborators ENABLE ROW LEVEL SECURITY;

-- 2) Table grants
REVOKE ALL ON TABLE public.map_collaborators FROM anon;
GRANT SELECT, INSERT, DELETE ON TABLE public.map_collaborators TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.map_collaborators TO service_role;

-- 3) RLS for map_collaborators
DROP POLICY IF EXISTS "collaborators_select" ON public.map_collaborators;
CREATE POLICY "collaborators_select"
  ON public.map_collaborators
  FOR SELECT
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1
      FROM public.maps
      WHERE maps.id = map_collaborators.map_id
        AND maps.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "collaborators_insert_owner" ON public.map_collaborators;
CREATE POLICY "collaborators_insert_owner"
  ON public.map_collaborators
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.maps
      WHERE maps.id = map_collaborators.map_id
        AND maps.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "collaborators_delete_owner" ON public.map_collaborators;
CREATE POLICY "collaborators_delete_owner"
  ON public.map_collaborators
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM public.maps
      WHERE maps.id = map_collaborators.map_id
        AND maps.user_id = auth.uid()
    )
  );

-- 4) Recreate collaborator policies on map_features
DROP POLICY IF EXISTS "features_insert_collaborator" ON public.map_features;
CREATE POLICY "features_insert_collaborator"
  ON public.map_features
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.map_collaborators
      WHERE map_collaborators.map_id = map_features.map_id
        AND map_collaborators.user_id = auth.uid()
        AND map_collaborators.role = 'editor'
    )
  );

DROP POLICY IF EXISTS "features_update_collaborator" ON public.map_features;
CREATE POLICY "features_update_collaborator"
  ON public.map_features
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.map_collaborators
      WHERE map_collaborators.map_id = map_features.map_id
        AND map_collaborators.user_id = auth.uid()
        AND map_collaborators.role = 'editor'
    )
  );

DROP POLICY IF EXISTS "features_delete_collaborator" ON public.map_features;
CREATE POLICY "features_delete_collaborator"
  ON public.map_features
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM public.map_collaborators
      WHERE map_collaborators.map_id = map_features.map_id
        AND map_collaborators.user_id = auth.uid()
        AND map_collaborators.role = 'editor'
    )
  );

-- 5) Recreate map read policy for collaborators
DROP POLICY IF EXISTS "maps_select_collaborator" ON public.maps;
CREATE POLICY "maps_select_collaborator"
  ON public.maps
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.map_collaborators
      WHERE map_collaborators.map_id = maps.id
        AND map_collaborators.user_id = auth.uid()
    )
  );

-- 6) Ask PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';

