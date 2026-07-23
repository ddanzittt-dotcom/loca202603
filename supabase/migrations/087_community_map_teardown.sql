-- ============================================================
-- 087_community_map_teardown
-- 목적: 2026-07-23 철거된 "모두의 지도"(공용 커뮤니티 지도)의 DB 잔재 정리.
--
-- 배경:
--   모두의 지도는 사용자 모두가 하나의 공용 지도에 제보 → 승인 → 노출하던 기능이다.
--   후속으로 탐색탭 이웃 제보(084·085, explore_catalog 미러 발행)가 같은 역할을 하게 되면서
--   앱 진입 경로가 사라졌고, 2026-07-23 기준 데이터가 완전히 비어 있음을 확인했다:
--     - public.community_records                          : 0행
--     - 모두의 지도(map_features where map_id = 해당 지도) : 0행
--   앱 코드에서는 라우트(/community-web)·부팅 하이드레이션·실시간 구독을 이미 제거했다.
--
-- 하는 일:
--   STEP 1  잔여 데이터 확인 (반드시 눈으로 보고 나서 STEP 2 실행)
--   STEP 2  community_records 테이블 제거 (정책·트리거는 CASCADE 로 함께 사라진다)
--   STEP 3  'community-map' 지도 행 제거 (발행/스냅샷 행은 FK CASCADE)
--
-- ⚠️ 되돌릴 수 없다. 실행 위치: Supabase SQL Editor (postgres 롤).
-- ⚠️ STEP 1 결과가 0이 아니면 **중단하고** 데이터 보존 방침부터 정할 것.
-- ⚠️ 앱 배포 이후에 실행해도 되고 먼저 실행해도 된다 — 앱은 이미 이 테이블을 조회하지 않는다.
-- ============================================================

-- ── STEP 1. 잔여 데이터 확인 (여기까지만 먼저 실행) ─────────────
select
  (select count(*) from public.community_records)                                        as community_records,
  (select count(*) from public.maps where slug = 'community-map')                        as community_map_rows,
  (select count(*) from public.map_features f
     join public.maps m on m.id = f.map_id
    where m.slug = 'community-map')                                                      as community_map_features;

-- ── STEP 2. 커뮤니티 제보 테이블 제거 ──────────────────────────
-- (RLS 정책·인덱스·트리거는 테이블과 함께 제거된다)
drop table if exists public.community_records cascade;

-- ── STEP 3. 공용 지도 행 제거 ─────────────────────────────────
-- map_publications / map_publication_revisions / map_feature_placements 등
-- 참조 행은 FK ON DELETE CASCADE 로 함께 정리된다.
delete from public.maps where slug = 'community-map';

-- ── 확인 ─────────────────────────────────────────────────────
-- select to_regclass('public.community_records') as should_be_null;
-- select count(*) as should_be_zero from public.maps where slug = 'community-map';
