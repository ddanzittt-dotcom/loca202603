-- ============================================================
-- Migration 044: Personal map collaboration invites
-- - Invites are created as pending.
-- - Pending invitees can see an invite banner, but not the map contents.
-- - Only accepted collaborators can view/edit personal maps.
-- ============================================================

ALTER TABLE public.map_collaborators
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'accepted'
  CHECK (status IN ('pending', 'accepted', 'rejected'));

ALTER TABLE public.map_collaborators
  ADD COLUMN IF NOT EXISTS responded_at timestamptz;

ALTER TABLE public.map_collaborators
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

UPDATE public.map_collaborators
SET status = 'accepted'
WHERE status IS NULL;

CREATE INDEX IF NOT EXISTS idx_map_collaborators_user_status
  ON public.map_collaborators(user_id, status);

CREATE OR REPLACE FUNCTION public.can_view_personal_map(p_map_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.maps m
    WHERE m.id = p_map_id
      AND public.is_personal_collab_map(m.id)
      AND (
        m.user_id = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.map_collaborators c
          WHERE c.map_id = m.id
            AND c.user_id = auth.uid()
            AND c.status = 'accepted'
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.can_edit_personal_map_features(p_map_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.maps m
    WHERE m.id = p_map_id
      AND public.is_personal_collab_map(m.id)
      AND (
        m.user_id = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.map_collaborators c
          WHERE c.map_id = m.id
            AND c.user_id = auth.uid()
            AND c.role = 'editor'
            AND c.status = 'accepted'
        )
      )
  );
$$;

DROP POLICY IF EXISTS "collaborators_select_personal_members" ON public.map_collaborators;
CREATE POLICY "collaborators_select_personal_members"
  ON public.map_collaborators
  FOR SELECT
  USING (
    public.is_personal_collab_map(map_id)
    AND (
      public.is_map_owner(map_id)
      OR user_id = auth.uid()
      OR public.can_view_personal_map(map_id)
    )
  );

DROP POLICY IF EXISTS "collaborators_insert_personal_owner" ON public.map_collaborators;
CREATE POLICY "collaborators_insert_personal_owner"
  ON public.map_collaborators
  FOR INSERT
  WITH CHECK (
    public.is_personal_collab_map(map_id)
    AND public.is_map_owner(map_id)
    AND invited_by = auth.uid()
    AND role IN ('editor', 'viewer')
    AND status = 'pending'
  );

CREATE OR REPLACE FUNCTION public.list_pending_map_collaboration_invites()
RETURNS TABLE (
  id uuid,
  map_id uuid,
  role text,
  status text,
  created_at timestamptz,
  invited_by uuid,
  map_title text,
  map_description text,
  map_theme text,
  owner_id uuid,
  owner_nickname text,
  owner_avatar_url text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.id,
    c.map_id,
    c.role,
    c.status,
    c.created_at,
    c.invited_by,
    m.title AS map_title,
    m.description AS map_description,
    m.theme AS map_theme,
    m.user_id AS owner_id,
    p.nickname AS owner_nickname,
    p.avatar_url AS owner_avatar_url
  FROM public.map_collaborators c
  JOIN public.maps m ON m.id = c.map_id
  LEFT JOIN public.profiles p ON p.id = m.user_id
  WHERE c.user_id = auth.uid()
    AND c.status = 'pending'
    AND public.is_personal_collab_map(c.map_id)
  ORDER BY c.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.respond_map_collaboration_invite(
  p_collaborator_id uuid,
  p_decision text
)
RETURNS TABLE (
  id uuid,
  map_id uuid,
  status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text := CASE WHEN p_decision = 'accepted' THEN 'accepted' ELSE 'rejected' END;
BEGIN
  RETURN QUERY
  UPDATE public.map_collaborators c
  SET status = v_status,
      responded_at = now(),
      updated_at = now()
  WHERE c.id = p_collaborator_id
    AND c.user_id = auth.uid()
    AND c.status = 'pending'
  RETURNING c.id, c.map_id, c.status;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invite not found or already handled' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_pending_map_collaboration_invites() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.respond_map_collaboration_invite(uuid, text) TO authenticated, service_role;

GRANT SELECT, INSERT, DELETE ON public.map_collaborators TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.map_collaborators TO service_role;

NOTIFY pgrst, 'reload schema';
