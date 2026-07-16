-- 075_explore_catalog_nearby.sql
-- 탐색 카탈로그 거리순 조회 RPC (074 후속)
--
-- 문제: PostGIS 없이 클라이언트가 bbox 로 조회하면 결과가 무순서라,
--       밀집 지역(서울 10km bbox > 800행)에서 limit 에 걸려 "가까운 행"이 잘린다.
-- 해법: 서버에서 근사 거리(위도 보정 평면 거리)로 정렬 후 limit — 가까운 순 보장.
--       points(route 폴리라인)는 무거워서 반환 컬럼에서 제외 (지연 조회 규약 유지).

create or replace function public.explore_catalog_nearby(
  p_tab text,
  p_lat double precision,
  p_lng double precision,
  p_radius_km double precision default 20,
  p_limit integer default 300
)
returns table (
  id text,
  source text,
  tab text,
  title text,
  category text,
  addr text,
  lat double precision,
  lng double precision,
  region_text text,
  phone text,
  start_date date,
  end_date date,
  market_cycle text,
  market_days smallint[],
  route_distance_km numeric,
  route_duration_min integer,
  route_level text,
  summary text,
  source_url text,
  source_ref text
)
language sql
stable
as $$
  select
    c.id, c.source, c.tab, c.title, c.category, c.addr, c.lat, c.lng,
    c.region_text, c.phone, c.start_date, c.end_date,
    c.market_cycle, c.market_days,
    c.route_distance_km, c.route_duration_min, c.route_level,
    c.summary, c.source_url, c.source_ref
  from public.explore_catalog c
  where c.tab = p_tab
    and c.lat between p_lat - p_radius_km / 110.574
                  and p_lat + p_radius_km / 110.574
    and c.lng between p_lng - p_radius_km / (111.320 * greatest(0.2, cos(radians(p_lat))))
                  and p_lng + p_radius_km / (111.320 * greatest(0.2, cos(radians(p_lat))))
  -- 근사 평면 거리 제곱(경도는 위도 보정) — 정렬용으로 충분, sqrt 불필요
  order by pow((c.lat - p_lat) * 110.574, 2)
         + pow((c.lng - p_lng) * 111.320 * cos(radians(p_lat)), 2)
  limit least(greatest(p_limit, 1), 500)
$$;

-- 공개 카탈로그 조회이므로 익명 포함 실행 허용 (테이블 RLS 는 074의 공개 읽기 정책)
grant execute on function public.explore_catalog_nearby(text, double precision, double precision, double precision, integer)
  to anon, authenticated;

-- ── 적용 주의사항 ─────────────────────────────────────────────
-- 1) 074 적용 후 실행 (테이블 필요).
-- 2) 미적용 상태여도 앱은 동작한다 — 클라이언트가 RPC 실패 시 bbox 단계 조회로 폴백.
--    단, 밀집 지역 정확도(가까운 순 보장)는 이 RPC 가 있어야 완전하다.
