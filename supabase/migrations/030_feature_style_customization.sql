-- Migration 030: feature style customization (pin/route/area)

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

NOTIFY pgrst, 'reload schema';
