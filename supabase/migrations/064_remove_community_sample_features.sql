-- ============================================================
-- Migration 064: 모두의 지도 샘플(더미) 850개 제거
--
-- 배경: 사용자 테스트용 샘플 핀(작성자 'LCOA 샘플', 태그 'LCOA 샘플', 850개)을
--   운영 데이터에서 정리한다.
--
-- 주의: 043(is_sample/sample_batch 컬럼)이 라이브 DB 에 적용되지 않아, 시드 스크립트가
--   없는 컬럼을 떼고 삽입한 탓에 샘플은 is_sample 플래그 '없이' 들어갔다.
--   따라서 is_sample 이 아니라 **작성자명 + 태그**로 식별해 삭제한다
--   (scripts/community-sample-data.mjs 의 deleteByFixedSampleIds 와 동일 기준).
--
-- 재삽입 런타임 코드 없음(ensureCommunityMap 은 지도 행만 생성) → 삭제하면 영구.
-- 적용: DB 수동 적용 완료(파일은 기록용). 신규 migration 은 065 부터.
-- ============================================================

-- 샘플에 달린 메모 먼저 정리(FK 대비)
DELETE FROM public.feature_memos
WHERE feature_id IN (
  SELECT id FROM public.map_features
  WHERE created_by_name = 'LCOA 샘플' AND tags @> ARRAY['LCOA 샘플']
);

-- 샘플 본체 삭제
DELETE FROM public.map_features
WHERE created_by_name = 'LCOA 샘플'
  AND tags @> ARRAY['LCOA 샘플'];

NOTIFY pgrst, 'reload schema';
