-- Migration 018: feature operator notes (internal-only)
-- Goal:
-- 1) Separate participant-visible feature note from manager internal note.
-- 2) Keep operator notes owner-only via RLS.

CREATE TABLE IF NOT EXISTS public.feature_operator_notes (
  feature_id uuid PRIMARY KEY REFERENCES public.map_features(id) ON DELETE CASCADE,
  map_id uuid NOT NULL REFERENCES public.maps(id) ON DELETE CASCADE,
  note text NOT NULL DEFAULT '',
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feature_operator_notes_map_id ON public.feature_operator_notes(map_id);
CREATE INDEX IF NOT EXISTS idx_feature_operator_notes_updated_at ON public.feature_operator_notes(updated_at DESC);

ALTER TABLE public.feature_operator_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "operator_notes_select_owner" ON public.feature_operator_notes;
CREATE POLICY "operator_notes_select_owner"
  ON public.feature_operator_notes
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.maps
      WHERE maps.id = feature_operator_notes.map_id
        AND maps.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "operator_notes_insert_owner" ON public.feature_operator_notes;
CREATE POLICY "operator_notes_insert_owner"
  ON public.feature_operator_notes
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.maps
      WHERE maps.id = feature_operator_notes.map_id
        AND maps.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "operator_notes_update_owner" ON public.feature_operator_notes;
CREATE POLICY "operator_notes_update_owner"
  ON public.feature_operator_notes
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.maps
      WHERE maps.id = feature_operator_notes.map_id
        AND maps.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "operator_notes_delete_owner" ON public.feature_operator_notes;
CREATE POLICY "operator_notes_delete_owner"
  ON public.feature_operator_notes
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM public.maps
      WHERE maps.id = feature_operator_notes.map_id
        AND maps.user_id = auth.uid()
    )
  );

DROP TRIGGER IF EXISTS set_feature_operator_notes_updated_at ON public.feature_operator_notes;
CREATE TRIGGER set_feature_operator_notes_updated_at
BEFORE UPDATE ON public.feature_operator_notes
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.upsert_feature_operator_note(
  p_feature_id uuid,
  p_note text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_map_id uuid;
  v_note text := COALESCE(p_note, '');
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'auth_required');
  END IF;

  SELECT f.map_id
  INTO v_map_id
  FROM public.map_features f
  JOIN public.maps m ON m.id = f.map_id
  WHERE f.id = p_feature_id
    AND m.user_id = v_user_id
  LIMIT 1;

  IF v_map_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'feature_not_found_or_forbidden');
  END IF;

  INSERT INTO public.feature_operator_notes (
    feature_id,
    map_id,
    note,
    updated_by
  )
  VALUES (
    p_feature_id,
    v_map_id,
    v_note,
    v_user_id
  )
  ON CONFLICT (feature_id) DO UPDATE
  SET
    map_id = EXCLUDED.map_id,
    note = EXCLUDED.note,
    updated_by = EXCLUDED.updated_by,
    updated_at = now();

  RETURN jsonb_build_object('success', true, 'feature_id', p_feature_id, 'map_id', v_map_id);
END;
$$;

GRANT SELECT ON public.feature_operator_notes TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_feature_operator_note(uuid, text) TO authenticated;
