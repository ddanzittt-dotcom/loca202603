-- 034: Guest-token fallback for public web saved box.
-- Used when Supabase Auth anonymous sign-in is disabled.
-- Frontend never receives service-role credentials; guest writes go through SECURITY DEFINER RPCs.

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.user_saved_recommend_maps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  owner_kind text NOT NULL DEFAULT 'auth_user' CHECK (owner_kind IN ('guest', 'anonymous', 'auth_user')),
  claim_token_hash text,
  guest_session_hash text,
  recommend_map_id text NOT NULL,
  recommend_map_slug text NOT NULL,
  title text NOT NULL,
  region text,
  recommender text,
  reel_id text,
  source_context text,
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_saved_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  owner_kind text NOT NULL DEFAULT 'auth_user' CHECK (owner_kind IN ('guest', 'anonymous', 'auth_user')),
  claim_token_hash text,
  guest_session_hash text,
  record_id text NOT NULL,
  record_key text NOT NULL,
  record_type text NOT NULL CHECK (record_type IN ('place', 'route')),
  title text NOT NULL,
  region text,
  intro text,
  source_context text,
  recommend_map_slug text,
  lat double precision,
  lng double precision,
  keywords text[] NOT NULL DEFAULT ARRAY[]::text[],
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_saved_recommend_maps
  ALTER COLUMN user_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS guest_session_hash text;

ALTER TABLE public.user_saved_records
  ALTER COLUMN user_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS guest_session_hash text;

ALTER TABLE public.user_saved_recommend_maps
  DROP CONSTRAINT IF EXISTS user_saved_recommend_maps_owner_kind_check;
ALTER TABLE public.user_saved_recommend_maps
  ADD CONSTRAINT user_saved_recommend_maps_owner_kind_check
  CHECK (owner_kind IN ('guest', 'anonymous', 'auth_user'));

ALTER TABLE public.user_saved_records
  DROP CONSTRAINT IF EXISTS user_saved_records_owner_kind_check;
