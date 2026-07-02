-- ============================================================
-- Migration 048: 웹 MVP 실험분(046·047) 잔존 테이블 정리
--
-- 배경: 2026-07-02 웹 MVP(스팟/장소기록/지도) 실험을 라이브 DB에
-- 적용(046·047)했다가 당일 코드 전체를 롤백함. 파일은 레포에서
-- 제거됐지만 DB에는 테이블·RPC가 남아 있어 이 migration 으로 정리한다.
--
-- 적용 주의사항:
--   1. 046·047 을 적용한 프로젝트에서만 실행. 적용한 적 없으면 no-op (IF EXISTS).
--   2. spots/place_records 등에 실데이터가 있다면 이 migration 은 되돌릴 수 없다.
--      (실험 당일 롤백이라 실데이터는 없다고 가정)
--   3. maps.cover_image_url, profiles.is_public 컬럼도 046에서 추가된 것이므로 함께 제거.
-- ============================================================

-- 047: 초대 링크
DROP FUNCTION IF EXISTS public.accept_map_invite(text);
DROP FUNCTION IF EXISTS public.get_map_invite_preview(text);
DROP FUNCTION IF EXISTS public.create_map_invite_link(uuid);
DROP TABLE IF EXISTS public.map_invite_links;

-- 046: 스팟/장소기록/담기
DROP FUNCTION IF EXISTS public.web_mvp_prepare_publish(uuid);
DROP FUNCTION IF EXISTS public.find_nearby_spots(double precision, double precision, double precision);
DROP FUNCTION IF EXISTS public.web_mvp_can_view_map(uuid);
DROP FUNCTION IF EXISTS public.web_mvp_is_map_collaborator(uuid);

DROP TABLE IF EXISTS public.user_saves;
DROP TABLE IF EXISTS public.map_items;
DROP TABLE IF EXISTS public.place_records;
DROP TABLE IF EXISTS public.spots;

DROP FUNCTION IF EXISTS public.web_mvp_touch_updated_at() CASCADE;

ALTER TABLE public.maps DROP COLUMN IF EXISTS cover_image_url;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS is_public;

NOTIFY pgrst, 'reload schema';
