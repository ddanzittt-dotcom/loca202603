-- Migration 017: draft/live publication revisions + rollback
-- Goal:
-- 1) Keep immutable publication snapshots per map revision.
-- 2) Support publish/unpublish/rollback workflow without destructive feature rewrites.
-- 3) Let participant app read live snapshot first (fallback-safe).

CREATE TABLE IF NOT EXISTS public.map_publication_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  map_id uuid NOT NULL REFERENCES public.maps(id) ON DELETE CASCADE,
  revision_no integer NOT NULL,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'live', 'archived', 'rolled_back')),
  slug text NOT NULL,
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  note text,
  source_revision_id uuid REFERENCES public.map_publication_revisions(id) ON DELETE SET NULL,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (map_id, revision_no)
);

CREATE INDEX IF NOT EXISTS idx_map_pub_rev_map_id ON public.map_publication_revisions(map_id);
CREATE INDEX IF NOT EXISTS idx_map_pub_rev_status ON public.map_publication_revisions(status);
CREATE INDEX IF NOT EXISTS idx_map_pub_rev_created_at ON public.map_publication_revisions(created_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'uq_map_pub_rev_live_slug'
  ) THEN
    CREATE UNIQUE INDEX uq_map_pub_rev_live_slug
      ON public.map_publication_revisions(slug)
      WHERE status = 'live';
  END IF;
END;
$$;

ALTER TABLE public.map_publication_revisions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "map_pub_rev_select_owner_or_live" ON public.map_publication_revisions;
CREATE POLICY "map_pub_rev_select_owner_or_live"
  ON public.map_publication_revisions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.maps
      WHERE maps.id = map_publication_revisions.map_id
        AND maps.user_id = auth.uid()
    )
    OR (
      map_publication_revisions.status = 'live'
      AND EXISTS (
        SELECT 1
        FROM public.maps
        WHERE maps.id = map_publication_revisions.map_id
          AND maps.is_published = true
          AND maps.visibility IN ('public', 'unlisted')
      )
    )
  );

