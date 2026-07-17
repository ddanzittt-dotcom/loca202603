-- 076_explore_catalog_learn.sql
-- ② 배우기 소스 지원 — explore_catalog 컬럼 추가 + 거리순 RPC 재정의 (074·075 후속)
--
-- 추가 컬럼:
--   apply_start/apply_end  평생학습강좌 접수기간 → "접수중" 배지·정렬 (스펙 §5)
--   image                  소스 제공 사진 URL (농어촌체험마을 exprnPicUrl 등)

alter table public.explore_catalog
  add column if not exists apply_start date,
  add column if not exists apply_end date,
  add column if not exists image text;

-- 반환 테이블이 바뀌므로 drop 후 재생성 (create or replace 는 반환형 변경 불가)
drop function if exists public.explore_catalog_nearby(text, double precision, double precision, double precision, integer);

create function public.explore_catalog_nearby(
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
  apply_start date,
  apply_end date,
  market_cycle text,
  market_days smallint[],
  route_distance_km numeric,
  route_duration_min integer,
  route_level text,
  summary text,
  image text,
  source_url text,
  source_ref text
)
language sql
stable
as $$
  select
    c.id, c.source, c.tab, c.title, c.category, c.addr, c.lat, c.lng,
    c.region_text, c.phone, c.start_date, c.end_date,
    c.apply_start, c.apply_end,
    c.market_cycle, c.market_days,
    c.route_distance_km, c.route_duration_min, c.route_level,
    c.summary, c.image, c.source_url, c.source_ref
  from public.explore_catalog c
  where c.tab = p_tab
    and c.lat between p_lat - p_radius_km / 110.574
                  and p_lat + p_radius_km / 110.574
    and c.lng between p_lng - p_radius_km / (111.320 * greatest(0.2, cos(radians(p_lat))))
                  and p_lng + p_radius_km / (111.320 * greatest(0.2, cos(radians(p_lat))))
  order by pow((c.lat - p_lat) * 110.574, 2)
         + pow((c.lng - p_lng) * 111.320 * cos(radians(p_lat)), 2)
  limit least(greatest(p_limit, 1), 500)
$$;

grant execute on function public.explore_catalog_nearby(text, double precision, double precision, double precision, integer)
  to anon, authenticated;

-- ── 적용 주의사항 ─────────────────────────────────────────────
-- 1) 074·075 적용 후 실행.
-- 2) 클라이언트는 새 컬럼이 없으면(076 이전) 조회가 에러 → bbox 폴백/빈 목록으로 동작하므로
--    코드 배포보다 이 migration 을 먼저 적용하는 것을 권장.
