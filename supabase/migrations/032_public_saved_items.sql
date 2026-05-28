-- 032: Public web saved box
-- Server-side saves for non-login-looking public web users.
-- Uses Supabase Auth users, including anonymous users, as the owner identity.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.user_saved_recommend_maps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  owner_kind text NOT NULL DEFAULT 'auth_user' CHECK (owner_kind IN ('anonymous', 'auth_user')),
  claim_token_hash text,
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
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, recommend_map_id),
  UNIQUE (user_id, recommend_map_slug)
);

CREATE TABLE IF NOT EXISTS public.user_saved_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  owner_kind text NOT NULL DEFAULT 'auth_user' CHECK (owner_kind IN ('anonymous', 'auth_user')),
  claim_token_hash text,
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
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, record_id),
  UNIQUE (user_id, record_key)
);

CREATE INDEX IF NOT EXISTS idx_user_saved_recommend_maps_user_created
  ON public.user_saved_recommend_maps(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_saved_records_user_created
  ON public.user_saved_records(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_saved_records_type
  ON public.user_saved_records(record_type);

ALTER TABLE public.user_saved_recommend_maps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_saved_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "saved_recommend_maps_select_self" ON public.user_saved_recommend_maps;
CREATE POLICY "saved_recommend_maps_select_self"
  ON public.user_saved_recommend_maps
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "saved_recommend_maps_insert_self" ON public.user_saved_recommend_maps;
CREATE POLICY "saved_recommend_maps_insert_self"
  ON public.user_saved_recommend_maps
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "saved_recommend_maps_update_self" ON public.user_saved_recommend_maps;
CREATE POLICY "saved_recommend_maps_update_self"
  ON public.user_saved_recommend_maps
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "saved_recommend_maps_delete_self" ON public.user_saved_recommend_maps;
CREATE POLICY "saved_recommend_maps_delete_self"
  ON public.user_saved_recommend_maps
  FOR DELETE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "saved_records_select_self" ON public.user_saved_records;
CREATE POLICY "saved_records_select_self"
  ON public.user_saved_records
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "saved_records_insert_self" ON public.user_saved_records;
CREATE POLICY "saved_records_insert_self"
  ON public.user_saved_records
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "saved_records_update_self" ON public.user_saved_records;
CREATE POLICY "saved_records_update_self"
  ON public.user_saved_records
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "saved_records_delete_self" ON public.user_saved_records;
CREATE POLICY "saved_records_delete_self"
  ON public.user_saved_records
  FOR DELETE
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

CREATE OR REPLACE FUNCTION public.claim_public_saved_items(
  p_from_user_id uuid,
  p_claim_token text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_to_user_id uuid := auth.uid();
  v_claim_hash text;
  v_maps_count integer := 0;
  v_records_count integer := 0;
BEGIN
  IF v_to_user_id IS NULL THEN
    RAISE EXCEPTION 'auth_required';
  END IF;
  IF p_from_user_id IS NULL OR p_from_user_id = v_to_user_id THEN
    RETURN jsonb_build_object('success', true, 'recommend_maps', 0, 'records', 0);
  END IF;
  IF coalesce(length(trim(p_claim_token)), 0) < 24 THEN
    RAISE EXCEPTION 'claim_token_required';
  END IF;

  v_claim_hash := encode(digest(p_claim_token, 'sha256'), 'hex');

  INSERT INTO public.user_saved_recommend_maps (
    user_id, owner_kind, recommend_map_id, recommend_map_slug, title, region,
    recommender, reel_id, source_context, snapshot, created_at, updated_at
  )
  SELECT
    v_to_user_id, 'auth_user', recommend_map_id, recommend_map_slug, title, region,
    recommender, reel_id, source_context, snapshot, created_at, now()
  FROM public.user_saved_recommend_maps
  WHERE user_id = p_from_user_id
    AND owner_kind = 'anonymous'
    AND claim_token_hash = v_claim_hash
    AND deleted_at IS NULL
  ON CONFLICT (user_id, recommend_map_id) DO UPDATE
    SET snapshot = EXCLUDED.snapshot,
        deleted_at = NULL,
        updated_at = now();

  GET DIAGNOSTICS v_maps_count = ROW_COUNT;

  INSERT INTO public.user_saved_records (
    user_id, owner_kind, record_id, record_key, record_type, title, region, intro,
    source_context, recommend_map_slug, lat, lng, keywords, snapshot, created_at, updated_at
  )
  SELECT
    v_to_user_id, 'auth_user', record_id, record_key, record_type, title, region, intro,
    source_context, recommend_map_slug, lat, lng, keywords, snapshot, created_at, now()
  FROM public.user_saved_records
  WHERE user_id = p_from_user_id
    AND owner_kind = 'anonymous'
    AND claim_token_hash = v_claim_hash
    AND deleted_at IS NULL
  ON CONFLICT (user_id, record_id) DO UPDATE
    SET snapshot = EXCLUDED.snapshot,
        deleted_at = NULL,
        updated_at = now();

  GET DIAGNOSTICS v_records_count = ROW_COUNT;

  UPDATE public.user_saved_recommend_maps
  SET deleted_at = now(), updated_at = now()
  WHERE user_id = p_from_user_id
    AND owner_kind = 'anonymous'
    AND claim_token_hash = v_claim_hash
    AND deleted_at IS NULL;

  UPDATE public.user_saved_records
  SET deleted_at = now(), updated_at = now()
  WHERE user_id = p_from_user_id
    AND owner_kind = 'anonymous'
    AND claim_token_hash = v_claim_hash
    AND deleted_at IS NULL;

  RETURN jsonb_build_object(
    'success', true,
    'recommend_maps', v_maps_count,
    'records', v_records_count
  );
END;
$$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_saved_recommend_maps TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_saved_records TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_public_saved_items(uuid, text) TO authenticated;
