-- ============================================================
-- Migration 023:
-- 1) Allow operator collaborator in upsert_feature_operator_note RPC
-- 2) Allow event-map collaborators to read/write feature memos (comments)
-- ============================================================

-- 1) RPC parity: owner + operator collaborator (+ existing manager scope)
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
  v_can_manage boolean := false;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'auth_required');
  END IF;

  SELECT f.map_id
  INTO v_map_id
  FROM public.map_features f
  WHERE f.id = p_feature_id
  LIMIT 1;

  IF v_map_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'feature_not_found_or_forbidden');
  END IF;

  -- Keep compatibility with dashboard tenant scope where can_manage_map exists.
  IF to_regprocedure('public.can_manage_map(uuid,uuid)') IS NOT NULL THEN
    SELECT public.can_manage_map(v_map_id, v_user_id) INTO v_can_manage;
  ELSE
    v_can_manage := public.is_map_owner(v_map_id);
  END IF;

  IF NOT (
    v_can_manage
    OR public.is_map_owner(v_map_id)
    OR public.is_map_collaborator(v_map_id, 'operator')
  ) THEN
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

GRANT EXECUTE ON FUNCTION public.upsert_feature_operator_note(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_feature_operator_note(uuid, text) TO service_role;

-- 2) Event collaboration memo/comment permissions
DROP POLICY IF EXISTS "memos_select_event_collaborator" ON public.feature_memos;
CREATE POLICY "memos_select_event_collaborator"
  ON public.feature_memos
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.map_features f
      JOIN public.maps m ON m.id = f.map_id
      WHERE f.id = feature_memos.feature_id
        AND m.category = 'event'
        AND (
          public.is_map_owner(m.id)
          OR public.is_map_collaborator(m.id, NULL)
        )
    )
  );

DROP POLICY IF EXISTS "memos_insert_event_collaborator" ON public.feature_memos;
CREATE POLICY "memos_insert_event_collaborator"
  ON public.feature_memos
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND feature_memos.user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.map_features f
      JOIN public.maps m ON m.id = f.map_id
      WHERE f.id = feature_memos.feature_id
        AND m.category = 'event'
        AND (
          public.is_map_owner(m.id)
          OR public.is_map_collaborator(m.id, NULL)
        )
    )
  );

NOTIFY pgrst, 'reload schema';
