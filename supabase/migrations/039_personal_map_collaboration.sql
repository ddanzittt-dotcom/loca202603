-- ============================================================
-- Migration 039: Personal map collaboration
-- Scope:
--   - Personal/user maps only
--   - Excludes event maps and community maps
--   - owner can manage collaborators
--   - editor can directly edit map features, memos, and media
--   - viewer can read only
-- ============================================================

CREATE TABLE IF NOT EXISTS public.map_collaborators (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  map_id      uuid NOT NULL REFERENCES public.maps(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role        text NOT NULL DEFAULT 'editor' CHECK (role IN ('editor', 'viewer')),
  invited_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE(map_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_map_collaborators_map_id ON public.map_collaborators(map_id);
CREATE INDEX IF NOT EXISTS idx_map_collaborators_user_id ON public.map_collaborators(user_id);

ALTER TABLE public.map_collaborators ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, DELETE ON public.map_collaborators TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.map_collaborators TO service_role;

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

CREATE OR REPLACE FUNCTION public.is_personal_collab_map(p_map_id uuid)
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
      AND COALESCE(m.category, 'personal') <> 'event'
      AND COALESCE(m.slug, '') <> 'community-map'
      AND COALESCE(m.config->>'community', 'false') <> 'true'
  );
$$;

CREATE OR REPLACE FUNCTION public.can_view_personal_map(p_map_id uuid)
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
      AND public.is_personal_collab_map(m.id)
      AND (
        m.user_id = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.map_collaborators c
          WHERE c.map_id = m.id
            AND c.user_id = auth.uid()
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.can_edit_personal_map_features(p_map_id uuid)
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
      AND public.is_personal_collab_map(m.id)
      AND (
        m.user_id = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.map_collaborators c
          WHERE c.map_id = m.id
            AND c.user_id = auth.uid()
            AND c.role = 'editor'
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.touch_personal_map_updated_at(p_map_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.can_edit_personal_map_features(p_map_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  UPDATE public.maps
  SET updated_at = now()
  WHERE id = p_map_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_personal_collab_map(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_map_owner(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_view_personal_map(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_edit_personal_map_features(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.touch_personal_map_updated_at(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "maps_select_personal_collaborator" ON public.maps;
CREATE POLICY "maps_select_personal_collaborator"
  ON public.maps
  FOR SELECT
  USING (public.can_view_personal_map(id));

DROP POLICY IF EXISTS "collaborators_select_personal_members" ON public.map_collaborators;
CREATE POLICY "collaborators_select_personal_members"
  ON public.map_collaborators
  FOR SELECT
  USING (public.can_view_personal_map(map_id));

DROP POLICY IF EXISTS "collaborators_insert_personal_owner" ON public.map_collaborators;
CREATE POLICY "collaborators_insert_personal_owner"
  ON public.map_collaborators
  FOR INSERT
  WITH CHECK (
    public.is_personal_collab_map(map_id)
    AND public.is_map_owner(map_id)
    AND invited_by = auth.uid()
    AND role IN ('editor', 'viewer')
  );

DROP POLICY IF EXISTS "collaborators_delete_personal_owner" ON public.map_collaborators;
CREATE POLICY "collaborators_delete_personal_owner"
  ON public.map_collaborators
  FOR DELETE
  USING (
    public.is_personal_collab_map(map_id)
    AND public.is_map_owner(map_id)
  );

DROP POLICY IF EXISTS "features_select_personal_collaborator" ON public.map_features;
CREATE POLICY "features_select_personal_collaborator"
  ON public.map_features
  FOR SELECT
  USING (public.can_view_personal_map(map_id));

DROP POLICY IF EXISTS "features_insert_personal_editor" ON public.map_features;
CREATE POLICY "features_insert_personal_editor"
  ON public.map_features
  FOR INSERT
  WITH CHECK (public.can_edit_personal_map_features(map_id));

DROP POLICY IF EXISTS "features_update_personal_editor" ON public.map_features;
CREATE POLICY "features_update_personal_editor"
  ON public.map_features
  FOR UPDATE
  USING (public.can_edit_personal_map_features(map_id))
  WITH CHECK (public.can_edit_personal_map_features(map_id));

DROP POLICY IF EXISTS "features_delete_personal_editor" ON public.map_features;
CREATE POLICY "features_delete_personal_editor"
  ON public.map_features
  FOR DELETE
  USING (public.can_edit_personal_map_features(map_id));

DROP POLICY IF EXISTS "memos_select_personal_collaborator" ON public.feature_memos;
CREATE POLICY "memos_select_personal_collaborator"
  ON public.feature_memos
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.map_features mf
      WHERE mf.id = feature_memos.feature_id
        AND public.can_view_personal_map(mf.map_id)
    )
  );

DROP POLICY IF EXISTS "memos_insert_personal_editor" ON public.feature_memos;
CREATE POLICY "memos_insert_personal_editor"
  ON public.feature_memos
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1
      FROM public.map_features mf
      WHERE mf.id = feature_memos.feature_id
        AND public.can_edit_personal_map_features(mf.map_id)
    )
  );

DROP POLICY IF EXISTS "feature_media_select_personal_collaborator" ON public.feature_media;
CREATE POLICY "feature_media_select_personal_collaborator"
  ON public.feature_media
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.map_features mf
      WHERE mf.id = feature_media.feature_id
        AND public.can_view_personal_map(mf.map_id)
    )
  );

DROP POLICY IF EXISTS "feature_media_insert_personal_editor" ON public.feature_media;
CREATE POLICY "feature_media_insert_personal_editor"
  ON public.feature_media
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.map_features mf
      WHERE mf.id = feature_media.feature_id
        AND public.can_edit_personal_map_features(mf.map_id)
    )
  );

DROP POLICY IF EXISTS "feature_media_delete_personal_editor" ON public.feature_media;
CREATE POLICY "feature_media_delete_personal_editor"
  ON public.feature_media
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM public.map_features mf
      WHERE mf.id = feature_media.feature_id
        AND public.can_edit_personal_map_features(mf.map_id)
    )
  );

NOTIFY pgrst, 'reload schema';
