-- ============================================================
-- LOCA 지역 데이터 자산 인프라 마이그레이션 v7
-- 목적: 핀 데이터의 통계적 추출을 위한 공간 인덱스 + 행정구역 태깅 + 집계 뷰
-- 실행: Supabase SQL Editor에서 전체 복사 후 실행
-- ============================================================

-- -------------------------------------------------------
-- 1. PostGIS 활성화 + Spatial Index
--    위치 기반 범위 쿼리 성능 확보
-- -------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS postgis;

-- geometry 컬럼 추가 (기존 lat/lng에서 자동 생성)
ALTER TABLE public.map_features
  ADD COLUMN IF NOT EXISTS geom geometry(Point, 4326);

-- 기존 데이터 백필: lat/lng가 유효한 행만
UPDATE public.map_features
SET geom = ST_SetSRID(ST_MakePoint(lng, lat), 4326)
WHERE lat IS NOT NULL AND lng IS NOT NULL
  AND lat != 0 AND lng != 0
  AND geom IS NULL;

-- 공간 인덱스
CREATE INDEX IF NOT EXISTS idx_map_features_geom
  ON public.map_features USING GIST (geom);

-- -------------------------------------------------------
-- 2. 행정구역 자동 태깅 컬럼
--    핀 저장 시 region 자동 부여 (트리거)
-- -------------------------------------------------------
ALTER TABLE public.map_features
  ADD COLUMN IF NOT EXISTS region_code text;   -- 법정동코드 (예: '1121510700')
ALTER TABLE public.map_features
  ADD COLUMN IF NOT EXISTS region_name text;   -- 사람이 읽는 이름 (예: '서울 성동구 성수동1가')

CREATE INDEX IF NOT EXISTS idx_map_features_region_code
  ON public.map_features(region_code);
CREATE INDEX IF NOT EXISTS idx_map_features_region_name
  ON public.map_features(region_name);

-- geom 자동 생성 트리거: INSERT/UPDATE 시 lat/lng → geom 동기화
CREATE OR REPLACE FUNCTION public.sync_feature_geom()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.lat IS NOT NULL AND NEW.lng IS NOT NULL
     AND NEW.lat != 0 AND NEW.lng != 0 THEN
    NEW.geom := ST_SetSRID(ST_MakePoint(NEW.lng, NEW.lat), 4326);
  ELSE
    NEW.geom := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_feature_geom ON public.map_features;
CREATE TRIGGER trg_sync_feature_geom
BEFORE INSERT OR UPDATE OF lat, lng ON public.map_features
FOR EACH ROW EXECUTE FUNCTION public.sync_feature_geom();

-- -------------------------------------------------------
-- 3. 통계 집계 뷰 (Materialized View)
--    대시보드/데이터 추출에서 원본 테이블 풀스캔 방지
-- -------------------------------------------------------

-- 3-1. 지역별 핀 밀도
CREATE MATERIALIZED VIEW IF NOT EXISTS public.mv_region_pin_density AS
SELECT
  region_name,
  region_code,
  count(*) AS pin_count,
  count(DISTINCT map_id) AS map_count,
  count(DISTINCT created_by) AS creator_count,
  array_agg(DISTINCT unnest_tag) FILTER (WHERE unnest_tag IS NOT NULL) AS top_tags
FROM public.map_features,
  LATERAL unnest(tags) AS unnest_tag
WHERE type = 'pin'
  AND lat IS NOT NULL AND lng IS NOT NULL
  AND lat != 0 AND lng != 0
  AND region_name IS NOT NULL
GROUP BY region_name, region_code
WITH NO DATA;

-- 3-2. 태그별 인기도
CREATE MATERIALIZED VIEW IF NOT EXISTS public.mv_tag_popularity AS
SELECT
  unnest_tag AS tag,
  count(*) AS usage_count,
  count(DISTINCT mf.map_id) AS map_count,
  count(DISTINCT mf.created_by) AS creator_count,
  round(avg(mf.lat)::numeric, 4) AS avg_lat,
  round(avg(mf.lng)::numeric, 4) AS avg_lng
FROM public.map_features mf,
  LATERAL unnest(mf.tags) AS unnest_tag
WHERE mf.type = 'pin'
  AND mf.lat IS NOT NULL AND mf.lng IS NOT NULL
  AND mf.lat != 0 AND mf.lng != 0
GROUP BY unnest_tag
WITH NO DATA;

-- 3-3. 월별 활동 요약
CREATE MATERIALIZED VIEW IF NOT EXISTS public.mv_monthly_activity AS
SELECT
  date_trunc('month', created_at) AS month,
  count(*) FILTER (WHERE type = 'pin') AS new_pins,
  count(*) FILTER (WHERE type = 'route') AS new_routes,
  count(*) FILTER (WHERE type = 'area') AS new_areas,
  count(DISTINCT map_id) AS active_maps,
  count(DISTINCT created_by) AS active_creators
FROM public.map_features
GROUP BY date_trunc('month', created_at)
WITH NO DATA;

-- -------------------------------------------------------
-- 4. 뷰 새로고침 함수 (수동 또는 cron으로 호출)
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.refresh_analytics_views()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_region_pin_density;
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_tag_popularity;
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_monthly_activity;
END;
$$;

-- CONCURRENTLY 지원을 위한 UNIQUE INDEX
CREATE UNIQUE INDEX IF NOT EXISTS uidx_mv_region_pin_density
  ON public.mv_region_pin_density(region_name);
CREATE UNIQUE INDEX IF NOT EXISTS uidx_mv_tag_popularity
  ON public.mv_tag_popularity(tag);
CREATE UNIQUE INDEX IF NOT EXISTS uidx_mv_monthly_activity
  ON public.mv_monthly_activity(month);

-- 최초 데이터 적재
REFRESH MATERIALIZED VIEW public.mv_region_pin_density;
REFRESH MATERIALIZED VIEW public.mv_tag_popularity;
REFRESH MATERIALIZED VIEW public.mv_monthly_activity;

-- -------------------------------------------------------
-- 5. 유용한 통계 쿼리 예시 (실행하지 않음, 참고용)
-- -------------------------------------------------------

-- 특정 지점 반경 500m 내 모든 핀
-- SELECT title, tags, ST_Distance(geom::geography, ST_SetSRID(ST_MakePoint(127.056, 37.544), 4326)::geography) AS distance_m
-- FROM map_features
-- WHERE ST_DWithin(geom::geography, ST_SetSRID(ST_MakePoint(127.056, 37.544), 4326)::geography, 500)
-- ORDER BY distance_m;

-- 성수동 지역 인기 태그 TOP 10
-- SELECT * FROM mv_tag_popularity
-- WHERE avg_lat BETWEEN 37.54 AND 37.55 AND avg_lng BETWEEN 127.04 AND 127.06
-- ORDER BY usage_count DESC LIMIT 10;

-- 월별 성장 추이
-- SELECT * FROM mv_monthly_activity ORDER BY month DESC LIMIT 12;
