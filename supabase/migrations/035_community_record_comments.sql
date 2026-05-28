-- 035: Public community record comments.
-- Allows visitors to leave comments on public place/route records through guest-token RPCs.

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.community_record_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id text NOT NULL,
  record_key text,
  record_type text NOT NULL DEFAULT 'place' CHECK (record_type IN ('place', 'route')),
  auth_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  guest_session_hash text,
  author_name text NOT NULL DEFAULT '방문자',
  body text NOT NULL,
  status text NOT NULL DEFAULT 'visible' CHECK (status IN ('visible', 'hidden', 'reported', 'deleted')),
  report_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.community_record_comment_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id uuid NOT NULL REFERENCES public.community_record_comments(id) ON DELETE CASCADE,
  reporter_key text NOT NULL,
  reason text NOT NULL DEFAULT 'inappropriate',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (comment_id, reporter_key)
);

CREATE INDEX IF NOT EXISTS idx_community_record_comments_record
  ON public.community_record_comments(record_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_community_record_comments_guest
  ON public.community_record_comments(guest_session_hash, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_community_record_comment_reports_comment
  ON public.community_record_comment_reports(comment_id);

ALTER TABLE public.community_record_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_record_comment_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "community_record_comments_select_visible" ON public.community_record_comments;
CREATE POLICY "community_record_comments_select_visible"
  ON public.community_record_comments
  FOR SELECT
  TO anon, authenticated
  USING (status = 'visible');

DROP POLICY IF EXISTS "community_record_comment_reports_insert_public" ON public.community_record_comment_reports;
CREATE POLICY "community_record_comment_reports_insert_public"
  ON public.community_record_comment_reports
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.touch_community_record_comment()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_community_record_comments ON public.community_record_comments;
CREATE TRIGGER trg_touch_community_record_comments
BEFORE UPDATE ON public.community_record_comments
FOR EACH ROW EXECUTE FUNCTION public.touch_community_record_comment();

CREATE OR REPLACE FUNCTION public.community_comment_guest_hash(
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

  RETURN encode(extensions.digest(p_session_token, 'sha256'), 'hex');
END;
$$;

CREATE OR REPLACE FUNCTION public.list_community_record_comments(
  p_record_id text,
  p_record_key text DEFAULT NULL,
  p_session_token text DEFAULT NULL,
  p_limit integer DEFAULT 30,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_hash text := public.community_comment_guest_hash(p_session_token, false);
  v_user_id uuid := auth.uid();
  v_rows jsonb;
  v_total integer;
BEGIN
  IF coalesce(length(trim(p_record_id)), 0) = 0 THEN
    RETURN jsonb_build_object('comments', '[]'::jsonb, 'total', 0);
  END IF;

  SELECT count(*)
  INTO v_total
  FROM public.community_record_comments c
  WHERE c.record_id = p_record_id
    AND c.status = 'visible';

  SELECT coalesce(jsonb_agg(row_data ORDER BY created_at DESC), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT
      c.created_at,
      jsonb_build_object(
        'id', c.id,
        'record_id', c.record_id,
        'record_key', c.record_key,
        'record_type', c.record_type,
        'author_name', c.author_name,
        'body', c.body,
        'created_at', c.created_at,
        'updated_at', c.updated_at,
        'is_mine', (
          (v_user_id IS NOT NULL AND c.auth_user_id = v_user_id)
          OR (v_hash IS NOT NULL AND c.guest_session_hash = v_hash)
        )
      ) AS row_data
    FROM public.community_record_comments c
    WHERE c.record_id = p_record_id
      AND c.status = 'visible'
    ORDER BY c.created_at DESC
    LIMIT least(greatest(coalesce(p_limit, 30), 1), 50)
    OFFSET greatest(coalesce(p_offset, 0), 0)
  ) q;

  RETURN jsonb_build_object(
    'comments', v_rows,
    'total', coalesce(v_total, 0)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.create_community_record_comment_guest(
  p_session_token text,
  p_record_id text,
  p_record_key text,
  p_record_type text,
  p_body text,
  p_author_name text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_hash text := public.community_comment_guest_hash(p_session_token, true);
  v_user_id uuid := auth.uid();
  v_body text := trim(coalesce(p_body, ''));
  v_author text := trim(coalesce(p_author_name, ''));
  v_recent_count integer;
  v_row public.community_record_comments%ROWTYPE;
BEGIN
  IF coalesce(length(trim(p_record_id)), 0) = 0 THEN
    RAISE EXCEPTION 'record_id_required';
  END IF;
  IF v_body = '' THEN
    RAISE EXCEPTION 'body_required';
  END IF;
  IF char_length(v_body) > 500 THEN
    RAISE EXCEPTION 'body_too_long';
  END IF;

  SELECT count(*)
  INTO v_recent_count
  FROM public.community_record_comments c
  WHERE c.guest_session_hash = v_hash
    AND c.created_at > now() - interval '1 minute';

  IF v_recent_count >= 5 THEN
    RAISE EXCEPTION 'rate_limited';
  END IF;

  INSERT INTO public.community_record_comments (
    record_id, record_key, record_type, auth_user_id, guest_session_hash,
    author_name, body, status
  )
  VALUES (
    p_record_id,
    NULLIF(p_record_key, ''),
    CASE WHEN p_record_type = 'route' THEN 'route' ELSE 'place' END,
    v_user_id,
    v_hash,
    CASE WHEN v_author = '' THEN '방문자' ELSE left(v_author, 24) END,
    v_body,
    'visible'
  )
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'record_id', v_row.record_id,
    'record_key', v_row.record_key,
    'record_type', v_row.record_type,
    'author_name', v_row.author_name,
    'body', v_row.body,
    'created_at', v_row.created_at,
    'updated_at', v_row.updated_at,
    'is_mine', true
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_community_record_comment_guest(
  p_session_token text,
  p_comment_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_hash text := public.community_comment_guest_hash(p_session_token, true);
  v_user_id uuid := auth.uid();
BEGIN
  UPDATE public.community_record_comments
  SET status = 'deleted',
      updated_at = now()
  WHERE id = p_comment_id
    AND status = 'visible'
    AND (
      (v_user_id IS NOT NULL AND auth_user_id = v_user_id)
      OR guest_session_hash = v_hash
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.report_community_record_comment_guest(
  p_session_token text,
  p_comment_id uuid,
  p_reason text DEFAULT 'inappropriate'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_hash text := public.community_comment_guest_hash(p_session_token, true);
  v_user_id uuid := auth.uid();
  v_reporter_key text := coalesce('u:' || v_user_id::text, 'g:' || v_hash);
  v_count integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.community_record_comments
    WHERE id = p_comment_id AND status = 'visible'
  ) THEN
    RAISE EXCEPTION 'comment_not_found';
  END IF;

  INSERT INTO public.community_record_comment_reports (comment_id, reporter_key, reason)
  VALUES (p_comment_id, v_reporter_key, left(coalesce(nullif(trim(p_reason), ''), 'inappropriate'), 40))
  ON CONFLICT (comment_id, reporter_key) DO NOTHING;

  SELECT count(*)
  INTO v_count
  FROM public.community_record_comment_reports
  WHERE comment_id = p_comment_id;

  UPDATE public.community_record_comments
  SET report_count = v_count,
      status = CASE WHEN v_count >= 3 THEN 'reported' ELSE status END,
      updated_at = now()
  WHERE id = p_comment_id;

  RETURN jsonb_build_object('success', true, 'report_count', v_count);
END;
$$;

GRANT SELECT ON public.community_record_comments TO anon, authenticated;
GRANT INSERT ON public.community_record_comment_reports TO anon, authenticated;

GRANT EXECUTE ON FUNCTION public.list_community_record_comments(text, text, text, integer, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_community_record_comment_guest(text, text, text, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_community_record_comment_guest(text, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.report_community_record_comment_guest(text, uuid, text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
