-- ============================================================
-- Migration 041: media storage bucket and policies
-- Purpose:
--   - Ensure the media bucket exists in every environment.
--   - Allow signed-in users to upload today's record photos/voices.
--   - Keep uploaded media publicly readable so saved records render on other devices.
-- ============================================================

INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'media',
  'media',
  true,
  12582912,
  ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp',
    'audio/webm',
    'audio/mp4',
    'audio/ogg',
    'audio/wav',
    'audio/mpeg'
  ]::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "media_bucket_public_read" ON storage.objects;
CREATE POLICY "media_bucket_public_read"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'media');

DROP POLICY IF EXISTS "media_bucket_authenticated_insert" ON storage.objects;
CREATE POLICY "media_bucket_authenticated_insert"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'media'
    AND (name LIKE 'photos/%' OR name LIKE 'voices/%')
  );

DROP POLICY IF EXISTS "media_bucket_authenticated_update" ON storage.objects;
CREATE POLICY "media_bucket_authenticated_update"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'media'
    AND (name LIKE 'photos/%' OR name LIKE 'voices/%')
  )
  WITH CHECK (
    bucket_id = 'media'
    AND (name LIKE 'photos/%' OR name LIKE 'voices/%')
  );

DROP POLICY IF EXISTS "media_bucket_authenticated_delete" ON storage.objects;
CREATE POLICY "media_bucket_authenticated_delete"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'media'
    AND (name LIKE 'photos/%' OR name LIKE 'voices/%')
  );

NOTIFY pgrst, 'reload schema';
