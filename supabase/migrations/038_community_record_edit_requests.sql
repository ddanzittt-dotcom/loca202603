-- 038: Public community record owner edit + visitor edit requests.
-- Supports /community-web "내 기록 수정" and "수정 요청" without exposing service role keys.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.community_record_edit_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id text NOT NULL,
  record_key text,
  record_type text NOT NULL DEFAULT 'place' CHECK (record_type IN ('place', 'route')),
  auth_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  guest_session_hash text,
  current_title text,
  proposed_title text NOT NULL,
  proposed_description text NOT NULL,
  proposed_reason text,
  proposed_keywords text[] NOT NULL DEFAULT ARRAY[]::text[],
  proposed_representative_keyword text,
  proposed_pixel_icon_key text,
  proposed_route_summary_text text,
  requester_note text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'hidden')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_community_record_edit_requests_record
  ON public.community_record_edit_requests(record_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_community_record_edit_requests_status
  ON public.community_record_edit_requests(status, created_at DESC);

ALTER TABLE public.community_record_edit_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "community_record_edit_requests_insert_public" ON public.community_record_edit_requests;
CREATE POLICY "community_record_edit_requests_insert_public"
  ON public.community_record_edit_requests
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (status = 'pending');

CREATE OR REPLACE FUNCTION public.touch_community_record_edit_requests()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_community_record_edit_requests ON public.community_record_edit_requests;
CREATE TRIGGER trg_touch_community_record_edit_requests
BEFORE UPDATE ON public.community_record_edit_requests
FOR EACH ROW EXECUTE FUNCTION public.touch_community_record_edit_requests();

CREATE OR REPLACE FUNCTION public.community_record_guest_hash(
  p_session_token text,
  p_required boolean DEFAULT false
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF coalesce(length(trim(p_session_token)), 0) < 24 THEN
    IF p_required THEN
      RAISE EXCEPTION 'guest_session_token_required';
    END IF;
    RETURN NULL;
  END IF;

  RETURN encode(digest(p_session_token, 'sha256'), 'hex');
END;
$$;

CREATE OR REPLACE FUNCTION public.create_community_record_edit_request_guest(
  p_session_token text,
  p_record_id text,
  p_record_key text,
  p_record_type text,
  p_current_title text,
  p_patch jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_hash text := public.community_record_guest_hash(p_session_token, true);
  v_user_id uuid := auth.uid();
  v_title text := trim(coalesce(p_patch->>'title', ''));
  v_description text := trim(coalesce(p_patch->>'description', ''));
  v_reason text := nullif(trim(coalesce(p_patch->>'reason', '')), '');
  v_keywords text[] := ARRAY(
    SELECT DISTINCT left(trim(value), 40)
    FROM jsonb_array_elements_text(coalesce(p_patch->'keywords', '[]'::jsonb)) AS value
    WHERE trim(value) <> ''
    LIMIT 12
  );
  v_row public.community_record_edit_requests%ROWTYPE;
  v_recent_count integer;
BEGIN
  IF coalesce(length(trim(p_record_id)), 0) = 0 THEN
    RAISE EXCEPTION 'record_id_required';
  END IF;
  IF v_title = '' OR v_description = '' THEN
    RAISE EXCEPTION 'edit_required';
  END IF;

  SELECT count(*)
  INTO v_recent_count
  FROM public.community_record_edit_requests r
  WHERE r.guest_session_hash = v_hash
    AND r.created_at > now() - interval '1 minute';

  IF v_recent_count >= 5 THEN
    RAISE EXCEPTION 'rate_limited';
  END IF;

  INSERT INTO public.community_record_edit_requests (
    record_id, record_key, record_type, auth_user_id, guest_session_hash,
    current_title, proposed_title, proposed_description, proposed_reason,
    proposed_keywords, proposed_representative_keyword, proposed_pixel_icon_key,
    proposed_route_summary_text, status
  )
  VALUES (
    left(trim(p_record_id), 120),
    nullif(left(trim(coalesce(p_record_key, '')), 240), ''),
    CASE WHEN p_record_type = 'route' THEN 'route' ELSE 'place' END,
    v_user_id,
    v_hash,
    nullif(left(trim(coalesce(p_current_title, '')), 120), ''),
    left(v_title, 120),
    left(v_description, 1000),
    v_reason,
    coalesce(v_keywords, ARRAY[]::text[]),
    nullif(left(trim(coalesce(p_patch->>'representative_keyword', '')), 40), ''),
    nullif(left(trim(coalesce(p_patch->>'pixel_icon_key', '')), 80), ''),
    nullif(left(trim(coalesce(p_patch->>'route_summary_text', '')), 1000), ''),
    'pending'
  )
  RETURNING * INTO v_row;

  RETURN to_jsonb(v_row);
END;
$$;

CREATE OR REPLACE FUNCTION public.update_community_record_guest(
  p_session_token text,
  p_record_id text,
  p_patch jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_record_id uuid;
  v_user_id uuid := auth.uid();
  v_row public.community_records%ROWTYPE;
  v_title text := trim(coalesce(p_patch->>'title', ''));
  v_description text := trim(coalesce(p_patch->>'description', ''));
  v_keywords text[] := ARRAY(
    SELECT DISTINCT left(trim(value), 40)
    FROM jsonb_array_elements_text(coalesce(p_patch->'keywords', '[]'::jsonb)) AS value
    WHERE trim(value) <> ''
    LIMIT 12
  );
BEGIN
  BEGIN
    v_record_id := p_record_id::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'record_id_invalid';
  END;

  IF v_title = '' OR v_description = '' THEN
    RAISE EXCEPTION 'edit_required';
  END IF;

  SELECT *
  INTO v_row
  FROM public.community_records
  WHERE id = v_record_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'record_not_found';
  END IF;

  IF NOT (
    (v_user_id IS NOT NULL AND v_row.auth_user_id = v_user_id)
    OR (coalesce(length(trim(p_session_token)), 0) >= 24 AND v_row.guest_session_id = p_session_token)
  ) THEN
    RAISE EXCEPTION 'not_owner';
  END IF;

  UPDATE public.community_records
  SET title = left(v_title, 120),
      description = left(v_description, 1000),
      reason = nullif(trim(coalesce(p_patch->>'reason', '')), ''),
      keywords = coalesce(v_keywords, ARRAY[]::text[]),
      representative_keyword = nullif(left(trim(coalesce(p_patch->>'representative_keyword', '')), 40), ''),
      pixel_icon_key = nullif(left(trim(coalesce(p_patch->>'pixel_icon_key', '')), 80), ''),
      route_summary_text = CASE
        WHEN v_row.type = 'route' THEN nullif(left(trim(coalesce(p_patch->>'route_summary_text', v_description)), 1000), '')
        ELSE NULL
      END,
      updated_at = now()
  WHERE id = v_record_id
  RETURNING * INTO v_row;

  RETURN to_jsonb(v_row);
END;
$$;

GRANT INSERT ON public.community_record_edit_requests TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_community_record_edit_request_guest(text, text, text, text, text, jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_community_record_guest(text, text, jsonb) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
