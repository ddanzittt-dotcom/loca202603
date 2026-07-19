-- ============================================================
-- Migration 080: 기록(메모)에 "출처 지도" 태깅 — 지도별 스코프
--
-- 목표: 기록을 "카드 전역 공유"에서 "그 지도 맥락의 기록"으로 바꾼다.
--   feature_memos.map_id (nullable) 추가:
--     * map_id 있음 = 그 지도에서 남긴 기록
--         → 해당 지도 편집 뷰 + (작성자 본인) 바인더 집계에 노출
--     * map_id NULL  = 수첩 메모(지도 맥락 없이 바인더에서 작성)
--         → 바인더 전용 (어느 지도에도 뜨지 않음)
--   지도를 삭제해도 기록은 보존하되 태그만 해제(ON DELETE SET NULL → 수첩 메모로 강등).
--
-- 표시 규칙(앱 단):
--   - 지도 뷰: map_id = 현재 지도인 메모만.
--   - 바인더 집계: user_id = 나(본인)인 메모만, 지도별 그룹핑 + NULL(수첩) 버킷.
--     (협업 지도에서 남이 쓴 메모는 내 바인더 집계에 포함하지 않는다.)
--
-- 적용 주의사항:
--   1. 079 이후 실행(신규 번호 080).
--   2. 기존 메모 백필: 카드의 대표(scalar) map_features.map_id 를 출처로 추정한다.
--      다중 지도 배치(map_feature_placements)는 "어느 지도에서 썼는지" 이력이 없어
--      원출처를 특정할 수 없으므로 scalar map_id 로만 추정한다. mapless 카드의
--      메모는 NULL(수첩 메모)로 남는다.
--   3. RLS 변경 없음 — map_id 는 태그일 뿐이며, 읽기/쓰기 권한은 기존 feature 소유자·
--      협업(039)·mapless(052)·owner-only(069) 정책을 그대로 따른다.
-- ============================================================

-- 1) 출처 지도 컬럼 — 지도 삭제 시 기록은 남기고 태그만 해제
ALTER TABLE public.feature_memos
  ADD COLUMN IF NOT EXISTS map_id uuid REFERENCES public.maps(id) ON DELETE SET NULL;

-- 2) 기존 메모 백필 — 카드의 대표(scalar) 지도를 출처로 간주
UPDATE public.feature_memos AS fm
SET map_id = mf.map_id
FROM public.map_features AS mf
WHERE fm.feature_id = mf.id
  AND fm.map_id IS NULL
  AND mf.map_id IS NOT NULL;

-- 3) 지도별 조회 인덱스
CREATE INDEX IF NOT EXISTS idx_feature_memos_map_id ON public.feature_memos(map_id);

-- 검증 쿼리(수동 확인용):
--   SELECT
--     count(*)                                   AS total,
--     count(*) FILTER (WHERE map_id IS NOT NULL)  AS tagged,
--     count(*) FILTER (WHERE map_id IS NULL)      AS notebook_only
--   FROM public.feature_memos;
--   → notebook_only = 원래 mapless 카드의 메모 수와 일치해야 정상.
