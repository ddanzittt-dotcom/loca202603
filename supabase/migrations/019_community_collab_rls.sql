-- ============================================================
-- Migration 019: community map collaboration + collaborator read RLS
-- 목적
-- 1) 협업자(editor/viewer)가 본인 참여 지도의 feature를 조회 가능하게 확장
-- 2) slug='community-map' 공용 지도에서 인증 사용자 작성 허용
-- 3) 공용 지도 feature 수정/삭제는 작성자 본인(또는 지도 owner)만 허용
-- ============================================================

-- 1) map_features SELECT: collaborator도 읽기 허용
DROP POLICY IF EXISTS "features_select_collaborator" ON public.map_features;
CREATE POLICY "features_select_collaborator"
  ON public.map_features
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.map_collaborators c
      WHERE c.map_id = map_features.map_id
        AND c.user_id = auth.uid()
    )
  );

-- 2) community-map INSERT: 인증 사용자 작성 허용
DROP POLICY IF EXISTS "features_insert_community_authenticated" ON public.map_features;
CREATE POLICY "features_insert_community_authenticated"
  ON public.map_features
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND map_features.created_by = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.maps m
      WHERE m.id = map_features.map_id
        AND m.slug = 'community-map'
    )
    AND (
      -- 013 마이그레이션의 분당 제한 함수가 있는 경우 그대로 재사용
      -- (함수가 없으면 migration 적용 시 에러가 나므로 이 프로젝트 기준으로 필수 전제)
      public.feature_insert_rate_ok()
    )
  );

-- 3) community-map UPDATE: 작성자 본인 또는 지도 owner만 허용
DROP POLICY IF EXISTS "features_update_community_author" ON public.map_features;
CREATE POLICY "features_update_community_author"
  ON public.map_features
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.maps m
      WHERE m.id = map_features.map_id
        AND m.slug = 'community-map'
    )
    AND (
      map_features.created_by = auth.uid()
      OR EXISTS (
        SELECT 1
        FROM public.maps owner_map
        WHERE owner_map.id = map_features.map_id
          AND owner_map.user_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.maps m
      WHERE m.id = map_features.map_id
        AND m.slug = 'community-map'
    )
    AND (
      map_features.created_by = auth.uid()
      OR EXISTS (
        SELECT 1
        FROM public.maps owner_map
        WHERE owner_map.id = map_features.map_id
          AND owner_map.user_id = auth.uid()
      )
    )
  );

-- 4) community-map DELETE: 작성자 본인 또는 지도 owner만 허용
DROP POLICY IF EXISTS "features_delete_community_author" ON public.map_features;
CREATE POLICY "features_delete_community_author"
  ON public.map_features
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM public.maps m
      WHERE m.id = map_features.map_id
        AND m.slug = 'community-map'
    )
    AND (
      map_features.created_by = auth.uid()
      OR EXISTS (
        SELECT 1
        FROM public.maps owner_map
        WHERE owner_map.id = map_features.map_id
          AND owner_map.user_id = auth.uid()
      )
    )
  );