CREATE OR REPLACE FUNCTION public.publish_map_revision(
  p_map_id uuid,
  p_slug text DEFAULT NULL,
  p_note text DEFAULT NULL,
  p_visibility text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_map public.maps%ROWTYPE;
  v_now timestamptz := now();
  v_slug text;
  v_revision_no integer;
  v_snapshot jsonb;
  v_revision_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'auth_required');
  END IF;

  SELECT *
  INTO v_map
  FROM public.maps
  WHERE id = p_map_id
    AND user_id = v_user_id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'map_not_found_or_forbidden');
  END IF;

  v_slug := NULLIF(trim(COALESCE(p_slug, '')), '');
  IF v_slug IS NULL THEN
    v_slug := NULLIF(trim(COALESCE(v_map.slug, '')), '');
  END IF;
  IF v_slug IS NULL THEN
    v_slug := 'map-' || substr(replace(p_map_id::text, '-', ''), 1, 8) || '-' || to_char(extract(epoch FROM v_now)::bigint, 'FM999999999999');
  END IF;

  v_slug := lower(regexp_replace(v_slug, '\s+', '-', 'g'));
  v_slug := regexp_replace(v_slug, '[^a-z0-9\-_]+', '', 'g');
  v_slug := regexp_replace(v_slug, '-+', '-', 'g');
  v_slug := trim(both '-' FROM v_slug);
  IF v_slug = '' THEN
    v_slug := 'map-' || substr(replace(p_map_id::text, '-', ''), 1, 8) || '-' || to_char(extract(epoch FROM v_now)::bigint, 'FM999999999999');
  END IF;

  WHILE EXISTS (
    SELECT 1
    FROM public.map_publication_revisions r
    WHERE r.status = 'live'
      AND r.slug = v_slug
      AND r.map_id <> p_map_id
  ) LOOP
    v_slug := v_slug || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);
  END LOOP;

  SELECT COALESCE(MAX(revision_no), 0) + 1
  INTO v_revision_no
  FROM public.map_publication_revisions
  WHERE map_id = p_map_id;

  SELECT jsonb_build_object(
    'map', to_jsonb(m),
    'features', COALESCE((
      SELECT jsonb_agg(to_jsonb(f) ORDER BY f.sort_order, f.created_at)
      FROM public.map_features f
      WHERE f.map_id = p_map_id
    ), '[]'::jsonb)
  )
  INTO v_snapshot
  FROM public.maps m
  WHERE m.id = p_map_id;

  UPDATE public.map_publication_revisions
  SET status = 'archived'
  WHERE map_id = p_map_id
    AND status = 'live';

  INSERT INTO public.map_publication_revisions (
    map_id,
    revision_no,
    status,
    slug,
    snapshot,
    note,
    created_by,
    published_at,
    created_at
  )
  VALUES (
    p_map_id,
    v_revision_no,
    'live',
    v_slug,
    COALESCE(v_snapshot, '{}'::jsonb),
    NULLIF(trim(COALESCE(p_note, '')), ''),
    v_user_id,
    v_now,
    v_now
  )
  RETURNING id INTO v_revision_id;

  UPDATE public.maps
  SET
    slug = v_slug,
    visibility = CASE
      WHEN p_visibility IN ('public', 'unlisted', 'private') THEN p_visibility
      WHEN visibility = 'private' THEN 'unlisted'
      ELSE visibility
    END,
    is_published = true,
    published_at = v_now,
    updated_at = v_now
  WHERE id = p_map_id;

  INSERT INTO public.map_publications (map_id, published_at)
  VALUES (p_map_id, v_now)
  ON CONFLICT (map_id) DO UPDATE
  SET
    published_at = EXCLUDED.published_at,
    updated_at = v_now;

  RETURN jsonb_build_object(
    'success', true,
    'revision_id', v_revision_id,
    'revision_no', v_revision_no,
    'slug', v_slug,
    'published_at', v_now
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.unpublish_map_revision(
  p_map_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_now timestamptz := now();
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'auth_required');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.maps
    WHERE id = p_map_id
      AND user_id = v_user_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'map_not_found_or_forbidden');
  END IF;

  UPDATE public.map_publication_revisions
  SET status = 'archived'
  WHERE map_id = p_map_id
    AND status = 'live';

  UPDATE public.maps
  SET
    slug = NULL,
    is_published = false,
    published_at = NULL,
    updated_at = v_now
  WHERE id = p_map_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.rollback_map_revision(
  p_map_id uuid,
  p_revision_id uuid,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_now timestamptz := now();
  v_current_map public.maps%ROWTYPE;
  v_target public.map_publication_revisions%ROWTYPE;
  v_slug text;
  v_revision_no integer;
  v_new_revision_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'auth_required');
  END IF;

  SELECT *
  INTO v_current_map
  FROM public.maps
  WHERE id = p_map_id
    AND user_id = v_user_id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'map_not_found_or_forbidden');
  END IF;

  SELECT *
  INTO v_target
  FROM public.map_publication_revisions
  WHERE id = p_revision_id
    AND map_id = p_map_id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'target_revision_not_found');
  END IF;

  IF COALESCE(v_target.snapshot, '{}'::jsonb) = '{}'::jsonb THEN
    RETURN jsonb_build_object('success', false, 'error', 'target_snapshot_empty');
  END IF;

  v_slug := NULLIF(trim(COALESCE(v_current_map.slug, '')), '');
  IF v_slug IS NULL THEN
    v_slug := NULLIF(trim(COALESCE(v_target.slug, '')), '');
  END IF;
  IF v_slug IS NULL THEN
    v_slug := 'map-' || substr(replace(p_map_id::text, '-', ''), 1, 8) || '-' || to_char(extract(epoch FROM v_now)::bigint, 'FM999999999999');
  END IF;

  WHILE EXISTS (
    SELECT 1
    FROM public.map_publication_revisions r
    WHERE r.status = 'live'
      AND r.slug = v_slug
      AND r.map_id <> p_map_id
  ) LOOP
    v_slug := v_slug || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);
  END LOOP;

  SELECT COALESCE(MAX(revision_no), 0) + 1
  INTO v_revision_no
  FROM public.map_publication_revisions
  WHERE map_id = p_map_id;

  UPDATE public.map_publication_revisions
  SET status = 'archived'
  WHERE map_id = p_map_id
    AND status = 'live';

  INSERT INTO public.map_publication_revisions (
    map_id,
    revision_no,
    status,
    slug,
    snapshot,
    note,
    source_revision_id,
    created_by,
    published_at,
    created_at
  )
  VALUES (
    p_map_id,
    v_revision_no,
    'live',
    v_slug,
    v_target.snapshot,
    COALESCE(NULLIF(trim(COALESCE(p_note, '')), ''), 'rollback_to_r' || v_target.revision_no::text),
    v_target.id,
    v_user_id,
    v_now,
    v_now
  )
  RETURNING id INTO v_new_revision_id;

  UPDATE public.maps
  SET
    slug = v_slug,
    visibility = CASE WHEN visibility = 'private' THEN 'unlisted' ELSE visibility END,
    is_published = true,
    published_at = v_now,
    updated_at = v_now
  WHERE id = p_map_id;

  INSERT INTO public.map_publications (map_id, published_at)
  VALUES (p_map_id, v_now)
  ON CONFLICT (map_id) DO UPDATE
  SET
    published_at = EXCLUDED.published_at,
    updated_at = v_now;

  RETURN jsonb_build_object(
    'success', true,
    'revision_id', v_new_revision_id,
    'revision_no', v_revision_no,
    'slug', v_slug,
    'published_at', v_now,
    'rolled_back_from', v_target.revision_no
  );
END;
$$;

GRANT SELECT ON public.map_publication_revisions TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.publish_map_revision(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unpublish_map_revision(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rollback_map_revision(uuid, uuid, text) TO authenticated;
