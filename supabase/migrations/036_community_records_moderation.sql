-- 036: Public community records submission and moderation MVP.
-- Creates the real pending/approved record table used by /community-web and /admin/community-moderation.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.community_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL CHECK (type IN ('place', 'route')),
  title text NOT NULL,
  description text NOT NULL,
  reason text,
  keywords text[] NOT NULL DEFAULT ARRAY[]::text[],
  representative_keyword text,
  pixel_icon_key text,
  region_sido text,
  region_sigungu text,
  address_text text,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  route_summary_text text,
  author_name text,
  photo_url text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'hidden', 'reported')),
  guest_session_id text,
  auth_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_community_records_status_created
  ON public.community_records(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_community_records_type_status
  ON public.community_records(type, status);

CREATE INDEX IF NOT EXISTS idx_community_records_location
  ON public.community_records(lat, lng);

CREATE INDEX IF NOT EXISTS idx_community_records_keywords
  ON public.community_records USING gin(keywords);

ALTER TABLE public.community_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "community_records_public_select_approved" ON public.community_records;
CREATE POLICY "community_records_public_select_approved"
  ON public.community_records
  FOR SELECT
  TO anon, authenticated
  USING (status = 'approved');

DROP POLICY IF EXISTS "community_records_public_insert_pending" ON public.community_records;
CREATE POLICY "community_records_public_insert_pending"
  ON public.community_records
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    status = 'pending'
    AND type IN ('place', 'route')
    AND (auth_user_id IS NULL OR auth.uid() = auth_user_id)
  );

CREATE OR REPLACE FUNCTION public.touch_community_records()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_community_records ON public.community_records;
CREATE TRIGGER trg_touch_community_records
BEFORE UPDATE ON public.community_records
FOR EACH ROW EXECUTE FUNCTION public.touch_community_records();

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

GRANT SELECT, INSERT ON public.community_records TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_community_moderation_records(text, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_community_moderation_status(uuid, text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
