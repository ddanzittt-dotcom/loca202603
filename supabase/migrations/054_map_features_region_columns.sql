-- ============================================================
-- Migration 054: map_features 에 region_name / region_code 컬럼 추가
--
-- 배경:
--   지도를 열면 backfillRegionNames → reverseGeocodeAndTag 가 각 카드의 좌표를
--   동네 이름으로 변환한 뒤 map_features.region_name / region_code 에 저장한다.
--   그런데 이 컬럼을 만드는 007_geodata_infrastructure.sql 은 PostGIS·트리거·집계뷰까지
--   포함한 무거운 마이그레이션이라 프로덕션 DB 에 적용되지 않았고,
--   그 결과 UPDATE 가 400(PGRST204: 컬럼 없음)으로 실패하며 콘솔에 에러가 쌓였다.
--   (앱은 이 에러를 무시하도록 되어 있어 크래시는 없지만, 동네 이름이 저장되지 않았다.)
--
-- 방식:
--   앱이 실제로 쓰는 두 컬럼(region_name, region_code)만 추가한다.
--   007 의 PostGIS geom / 공간 트리거 / mv_region_pin_density 집계뷰는 앱이 사용하지
--   않으므로 제외한다(필요 시 007 을 별도로 실행).
--
-- 적용 주의사항:
--   1. 053 이후 실행 (신규 번호 054). Supabase SQL Editor 에서 실행.
--   2. IF NOT EXISTS 라 007 이 이미 적용된 환경에서도 안전(무시됨).
--   3. 추가(additive)라 롤백 필요 시 아래 컬럼만 DROP 하면 된다.
--   4. 검증: 적용 후 지도 열기 → 콘솔에 map_features 400 이 사라지고,
--      map_features.region_name 이 채워지면 정상.
-- ============================================================

ALTER TABLE public.map_features
  ADD COLUMN IF NOT EXISTS region_code text;   -- 법정동코드 (예: '1121510700')
ALTER TABLE public.map_features
  ADD COLUMN IF NOT EXISTS region_name text;   -- 사람이 읽는 이름 (예: '서울특별시 성동구 성수동1가')

CREATE INDEX IF NOT EXISTS idx_map_features_region_code
  ON public.map_features(region_code);
CREATE INDEX IF NOT EXISTS idx_map_features_region_name
  ON public.map_features(region_name);
