-- 074_explore_catalog.sql
-- 탐색탭 사전 적재 카탈로그 (스펙 v3.3 §3.5 — 사전 적재형 소스)
--
-- 격자형 표준데이터(도시공원·전통시장·문화축제)와 두루누비 코스는 요청 시 호출이
-- 불가능한 소스(전수 데이터·좌표 없음·GPX 파일 파싱·저빈도 갱신)라서,
-- 수집 스크립트(scripts/ingest/*)가 지오코딩·필터·다운샘플을 끝낸 상태로 이 테이블에 적재하고
-- 클라이언트/서버리스는 읽기만 한다.
--
-- 쓰기 경로: service_role 전용 (RLS에 INSERT/UPDATE/DELETE 정책을 만들지 않음 →
--            anon/authenticated 쓰기 불가. 수집 스크립트는 SUPABASE_SERVICE_ROLE_KEY 사용)
-- 읽기 경로: 공개 카탈로그 — 비로그인 탐색탭에서도 보여야 하므로 anon SELECT 허용.
--            단, route 폴리라인(points)은 목록 조회에서 컬럼 제외로 가볍게 유지(클라이언트 규약).

create table if not exists public.explore_catalog (
  id text primary key,                    -- "<source>:<원본 식별자>" (upsert 키)
  source text not null,                   -- 'citypark' | 'market' | 'durunubi' | 'festival'
  tab text not null,                      -- 서빙 칸: 'walk' | 'enjoy' (이후 'learn' 확장)
  title text not null,
  category text,                          -- 카드 라벨 (공원구분/시장유형/둘레길 등)
  addr text,
  lat double precision not null,
  lng double precision not null,
  region_text text,                       -- 소스 제공 지역 원문 (두루누비 sigun 등)
  phone text,
  start_date date,                        -- festival 개최 시작
  end_date date,                          -- festival 개최 종료 (지난 레코드는 적재 시 제외)
  market_cycle text,                      -- 시장개설주기 원문 ("5일+10일" 등)
  market_days smallint[],                 -- 오일장 날짜 끝자리 (예: {5,10} / 10은 0·10·20·30일)
  route_distance_km numeric,              -- durunubi 총길이(km)
  route_duration_min integer,             -- durunubi 총소요시간(분)
  route_level text,                       -- durunubi 난이도
  summary text,                           -- 카드/상세용 짧은 소개
  detail jsonb,                           -- 소스별 부가 필드 (보유시설·취급품목·주최 등)
  points jsonb,                           -- route 폴리라인 [[lng,lat],...] — durunubi 전용, 다운샘플 완료본
  source_ref text,                        -- 원본 키 (crsIdx 등)
  source_url text,                        -- 원본 안내 링크
  data_reference_date date,               -- 데이터기준일자 (신선도 지표, 스펙 §2)
  ingested_at timestamptz not null default now()
);

comment on table public.explore_catalog is
  '탐색탭 사전 적재 카탈로그 — 표준데이터·두루누비. service_role만 쓰기, 공개 읽기 (v3.3 §3.5)';

-- bbox 반경 조회용 (tab별 lat/lng 범위 스캔)
create index if not exists explore_catalog_tab_lat_lng_idx
  on public.explore_catalog (tab, lat, lng);

-- festival 종료일 필터 조회용
create index if not exists explore_catalog_end_date_idx
  on public.explore_catalog (end_date)
  where end_date is not null;

alter table public.explore_catalog enable row level security;

-- 공개 읽기 (비로그인 탐색탭 포함). 쓰기 정책 없음 → service_role 외 쓰기 불가.
drop policy if exists explore_catalog_public_read on public.explore_catalog;
create policy explore_catalog_public_read
  on public.explore_catalog
  for select
  using (true);

-- ── 적용 주의사항 ─────────────────────────────────────────────
-- 1) Supabase SQL Editor에서 이 파일 실행 (기존 066~073과 동일 흐름).
-- 2) 실행 후 수집 스크립트로 데이터 적재:
--      node scripts/ingest/ingest-cityparks.mjs --dry-run   (필드 확인)
--      node scripts/ingest/ingest-cityparks.mjs             (실제 적재)
--    필요 env: DATA_GO_KR_KEY(또는 TOUR_API_KEY), VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
-- 3) 테이블이 아직 없어도 앱은 동작한다 — 클라이언트 조회는 fail-soft(빈 목록)로 설계됨.
