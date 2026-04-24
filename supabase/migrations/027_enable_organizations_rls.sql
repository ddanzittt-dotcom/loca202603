-- ============================================================
-- Migration 027:
-- Ensure RLS is enabled on organizations when policies exist
-- ============================================================

DO $$
BEGIN
  IF to_regclass('public.organizations') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY';
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';
