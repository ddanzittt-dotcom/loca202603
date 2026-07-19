-- ============================================================
-- Migration 083: 사진(미디어)에 "출처 지도" 태깅 — 지도별 스코프
--
-- 배경: 080 은 feature_memos.map_id 로 메모를 지도별로 스코프했지만, 사진
--   (feature_media)에는 스코프가 없어 바인더에서 항상 "수첩"으로 빠졌다.
--   메모+사진 기록은 같은 record_id 를 공유하므로 앱단 역참조(record_id →
--   memo.map_id)로 사진을 메모의 지도에 붙일 수 있으나, "사진만 있는 기록"
--   (메모 텍스트 없음)은 참조할 메모가 없어 스코프가 불가능했다. 그 케이스까지
--   커버하려면 사진 자체에 map_id 가 필요하다.
--
-- 이 마이그레이션:
--   feature_media.map_id (nullable) 추가:
--     * map_id 있음 = 그 지도에서 남긴 사진 → 해당 지도 섹션(바인더)에 노출
--     * map_id NULL  = 수첩 사진(지도 맥락 없이 저장) → 바인더 수첩 섹션
--   지도를 삭제해도 사진은 보존하되 태그만 해제(ON DELETE SET NULL). 080 의
--   feature_memos.map_id 와 동일한 규약.
--
-- 적용:
--   1. 082 이후 실행(신규 번호 083). Supabase SQL Editor 에서 전체 복사 후 실행.
--   2. 적용 전에도 앱 동작에는 영향 없음 — createMediaRecord 는 map_id 컬럼이
--      없으면 자동으로 빼고 재삽입한다(record_id 와 동일한 폴백). 바인더는
--      photo.mapId 우선, 없으면 record_id → memo.map_id 역참조로 폴백하므로
--      메모+사진 기록은 마이그레이션 없이도 지도에 붙는다. 이 마이그레이션은
--      "사진만 있는 기록"까지 완전히 커버하기 위한 것.
--   3. RLS 변경 없음 — map_id 는 태그일 뿐이며 읽기/쓰기 권한은 기존
--      feature_media 정책(005·039)을 그대로 따른다.
-- ============================================================

-- 1) 출처 지도 컬럼 — 지도 삭제 시 사진은 남기고 태그만 해제
ALTER TABLE public.feature_media
  ADD COLUMN IF NOT EXISTS map_id uuid REFERENCES public.maps(id) ON DELETE SET NULL;

-- 2) 기존 사진 백필 — 같은 기록(feature_id + record_id)의 메모 출처 지도를 물려받는다.
--    (080 으로 메모엔 이미 map_id 가 백필돼 있음. 메모 없는 사진-only 기록은
--     원출처를 알 수 없어 NULL 유지 = 수첩.)
UPDATE public.feature_media AS md
SET map_id = fm.map_id
FROM public.feature_memos AS fm
WHERE md.map_id IS NULL
  AND md.record_id IS NOT NULL
  AND fm.record_id = md.record_id
  AND fm.feature_id = md.feature_id
  AND fm.map_id IS NOT NULL;

-- 3) 지도별 조회 인덱스
CREATE INDEX IF NOT EXISTS idx_feature_media_map_id ON public.feature_media(map_id);

-- PostgREST 스키마 캐시 리로드 (신규 컬럼 즉시 인식)
NOTIFY pgrst, 'reload schema';

-- 검증 쿼리(수동 확인용):
--   SELECT
--     count(*)                                   AS total,
--     count(*) FILTER (WHERE map_id IS NOT NULL)  AS tagged,
--     count(*) FILTER (WHERE map_id IS NULL)      AS notebook_only
--   FROM public.feature_media WHERE media_type = 'photo';
