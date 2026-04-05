-- ============================================================
-- 012_event_comments.sql
-- 행사 지도 participant 댓글 시스템
-- ============================================================
-- 적용 전 확인:
--   1) 010_gamification_v2.sql 이 적용되어 event_checkins 테이블이 존재해야 함
--   2) maps, map_features, profiles 테이블이 존재해야 함
-- 적용: Supabase SQL Editor 에서 실행
-- 롤백: DROP TABLE event_comment_reports, event_comments CASCADE;
--        DROP FUNCTION create_event_comment, list_event_comments CASCADE;
-- ============================================================

-- ─── 1) event_comments 테이블 ───
CREATE TABLE IF NOT EXISTS public.event_comments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  map_id          UUID NOT NULL REFERENCES public.maps(id) ON DELETE CASCADE,
  feature_id      UUID NOT NULL REFERENCES public.map_features(id) ON DELETE CASCADE,
  user_id         UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  session_id      TEXT,
  participant_key TEXT NOT NULL,          -- 'u:<user_id>' 또는 's:<session_id>'
  author_name     TEXT,                   -- 게스트일 때 닉네임
  body            TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  status          TEXT NOT NULL DEFAULT 'visible'
                    CHECK (status IN ('visible', 'hidden', 'reported', 'deleted')),
  is_pinned       BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 읽기 효율: feature별 최신순 + pinned 우선
CREATE INDEX IF NOT EXISTS idx_event_comments_feature
  ON public.event_comments(map_id, feature_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_event_comments_pinned
  ON public.event_comments(feature_id, is_pinned DESC, created_at DESC)
  WHERE status = 'visible';

CREATE INDEX IF NOT EXISTS idx_event_comments_participant
  ON public.event_comments(participant_key);

-- ─── 2) event_comment_reports 테이블 ───
CREATE TABLE IF NOT EXISTS public.event_comment_reports (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id          UUID NOT NULL REFERENCES public.event_comments(id) ON DELETE CASCADE,
  reporter_user_id    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reporter_session_id TEXT,
  reason              TEXT NOT NULL CHECK (reason IN ('spam', 'offensive', 'inappropriate', 'misinformation', 'other')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- 같은 사람이 같은 댓글을 중복 신고 방지
  UNIQUE(comment_id, COALESCE(reporter_user_id::text, reporter_session_id))
);

CREATE INDEX IF NOT EXISTS idx_comment_reports_comment
  ON public.event_comment_reports(comment_id);

-- ─── 3) RLS 정책 ───

ALTER TABLE public.event_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_comment_reports ENABLE ROW LEVEL SECURITY;

-- 댓글 SELECT: visible 상태만, 공개/비공개 지도 무관 (행사 링크로 접근하므로)
CREATE POLICY "event_comments_select_visible"
  ON public.event_comments FOR SELECT
  USING (status = 'visible');

-- 운영자는 모든 상태의 댓글 조회 가능 (대시보드 moderation용)
CREATE POLICY "event_comments_select_map_owner"
  ON public.event_comments FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.maps WHERE maps.id = map_id AND maps.user_id = auth.uid())
  );

-- 댓글 INSERT: SECURITY DEFINER RPC를 통해서만 (권한 검증은 RPC에서)
-- 로그인 유저의 직접 INSERT 허용 (RPC 우회 fallback)
CREATE POLICY "event_comments_insert_auth"
  ON public.event_comments FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 댓글 UPDATE: 본인만 body 수정 가능 (participant_key 기준)
CREATE POLICY "event_comments_update_self"
  ON public.event_comments FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 운영자 UPDATE: 상태/고정 변경 (대시보드 moderation)
CREATE POLICY "event_comments_update_map_owner"
  ON public.event_comments FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM public.maps WHERE maps.id = map_id AND maps.user_id = auth.uid())
  );

-- 댓글 DELETE: 본인만
CREATE POLICY "event_comments_delete_self"
  ON public.event_comments FOR DELETE
  USING (auth.uid() = user_id);

-- 운영자 DELETE
CREATE POLICY "event_comments_delete_map_owner"
  ON public.event_comments FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM public.maps WHERE maps.id = map_id AND maps.user_id = auth.uid())
  );

-- 신고 INSERT: 누구나 (로그인 유저)
CREATE POLICY "comment_reports_insert_auth"
  ON public.event_comment_reports FOR INSERT
  WITH CHECK (auth.uid() = reporter_user_id);

-- 신고 SELECT: 운영자만 (대시보드)
CREATE POLICY "comment_reports_select_owner"
  ON public.event_comment_reports FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.event_comments ec
      JOIN public.maps m ON m.id = ec.map_id
      WHERE ec.id = comment_id AND m.user_id = auth.uid()
    )
  );


