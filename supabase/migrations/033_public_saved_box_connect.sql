-- 033: Public saved box connection leads and compatibility fixes.
-- Keeps the public web "saved box connect" flow on anon/authenticated RLS only.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE public.user_saved_recommend_maps
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

ALTER TABLE public.user_saved_records
  ADD COLUMN IF NOT EXISTS record_id text,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

UPDATE public.user_saved_records
SET record_id = record_key
WHERE record_id IS NULL;

ALTER TABLE public.user_saved_records
  ALTER COLUMN record_id SET NOT NULL;

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
    WHERE conname = 'user_saved_records_user_id_record_id_key'
  ) THEN
    ALTER TABLE public.user_saved_records
      ADD CONSTRAINT user_saved_records_user_id_record_id_key
      UNIQUE (user_id, record_id);
  END IF;
END $$;

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

CREATE TABLE IF NOT EXISTS public.app_interest_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  email text,
  guest_session_id text,
  source_context text NOT NULL DEFAULT 'public_saved_box_connect',
  lead_type text NOT NULL DEFAULT 'saved_box_connect',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.app_interest_leads
  ADD COLUMN IF NOT EXISTS auth_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS guest_session_id text,
  ADD COLUMN IF NOT EXISTS source_context text NOT NULL DEFAULT 'public_saved_box_connect',
  ADD COLUMN IF NOT EXISTS lead_type text NOT NULL DEFAULT 'saved_box_connect',
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_app_interest_leads_auth_user
  ON public.app_interest_leads(auth_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_app_interest_leads_guest
  ON public.app_interest_leads(guest_session_id, created_at DESC);

ALTER TABLE public.app_interest_leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "app_interest_leads_insert_public" ON public.app_interest_leads;
CREATE POLICY "app_interest_leads_insert_public"
  ON public.app_interest_leads
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (auth_user_id IS NULL OR auth.uid() = auth_user_id);

DROP POLICY IF EXISTS "app_interest_leads_select_self" ON public.app_interest_leads;
CREATE POLICY "app_interest_leads_select_self"
  ON public.app_interest_leads
  FOR SELECT
  TO authenticated
  USING (auth_user_id IS NOT NULL AND auth.uid() = auth_user_id);

DROP TRIGGER IF EXISTS trg_touch_app_interest_leads ON public.app_interest_leads;
CREATE TRIGGER trg_touch_app_interest_leads
BEFORE UPDATE ON public.app_interest_leads
FOR EACH ROW EXECUTE FUNCTION public.touch_public_saved_item();

GRANT SELECT, INSERT ON public.app_interest_leads TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_public_saved_items(uuid, text) TO authenticated;
