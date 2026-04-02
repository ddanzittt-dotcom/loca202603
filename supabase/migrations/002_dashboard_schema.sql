-- ============================================================
-- LOCA 대시보드 스키마 마이그레이션 v2
-- 실행: Supabase SQL Editor에서 전체 복사 후 실행
-- 멱등성: IF NOT EXISTS / DROP IF EXISTS 패턴 사용
-- ============================================================

-- -------------------------------------------------------
-- 1. view_logs 확장 — 이벤트 로깅 기반
-- -------------------------------------------------------
ALTER TABLE public.view_logs ADD COLUMN IF NOT EXISTS session_id text;
ALTER TABLE public.view_logs ADD COLUMN IF NOT EXISTS event_type text NOT NULL DEFAULT 'map_view';
ALTER TABLE public.view_logs ADD COLUMN IF NOT EXISTS meta jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_view_logs_event_type ON public.view_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_view_logs_session_id ON public.view_logs(session_id);

-- -------------------------------------------------------
-- 2. feature_memos 확장 — 콘텐츠 관리 (숨김/삭제)
-- -------------------------------------------------------
ALTER TABLE public.feature_memos ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'visible';

-- CHECK 제약은 IF NOT EXISTS 미지원이므로 DO 블록 사용
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'feature_memos_status_check'
  ) THEN
    ALTER TABLE public.feature_memos
      ADD CONSTRAINT feature_memos_status_check
      CHECK (status IN ('visible', 'hidden', 'deleted'));
  END IF;
END $$;

-- -------------------------------------------------------
-- 3. maps 확장 — 대시보드 모듈 + 유료 판매 예약
-- -------------------------------------------------------
ALTER TABLE public.maps ADD COLUMN IF NOT EXISTS dashboard_modules jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.maps ADD COLUMN IF NOT EXISTS price integer;
ALTER TABLE public.maps ADD COLUMN IF NOT EXISTS is_paid boolean NOT NULL DEFAULT false;

-- -------------------------------------------------------
-- 4. 신규 테이블: announcements (공지)
-- -------------------------------------------------------
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

DROP TRIGGER IF EXISTS set_announcements_updated_at ON public.announcements;
CREATE TRIGGER set_announcements_updated_at
BEFORE UPDATE ON public.announcements
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "announcements_select_public" ON public.announcements;
CREATE POLICY "announcements_select_public"
  ON public.announcements
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.maps
      WHERE maps.id = announcements.map_id
        AND maps.visibility IN ('public', 'unlisted')
    )
  );

DROP POLICY IF EXISTS "announcements_insert_owner" ON public.announcements;
CREATE POLICY "announcements_insert_owner"
  ON public.announcements
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.maps
      WHERE maps.id = announcements.map_id
        AND maps.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "announcements_update_owner" ON public.announcements;
CREATE POLICY "announcements_update_owner"
  ON public.announcements
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.maps
      WHERE maps.id = announcements.map_id
        AND maps.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "announcements_delete_owner" ON public.announcements;
CREATE POLICY "announcements_delete_owner"
  ON public.announcements
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.maps
      WHERE maps.id = announcements.map_id
        AND maps.user_id = auth.uid()
    )
  );

-- -------------------------------------------------------
-- 5. 신규 테이블: survey_responses (설문)
-- -------------------------------------------------------
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

-- RLS
ALTER TABLE public.survey_responses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "survey_responses_insert_all" ON public.survey_responses;
CREATE POLICY "survey_responses_insert_all"
  ON public.survey_responses
  FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "survey_responses_select_owner" ON public.survey_responses;
CREATE POLICY "survey_responses_select_owner"
  ON public.survey_responses
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.maps
      WHERE maps.id = survey_responses.map_id
        AND maps.user_id = auth.uid()
    )
  );