-- ─── 4) RPC: create_event_comment ───
-- 서버 기준 권한 검증 + 게스트/체크인 조건 확인
CREATE OR REPLACE FUNCTION public.create_event_comment(
  p_map_id       UUID,
  p_feature_id   UUID,
  p_body         TEXT,
  p_session_id   TEXT DEFAULT NULL,
  p_author_name  TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id         UUID := auth.uid();
  v_participant_key TEXT;
  v_map_config      JSONB;
  v_comment_perm    TEXT;
  v_author          TEXT;
  v_new_id          UUID;
BEGIN
  -- 지도 config 조회
  SELECT config INTO v_map_config
  FROM public.maps WHERE id = p_map_id;

  IF v_map_config IS NULL THEN
    RETURN jsonb_build_object('error', 'map_not_found');
  END IF;

  -- comments_enabled 확인
  IF NOT COALESCE((v_map_config->>'comments_enabled')::boolean, true) THEN
    RETURN jsonb_build_object('error', 'comments_disabled');
  END IF;

  -- participant_key 결정
  IF v_user_id IS NOT NULL THEN
    v_participant_key := 'u:' || v_user_id::text;
  ELSIF p_session_id IS NOT NULL THEN
    -- 게스트 허용 확인
    IF NOT COALESCE((v_map_config->>'guest_comments_enabled')::boolean, false) THEN
      RETURN jsonb_build_object('error', 'login_required');
    END IF;
    v_participant_key := 's:' || p_session_id;
  ELSE
    RETURN jsonb_build_object('error', 'no_identity');
  END IF;

  -- comment_permission 검사
  v_comment_perm := COALESCE(v_map_config->>'comment_permission', 'all_logged_in');

  IF v_comment_perm = 'checked_in_only' THEN
    -- 해당 feature를 체크인했는지 확인
    IF NOT EXISTS (
      SELECT 1 FROM public.event_checkins
      WHERE map_id = p_map_id
        AND feature_id = p_feature_id
        AND participant_key = v_participant_key
    ) THEN
      RETURN jsonb_build_object('error', 'checkin_required');
    END IF;
  END IF;

  -- author_name 결정
  IF v_user_id IS NOT NULL THEN
    SELECT COALESCE(nickname, 'LOCA 사용자') INTO v_author
    FROM public.profiles WHERE id = v_user_id;
  ELSE
    v_author := COALESCE(p_author_name, '게스트');
  END IF;

  -- INSERT
  INSERT INTO public.event_comments (
    map_id, feature_id, user_id, session_id,
    participant_key, author_name, body
  ) VALUES (
    p_map_id, p_feature_id, v_user_id, p_session_id,
    v_participant_key, v_author, p_body
  ) RETURNING id INTO v_new_id;

  RETURN jsonb_build_object(
    'id', v_new_id,
    'participant_key', v_participant_key,
    'author_name', v_author,
    'status', 'ok'
  );
END;
$$;


-- ─── 5) RPC: list_event_comments ───
-- pinned 우선, 최신순 정렬, visible만
CREATE OR REPLACE FUNCTION public.list_event_comments(
  p_map_id     UUID,
  p_feature_id UUID,
  p_limit      INT DEFAULT 50,
  p_offset     INT DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows JSONB;
  v_total BIGINT;
BEGIN
  SELECT COUNT(*) INTO v_total
  FROM public.event_comments
  WHERE map_id = p_map_id
    AND feature_id = p_feature_id
    AND status = 'visible';

  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT
      ec.id,
      ec.participant_key,
      ec.author_name,
      ec.body,
      ec.is_pinned,
      ec.created_at,
      ec.updated_at
    FROM public.event_comments ec
    WHERE ec.map_id = p_map_id
      AND ec.feature_id = p_feature_id
      AND ec.status = 'visible'
    ORDER BY ec.is_pinned DESC, ec.created_at DESC
    LIMIT p_limit OFFSET p_offset
  ) t;

  RETURN jsonb_build_object(
    'comments', v_rows,
    'total', v_total,
    'limit', p_limit,
    'offset', p_offset
  );
END;
$$;


-- ─── 6) RPC: report_event_comment ───
CREATE OR REPLACE FUNCTION public.report_event_comment(
  p_comment_id UUID,
  p_reason     TEXT,
  p_session_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_reporter_key TEXT;
BEGIN
  -- 유효한 댓글인지 확인
  IF NOT EXISTS (SELECT 1 FROM public.event_comments WHERE id = p_comment_id AND status = 'visible') THEN
    RETURN jsonb_build_object('error', 'comment_not_found');
  END IF;

  -- reason 유효성
  IF p_reason NOT IN ('spam', 'offensive', 'inappropriate', 'misinformation', 'other') THEN
    RETURN jsonb_build_object('error', 'invalid_reason');
  END IF;

  -- 중복 신고 체크 후 INSERT
  INSERT INTO public.event_comment_reports (
    comment_id, reporter_user_id, reporter_session_id, reason
  ) VALUES (
    p_comment_id, v_user_id, p_session_id, p_reason
  )
  ON CONFLICT DO NOTHING;

  -- 신고 3회 이상이면 자동 reported 상태 전환
  IF (SELECT COUNT(*) FROM public.event_comment_reports WHERE comment_id = p_comment_id) >= 3 THEN
    UPDATE public.event_comments SET status = 'reported', updated_at = now()
    WHERE id = p_comment_id AND status = 'visible';
  END IF;

  RETURN jsonb_build_object('status', 'ok');
END;
$$;
