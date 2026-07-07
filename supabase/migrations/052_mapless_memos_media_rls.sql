-- ============================================================
-- Migration 052: 채집(mapless) 카드의 기록·사진 RLS 보강
--
-- 배경:
--   050 에서 map_features.map_id 를 nullable 로 바꿔 "지도에 안 담긴 채집 카드"가
--   생겼는데, feature_memos / feature_media 의 기존 정책은 모두
--     map_features JOIN maps ON maps.id = map_features.map_id
--   INNER JOIN 으로 지도 소유를 확인한다. map_id 가 NULL 이면 조인 결과가 없어
--   EXISTS 가 false → 기록(메모/사진) INSERT·SELECT 가 전부 차단된다.
--   → 채집 카드에 남긴 기록/사진이 Supabase 에 저장되지 못하고 로컬에만 있다가
--     로그아웃(데모 데이터 복원) 시 사라진다.
--
--   050 은 map_features 에는 "내 기록은 내 것"(created_by = auth.uid()) 정책을
--   추가했지만 feature_memos / feature_media 에는 넣지 않았다. 그 누락을 메운다.
--
-- 방식:
--   부모 카드의 created_by = auth.uid() 이면 (map_id 유무와 무관하게)
--   그 카드의 기록·사진을 읽고/쓰고/지울 수 있게 하는 정책을 추가한다.
--   기존 지도-소유 기반 정책과 OR 로 병존하므로, 지도에 담긴 카드의 동작은 그대로다.
--
-- 적용 주의사항:
--   1. 051 이후 실행 (신규 번호 052). Supabase SQL Editor 에서 실행.
--   2. 추가(additive) 정책이라 롤백 필요 시 아래 이름의 정책만 DROP 하면 된다.
--   3. 검증: 로그인 상태에서 지도에 안 담긴 채집 카드에 기록+사진 저장 →
--      로그아웃 후 재로그인 → 기록/사진이 그대로 보이면 정상.
-- ============================================================

-- ------------------------------------------------------------
-- feature_memos: 내 카드의 기록은 내 것
-- ------------------------------------------------------------

DROP POLICY IF EXISTS "memos_select_own_feature" ON public.feature_memos;
CREATE POLICY "memos_select_own_feature"
  ON public.feature_memos
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.map_features mf
      WHERE mf.id = feature_memos.feature_id
        AND mf.created_by = auth.uid()
    )
  );

DROP POLICY IF EXISTS "memos_insert_own_feature" ON public.feature_memos;
CREATE POLICY "memos_insert_own_feature"
  ON public.feature_memos
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.map_features mf
      WHERE mf.id = feature_memos.feature_id
        AND mf.created_by = auth.uid()
    )
  );

DROP POLICY IF EXISTS "memos_update_own_feature" ON public.feature_memos;
CREATE POLICY "memos_update_own_feature"
  ON public.feature_memos
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.map_features mf
      WHERE mf.id = feature_memos.feature_id
        AND mf.created_by = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.map_features mf
      WHERE mf.id = feature_memos.feature_id
        AND mf.created_by = auth.uid()
    )
  );

-- DELETE 는 기존 "memos_delete_self"(auth.uid() = user_id) 로 이미 mapless 에서도 동작하므로 추가 불필요.

-- ------------------------------------------------------------
-- feature_media: 내 카드의 사진/음성 메타는 내 것
-- ------------------------------------------------------------

DROP POLICY IF EXISTS "feature_media_select_own_feature" ON public.feature_media;
CREATE POLICY "feature_media_select_own_feature"
  ON public.feature_media
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.map_features mf
      WHERE mf.id = feature_media.feature_id
        AND mf.created_by = auth.uid()
    )
  );

DROP POLICY IF EXISTS "feature_media_insert_own_feature" ON public.feature_media;
CREATE POLICY "feature_media_insert_own_feature"
  ON public.feature_media
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.map_features mf
      WHERE mf.id = feature_media.feature_id
        AND mf.created_by = auth.uid()
    )
  );

DROP POLICY IF EXISTS "feature_media_delete_own_feature" ON public.feature_media;
CREATE POLICY "feature_media_delete_own_feature"
  ON public.feature_media
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.map_features mf
      WHERE mf.id = feature_media.feature_id
        AND mf.created_by = auth.uid()
    )
  );

NOTIFY pgrst, 'reload schema';