ALTER TABLE public.user_saved_records
  ADD CONSTRAINT user_saved_records_owner_kind_check
  CHECK (owner_kind IN ('guest', 'anonymous', 'auth_user'));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_saved_recommend_maps_user_id_recommend_map_id_key'
  ) THEN
    ALTER TABLE public.user_saved_recommend_maps
      ADD CONSTRAINT user_saved_recommend_maps_user_id_recommend_map_id_key
      UNIQUE (user_id, recommend_map_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_saved_recommend_maps_user_id_recommend_map_slug_key'
  ) THEN
    ALTER TABLE public.user_saved_recommend_maps
      ADD CONSTRAINT user_saved_recommend_maps_user_id_recommend_map_slug_key
      UNIQUE (user_id, recommend_map_slug);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_saved_records_user_id_record_id_key'
  ) THEN
    ALTER TABLE public.user_saved_records
      ADD CONSTRAINT user_saved_records_user_id_record_id_key
      UNIQUE (user_id, record_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_saved_records_user_id_record_key_key'
  ) THEN
    ALTER TABLE public.user_saved_records
      ADD CONSTRAINT user_saved_records_user_id_record_key_key
      UNIQUE (user_id, record_key);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_user_saved_recommend_maps_user_created
  ON public.user_saved_recommend_maps(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_saved_records_user_created
  ON public.user_saved_records(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_saved_records_type
  ON public.user_saved_records(record_type);
CREATE INDEX IF NOT EXISTS idx_user_saved_recommend_maps_guest_created
  ON public.user_saved_recommend_maps(guest_session_hash, created_at DESC)
  WHERE owner_kind = 'guest';

CREATE INDEX IF NOT EXISTS idx_user_saved_records_guest_created
  ON public.user_saved_records(guest_session_hash, created_at DESC)
  WHERE owner_kind = 'guest';

ALTER TABLE public.user_saved_recommend_maps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_saved_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "saved_recommend_maps_select_self" ON public.user_saved_recommend_maps;
CREATE POLICY "saved_recommend_maps_select_self"
  ON public.user_saved_recommend_maps
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "saved_recommend_maps_insert_self" ON public.user_saved_recommend_maps;
CREATE POLICY "saved_recommend_maps_insert_self"
  ON public.user_saved_recommend_maps
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "saved_recommend_maps_update_self" ON public.user_saved_recommend_maps;
CREATE POLICY "saved_recommend_maps_update_self"
  ON public.user_saved_recommend_maps
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "saved_recommend_maps_delete_self" ON public.user_saved_recommend_maps;
CREATE POLICY "saved_recommend_maps_delete_self"
  ON public.user_saved_recommend_maps
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "saved_records_select_self" ON public.user_saved_records;
CREATE POLICY "saved_records_select_self"
  ON public.user_saved_records
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "saved_records_insert_self" ON public.user_saved_records;
CREATE POLICY "saved_records_insert_self"
  ON public.user_saved_records
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "saved_records_update_self" ON public.user_saved_records;
CREATE POLICY "saved_records_update_self"
  ON public.user_saved_records
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "saved_records_delete_self" ON public.user_saved_records;
CREATE POLICY "saved_records_delete_self"
  ON public.user_saved_records
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.touch_public_saved_item()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_saved_recommend_maps ON public.user_saved_recommend_maps;
CREATE TRIGGER trg_touch_saved_recommend_maps
BEFORE UPDATE ON public.user_saved_recommend_maps
FOR EACH ROW EXECUTE FUNCTION public.touch_public_saved_item();

DROP TRIGGER IF EXISTS trg_touch_saved_records ON public.user_saved_records;
CREATE TRIGGER trg_touch_saved_records
BEFORE UPDATE ON public.user_saved_records
FOR EACH ROW EXECUTE FUNCTION public.touch_public_saved_item();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_saved_recommend_maps TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_saved_records TO authenticated;

CREATE OR REPLACE FUNCTION public.public_guest_token_hash(p_session_token text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF coalesce(length(trim(p_session_token)), 0) < 24 THEN
    RAISE EXCEPTION 'guest_session_token_required';
  END IF;
  RETURN encode(extensions.digest(p_session_token, 'sha256'), 'hex');
END;
$$;

CREATE OR REPLACE FUNCTION public.save_public_recommend_map_guest(
  p_session_token text,
  p_recommend_map_id text,
  p_recommend_map_slug text,
  p_title text,
  p_region text DEFAULT NULL,
  p_recommender text DEFAULT NULL,
  p_reel_id text DEFAULT NULL,
  p_source_context text DEFAULT 'public_recommend_map',
  p_snapshot jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hash text := public.public_guest_token_hash(p_session_token);
  v_row public.user_saved_recommend_maps%ROWTYPE;
BEGIN
  UPDATE public.user_saved_recommend_maps
  SET recommend_map_slug = p_recommend_map_slug,
      title = p_title,
      region = p_region,
      recommender = p_recommender,
      reel_id = p_reel_id,
      source_context = p_source_context,
      snapshot = coalesce(p_snapshot, '{}'::jsonb),
      deleted_at = NULL,
      updated_at = now()
  WHERE owner_kind = 'guest'
    AND guest_session_hash = v_hash
    AND recommend_map_id = p_recommend_map_id
  RETURNING * INTO v_row;

  IF FOUND THEN
    RETURN to_jsonb(v_row);
  END IF;

  INSERT INTO public.user_saved_recommend_maps (
    user_id, owner_kind, guest_session_hash, recommend_map_id, recommend_map_slug,
    title, region, recommender, reel_id, source_context, snapshot, deleted_at
  )
  VALUES (
    NULL, 'guest', v_hash, p_recommend_map_id, p_recommend_map_slug,
    p_title, p_region, p_recommender, p_reel_id, p_source_context,
    coalesce(p_snapshot, '{}'::jsonb), NULL
  )
  RETURNING * INTO v_row;

  RETURN to_jsonb(v_row);
END;
$$;

CREATE OR REPLACE FUNCTION public.save_public_record_guest(
  p_session_token text,
  p_record_id text,
  p_record_key text,
  p_record_type text,
  p_title text,
  p_region text DEFAULT NULL,
  p_intro text DEFAULT NULL,
  p_source_context text DEFAULT 'public_community_web',
  p_recommend_map_slug text DEFAULT NULL,
  p_lat double precision DEFAULT NULL,
  p_lng double precision DEFAULT NULL,
  p_keywords text[] DEFAULT ARRAY[]::text[],
  p_snapshot jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hash text := public.public_guest_token_hash(p_session_token);
  v_row public.user_saved_records%ROWTYPE;
BEGIN
  IF p_record_type NOT IN ('place', 'route') THEN
    RAISE EXCEPTION 'invalid_record_type';
  END IF;

  UPDATE public.user_saved_records
  SET record_key = p_record_key,
      record_type = p_record_type,
      title = p_title,
      region = p_region,
      intro = p_intro,
      source_context = p_source_context,
      recommend_map_slug = p_recommend_map_slug,
      lat = p_lat,
      lng = p_lng,
      keywords = coalesce(p_keywords, ARRAY[]::text[]),
      snapshot = coalesce(p_snapshot, '{}'::jsonb),
      deleted_at = NULL,
      updated_at = now()
  WHERE owner_kind = 'guest'
    AND guest_session_hash = v_hash
    AND record_id = p_record_id
  RETURNING * INTO v_row;

  IF FOUND THEN
    RETURN to_jsonb(v_row);
  END IF;

  INSERT INTO public.user_saved_records (
    user_id, owner_kind, guest_session_hash, record_id, record_key, record_type,
    title, region, intro, source_context, recommend_map_slug, lat, lng,
    keywords, snapshot, deleted_at
  )
  VALUES (
    NULL, 'guest', v_hash, p_record_id, p_record_key, p_record_type,
    p_title, p_region, p_intro, p_source_context, p_recommend_map_slug,
    p_lat, p_lng, coalesce(p_keywords, ARRAY[]::text[]),
    coalesce(p_snapshot, '{}'::jsonb), NULL
  )
  RETURNING * INTO v_row;

  RETURN to_jsonb(v_row);
END;
$$;

CREATE OR REPLACE FUNCTION public.list_public_saved_items_guest(p_session_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hash text := public.public_guest_token_hash(p_session_token);
  v_maps jsonb;
  v_records jsonb;
BEGIN
  SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY m.created_at DESC), '[]'::jsonb)
  INTO v_maps
  FROM public.user_saved_recommend_maps m
  WHERE m.owner_kind = 'guest'
    AND m.guest_session_hash = v_hash
    AND m.deleted_at IS NULL;

  SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.created_at DESC), '[]'::jsonb)
  INTO v_records
  FROM public.user_saved_records r
  WHERE r.owner_kind = 'guest'
    AND r.guest_session_hash = v_hash
    AND r.deleted_at IS NULL;

  RETURN jsonb_build_object('recommendMaps', v_maps, 'records', v_records);
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_public_recommend_map_guest(
  p_session_token text,
  p_saved_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hash text := public.public_guest_token_hash(p_session_token);
BEGIN
  UPDATE public.user_saved_recommend_maps
  SET deleted_at = now(), updated_at = now()
  WHERE id = p_saved_id
    AND owner_kind = 'guest'
    AND guest_session_hash = v_hash;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_public_record_guest(
  p_session_token text,
  p_saved_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hash text := public.public_guest_token_hash(p_session_token);
BEGIN
  UPDATE public.user_saved_records
  SET deleted_at = now(), updated_at = now()
  WHERE id = p_saved_id
    AND owner_kind = 'guest'
    AND guest_session_hash = v_hash;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_public_guest_saved_items(p_session_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_to_user_id uuid := auth.uid();
  v_hash text := public.public_guest_token_hash(p_session_token);
  v_maps_count integer := 0;
  v_records_count integer := 0;
BEGIN
  IF v_to_user_id IS NULL THEN
    RAISE EXCEPTION 'auth_required';
  END IF;

  INSERT INTO public.user_saved_recommend_maps (
    user_id, owner_kind, claim_token_hash, recommend_map_id, recommend_map_slug,
    title, region, recommender, reel_id, source_context, snapshot,
    created_at, updated_at
  )
  SELECT
    v_to_user_id, 'auth_user', NULL, recommend_map_id, recommend_map_slug,
    title, region, recommender, reel_id, source_context, snapshot,
    created_at, now()
  FROM public.user_saved_recommend_maps
  WHERE owner_kind = 'guest'
    AND guest_session_hash = v_hash
    AND deleted_at IS NULL
  ON CONFLICT (user_id, recommend_map_id) DO UPDATE
    SET snapshot = EXCLUDED.snapshot,
        deleted_at = NULL,
        updated_at = now();

  GET DIAGNOSTICS v_maps_count = ROW_COUNT;

  INSERT INTO public.user_saved_records (
    user_id, owner_kind, claim_token_hash, record_id, record_key, record_type,
    title, region, intro, source_context, recommend_map_slug, lat, lng,
    keywords, snapshot, created_at, updated_at
  )
  SELECT
    v_to_user_id, 'auth_user', NULL, record_id, record_key, record_type,
    title, region, intro, source_context, recommend_map_slug, lat, lng,
    keywords, snapshot, created_at, now()
  FROM public.user_saved_records
  WHERE owner_kind = 'guest'
    AND guest_session_hash = v_hash
    AND deleted_at IS NULL
  ON CONFLICT (user_id, record_id) DO UPDATE
    SET snapshot = EXCLUDED.snapshot,
        deleted_at = NULL,
        updated_at = now();

  GET DIAGNOSTICS v_records_count = ROW_COUNT;

  UPDATE public.user_saved_recommend_maps
  SET deleted_at = now(), updated_at = now()
  WHERE owner_kind = 'guest'
    AND guest_session_hash = v_hash
    AND deleted_at IS NULL;

  UPDATE public.user_saved_records
  SET deleted_at = now(), updated_at = now()
  WHERE owner_kind = 'guest'
    AND guest_session_hash = v_hash
    AND deleted_at IS NULL;

  RETURN jsonb_build_object(
    'success', true,
    'recommend_maps', v_maps_count,
    'records', v_records_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_public_recommend_map_guest(text, text, text, text, text, text, text, text, jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_public_record_guest(text, text, text, text, text, text, text, text, text, double precision, double precision, text[], jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_public_saved_items_guest(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_public_recommend_map_guest(text, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_public_record_guest(text, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_public_guest_saved_items(text) TO authenticated;

NOTIFY pgrst, 'reload schema';
