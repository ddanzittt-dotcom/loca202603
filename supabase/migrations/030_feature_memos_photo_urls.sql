-- ============================================================
-- Migration 030:
-- Add photo_urls column to feature_memos for memo photo attachments.
-- ============================================================

ALTER TABLE public.feature_memos
ADD COLUMN IF NOT EXISTS photo_urls jsonb NOT NULL DEFAULT '[]'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'feature_memos_photo_urls_is_array'
  ) THEN
    ALTER TABLE public.feature_memos
    ADD CONSTRAINT feature_memos_photo_urls_is_array
    CHECK (jsonb_typeof(photo_urls) = 'array');
  END IF;
END;
$$;

UPDATE public.feature_memos
SET photo_urls = '[]'::jsonb
WHERE photo_urls IS NULL;

NOTIFY pgrst, 'reload schema';
