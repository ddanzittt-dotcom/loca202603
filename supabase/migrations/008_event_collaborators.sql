-- ============================================================
-- Migration 008: 이벤트 지도 협업자 (map_collaborators)
-- 이벤트 지도에 editor 역할의 협업자를 초대하여 함께 편집
-- ============================================================

-- 1) map_collaborators 테이블
CREATE TABLE IF NOT EXISTS public.map_collaborators (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  map_id      UUID NOT NULL REFERENCES public.maps(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role        TEXT NOT NULL DEFAULT 'editor' CHECK (role IN ('editor', 'viewer')),
  invited_by  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(map_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_map_collaborators_map_id ON public.map_collaborators(map_id);
CREATE INDEX IF NOT EXISTS idx_map_collaborators_user_id ON public.map_collaborators(user_id);

-- 2) RLS
ALTER TABLE public.map_collaborators ENABLE ROW LEVEL SECURITY;

-- 지도 소유자 또는 본인 협업 레코드 조회
DROP POLICY IF EXISTS "collaborators_select" ON public.map_collaborators;
CREATE POLICY "collaborators_select"
  ON public.map_collaborators
  FOR SELECT
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.maps WHERE maps.id = map_collaborators.map_id AND maps.user_id = auth.uid()
    )
  );

-- 지도 소유자만 협업자 추가
DROP POLICY IF EXISTS "collaborators_insert_owner" ON public.map_collaborators;
CREATE POLICY "collaborators_insert_owner"
  ON public.map_collaborators
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.maps WHERE maps.id = map_collaborators.map_id AND maps.user_id = auth.uid()
    )
  );

-- 지도 소유자만 협업자 삭제
DROP POLICY IF EXISTS "collaborators_delete_owner" ON public.map_collaborators;
CREATE POLICY "collaborators_delete_owner"
  ON public.map_collaborators
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.maps WHERE maps.id = map_collaborators.map_id AND maps.user_id = auth.uid()
    )
  );

-- 3) map_features: 협업자(editor)도 CRUD 허용하도록 RLS 확장
-- 기존 정책을 유지하면서 협업자 허용 정책 추가

DROP POLICY IF EXISTS "features_insert_collaborator" ON public.map_features;
CREATE POLICY "features_insert_collaborator"
  ON public.map_features
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.map_collaborators
      WHERE map_collaborators.map_id = map_features.map_id
        AND map_collaborators.user_id = auth.uid()
        AND map_collaborators.role = 'editor'
    )
  );

DROP POLICY IF EXISTS "features_update_collaborator" ON public.map_features;
CREATE POLICY "features_update_collaborator"
  ON public.map_features
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.map_collaborators
      WHERE map_collaborators.map_id = map_features.map_id
        AND map_collaborators.user_id = auth.uid()
        AND map_collaborators.role = 'editor'
    )
  );

DROP POLICY IF EXISTS "features_delete_collaborator" ON public.map_features;
CREATE POLICY "features_delete_collaborator"
  ON public.map_features
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.map_collaborators
      WHERE map_collaborators.map_id = map_features.map_id
        AND map_collaborators.user_id = auth.uid()
        AND map_collaborators.role = 'editor'
    )
  );

-- 4) 협업자가 참여 중인 지도도 SELECT 가능
DROP POLICY IF EXISTS "maps_select_collaborator" ON public.maps;
CREATE POLICY "maps_select_collaborator"
  ON public.maps
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.map_collaborators
      WHERE map_collaborators.map_id = maps.id
        AND map_collaborators.user_id = auth.uid()
    )
  );
