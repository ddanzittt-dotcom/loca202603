-- 037: Optional no-moderation mode for public community submissions.
-- Default remains moderation-first. Toggle with:
-- UPDATE public.community_operating_settings SET auto_approve_records = true, updated_at = now() WHERE id = true;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.community_operating_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  auto_approve_records boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.community_operating_settings (id, auto_approve_records)
VALUES (true, false)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.community_operating_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "community_operating_settings_no_public_select" ON public.community_operating_settings;
CREATE POLICY "community_operating_settings_no_public_select"
  ON public.community_operating_settings
  FOR SELECT
  TO anon, authenticated
  USING (false);

CREATE OR REPLACE FUNCTION public.create_community_record_public(p_record jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_type text := p_record->>'type';
  v_title text := btrim(coalesce(p_record->>'title', ''));
  v_description text := btrim(coalesce(p_record->>'description', ''));
  v_reason text := nullif(btrim(coalesce(p_record->>'reason', '')), '');
  v_keywords text[] := ARRAY[]::text[];
  v_lat double precision;
  v_lng double precision;
  v_auth_user_id uuid := NULL;
  v_guest_session_id text := nullif(btrim(coalesce(p_record->>'guest_session_id', '')), '');
  v_status text;
  v_row public.community_records%ROWTYPE;
BEGIN
  IF v_type NOT IN ('place', 'route') THEN
    RAISE EXCEPTION 'invalid_record_type';
  END IF;

  IF v_title = '' OR v_description = '' THEN
    RAISE EXCEPTION 'missing_required_fields';
  END IF;

  BEGIN
    v_id := coalesce(nullif(p_record->>'id', '')::uuid, gen_random_uuid());
  EXCEPTION WHEN invalid_text_representation THEN
    v_id := gen_random_uuid();
  END;

  BEGIN
    v_lat := (p_record->>'lat')::double precision;
    v_lng := (p_record->>'lng')::double precision;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'invalid_location';
  END;

  IF p_record ? 'auth_user_id' AND nullif(p_record->>'auth_user_id', '') IS NOT NULL THEN
    v_auth_user_id := (p_record->>'auth_user_id')::uuid;
    IF auth.uid() IS NULL OR auth.uid() <> v_auth_user_id THEN
      RAISE EXCEPTION 'invalid_auth_owner';
    END IF;
  END IF;

  IF v_auth_user_id IS NULL AND v_guest_session_id IS NULL THEN
    RAISE EXCEPTION 'missing_submission_owner';
  END IF;

  IF jsonb_typeof(p_record->'keywords') = 'array' THEN
    SELECT coalesce(array_agg(value), ARRAY[]::text[])
    INTO v_keywords
    FROM (
      SELECT DISTINCT btrim(value) AS value
      FROM jsonb_array_elements_text(p_record->'keywords') AS value
      WHERE btrim(value) <> ''
      LIMIT 12
    ) keyword_rows;
  END IF;

  SELECT CASE WHEN coalesce(auto_approve_records, false) THEN 'approved' ELSE 'pending' END
  INTO v_status
  FROM public.community_operating_settings
  WHERE id = true;

  v_status := coalesce(v_status, 'pending');

  INSERT INTO public.community_records (
    id,
    type,
    title,
    description,
    reason,
    keywords,
    representative_keyword,
    pixel_icon_key,
    region_sido,
    region_sigungu,
    address_text,
    lat,
    lng,
    route_summary_text,
    author_name,
    photo_url,
    status,
    guest_session_id,
    auth_user_id,
    approved_at
  )
  VALUES (
    v_id,
    v_type,
    v_title,
    v_description,
    v_reason,
    v_keywords,
    nullif(btrim(coalesce(p_record->>'representative_keyword', '')), ''),
    nullif(btrim(coalesce(p_record->>'pixel_icon_key', '')), ''),
    nullif(btrim(coalesce(p_record->>'region_sido', '')), ''),
    nullif(btrim(coalesce(p_record->>'region_sigungu', '')), ''),
    nullif(btrim(coalesce(p_record->>'address_text', '')), ''),
    v_lat,
    v_lng,
    CASE WHEN v_type = 'route' THEN nullif(btrim(coalesce(p_record->>'route_summary_text', v_description)), '') ELSE NULL END,
    nullif(btrim(coalesce(p_record->>'author_name', '')), ''),
    nullif(btrim(coalesce(p_record->>'photo_url', '')), ''),
    v_status,
    v_guest_session_id,
    v_auth_user_id,
    CASE WHEN v_status = 'approved' THEN now() ELSE NULL END
  )
  RETURNING * INTO v_row;

  RETURN to_jsonb(v_row);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_community_record_public(jsonb) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
