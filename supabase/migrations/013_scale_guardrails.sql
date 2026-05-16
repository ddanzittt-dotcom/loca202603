-- ============================================================
-- Migration 013: scale guardrails for media, logs, and dashboard aggregation
-- Purpose:
--   - Keep photo/voice records within predictable limits.
--   - Add indexes for common public-map and dashboard queries.
--   - Provide retention and daily summary helpers before traffic grows.
-- ============================================================

-- 1) Storage bucket limits. The bucket is created manually in many environments,
-- so this update is safe to run after the bucket exists.
UPDATE storage.buckets
SET
  file_size_limit = 12582912,
  allowed_mime_types = ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp',
    'audio/webm',
    'audio/mp4',
    'audio/ogg',
    'audio/wav',
    'audio/mpeg'
  ]
WHERE id = 'media';

-- 2) DB-level media limits. Client-side compression is helpful, but the database
-- should still reject unexpectedly large metadata records.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'feature_media_size_guard'
      AND conrelid = 'public.feature_media'::regclass
  ) THEN
    ALTER TABLE public.feature_media
      ADD CONSTRAINT feature_media_size_guard
      CHECK (
        (media_type = 'photo' AND size_bytes <= 2097152)
        OR
        (media_type = 'voice' AND size_bytes <= 8388608 AND COALESCE(duration_sec, 0) <= 120)
      );
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_feature_media_type_created_at
  ON public.feature_media(media_type, created_at DESC);

-- 3) High-traffic public map and dashboard query indexes.
CREATE INDEX IF NOT EXISTS idx_maps_public_slug
  ON public.maps(slug)
  WHERE is_published = true;

CREATE INDEX IF NOT EXISTS idx_maps_public_published_at
  ON public.maps(published_at DESC)
  WHERE is_published = true;

CREATE INDEX IF NOT EXISTS idx_map_features_map_type_sort
  ON public.map_features(map_id, type, sort_order, created_at);

CREATE INDEX IF NOT EXISTS idx_view_logs_map_created_at
  ON public.view_logs(map_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_view_logs_event_created_at
  ON public.view_logs(event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_event_checkins_map_created_at
  ON public.event_checkins(map_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_survey_responses_map_created_at
  ON public.survey_responses(map_id, created_at DESC);

-- 4) Daily summary table for dashboard reads. This lets the app move expensive
-- all-time scans into a scheduled refresh job later.
CREATE TABLE IF NOT EXISTS public.map_daily_metrics (
  map_id uuid REFERENCES public.maps(id) ON DELETE CASCADE NOT NULL,
  metric_date date NOT NULL,
  view_count integer NOT NULL DEFAULT 0,
  unique_sessions integer NOT NULL DEFAULT 0,
  checkin_count integer NOT NULL DEFAULT 0,
  survey_count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (map_id, metric_date)
);

ALTER TABLE public.map_daily_metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "map_daily_metrics_owner_select" ON public.map_daily_metrics;
CREATE POLICY "map_daily_metrics_owner_select"
  ON public.map_daily_metrics
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.maps m
      WHERE m.id = map_daily_metrics.map_id
        AND m.user_id = auth.uid()
    )
  );

CREATE OR REPLACE FUNCTION public.refresh_map_daily_metrics(
  p_from date DEFAULT CURRENT_DATE - 30,
  p_to date DEFAULT CURRENT_DATE
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_rows integer := 0;
BEGIN
  INSERT INTO public.map_daily_metrics (
    map_id,
    metric_date,
    view_count,
    unique_sessions,
    checkin_count,
    survey_count,
    updated_at
  )
  SELECT
    m.id AS map_id,
    d.metric_date::date,
    COALESCE(v.view_count, 0) AS view_count,
    COALESCE(v.unique_sessions, 0) AS unique_sessions,
    COALESCE(c.checkin_count, 0) AS checkin_count,
    COALESCE(s.survey_count, 0) AS survey_count,
    now() AS updated_at
  FROM public.maps m
  CROSS JOIN generate_series(p_from, p_to, interval '1 day') AS d(metric_date)
  LEFT JOIN (
    SELECT
      map_id,
      created_at::date AS metric_date,
      COUNT(*)::integer AS view_count,
      COUNT(DISTINCT session_id)::integer AS unique_sessions
    FROM public.view_logs
    WHERE created_at::date BETWEEN p_from AND p_to
      AND map_id IS NOT NULL
    GROUP BY map_id, created_at::date
  ) v ON v.map_id = m.id AND v.metric_date = d.metric_date
  LEFT JOIN (
    SELECT
      map_id,
      created_at::date AS metric_date,
      COUNT(*)::integer AS checkin_count
    FROM public.event_checkins
    WHERE created_at::date BETWEEN p_from AND p_to
    GROUP BY map_id, created_at::date
  ) c ON c.map_id = m.id AND c.metric_date = d.metric_date
  LEFT JOIN (
    SELECT
      map_id,
      created_at::date AS metric_date,
      COUNT(*)::integer AS survey_count
    FROM public.survey_responses
    WHERE created_at::date BETWEEN p_from AND p_to
    GROUP BY map_id, created_at::date
  ) s ON s.map_id = m.id AND s.metric_date = d.metric_date
  WHERE m.is_published = true
  ON CONFLICT (map_id, metric_date)
  DO UPDATE SET
    view_count = EXCLUDED.view_count,
    unique_sessions = EXCLUDED.unique_sessions,
    checkin_count = EXCLUDED.checkin_count,
    survey_count = EXCLUDED.survey_count,
    updated_at = now();

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END;
$$;

-- 5) Retention helper for raw logs. Use this from a scheduled job after exports
-- are in place. It does not run automatically.
CREATE OR REPLACE FUNCTION public.prune_old_view_logs(p_before timestamptz)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_deleted integer := 0;
BEGIN
  DELETE FROM public.view_logs
  WHERE created_at < p_before;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;
