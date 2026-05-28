-- ============================================================
-- Migration 042: record entry ids
-- Purpose:
--   - Group memo, photo, and voice rows into one diary-like record entry.
--   - Keep legacy rows readable; older records still fall back to time grouping.
-- ============================================================

ALTER TABLE public.feature_memos
  ADD COLUMN IF NOT EXISTS record_id text;

ALTER TABLE public.feature_media
  ADD COLUMN IF NOT EXISTS record_id text;

CREATE INDEX IF NOT EXISTS idx_feature_memos_feature_record
  ON public.feature_memos(feature_id, record_id, created_at);

CREATE INDEX IF NOT EXISTS idx_feature_media_feature_record
  ON public.feature_media(feature_id, record_id, created_at);

NOTIFY pgrst, 'reload schema';
