-- ============================================================
-- Migration 025:
-- Atomic map_publications.likes_count increment RPC
-- ============================================================

CREATE OR REPLACE FUNCTION public.increment_map_publication_like(
  p_map_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_likes integer;
BEGIN
  IF p_map_id IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE public.map_publications
  SET likes_count = COALESCE(likes_count, 0) + 1
  WHERE map_id = p_map_id
  RETURNING likes_count INTO v_likes;

  RETURN v_likes;
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_map_publication_like(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_map_publication_like(uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
