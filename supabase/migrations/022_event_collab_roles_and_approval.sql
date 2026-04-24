-- ============================================================
-- Migration 022:
-- 1) Event collaboration role granularity (operator/editor/viewer)
-- 2) Feature change approval queue
-- 3) Operator internal note permission (owner + operator)
-- ============================================================

-- 1) map_collaborators role granularity
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'map_collaborators_role_check'
      AND conrelid = 'public.map_collaborators'::regclass
  ) THEN
    ALTER TABLE public.map_collaborators
      DROP CONSTRAINT map_collaborators_role_check;
  END IF;
END;
$$;

ALTER TABLE public.map_collaborators
  ADD CONSTRAINT map_collaborators_role_check
  CHECK (role IN ('operator', 'editor', 'viewer'));

-- Direct feature CRUD is now owner/operator only.
DROP POLICY IF EXISTS "features_insert_collaborator" ON public.map_features;
CREATE POLICY "features_insert_collaborator"
  ON public.map_features
  FOR INSERT
  WITH CHECK (
    public.is_map_collaborator(map_id, 'operator')
  );

DROP POLICY IF EXISTS "features_update_collaborator" ON public.map_features;
CREATE POLICY "features_update_collaborator"
  ON public.map_features
  FOR UPDATE
  USING (
    public.is_map_collaborator(map_id, 'operator')
  );

DROP POLICY IF EXISTS "features_delete_collaborator" ON public.map_features;
CREATE POLICY "features_delete_collaborator"
  ON public.map_features
  FOR DELETE
  USING (
    public.is_map_collaborator(map_id, 'operator')
  );

-- 2) feature_operator_notes: owner + operator
DROP POLICY IF EXISTS "operator_notes_select_owner" ON public.feature_operator_notes;
DROP POLICY IF EXISTS "operator_notes_insert_owner" ON public.feature_operator_notes;
DROP POLICY IF EXISTS "operator_notes_update_owner" ON public.feature_operator_notes;
DROP POLICY IF EXISTS "operator_notes_delete_owner" ON public.feature_operator_notes;

DROP POLICY IF EXISTS "operator_notes_select_owner_or_operator" ON public.feature_operator_notes;
CREATE POLICY "operator_notes_select_owner_or_operator"
  ON public.feature_operator_notes
  FOR SELECT
  USING (
    public.is_map_owner(map_id)
    OR public.is_map_collaborator(map_id, 'operator')
  );

DROP POLICY IF EXISTS "operator_notes_insert_owner_or_operator" ON public.feature_operator_notes;
CREATE POLICY "operator_notes_insert_owner_or_operator"
  ON public.feature_operator_notes
  FOR INSERT
  WITH CHECK (
    public.is_map_owner(map_id)
    OR public.is_map_collaborator(map_id, 'operator')
  );

DROP POLICY IF EXISTS "operator_notes_update_owner_or_operator" ON public.feature_operator_notes;
CREATE POLICY "operator_notes_update_owner_or_operator"
  ON public.feature_operator_notes
  FOR UPDATE
  USING (
    public.is_map_owner(map_id)
    OR public.is_map_collaborator(map_id, 'operator')
  )
  WITH CHECK (
    public.is_map_owner(map_id)
    OR public.is_map_collaborator(map_id, 'operator')
  );

DROP POLICY IF EXISTS "operator_notes_delete_owner_or_operator" ON public.feature_operator_notes;
CREATE POLICY "operator_notes_delete_owner_or_operator"
  ON public.feature_operator_notes
  FOR DELETE
  USING (
    public.is_map_owner(map_id)
    OR public.is_map_collaborator(map_id, 'operator')
  );

-- 3) feature_change_requests (editor -> owner/operator approval flow)
CREATE TABLE IF NOT EXISTS public.feature_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  map_id uuid NOT NULL REFERENCES public.maps(id) ON DELETE CASCADE,
  feature_id uuid NULL REFERENCES public.map_features(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action IN ('insert', 'update', 'delete')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  requested_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reviewed_by uuid NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  review_note text NOT NULL DEFAULT '',
  reviewed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feature_change_requests_map_status
  ON public.feature_change_requests(map_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feature_change_requests_requested_by
  ON public.feature_change_requests(requested_by, created_at DESC);

ALTER TABLE public.feature_change_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "feature_change_requests_select" ON public.feature_change_requests;
CREATE POLICY "feature_change_requests_select"
  ON public.feature_change_requests
  FOR SELECT
  USING (
    requested_by = auth.uid()
    OR public.is_map_owner(map_id)
    OR public.is_map_collaborator(map_id, 'operator')
  );

DROP POLICY IF EXISTS "feature_change_requests_insert" ON public.feature_change_requests;
CREATE POLICY "feature_change_requests_insert"
  ON public.feature_change_requests
  FOR INSERT
  WITH CHECK (
    requested_by = auth.uid()
    AND status = 'pending'
    AND (
      public.is_map_owner(map_id)
      OR public.is_map_collaborator(map_id, 'operator')
      OR public.is_map_collaborator(map_id, 'editor')
    )
  );

DROP POLICY IF EXISTS "feature_change_requests_review" ON public.feature_change_requests;
CREATE POLICY "feature_change_requests_review"
  ON public.feature_change_requests
  FOR UPDATE
  USING (
    public.is_map_owner(map_id)
    OR public.is_map_collaborator(map_id, 'operator')
  )
  WITH CHECK (
    public.is_map_owner(map_id)
    OR public.is_map_collaborator(map_id, 'operator')
  );

DROP TRIGGER IF EXISTS set_feature_change_requests_updated_at ON public.feature_change_requests;
CREATE TRIGGER set_feature_change_requests_updated_at
BEFORE UPDATE ON public.feature_change_requests
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

GRANT SELECT, INSERT, UPDATE ON public.feature_change_requests TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.feature_change_requests TO service_role;

NOTIFY pgrst, 'reload schema';
