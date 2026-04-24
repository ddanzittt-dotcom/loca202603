-- ============================================================
-- Migration 022: dashboard tenant RBAC (platform + organization scopes)
-- ============================================================

-- --------------------------------------------------------------------
-- Prerequisite hardening (for environments where 005_organizations was
-- not applied): ensure organizations + maps.organization_id exist.
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE,
  contact text,
  dashboard_config jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

DROP TRIGGER IF EXISTS set_organizations_updated_at ON public.organizations;
CREATE TRIGGER set_organizations_updated_at
BEFORE UPDATE ON public.organizations
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.maps
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_maps_organization_id ON public.maps(organization_id);

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS dashboard_role text NOT NULL DEFAULT 'user';

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS dashboard_enabled boolean NOT NULL DEFAULT true;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profiles_dashboard_role_check'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_dashboard_role_check
      CHECK (dashboard_role IN ('user', 'org_manager', 'platform_admin'));
  END IF;
END;
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'role'
  ) THEN
    UPDATE public.profiles
    SET
      dashboard_role = 'platform_admin',
      dashboard_enabled = true
    WHERE role = 'admin'
      AND (dashboard_role IS NULL OR dashboard_role = 'user');
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.organization_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'viewer' CHECK (role IN ('owner', 'editor', 'viewer')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'invited', 'suspended')),
  invited_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_org_members_org_id ON public.organization_members(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_members_user_id ON public.organization_members(user_id);
CREATE INDEX IF NOT EXISTS idx_org_members_status ON public.organization_members(status);

DROP TRIGGER IF EXISTS set_organization_members_updated_at ON public.organization_members;
CREATE TRIGGER set_organization_members_updated_at
BEFORE UPDATE ON public.organization_members
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.organization_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.organization_members TO service_role;

-- --------------------------------------------------------------------
-- Optional table backfill (for environments with partial migrations)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.feature_operator_notes (
  feature_id uuid PRIMARY KEY REFERENCES public.map_features(id) ON DELETE CASCADE,
  map_id uuid NOT NULL REFERENCES public.maps(id) ON DELETE CASCADE,
  note text NOT NULL DEFAULT '',
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feature_operator_notes_map_id ON public.feature_operator_notes(map_id);
CREATE INDEX IF NOT EXISTS idx_feature_operator_notes_updated_at ON public.feature_operator_notes(updated_at DESC);
ALTER TABLE public.feature_operator_notes ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS set_feature_operator_notes_updated_at ON public.feature_operator_notes;
CREATE TRIGGER set_feature_operator_notes_updated_at
BEFORE UPDATE ON public.feature_operator_notes
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  map_id uuid REFERENCES public.maps(id) ON DELETE CASCADE NOT NULL,
  title text NOT NULL,
  body text DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_announcements_map_id ON public.announcements(map_id);
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS set_announcements_updated_at ON public.announcements;
CREATE TRIGGER set_announcements_updated_at
BEFORE UPDATE ON public.announcements
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.survey_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  map_id uuid REFERENCES public.maps(id) ON DELETE CASCADE NOT NULL,
  session_id text,
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  rating smallint CHECK (rating BETWEEN 1 AND 5),
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  comment text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_survey_responses_map_id ON public.survey_responses(map_id);
ALTER TABLE public.survey_responses ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.event_checkins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  map_id uuid NOT NULL REFERENCES public.maps(id) ON DELETE CASCADE,
  feature_id uuid NOT NULL REFERENCES public.map_features(id) ON DELETE CASCADE,
  participant_key text NOT NULL,
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  session_id text,
  proof_type text NOT NULL DEFAULT 'gps',
  proof_meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (map_id, feature_id, participant_key)
);
CREATE INDEX IF NOT EXISTS idx_event_checkins_map ON public.event_checkins(map_id);
CREATE INDEX IF NOT EXISTS idx_event_checkins_participant ON public.event_checkins(participant_key);
ALTER TABLE public.event_checkins ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.event_completions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  map_id uuid NOT NULL REFERENCES public.maps(id) ON DELETE CASCADE,
  participant_key text NOT NULL,
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  session_id text,
  checkin_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (map_id, participant_key)
);
CREATE INDEX IF NOT EXISTS idx_event_completions_map ON public.event_completions(map_id);
ALTER TABLE public.event_completions ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.event_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  map_id uuid NOT NULL REFERENCES public.maps(id) ON DELETE CASCADE,
  feature_id uuid NOT NULL REFERENCES public.map_features(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  session_id text,
  participant_key text NOT NULL,
  author_name text,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  status text NOT NULL DEFAULT 'visible'
    CHECK (status IN ('visible', 'hidden', 'reported', 'deleted')),
  is_pinned boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_event_comments_feature
  ON public.event_comments(map_id, feature_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_event_comments_pinned
  ON public.event_comments(feature_id, is_pinned DESC, created_at DESC)
  WHERE status = 'visible';
ALTER TABLE public.event_comments ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.event_comment_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id uuid NOT NULL REFERENCES public.event_comments(id) ON DELETE CASCADE,
  reporter_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reporter_session_id text,
  reason text NOT NULL CHECK (reason IN ('spam', 'offensive', 'inappropriate', 'misinformation', 'other')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_comment_reports_comment ON public.event_comment_reports(comment_id);
ALTER TABLE public.event_comment_reports ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.map_publication_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  map_id uuid NOT NULL REFERENCES public.maps(id) ON DELETE CASCADE,
  revision_no integer NOT NULL,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'live', 'archived', 'rolled_back')),
  slug text NOT NULL,
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  note text,
  source_revision_id uuid REFERENCES public.map_publication_revisions(id) ON DELETE SET NULL,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (map_id, revision_no)
);
CREATE INDEX IF NOT EXISTS idx_map_pub_rev_map_id ON public.map_publication_revisions(map_id);
CREATE INDEX IF NOT EXISTS idx_map_pub_rev_status ON public.map_publication_revisions(status);
CREATE INDEX IF NOT EXISTS idx_map_pub_rev_created_at ON public.map_publication_revisions(created_at DESC);
ALTER TABLE public.map_publication_revisions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'uq_map_pub_rev_live_slug'
  ) THEN
    CREATE UNIQUE INDEX uq_map_pub_rev_live_slug
      ON public.map_publication_revisions(slug)
      WHERE status = 'live';
  END IF;
