-- LOCA public community web schema draft
-- Draft only: review against existing 032_public_saved_items.sql and 033_public_saved_box_connect.sql before applying.
-- Goal: public community records, reels-based recommended maps, saved box, saved-box connection, reports, keyword dictionary.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  CREATE TYPE public.community_record_type AS ENUM ('place', 'route');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE public.community_record_status AS ENUM ('pending', 'approved', 'rejected', 'hidden', 'reported');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE public.recommend_map_status AS ENUM ('draft', 'published', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE public.recommender_type AS ENUM ('resident', 'editor', 'creator', 'partner');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE public.saved_owner_type AS ENUM ('guest', 'auth_user');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE public.report_target_type AS ENUM ('record', 'recommend_map');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE public.report_status AS ENUM ('pending', 'resolved', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Replace this with your real admin model before production.
-- Example options: app_metadata.role = 'admin', an org_memberships admin role, or a private dashboard schema.
CREATE OR REPLACE FUNCTION public.is_loca_admin()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin';
$$;

CREATE TABLE IF NOT EXISTS public.guest_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_token text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.community_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type public.community_record_type NOT NULL,
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 120),
  description text,
  reason text,
  keywords text[] NOT NULL DEFAULT ARRAY[]::text[],
  representative_keyword text,
  pixel_icon_key text,
  region_sido text,
  region_sigungu text,
  address_text text,
  lat double precision NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lng double precision NOT NULL CHECK (lng BETWEEN -180 AND 180),
  route_summary_text text,
  author_name text,
  photo_url text,
  status public.community_record_status NOT NULL DEFAULT 'pending',
  guest_session_id uuid REFERENCES public.guest_sessions(id) ON DELETE SET NULL,
  auth_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  CHECK (type = 'route' OR route_summary_text IS NULL)
);

CREATE TABLE IF NOT EXISTS public.recommend_maps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 120),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  subtitle text,
  description text,
  region text,
  keywords text[] NOT NULL DEFAULT ARRAY[]::text[],
  cover_image_url text,
  reel_url text,
  reel_id text,
  recommender_name text,
  recommender_type public.recommender_type NOT NULL DEFAULT 'editor',
  recommender_instagram text,
  map_center_lat double precision CHECK (map_center_lat BETWEEN -90 AND 90),
  map_center_lng double precision CHECK (map_center_lng BETWEEN -180 AND 180),
  map_zoom integer NOT NULL DEFAULT 14 CHECK (map_zoom BETWEEN 5 AND 21),
  status public.recommend_map_status NOT NULL DEFAULT 'draft',
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.recommend_map_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recommend_map_id uuid NOT NULL REFERENCES public.recommend_maps(id) ON DELETE CASCADE,
  record_id uuid NOT NULL REFERENCES public.community_records(id) ON DELETE RESTRICT,
  record_type public.community_record_type NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  curator_note text,
  video_timestamp_optional integer CHECK (video_timestamp_optional IS NULL OR video_timestamp_optional >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (recommend_map_id, record_id)
);

CREATE TABLE IF NOT EXISTS public.user_saved_recommend_maps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_type public.saved_owner_type NOT NULL,
  owner_id text NOT NULL,
  recommend_map_id uuid NOT NULL REFERENCES public.recommend_maps(id) ON DELETE CASCADE,
  saved_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (owner_type, owner_id, recommend_map_id)
);

CREATE TABLE IF NOT EXISTS public.user_saved_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_type public.saved_owner_type NOT NULL,
  owner_id text NOT NULL,
  record_id uuid NOT NULL REFERENCES public.community_records(id) ON DELETE CASCADE,
  record_type public.community_record_type NOT NULL,
  saved_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (owner_type, owner_id, record_id)
);

