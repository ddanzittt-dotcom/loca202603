-- ============================================================
-- 069_feature_memos_owner_only_read
-- [P0 / 출시 차단] 개인 기록(메모 텍스트 + 첨부 사진)을 발행/공유해도 비공개 유지.
--
-- 배경(068 의 메모 짝):
--   feature_memos 는 "내 기록"(카드에 남긴 메모 텍스트 + photo_urls 첨부사진)을 담는다.
--   base 정책 memos_select_visible_or_owner(loca_v1_schema.sql)가
--     maps.visibility IN ('public','unlisted') OR maps.user_id = auth.uid()
--   라, 공개/미등록 지도의 메모를 "누구나(익명 포함)" 조회할 수 있었다.
--   → feature_media(068)와 같은 노출. 오히려 is_published 가 아니라 visibility 기준이라 더 넓다.
--   메모 첨부사진(photo_urls)도 public media 버킷을 가리키므로 함께 샌다.
--
-- 방식:
--   base 정책에서 visibility 공개 분기를 제거하고 "지도 소유자"로만 제한한다.
--   유지되는 다른 정책과 OR 병존:
--     - 052 memos_select_own_feature (created_by = auth.uid())  → 내가 만든 카드(mapless 포함)
--     - 039 memos_select_personal_collaborator                  → 수락된 협업 지도
--   최종 조회 = (지도 소유자) OR (카드 작성자) OR (수락된 협업자). 익명/무관 사용자는 불가.
--
-- 영향:
--   - 공유 뷰어(스냅샷)·자체포함 공유(/shared?data=)는 원래 메모를 제외하므로 변화 없음.
--   - 레거시 폴백(getMapBundle)으로 공개 지도의 메모를 보던 경로는 비노출(의도된 변경).
--   - 협업자는 039 정책으로 계속 조회 가능.
--
-- 참고(이번 범위 아님): base memos_insert_authenticated 도 visibility 공개 분기가 있어
--   "남의 공개 지도에 메모 추가"가 가능하다. 쓰기 권한 이슈라 별도 검토 대상(여기선 READ 만 조인다).
--
-- 적용 주의사항:
--   1. 052/039 이후(신규 069). Supabase SQL Editor(postgres 롤). 068 과 함께 적용 권장.
--   2. 검증: 익명 또는 타 계정으로 "공개(visibility=public) 남의 지도"의 feature_memos 를
--      REST 조회 → 0 rows 면 정상. 본인/작성자/협업자는 그대로 조회 가능해야 한다.
-- ============================================================

DROP POLICY IF EXISTS "memos_select_visible_or_owner" ON public.feature_memos;
CREATE POLICY "memos_select_visible_or_owner"
  ON public.feature_memos
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.map_features
      JOIN public.maps ON maps.id = map_features.map_id
      WHERE map_features.id = feature_memos.feature_id
        AND maps.user_id = auth.uid()
    )
  );

NOTIFY pgrst, 'reload schema';