END;
$$;

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

CREATE TABLE IF NOT EXISTS public.map_lineage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_map_id uuid NOT NULL REFERENCES public.maps(id) ON DELETE CASCADE,
  child_map_id uuid NOT NULL REFERENCES public.maps(id) ON DELETE CASCADE,
  root_map_id uuid REFERENCES public.maps(id) ON DELETE SET NULL,
  relation_type text NOT NULL DEFAULT 'import'
    CHECK (relation_type IN ('import', 'fork', 'template')),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (child_map_id),
  UNIQUE (parent_map_id, child_map_id)
);
CREATE INDEX IF NOT EXISTS idx_map_lineage_parent ON public.map_lineage(parent_map_id);
CREATE INDEX IF NOT EXISTS idx_map_lineage_child ON public.map_lineage(child_map_id);
CREATE INDEX IF NOT EXISTS idx_map_lineage_root ON public.map_lineage(root_map_id);
ALTER TABLE public.map_lineage ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_platform_admin(
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = COALESCE(p_user_id, auth.uid())
      AND COALESCE(p.dashboard_enabled, true)
      AND p.dashboard_role = 'platform_admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_org_member(
  p_org_id uuid,
  p_min_role text DEFAULT NULL,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members om
    JOIN public.profiles p ON p.id = om.user_id
    WHERE om.organization_id = p_org_id
      AND om.user_id = COALESCE(p_user_id, auth.uid())
      AND om.status = 'active'
      AND COALESCE(p.dashboard_enabled, true)
      AND (
        p_min_role IS NULL
        OR (
          CASE om.role
            WHEN 'owner' THEN 3
            WHEN 'editor' THEN 2
            WHEN 'viewer' THEN 1
            ELSE 0
          END
          >=
          CASE p_min_role
            WHEN 'owner' THEN 3
            WHEN 'editor' THEN 2
            WHEN 'viewer' THEN 1
            ELSE 99
          END
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.can_view_map(
  p_map_id uuid,
  p_user_id uuid DEFAULT auth.uid()
)
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
      AND (
        m.user_id = COALESCE(p_user_id, auth.uid())
        OR public.is_platform_admin(COALESCE(p_user_id, auth.uid()))
        OR (
          m.organization_id IS NOT NULL
          AND public.is_org_member(m.organization_id, NULL, COALESCE(p_user_id, auth.uid()))
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_map(
  p_map_id uuid,
  p_user_id uuid DEFAULT auth.uid()
)
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
      AND (
        m.user_id = COALESCE(p_user_id, auth.uid())
        OR public.is_platform_admin(COALESCE(p_user_id, auth.uid()))
        OR (
          m.organization_id IS NOT NULL
          AND public.is_org_member(m.organization_id, 'editor', COALESCE(p_user_id, auth.uid()))
        )
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_platform_admin(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_org_member(uuid, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_view_map(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_manage_map(uuid, uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "org_members_select_scope" ON public.organization_members;
CREATE POLICY "org_members_select_scope"
  ON public.organization_members
  FOR SELECT
  USING (
    public.is_platform_admin(auth.uid())
    OR auth.uid() = user_id
    OR public.is_org_member(organization_id, 'editor', auth.uid())
  );

DROP POLICY IF EXISTS "org_members_insert_scope" ON public.organization_members;
CREATE POLICY "org_members_insert_scope"
  ON public.organization_members
  FOR INSERT
  WITH CHECK (
    public.is_platform_admin(auth.uid())
    OR public.is_org_member(organization_id, 'owner', auth.uid())
  );

DROP POLICY IF EXISTS "org_members_update_scope" ON public.organization_members;
CREATE POLICY "org_members_update_scope"
  ON public.organization_members
  FOR UPDATE
  USING (
    public.is_platform_admin(auth.uid())
    OR public.is_org_member(organization_id, 'owner', auth.uid())
  )
  WITH CHECK (
    public.is_platform_admin(auth.uid())
    OR public.is_org_member(organization_id, 'owner', auth.uid())
  );

DROP POLICY IF EXISTS "org_members_delete_scope" ON public.organization_members;
CREATE POLICY "org_members_delete_scope"
  ON public.organization_members
  FOR DELETE
  USING (
    public.is_platform_admin(auth.uid())
    OR public.is_org_member(organization_id, 'owner', auth.uid())
  );

DROP POLICY IF EXISTS "organizations_select_scope" ON public.organizations;
CREATE POLICY "organizations_select_scope"
  ON public.organizations
  FOR SELECT
  USING (
    public.is_platform_admin(auth.uid())
    OR public.is_org_member(id, NULL, auth.uid())
  );

DROP POLICY IF EXISTS "organizations_insert_platform_admin" ON public.organizations;
CREATE POLICY "organizations_insert_platform_admin"
  ON public.organizations
  FOR INSERT
  WITH CHECK (public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "organizations_update_scope" ON public.organizations;
CREATE POLICY "organizations_update_scope"
  ON public.organizations
  FOR UPDATE
  USING (
    public.is_platform_admin(auth.uid())
    OR public.is_org_member(id, 'owner', auth.uid())
  )
  WITH CHECK (
    public.is_platform_admin(auth.uid())
    OR public.is_org_member(id, 'owner', auth.uid())
  );

DROP POLICY IF EXISTS "organizations_delete_platform_admin" ON public.organizations;
CREATE POLICY "organizations_delete_platform_admin"
  ON public.organizations
  FOR DELETE
  USING (public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "maps_select_dashboard_scope" ON public.maps;
CREATE POLICY "maps_select_dashboard_scope"
  ON public.maps
  FOR SELECT
  USING (public.can_view_map(id, auth.uid()));

DROP POLICY IF EXISTS "maps_insert_dashboard_scope" ON public.maps;
CREATE POLICY "maps_insert_dashboard_scope"
  ON public.maps
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND (
      organization_id IS NULL
      OR public.is_platform_admin(auth.uid())
      OR public.is_org_member(organization_id, 'editor', auth.uid())
    )
  );

DROP POLICY IF EXISTS "maps_update_dashboard_scope" ON public.maps;
CREATE POLICY "maps_update_dashboard_scope"
  ON public.maps
  FOR UPDATE
  USING (public.can_manage_map(id, auth.uid()))
  WITH CHECK (
    (
      public.is_platform_admin(auth.uid())
      OR user_id = auth.uid()
      OR (
        organization_id IS NOT NULL
        AND public.is_org_member(organization_id, 'editor', auth.uid())
      )
    )
    AND (
      organization_id IS NULL
      OR public.is_platform_admin(auth.uid())
      OR public.is_org_member(organization_id, 'editor', auth.uid())
    )
  );

DROP POLICY IF EXISTS "maps_delete_dashboard_scope" ON public.maps;
CREATE POLICY "maps_delete_dashboard_scope"
  ON public.maps
  FOR DELETE
  USING (public.can_manage_map(id, auth.uid()));

DROP POLICY IF EXISTS "features_select_dashboard_scope" ON public.map_features;
CREATE POLICY "features_select_dashboard_scope"
  ON public.map_features
  FOR SELECT
  USING (public.can_view_map(map_id, auth.uid()));

DROP POLICY IF EXISTS "features_insert_dashboard_scope" ON public.map_features;
CREATE POLICY "features_insert_dashboard_scope"
  ON public.map_features
  FOR INSERT
  WITH CHECK (public.can_manage_map(map_id, auth.uid()));

DROP POLICY IF EXISTS "features_update_dashboard_scope" ON public.map_features;
CREATE POLICY "features_update_dashboard_scope"
  ON public.map_features
  FOR UPDATE
  USING (public.can_manage_map(map_id, auth.uid()))
  WITH CHECK (public.can_manage_map(map_id, auth.uid()));

DROP POLICY IF EXISTS "features_delete_dashboard_scope" ON public.map_features;
CREATE POLICY "features_delete_dashboard_scope"
  ON public.map_features
  FOR DELETE
  USING (public.can_manage_map(map_id, auth.uid()));

DROP POLICY IF EXISTS "memos_select_dashboard_scope" ON public.feature_memos;
CREATE POLICY "memos_select_dashboard_scope"
  ON public.feature_memos
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.map_features f
      WHERE f.id = feature_memos.feature_id
        AND public.can_view_map(f.map_id, auth.uid())
    )
  );

DROP POLICY IF EXISTS "memos_update_dashboard_scope" ON public.feature_memos;
CREATE POLICY "memos_update_dashboard_scope"
  ON public.feature_memos
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.map_features f
      WHERE f.id = feature_memos.feature_id
        AND public.can_manage_map(f.map_id, auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.map_features f
      WHERE f.id = feature_memos.feature_id
        AND public.can_manage_map(f.map_id, auth.uid())
    )
  );

DROP POLICY IF EXISTS "memos_delete_dashboard_scope" ON public.feature_memos;
CREATE POLICY "memos_delete_dashboard_scope"
  ON public.feature_memos
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM public.map_features f
      WHERE f.id = feature_memos.feature_id
        AND public.can_manage_map(f.map_id, auth.uid())
    )
  );

DROP POLICY IF EXISTS "operator_notes_select_dashboard_scope" ON public.feature_operator_notes;
CREATE POLICY "operator_notes_select_dashboard_scope"
  ON public.feature_operator_notes
  FOR SELECT
  USING (public.can_manage_map(map_id, auth.uid()));

DROP POLICY IF EXISTS "operator_notes_insert_dashboard_scope" ON public.feature_operator_notes;
CREATE POLICY "operator_notes_insert_dashboard_scope"
  ON public.feature_operator_notes
  FOR INSERT
  WITH CHECK (public.can_manage_map(map_id, auth.uid()));

DROP POLICY IF EXISTS "operator_notes_update_dashboard_scope" ON public.feature_operator_notes;
CREATE POLICY "operator_notes_update_dashboard_scope"
  ON public.feature_operator_notes
  FOR UPDATE
  USING (public.can_manage_map(map_id, auth.uid()))
  WITH CHECK (public.can_manage_map(map_id, auth.uid()));

DROP POLICY IF EXISTS "operator_notes_delete_dashboard_scope" ON public.feature_operator_notes;
CREATE POLICY "operator_notes_delete_dashboard_scope"
  ON public.feature_operator_notes
  FOR DELETE
  USING (public.can_manage_map(map_id, auth.uid()));

DROP POLICY IF EXISTS "view_logs_select_dashboard_scope" ON public.view_logs;
CREATE POLICY "view_logs_select_dashboard_scope"
  ON public.view_logs
  FOR SELECT
  USING (public.can_view_map(map_id, auth.uid()));

DROP POLICY IF EXISTS "checkins_select_dashboard_scope" ON public.event_checkins;
CREATE POLICY "checkins_select_dashboard_scope"
  ON public.event_checkins
  FOR SELECT
  USING (public.can_view_map(map_id, auth.uid()));

DROP POLICY IF EXISTS "completions_select_dashboard_scope" ON public.event_completions;
CREATE POLICY "completions_select_dashboard_scope"
  ON public.event_completions
  FOR SELECT
  USING (public.can_view_map(map_id, auth.uid()));

DROP POLICY IF EXISTS "survey_responses_select_dashboard_scope" ON public.survey_responses;
CREATE POLICY "survey_responses_select_dashboard_scope"
  ON public.survey_responses
  FOR SELECT
  USING (public.can_view_map(map_id, auth.uid()));

DROP POLICY IF EXISTS "announcements_select_dashboard_scope" ON public.announcements;
CREATE POLICY "announcements_select_dashboard_scope"
  ON public.announcements
  FOR SELECT
  USING (public.can_view_map(map_id, auth.uid()));

DROP POLICY IF EXISTS "announcements_insert_dashboard_scope" ON public.announcements;
CREATE POLICY "announcements_insert_dashboard_scope"
  ON public.announcements
  FOR INSERT
  WITH CHECK (public.can_manage_map(map_id, auth.uid()));

DROP POLICY IF EXISTS "announcements_update_dashboard_scope" ON public.announcements;
CREATE POLICY "announcements_update_dashboard_scope"
  ON public.announcements
  FOR UPDATE
  USING (public.can_manage_map(map_id, auth.uid()))
  WITH CHECK (public.can_manage_map(map_id, auth.uid()));

DROP POLICY IF EXISTS "announcements_delete_dashboard_scope" ON public.announcements;
CREATE POLICY "announcements_delete_dashboard_scope"
  ON public.announcements
  FOR DELETE
  USING (public.can_manage_map(map_id, auth.uid()));

DROP POLICY IF EXISTS "event_comments_select_dashboard_scope" ON public.event_comments;
CREATE POLICY "event_comments_select_dashboard_scope"
  ON public.event_comments
  FOR SELECT
  USING (public.can_view_map(map_id, auth.uid()));

DROP POLICY IF EXISTS "event_comments_update_dashboard_scope" ON public.event_comments;
CREATE POLICY "event_comments_update_dashboard_scope"
  ON public.event_comments
  FOR UPDATE
  USING (public.can_manage_map(map_id, auth.uid()))
  WITH CHECK (public.can_manage_map(map_id, auth.uid()));

DROP POLICY IF EXISTS "event_comments_delete_dashboard_scope" ON public.event_comments;
CREATE POLICY "event_comments_delete_dashboard_scope"
  ON public.event_comments
  FOR DELETE
  USING (public.can_manage_map(map_id, auth.uid()));

DROP POLICY IF EXISTS "comment_reports_select_dashboard_scope" ON public.event_comment_reports;
CREATE POLICY "comment_reports_select_dashboard_scope"
  ON public.event_comment_reports
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.event_comments ec
      WHERE ec.id = event_comment_reports.comment_id
        AND public.can_view_map(ec.map_id, auth.uid())
    )
  );

DROP POLICY IF EXISTS "publications_select_dashboard_scope" ON public.map_publications;
CREATE POLICY "publications_select_dashboard_scope"
  ON public.map_publications
  FOR SELECT
  USING (public.can_view_map(map_id, auth.uid()));

DROP POLICY IF EXISTS "publications_insert_dashboard_scope" ON public.map_publications;
CREATE POLICY "publications_insert_dashboard_scope"
  ON public.map_publications
  FOR INSERT
  WITH CHECK (public.can_manage_map(map_id, auth.uid()));

DROP POLICY IF EXISTS "publications_update_dashboard_scope" ON public.map_publications;
CREATE POLICY "publications_update_dashboard_scope"
  ON public.map_publications
  FOR UPDATE
  USING (public.can_manage_map(map_id, auth.uid()))
  WITH CHECK (public.can_manage_map(map_id, auth.uid()));

DROP POLICY IF EXISTS "publications_delete_dashboard_scope" ON public.map_publications;
CREATE POLICY "publications_delete_dashboard_scope"
  ON public.map_publications
  FOR DELETE
  USING (public.can_manage_map(map_id, auth.uid()));

DROP POLICY IF EXISTS "map_pub_rev_select_dashboard_scope" ON public.map_publication_revisions;
CREATE POLICY "map_pub_rev_select_dashboard_scope"
  ON public.map_publication_revisions
  FOR SELECT
  USING (public.can_view_map(map_id, auth.uid()));

DROP POLICY IF EXISTS "map_saves_select_dashboard_scope" ON public.map_saves;
CREATE POLICY "map_saves_select_dashboard_scope"
  ON public.map_saves
  FOR SELECT
  USING (public.can_view_map(map_id, auth.uid()));

DROP POLICY IF EXISTS "lineage_select_dashboard_scope" ON public.map_lineage;
CREATE POLICY "lineage_select_dashboard_scope"
  ON public.map_lineage
  FOR SELECT
  USING (
    public.can_view_map(parent_map_id, auth.uid())
    OR public.can_view_map(child_map_id, auth.uid())
  );

CREATE OR REPLACE FUNCTION public.upsert_feature_operator_note(
  p_feature_id uuid,
  p_note text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_map_id uuid;
  v_note text := COALESCE(p_note, '');
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'auth_required');
  END IF;

  SELECT f.map_id
  INTO v_map_id
  FROM public.map_features f
  WHERE f.id = p_feature_id
  LIMIT 1;

  IF v_map_id IS NULL OR NOT public.can_manage_map(v_map_id, v_user_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'feature_not_found_or_forbidden');
  END IF;

  INSERT INTO public.feature_operator_notes (
    feature_id,
    map_id,
    note,
    updated_by
  )
  VALUES (
    p_feature_id,
    v_map_id,
    v_note,
    v_user_id
  )
  ON CONFLICT (feature_id) DO UPDATE
  SET
    map_id = EXCLUDED.map_id,
    note = EXCLUDED.note,
    updated_by = EXCLUDED.updated_by,
    updated_at = now();

  RETURN jsonb_build_object('success', true, 'feature_id', p_feature_id, 'map_id', v_map_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.publish_map_revision(
  p_map_id uuid,
  p_slug text DEFAULT NULL,
  p_note text DEFAULT NULL,
  p_visibility text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_map public.maps%ROWTYPE;
  v_now timestamptz := now();
  v_slug text;
  v_revision_no integer;
  v_snapshot jsonb;
  v_revision_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'auth_required');
  END IF;

  SELECT *
  INTO v_map
  FROM public.maps
  WHERE id = p_map_id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'map_not_found');
  END IF;

  IF NOT public.can_manage_map(p_map_id, v_user_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'map_not_found_or_forbidden');
  END IF;

  v_slug := NULLIF(trim(COALESCE(p_slug, '')), '');
  IF v_slug IS NULL THEN
    v_slug := NULLIF(trim(COALESCE(v_map.slug, '')), '');
  END IF;
  IF v_slug IS NULL THEN
    v_slug := 'map-' || substr(replace(p_map_id::text, '-', ''), 1, 8) || '-' || to_char(extract(epoch FROM v_now)::bigint, 'FM999999999999');
  END IF;

  v_slug := lower(regexp_replace(v_slug, '\s+', '-', 'g'));
  v_slug := regexp_replace(v_slug, '[^a-z0-9\-_]+', '', 'g');
  v_slug := regexp_replace(v_slug, '-+', '-', 'g');
  v_slug := trim(both '-' FROM v_slug);
  IF v_slug = '' THEN
    v_slug := 'map-' || substr(replace(p_map_id::text, '-', ''), 1, 8) || '-' || to_char(extract(epoch FROM v_now)::bigint, 'FM999999999999');
  END IF;

  WHILE EXISTS (
    SELECT 1
    FROM public.map_publication_revisions r
    WHERE r.status = 'live'
      AND r.slug = v_slug
      AND r.map_id <> p_map_id
  ) LOOP
    v_slug := v_slug || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);
  END LOOP;

  SELECT COALESCE(MAX(revision_no), 0) + 1
  INTO v_revision_no
  FROM public.map_publication_revisions
  WHERE map_id = p_map_id;

  SELECT jsonb_build_object(
    'map', to_jsonb(m),
    'features', COALESCE((
      SELECT jsonb_agg(to_jsonb(f) ORDER BY f.sort_order, f.created_at)
      FROM public.map_features f
      WHERE f.map_id = p_map_id
    ), '[]'::jsonb)
  )
  INTO v_snapshot
  FROM public.maps m
  WHERE m.id = p_map_id;

  UPDATE public.map_publication_revisions
  SET status = 'archived'
  WHERE map_id = p_map_id
    AND status = 'live';

  INSERT INTO public.map_publication_revisions (
    map_id,
    revision_no,
    status,
    slug,
    snapshot,
    note,
    created_by,
    published_at,
    created_at
  )
  VALUES (
    p_map_id,
    v_revision_no,
    'live',
    v_slug,
    COALESCE(v_snapshot, '{}'::jsonb),
    NULLIF(trim(COALESCE(p_note, '')), ''),
    v_user_id,
    v_now,
    v_now
  )
  RETURNING id INTO v_revision_id;

  UPDATE public.maps
  SET
    slug = v_slug,
    visibility = CASE
      WHEN p_visibility IN ('public', 'unlisted', 'private') THEN p_visibility
      WHEN visibility = 'private' THEN 'unlisted'
      ELSE visibility
    END,
    is_published = true,
    published_at = v_now,
    updated_at = v_now
  WHERE id = p_map_id;

  INSERT INTO public.map_publications (map_id, published_at)
  VALUES (p_map_id, v_now)
  ON CONFLICT (map_id) DO UPDATE
  SET
    published_at = EXCLUDED.published_at,
    updated_at = v_now;

  RETURN jsonb_build_object(
    'success', true,
    'revision_id', v_revision_id,
    'revision_no', v_revision_no,
    'slug', v_slug,
    'published_at', v_now
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.unpublish_map_revision(
  p_map_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_now timestamptz := now();
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'auth_required');
  END IF;

  IF NOT public.can_manage_map(p_map_id, v_user_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'map_not_found_or_forbidden');
  END IF;

  UPDATE public.map_publication_revisions
  SET status = 'archived'
  WHERE map_id = p_map_id
    AND status = 'live';

  UPDATE public.maps
  SET
    slug = NULL,
    is_published = false,
    published_at = NULL,
    updated_at = v_now
  WHERE id = p_map_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.rollback_map_revision(
  p_map_id uuid,
  p_revision_id uuid,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_now timestamptz := now();
  v_current_map public.maps%ROWTYPE;
  v_target public.map_publication_revisions%ROWTYPE;
  v_slug text;
  v_revision_no integer;
  v_new_revision_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'auth_required');
  END IF;

  IF NOT public.can_manage_map(p_map_id, v_user_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'map_not_found_or_forbidden');
  END IF;

  SELECT *
  INTO v_current_map
  FROM public.maps
  WHERE id = p_map_id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'map_not_found_or_forbidden');
  END IF;

  SELECT *
  INTO v_target
  FROM public.map_publication_revisions
  WHERE id = p_revision_id
    AND map_id = p_map_id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'target_revision_not_found');
  END IF;

  IF COALESCE(v_target.snapshot, '{}'::jsonb) = '{}'::jsonb THEN
    RETURN jsonb_build_object('success', false, 'error', 'target_snapshot_empty');
  END IF;

  v_slug := NULLIF(trim(COALESCE(v_current_map.slug, '')), '');
  IF v_slug IS NULL THEN
    v_slug := NULLIF(trim(COALESCE(v_target.slug, '')), '');
  END IF;
  IF v_slug IS NULL THEN
    v_slug := 'map-' || substr(replace(p_map_id::text, '-', ''), 1, 8) || '-' || to_char(extract(epoch FROM v_now)::bigint, 'FM999999999999');
  END IF;

  WHILE EXISTS (
    SELECT 1
    FROM public.map_publication_revisions r
    WHERE r.status = 'live'
      AND r.slug = v_slug
      AND r.map_id <> p_map_id
  ) LOOP
    v_slug := v_slug || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);
  END LOOP;

  SELECT COALESCE(MAX(revision_no), 0) + 1
  INTO v_revision_no
  FROM public.map_publication_revisions
  WHERE map_id = p_map_id;

  UPDATE public.map_publication_revisions
  SET status = 'archived'
  WHERE map_id = p_map_id
    AND status = 'live';

  INSERT INTO public.map_publication_revisions (
    map_id,
    revision_no,
    status,
    slug,
    snapshot,
    note,
    source_revision_id,
    created_by,
    published_at,
    created_at
  )
  VALUES (
    p_map_id,
    v_revision_no,
    'live',
    v_slug,
    v_target.snapshot,
    COALESCE(NULLIF(trim(COALESCE(p_note, '')), ''), 'rollback_to_r' || v_target.revision_no::text),
    v_target.id,
    v_user_id,
    v_now,
    v_now
  )
  RETURNING id INTO v_new_revision_id;

  UPDATE public.maps
  SET
    slug = v_slug,
    visibility = CASE WHEN visibility = 'private' THEN 'unlisted' ELSE visibility END,
    is_published = true,
    published_at = v_now,
    updated_at = v_now
  WHERE id = p_map_id;

  INSERT INTO public.map_publications (map_id, published_at)
  VALUES (p_map_id, v_now)
  ON CONFLICT (map_id) DO UPDATE
  SET
    published_at = EXCLUDED.published_at,
    updated_at = v_now;

  RETURN jsonb_build_object(
    'success', true,
    'revision_id', v_new_revision_id,
    'revision_no', v_revision_no,
    'slug', v_slug,
    'published_at', v_now,
    'rolled_back_from', v_target.revision_no
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.publish_map_revision(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unpublish_map_revision(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rollback_map_revision(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_feature_operator_note(uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
