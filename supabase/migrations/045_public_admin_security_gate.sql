CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.list_community_moderation_records(
  p_status text DEFAULT 'pending',
  p_limit integer DEFAULT 80
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text := CASE WHEN p_status IN ('pending', 'reported', 'rejected', 'hidden', 'approved') THEN p_status ELSE 'pending' END;
  v_rows jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'admin_required' USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.created_at DESC), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT
      id, type, title, description, reason, keywords, representative_keyword,
      pixel_icon_key, lat, lng, route_summary_text, author_name, status,
      created_at, updated_at, approved_at
    FROM public.community_records
    WHERE status = v_status
    ORDER BY created_at DESC
    LIMIT least(greatest(coalesce(p_limit, 80), 1), 200)
  ) r;

  RETURN jsonb_build_object('records', v_rows);
END;
$$;

CREATE OR REPLACE FUNCTION public.update_community_moderation_status(
  p_record_id uuid,
  p_status text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.community_records%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'admin_required' USING ERRCODE = '42501';
  END IF;

  IF p_status NOT IN ('approved', 'rejected', 'hidden') THEN
    RAISE EXCEPTION 'invalid_status';
  END IF;

  UPDATE public.community_records
  SET status = p_status,
      approved_at = CASE WHEN p_status = 'approved' THEN now() ELSE NULL END,
      updated_at = now()
  WHERE id = p_record_id
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'record_not_found';
  END IF;

  RETURN to_jsonb(v_row);
END;
$$;

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
  v_user_key text;
  v_allowed boolean;
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

  IF v_guest_session_id IS NOT NULL AND length(v_guest_session_id) < 24 THEN
    RAISE EXCEPTION 'invalid_guest_session';
  END IF;

  v_user_key := CASE
    WHEN v_auth_user_id IS NOT NULL THEN 'u:' || v_auth_user_id::text
    ELSE 'g:' || encode(digest(v_guest_session_id, 'sha256'), 'hex')
  END;

  v_allowed := public.check_rate_limit(v_user_key, 'community_record_create', 5);
  IF NOT v_allowed THEN
    RAISE EXCEPTION 'rate_limited';
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

REVOKE ALL ON FUNCTION public.list_community_moderation_records(text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_community_moderation_status(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_community_moderation_records(text, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_community_moderation_status(uuid, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.create_community_record_public(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_community_record_public(jsonb) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
