-- 030 feature style apply + verify
-- Run this in Supabase SQL Editor when you want to apply/confirm the
-- map_features.style rollout in one place.

BEGIN;

ALTER TABLE public.map_features
ADD COLUMN IF NOT EXISTS style jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE public.map_features
SET style = '{}'::jsonb
WHERE style IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'map_features_style_is_object'
      AND conrelid = 'public.map_features'::regclass
  ) THEN
    ALTER TABLE public.map_features
    ADD CONSTRAINT map_features_style_is_object
    CHECK (jsonb_typeof(style) = 'object');
  END IF;
END
$$;

COMMENT ON COLUMN public.map_features.style IS 'Feature style options: color, lineStyle';

COMMIT;

NOTIFY pgrst, 'reload schema';

-- Verify #1: style column present and non-null default
SELECT
  table_schema,
  table_name,
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'map_features'
  AND column_name = 'style';

-- Verify #2: style object constraint exists
SELECT
  conname AS constraint_name,
  pg_get_constraintdef(c.oid) AS definition
FROM pg_constraint c
WHERE c.conrelid = 'public.map_features'::regclass
  AND c.conname = 'map_features_style_is_object';

-- Verify #3: no null style rows
SELECT
  COUNT(*) AS total_rows,
  COUNT(*) FILTER (WHERE style IS NULL) AS null_style_rows
FROM public.map_features;

-- Verify #4: quick sample of styled features
SELECT
  id,
  type,
  title,
  style,
  updated_at
FROM public.map_features
WHERE style <> '{}'::jsonb
ORDER BY updated_at DESC
LIMIT 20;
