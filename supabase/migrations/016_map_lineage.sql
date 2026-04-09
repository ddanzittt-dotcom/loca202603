-- Migration 016: map lineage (parent/child relationship for reuse flow)
-- Goal:
-- 1) Track shared->saved map ancestry.
-- 2) Preserve root lineage for downstream attribution/reporting.

CREATE TABLE IF NOT EXISTS public.map_lineage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_map_id uuid NOT NULL REFERENCES public.maps(id) ON DELETE CASCADE,
  child_map_id uuid NOT NULL REFERENCES public.maps(id) ON DELETE CASCADE,
  root_map_id uuid REFERENCES public.maps(id) ON DELETE SET NULL,
  relation_type text NOT NULL DEFAULT 'import'
    CHECK (relation_type IN ('import', 'fork', 'template')),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (child_map_id),
  UNIQUE (parent_map_id, child_map_id)
);

CREATE INDEX IF NOT EXISTS idx_map_lineage_parent ON public.map_lineage(parent_map_id);
CREATE INDEX IF NOT EXISTS idx_map_lineage_child ON public.map_lineage(child_map_id);
CREATE INDEX IF NOT EXISTS idx_map_lineage_root ON public.map_lineage(root_map_id);

ALTER TABLE public.map_lineage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lineage_select_owner" ON public.map_lineage;
CREATE POLICY "lineage_select_owner"
  ON public.map_lineage
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.maps m
      WHERE m.id = map_lineage.parent_map_id
        AND m.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.maps m
      WHERE m.id = map_lineage.child_map_id
        AND m.user_id = auth.uid()
    )
  );

CREATE OR REPLACE FUNCTION public.link_map_lineage(
  p_parent_map_id uuid,
  p_child_map_id uuid,
  p_relation_type text DEFAULT 'import'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_relation text := COALESCE(NULLIF(trim(p_relation_type), ''), 'import');
  v_parent_root uuid;
  v_root_map_id uuid;
BEGIN
  IF p_parent_map_id IS NULL OR p_child_map_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_params');
  END IF;

  IF p_parent_map_id = p_child_map_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'self_lineage_not_allowed');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.maps WHERE id = p_parent_map_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'parent_not_found');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.maps WHERE id = p_child_map_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'child_not_found');
  END IF;

  SELECT root_map_id
  INTO v_parent_root
  FROM public.map_lineage
  WHERE child_map_id = p_parent_map_id
  LIMIT 1;

  v_root_map_id := COALESCE(v_parent_root, p_parent_map_id);

  INSERT INTO public.map_lineage (
    parent_map_id,
    child_map_id,
    root_map_id,
    relation_type,
    created_by
  )
  VALUES (
    p_parent_map_id,
    p_child_map_id,
    v_root_map_id,
    v_relation,
    v_user_id
  )
  ON CONFLICT (child_map_id) DO UPDATE
  SET
    parent_map_id = EXCLUDED.parent_map_id,
    root_map_id = EXCLUDED.root_map_id,
    relation_type = EXCLUDED.relation_type,
    created_by = EXCLUDED.created_by;

  RETURN jsonb_build_object(
    'success', true,
    'parent_map_id', p_parent_map_id,
    'child_map_id', p_child_map_id,
    'root_map_id', v_root_map_id,
    'relation_type', v_relation
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.link_map_lineage(uuid, uuid, text) TO authenticated;
