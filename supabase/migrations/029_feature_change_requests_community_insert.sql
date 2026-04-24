-- ============================================================
-- Migration 029:
-- Allow community-map participants to submit feature change requests.
-- ============================================================

DO $$
BEGIN
  IF to_regclass('public.feature_change_requests') IS NULL THEN
    RAISE NOTICE 'feature_change_requests table not found. skip migration 029.';
    RETURN;
  END IF;
END;
$$;

DROP POLICY IF EXISTS "feature_change_requests_insert_community" ON public.feature_change_requests;
CREATE POLICY "feature_change_requests_insert_community"
ON public.feature_change_requests
FOR INSERT
WITH CHECK (
  requested_by = auth.uid()
  AND status = 'pending'
  AND EXISTS (
    SELECT 1
    FROM public.maps m
    WHERE m.id = feature_change_requests.map_id
      AND COALESCE((m.config->>'community')::boolean, false) = true
  )
);

NOTIFY pgrst, 'reload schema';
