-- Migration 015: canonical map saves + count sync
-- Goal:
-- 1) Use map_saves as single source of truth for save conversion.
-- 2) Keep map_publications.saves_count synchronized via trigger.
-- 3) Expose save/unsave RPC for participant flow (auth + anon session).

CREATE TABLE IF NOT EXISTS public.map_saves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  map_id uuid NOT NULL REFERENCES public.maps(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  participant_key text NOT NULL,
  session_id text,
  source text NOT NULL DEFAULT 'unknown',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (map_id, participant_key)
);

CREATE INDEX IF NOT EXISTS idx_map_saves_map_id ON public.map_saves(map_id);
CREATE INDEX IF NOT EXISTS idx_map_saves_user_id ON public.map_saves(user_id);
CREATE INDEX IF NOT EXISTS idx_map_saves_created_at ON public.map_saves(created_at DESC);

ALTER TABLE public.map_saves ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "map_saves_select_owner_or_self" ON public.map_saves;
CREATE POLICY "map_saves_select_owner_or_self"
  ON public.map_saves
  FOR SELECT
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1
      FROM public.maps
      WHERE maps.id = map_saves.map_id
        AND maps.user_id = auth.uid()
    )
  );

CREATE OR REPLACE FUNCTION public.sync_map_saves_count()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_map_id uuid;
BEGIN
  v_map_id := COALESCE(NEW.map_id, OLD.map_id);

  -- Keep publication row available for consistent dashboard reads.
  INSERT INTO public.map_publications (map_id, saves_count, published_at)
  VALUES (v_map_id, 0, now())
  ON CONFLICT (map_id) DO NOTHING;

  UPDATE public.map_publications
  SET
    saves_count = (
      SELECT COUNT(*)
      FROM public.map_saves
      WHERE map_id = v_map_id
    ),
    updated_at = now()
  WHERE map_id = v_map_id;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_map_saves_count_insert ON public.map_saves;
CREATE TRIGGER trg_sync_map_saves_count_insert
AFTER INSERT ON public.map_saves
FOR EACH ROW
EXECUTE FUNCTION public.sync_map_saves_count();

DROP TRIGGER IF EXISTS trg_sync_map_saves_count_delete ON public.map_saves;
CREATE TRIGGER trg_sync_map_saves_count_delete
AFTER DELETE ON public.map_saves
FOR EACH ROW
EXECUTE FUNCTION public.sync_map_saves_count();

CREATE OR REPLACE FUNCTION public.save_map(
  p_map_id uuid,
  p_session_id text DEFAULT NULL,
  p_source text DEFAULT 'unknown'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_participant_key text;
  v_inserted integer := 0;
BEGIN
  IF p_map_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'map_required');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.maps
    WHERE id = p_map_id
      AND visibility IN ('public', 'unlisted')
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'map_not_found');
  END IF;

  IF v_user_id IS NOT NULL THEN
    v_participant_key := 'u:' || v_user_id::text;
  ELSIF NULLIF(trim(COALESCE(p_session_id, '')), '') IS NOT NULL THEN
    v_participant_key := 's:' || trim(p_session_id);
  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'session_required');
  END IF;

  INSERT INTO public.map_saves (map_id, user_id, participant_key, session_id, source)
  VALUES (
    p_map_id,
    v_user_id,
    v_participant_key,
    NULLIF(trim(COALESCE(p_session_id, '')), ''),
    COALESCE(NULLIF(trim(COALESCE(p_source, '')), ''), 'unknown')
  )
  ON CONFLICT (map_id, participant_key) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  IF v_inserted = 0 THEN
    RETURN jsonb_build_object('success', true, 'saved', false, 'error', 'already_saved');
  END IF;

  RETURN jsonb_build_object('success', true, 'saved', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.unsave_map(
  p_map_id uuid,
  p_session_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_participant_key text;
  v_deleted integer := 0;
BEGIN
  IF p_map_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'map_required');
  END IF;

  IF v_user_id IS NOT NULL THEN
    v_participant_key := 'u:' || v_user_id::text;
  ELSIF NULLIF(trim(COALESCE(p_session_id, '')), '') IS NOT NULL THEN
    v_participant_key := 's:' || trim(p_session_id);
  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'session_required');
  END IF;

  DELETE FROM public.map_saves
  WHERE map_id = p_map_id
    AND participant_key = v_participant_key;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  RETURN jsonb_build_object('success', true, 'unsaved', v_deleted > 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_map(uuid, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.unsave_map(uuid, text) TO anon, authenticated;
