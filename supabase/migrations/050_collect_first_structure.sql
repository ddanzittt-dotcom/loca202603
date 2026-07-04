-- ============================================================
-- Migration 050: 채집-우선 구조 전환 (A단계 — 보이지 않는 공사)
--
-- 목표: "지도 먼저 → 그 안에 기록" 을 "기록(채집) 먼저 → 지도는 묶음" 으로.
--   1) 기록(map_features)이 지도 없이 존재할 수 있게 map_id 를 nullable 로
--   2) 지도를 삭제해도 기록은 도감에 남게 CASCADE → SET NULL
--   3) 지도-기록 M:N 연결 테이블(map_feature_placements) 신설 + 기존 데이터 백필
--   4) 작성자(created_by) 백필 + "내 기록은 내 것" RLS 보강
--
-- 적용 주의사항:
--   1. 049 이후 실행 (신규 번호 050).
--   2. 백필 포함 — 실행 후 아래 검증 쿼리로 개수 일치 확인:
--        SELECT
--          (SELECT count(*) FROM public.map_features WHERE map_id IS NOT NULL) AS features_with_map,
--          (SELECT count(*) FROM public.map_feature_placements) AS placements,
--          (SELECT count(*) FROM public.map_features WHERE created_by IS NULL) AS ownerless;
--      → features_with_map = placements, ownerless = 0 이어야 정상.
--   3. 이 단계에서는 앱이 map_id 컬럼과 placements 를 병행 기록(dual-write)한다.
--      실제 다중 지도 배치는 C단계에서 placements 기준으로 전환.
-- ============================================================

-- ------------------------------------------------------------
-- 1. 기록의 독립: map_id nullable + 지도 삭제 시 기록 보존
-- ------------------------------------------------------------

ALTER TABLE public.map_features ALTER COLUMN map_id DROP NOT NULL;

ALTER TABLE public.map_features DROP CONSTRAINT IF EXISTS map_features_map_id_fkey;
ALTER TABLE public.map_features
  ADD CONSTRAINT map_features_map_id_fkey
  FOREIGN KEY (map_id) REFERENCES public.maps(id) ON DELETE SET NULL;

-- ------------------------------------------------------------
-- 2. 작성자 백필 — created_by 없는 기록은 지도 주인 소유로
-- ------------------------------------------------------------

UPDATE public.map_features f
SET created_by = m.user_id
FROM public.maps m
WHERE f.map_id = m.id
  AND f.created_by IS NULL;

CREATE INDEX IF NOT EXISTS idx_map_features_created_by
  ON public.map_features(created_by);

-- ------------------------------------------------------------
-- 3. 지도-기록 M:N 배치 테이블 + 백필
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.map_feature_placements (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  map_id      uuid NOT NULL REFERENCES public.maps(id) ON DELETE CASCADE,
  feature_id  uuid NOT NULL REFERENCES public.map_features(id) ON DELETE CASCADE,
  sort_order  integer NOT NULL DEFAULT 0,
  added_by    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (map_id, feature_id)
);

CREATE INDEX IF NOT EXISTS idx_mfp_map ON public.map_feature_placements(map_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_mfp_feature ON public.map_feature_placements(feature_id);

INSERT INTO public.map_feature_placements (map_id, feature_id, sort_order, added_by)
SELECT f.map_id, f.id, COALESCE(f.sort_order, 0), f.created_by
FROM public.map_features f
WHERE f.map_id IS NOT NULL
ON CONFLICT (map_id, feature_id) DO NOTHING;

-- ------------------------------------------------------------
-- 4. RLS
-- ------------------------------------------------------------

ALTER TABLE public.map_feature_placements ENABLE ROW LEVEL SECURITY;

-- 열람: 공개/링크 지도는 누구나, 비공개는 소유자·수락된 참여자
DROP POLICY IF EXISTS "mfp_select_viewable" ON public.map_feature_placements;
CREATE POLICY "mfp_select_viewable"
  ON public.map_feature_placements
  FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.maps m
      WHERE m.id = map_id
        AND (
          m.visibility IN ('public', 'unlisted')
          OR m.user_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.map_collaborators c
            WHERE c.map_id = m.id AND c.user_id = auth.uid() AND c.status = 'accepted'
          )
        )
    )
  );

-- 배치 추가: 소유자·수락된 편집 참여자가, 자기 기록(또는 소유자는 제한 없이)을 꽂는다
DROP POLICY IF EXISTS "mfp_insert_editor" ON public.map_feature_placements;
CREATE POLICY "mfp_insert_editor"
  ON public.map_feature_placements
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (
      public.is_map_owner(map_id)
      OR EXISTS (
        SELECT 1 FROM public.map_collaborators c
        WHERE c.map_id = map_feature_placements.map_id
          AND c.user_id = auth.uid()
          AND c.role = 'editor'
          AND c.status = 'accepted'
      )
    )
    AND (
      public.is_map_owner(map_id)
      OR EXISTS (
        SELECT 1 FROM public.map_features f
        WHERE f.id = feature_id AND f.created_by = auth.uid()
      )
    )
  );

-- 순서 변경: 소유자만
DROP POLICY IF EXISTS "mfp_update_owner" ON public.map_feature_placements;
CREATE POLICY "mfp_update_owner"
  ON public.map_feature_placements
  FOR UPDATE
  TO authenticated
  USING (public.is_map_owner(map_id))
  WITH CHECK (public.is_map_owner(map_id));

-- 빼기: 소유자 전체, 참여자는 자기 기록의 배치만
DROP POLICY IF EXISTS "mfp_delete_policy" ON public.map_feature_placements;
CREATE POLICY "mfp_delete_policy"
  ON public.map_feature_placements
  FOR DELETE
  TO authenticated
  USING (
    public.is_map_owner(map_id)
    OR EXISTS (
      SELECT 1 FROM public.map_features f
      WHERE f.id = feature_id AND f.created_by = auth.uid()
    )
  );

GRANT SELECT ON public.map_feature_placements TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.map_feature_placements TO authenticated;
GRANT ALL ON public.map_feature_placements TO service_role;

-- map_features 보강: "내 기록은 내 것" (기존 지도 기반 정책과 OR 병존)
DROP POLICY IF EXISTS "features_select_own" ON public.map_features;
CREATE POLICY "features_select_own"
  ON public.map_features
  FOR SELECT
  TO authenticated
  USING (created_by = auth.uid());

DROP POLICY IF EXISTS "features_insert_own_mapless" ON public.map_features;
CREATE POLICY "features_insert_own_mapless"
  ON public.map_features
  FOR INSERT
  TO authenticated
  WITH CHECK (map_id IS NULL AND created_by = auth.uid());

DROP POLICY IF EXISTS "features_update_own" ON public.map_features;
CREATE POLICY "features_update_own"
  ON public.map_features
  FOR UPDATE
  TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS "features_delete_own" ON public.map_features;
CREATE POLICY "features_delete_own"
  ON public.map_features
  FOR DELETE
  TO authenticated
  USING (created_by = auth.uid());

NOTIFY pgrst, 'reload schema';
