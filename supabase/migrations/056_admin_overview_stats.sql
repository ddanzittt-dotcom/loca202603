-- ============================================================
-- Migration 056: 운영 통계 RPC (get_admin_overview)
--
-- 관리화면(/admin) 상단 개요용 집계. platform_admin 만 호출 가능.
-- 가입자/지도/장소/기록/방문/커뮤니티 수를 한 번에 반환한다.
--
-- 방어적 설계: session_id 컬럼(002)·community_records 테이블(036)이
-- 없는 환경에서도 함수 전체가 실패하지 않도록 해당 집계만 NULL 처리.
--
-- 적용: 055 이후(신규 번호 056). Supabase SQL Editor 에서 실행.
-- 검증: 관리자 계정으로 loca.im/admin → 상단에 숫자 카드가 뜨면 정상.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_admin_overview()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v jsonb;
  v_visitors_30d bigint := NULL;
  v_community_total bigint := NULL;
  v_community_pending bigint := NULL;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'admin_required' USING ERRCODE = '42501';
  END IF;

  -- 세션 기반 순 방문자(최근 30일). session_id 는 002 에서 추가 — 없으면 NULL.
  BEGIN
    SELECT count(DISTINCT session_id) INTO v_visitors_30d
    FROM public.view_logs
    WHERE created_at >= now() - interval '30 days' AND session_id IS NOT NULL;
  EXCEPTION WHEN undefined_column THEN
    v_visitors_30d := NULL;
  END;

  -- 커뮤니티 기록(모두의 지도). 테이블 없으면 NULL.
  BEGIN
    SELECT count(*), count(*) FILTER (WHERE status = 'pending')
    INTO v_community_total, v_community_pending
    FROM public.community_records;
  EXCEPTION WHEN undefined_table THEN
    v_community_total := NULL;
    v_community_pending := NULL;
  END;

  SELECT jsonb_build_object(
    'users_total',     (SELECT count(*) FROM public.profiles),
    'users_7d',        (SELECT count(*) FROM public.profiles WHERE created_at >= now() - interval '7 days'),
    'users_30d',       (SELECT count(*) FROM public.profiles WHERE created_at >= now() - interval '30 days'),
    'maps_total',      (SELECT count(*) FROM public.maps),
    'maps_published',  (SELECT count(*) FROM public.maps WHERE is_published),
    'maps_7d',         (SELECT count(*) FROM public.maps WHERE created_at >= now() - interval '7 days'),
    'features_total',  (SELECT count(*) FROM public.map_features),
    'features_pin',    (SELECT count(*) FROM public.map_features WHERE type = 'pin'),
    'features_route',  (SELECT count(*) FROM public.map_features WHERE type = 'route'),
    'features_area',   (SELECT count(*) FROM public.map_features WHERE type = 'area'),
    'memos_total',     (SELECT count(*) FROM public.feature_memos),
    'follows_total',   (SELECT count(*) FROM public.follows),
    'views_total',     (SELECT count(*) FROM public.view_logs),
    'views_7d',        (SELECT count(*) FROM public.view_logs WHERE created_at >= now() - interval '7 days'),
    'visitors_30d',    v_visitors_30d,
    'community_total', v_community_total,
    'community_pending', v_community_pending,
    'generated_at',    now()
  ) INTO v;

  RETURN v;
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_overview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_overview() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