CREATE TABLE IF NOT EXISTS public.app_interest_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text,
  auth_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  guest_session_id uuid REFERENCES public.guest_sessions(id) ON DELETE SET NULL,
  email_verified_at timestamptz,
  consent_app_notice boolean NOT NULL DEFAULT false,
  consent_saved_data_link boolean NOT NULL DEFAULT false,
  consent_marketing_optional boolean NOT NULL DEFAULT false,
  source_context text,
  source_recommend_map_id uuid REFERENCES public.recommend_maps(id) ON DELETE SET NULL,
  source_reel_id text,
  saved_recommend_maps_count integer NOT NULL DEFAULT 0 CHECK (saved_recommend_maps_count >= 0),
  saved_records_count integer NOT NULL DEFAULT 0 CHECK (saved_records_count >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type public.report_target_type NOT NULL,
  target_id uuid NOT NULL,
  reason_type text NOT NULL,
  description text,
  reporter_contact_optional text,
  status public.report_status NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.keyword_dictionary (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword text NOT NULL,
  normalized_keyword text NOT NULL UNIQUE,
  emoji text,
  pixel_icon_key text,
  synonyms text[] NOT NULL DEFAULT ARRAY[]::text[],
  category_hint text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_community_records_public_map
  ON public.community_records(status, type, region_sido, region_sigungu, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_community_records_keywords
  ON public.community_records USING gin(keywords);

CREATE INDEX IF NOT EXISTS idx_community_records_location
  ON public.community_records(lat, lng);

CREATE INDEX IF NOT EXISTS idx_recommend_maps_public
  ON public.recommend_maps(status, published_at DESC);

CREATE INDEX IF NOT EXISTS idx_recommend_maps_keywords
  ON public.recommend_maps USING gin(keywords);

CREATE INDEX IF NOT EXISTS idx_recommend_map_items_map_sort
  ON public.recommend_map_items(recommend_map_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_saved_recommend_maps_owner
  ON public.user_saved_recommend_maps(owner_type, owner_id, saved_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_saved_records_owner
  ON public.user_saved_records(owner_type, owner_id, saved_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_app_interest_leads_source
  ON public.app_interest_leads(source_context, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_reports_status
  ON public.reports(status, created_at DESC);

DROP TRIGGER IF EXISTS trg_community_records_touch ON public.community_records;
CREATE TRIGGER trg_community_records_touch
BEFORE UPDATE ON public.community_records
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_recommend_maps_touch ON public.recommend_maps;
CREATE TRIGGER trg_recommend_maps_touch
BEFORE UPDATE ON public.recommend_maps
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_keyword_dictionary_touch ON public.keyword_dictionary;
CREATE TRIGGER trg_keyword_dictionary_touch
BEFORE UPDATE ON public.keyword_dictionary
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.guest_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recommend_maps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recommend_map_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_saved_recommend_maps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_saved_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_interest_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.keyword_dictionary ENABLE ROW LEVEL SECURITY;

-- Public read policies
DROP POLICY IF EXISTS "community_records_public_approved_select" ON public.community_records;
CREATE POLICY "community_records_public_approved_select"
  ON public.community_records
  FOR SELECT
  TO anon, authenticated
  USING (status = 'approved');

DROP POLICY IF EXISTS "community_records_admin_all" ON public.community_records;
CREATE POLICY "community_records_admin_all"
  ON public.community_records
  FOR ALL
  TO authenticated
  USING (public.is_loca_admin())
  WITH CHECK (public.is_loca_admin());

DROP POLICY IF EXISTS "recommend_maps_public_published_select" ON public.recommend_maps;
CREATE POLICY "recommend_maps_public_published_select"
  ON public.recommend_maps
  FOR SELECT
  TO anon, authenticated
  USING (status = 'published');

DROP POLICY IF EXISTS "recommend_maps_admin_all" ON public.recommend_maps;
CREATE POLICY "recommend_maps_admin_all"
  ON public.recommend_maps
  FOR ALL
  TO authenticated
  USING (public.is_loca_admin())
  WITH CHECK (public.is_loca_admin());

DROP POLICY IF EXISTS "recommend_map_items_public_select" ON public.recommend_map_items;
CREATE POLICY "recommend_map_items_public_select"
  ON public.recommend_map_items
  FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.recommend_maps rm
      WHERE rm.id = recommend_map_id
        AND rm.status = 'published'
    )
    AND EXISTS (
      SELECT 1
      FROM public.community_records cr
      WHERE cr.id = record_id
        AND cr.status = 'approved'
    )
  );

DROP POLICY IF EXISTS "recommend_map_items_admin_all" ON public.recommend_map_items;
CREATE POLICY "recommend_map_items_admin_all"
  ON public.recommend_map_items
  FOR ALL
  TO authenticated
  USING (public.is_loca_admin())
  WITH CHECK (public.is_loca_admin());

DROP POLICY IF EXISTS "keyword_dictionary_public_active_select" ON public.keyword_dictionary;
CREATE POLICY "keyword_dictionary_public_active_select"
  ON public.keyword_dictionary
  FOR SELECT
  TO anon, authenticated
  USING (is_active = true);

DROP POLICY IF EXISTS "keyword_dictionary_admin_all" ON public.keyword_dictionary;
CREATE POLICY "keyword_dictionary_admin_all"
  ON public.keyword_dictionary
  FOR ALL
  TO authenticated
  USING (public.is_loca_admin())
  WITH CHECK (public.is_loca_admin());

-- Public submissions: direct INSERT is allowed but never public until approved.
DROP POLICY IF EXISTS "community_records_public_insert_pending" ON public.community_records;
CREATE POLICY "community_records_public_insert_pending"
  ON public.community_records
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    status = 'pending'
    AND type IN ('place', 'route')
    AND (auth_user_id IS NULL OR auth_user_id = auth.uid())
  );

-- Interest leads and reports: public INSERT only. SELECT is admin-only.
DROP POLICY IF EXISTS "app_interest_leads_public_insert" ON public.app_interest_leads;
CREATE POLICY "app_interest_leads_public_insert"
  ON public.app_interest_leads
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (auth_user_id IS NULL OR auth_user_id = auth.uid());

DROP POLICY IF EXISTS "app_interest_leads_admin_select" ON public.app_interest_leads;
CREATE POLICY "app_interest_leads_admin_select"
  ON public.app_interest_leads
  FOR SELECT
  TO authenticated
  USING (public.is_loca_admin());

DROP POLICY IF EXISTS "reports_public_insert" ON public.reports;
CREATE POLICY "reports_public_insert"
  ON public.reports
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (status = 'pending');

DROP POLICY IF EXISTS "reports_admin_select_update" ON public.reports;
CREATE POLICY "reports_admin_select_update"
  ON public.reports
  FOR ALL
  TO authenticated
  USING (public.is_loca_admin())
  WITH CHECK (public.is_loca_admin());

-- Auth-user saved box policies.
-- Supabase Auth anonymous users also have authenticated role and auth.uid(); they can use owner_type='auth_user'.
DROP POLICY IF EXISTS "saved_recommend_maps_auth_owner_select" ON public.user_saved_recommend_maps;
CREATE POLICY "saved_recommend_maps_auth_owner_select"
  ON public.user_saved_recommend_maps
  FOR SELECT
  TO authenticated
  USING (owner_type = 'auth_user' AND owner_id = auth.uid()::text);

DROP POLICY IF EXISTS "saved_recommend_maps_auth_owner_insert" ON public.user_saved_recommend_maps;
CREATE POLICY "saved_recommend_maps_auth_owner_insert"
  ON public.user_saved_recommend_maps
  FOR INSERT
  TO authenticated
  WITH CHECK (owner_type = 'auth_user' AND owner_id = auth.uid()::text);

DROP POLICY IF EXISTS "saved_recommend_maps_auth_owner_update" ON public.user_saved_recommend_maps;
CREATE POLICY "saved_recommend_maps_auth_owner_update"
  ON public.user_saved_recommend_maps
  FOR UPDATE
  TO authenticated
  USING (owner_type = 'auth_user' AND owner_id = auth.uid()::text)
  WITH CHECK (owner_type = 'auth_user' AND owner_id = auth.uid()::text);

DROP POLICY IF EXISTS "saved_records_auth_owner_select" ON public.user_saved_records;
CREATE POLICY "saved_records_auth_owner_select"
  ON public.user_saved_records
  FOR SELECT
  TO authenticated
  USING (owner_type = 'auth_user' AND owner_id = auth.uid()::text);

DROP POLICY IF EXISTS "saved_records_auth_owner_insert" ON public.user_saved_records;
CREATE POLICY "saved_records_auth_owner_insert"
  ON public.user_saved_records
  FOR INSERT
  TO authenticated
  WITH CHECK (owner_type = 'auth_user' AND owner_id = auth.uid()::text);

DROP POLICY IF EXISTS "saved_records_auth_owner_update" ON public.user_saved_records;
CREATE POLICY "saved_records_auth_owner_update"
  ON public.user_saved_records
  FOR UPDATE
  TO authenticated
  USING (owner_type = 'auth_user' AND owner_id = auth.uid()::text)
  WITH CHECK (owner_type = 'auth_user' AND owner_id = auth.uid()::text);

-- Guest-session RPCs. Use only when choosing the custom guest_session_token approach.
-- The frontend sends session_token to RPC. The service role key is never exposed.
CREATE OR REPLACE FUNCTION public.touch_guest_session(p_session_token text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_guest_session_id uuid;
BEGIN
  IF coalesce(length(trim(p_session_token)), 0) < 24 THEN
    RAISE EXCEPTION 'invalid_guest_session_token';
  END IF;

  INSERT INTO public.guest_sessions(session_token)
  VALUES (p_session_token)
  ON CONFLICT (session_token) DO UPDATE
    SET last_seen_at = now()
  RETURNING id INTO v_guest_session_id;

  RETURN v_guest_session_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_recommend_map_for_guest(
  p_session_token text,
  p_recommend_map_id uuid
)
RETURNS public.user_saved_recommend_maps
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_guest_session_id uuid;
  v_saved public.user_saved_recommend_maps;
BEGIN
  v_guest_session_id := public.touch_guest_session(p_session_token);

  INSERT INTO public.user_saved_recommend_maps(owner_type, owner_id, recommend_map_id, deleted_at)
  VALUES ('guest', v_guest_session_id::text, p_recommend_map_id, NULL)
  ON CONFLICT (owner_type, owner_id, recommend_map_id) DO UPDATE
    SET deleted_at = NULL,
        saved_at = now()
  RETURNING * INTO v_saved;

  RETURN v_saved;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_record_for_guest(
  p_session_token text,
  p_record_id uuid
)
RETURNS public.user_saved_records
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_guest_session_id uuid;
  v_record_type public.community_record_type;
  v_saved public.user_saved_records;
BEGIN
  v_guest_session_id := public.touch_guest_session(p_session_token);

  SELECT type INTO v_record_type
  FROM public.community_records
  WHERE id = p_record_id
    AND status = 'approved';

  IF v_record_type IS NULL THEN
    RAISE EXCEPTION 'record_not_found_or_not_public';
  END IF;

  INSERT INTO public.user_saved_records(owner_type, owner_id, record_id, record_type, deleted_at)
  VALUES ('guest', v_guest_session_id::text, p_record_id, v_record_type, NULL)
  ON CONFLICT (owner_type, owner_id, record_id) DO UPDATE
    SET deleted_at = NULL,
        saved_at = now()
  RETURNING * INTO v_saved;

  RETURN v_saved;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_guest_saved_items(
  p_session_token text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_guest_session_id uuid;
  v_maps_count integer := 0;
  v_records_count integer := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'auth_required';
  END IF;

  v_guest_session_id := public.touch_guest_session(p_session_token);

  INSERT INTO public.user_saved_recommend_maps(owner_type, owner_id, recommend_map_id, saved_at, deleted_at)
  SELECT 'auth_user', v_user_id::text, recommend_map_id, saved_at, NULL
  FROM public.user_saved_recommend_maps
  WHERE owner_type = 'guest'
    AND owner_id = v_guest_session_id::text
    AND deleted_at IS NULL
  ON CONFLICT (owner_type, owner_id, recommend_map_id) DO UPDATE
    SET deleted_at = NULL,
        saved_at = LEAST(public.user_saved_recommend_maps.saved_at, EXCLUDED.saved_at);

  GET DIAGNOSTICS v_maps_count = ROW_COUNT;

  INSERT INTO public.user_saved_records(owner_type, owner_id, record_id, record_type, saved_at, deleted_at)
  SELECT 'auth_user', v_user_id::text, record_id, record_type, saved_at, NULL
  FROM public.user_saved_records
  WHERE owner_type = 'guest'
    AND owner_id = v_guest_session_id::text
    AND deleted_at IS NULL
  ON CONFLICT (owner_type, owner_id, record_id) DO UPDATE
    SET deleted_at = NULL,
        saved_at = LEAST(public.user_saved_records.saved_at, EXCLUDED.saved_at);

  GET DIAGNOSTICS v_records_count = ROW_COUNT;

  UPDATE public.user_saved_recommend_maps
  SET deleted_at = now()
  WHERE owner_type = 'guest'
    AND owner_id = v_guest_session_id::text
    AND deleted_at IS NULL;

  UPDATE public.user_saved_records
  SET deleted_at = now()
  WHERE owner_type = 'guest'
    AND owner_id = v_guest_session_id::text
    AND deleted_at IS NULL;

  RETURN jsonb_build_object('success', true, 'recommend_maps', v_maps_count, 'records', v_records_count);
END;
$$;

GRANT SELECT ON public.community_records TO anon, authenticated;
GRANT SELECT ON public.recommend_maps TO anon, authenticated;
GRANT SELECT ON public.recommend_map_items TO anon, authenticated;
GRANT SELECT ON public.keyword_dictionary TO anon, authenticated;
GRANT INSERT ON public.community_records TO anon, authenticated;
GRANT INSERT ON public.app_interest_leads TO anon, authenticated;
GRANT INSERT ON public.reports TO anon, authenticated;
GRANT SELECT, UPDATE, DELETE ON public.community_records TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.recommend_maps TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.recommend_map_items TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.keyword_dictionary TO authenticated;
GRANT SELECT ON public.app_interest_leads TO authenticated;
GRANT SELECT, UPDATE ON public.reports TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.user_saved_recommend_maps TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.user_saved_records TO authenticated;
GRANT EXECUTE ON FUNCTION public.touch_guest_session(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_recommend_map_for_guest(text, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_record_for_guest(text, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_guest_saved_items(text) TO authenticated;
