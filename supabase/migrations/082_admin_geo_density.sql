-- ============================================================
-- Migration 082: /admin 공간 밀도 지도 RPC — get_admin_geo_density(p_days)
--
-- 목적:
--   관리 대시보드 ⑦(공간 시각화) 밀도 지도용 집계 RPC. 기간내 채집된 장소 카드를
--   0.05도(약 5.5km) 격자로 묶어 셀별 카드 수·새발견 수·대표 지역명을 반환한다.
--   격자 집계(≥0.05도)라 개별 카드의 정확한 위치를 노출하지 않는다 — 어디에서 얼마나
--   채집이 일어나는지의 밀도 히트맵만 그린다.
--
-- 적용: 081 이후(신규 082). Supabase SQL Editor 에서 전체 복사 후 실행.
--
-- 적용 전에도 기존 앱 동작에는 영향 없음 — 신규 RPC 가 없으면 /admin 의
-- 공간 시각화 섹션만 에러 카드로 표시되고 나머지 화면·앱 기능은 그대로 동작한다.
--
-- 권한: platform_admin 전용(SECURITY DEFINER + is_platform_admin 가드, 081 과 동일).
-- 방어: region_name(054) 컬럼이 없는 환경에서도 함수 전체가 죽지 않도록
--   top_region 계산만 BEGIN...EXCEPTION 으로 감싸 전부 null 로 폴백한다.
-- ============================================================

-- ------------------------------------------------------------
-- get_admin_geo_density(p_days) — 0.05도 격자 밀도 집계
--   대상: map_features 중 lat/lng 가 NOT NULL·(0,0) 아니고 created_at 이 최근 p_days 일 이내.
--   한국 bbox: lat 33.0~38.7, lng 124.5~131.9 (범위 밖 유효좌표는 overseas_cards 로 카운트만).
--   격자: 0.05도. 셀 키 = floor(lat/0.05), floor(lng/0.05). 셀 중심 = 키*0.05 + 0.025.
--   new_finds = tags @> ARRAY['새발견'] (081 과 동일 판정).
--   날짜 경계: created_at >= now() - make_interval(days => v_days) (081 cards_recent 방식).
--   셀 배열은 cards DESC 정렬 후 상한 500(payload 상한).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_admin_geo_density(p_days int DEFAULT 90)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_days int;
  v_start_ts timestamptz;
  v_cells jsonb := '[]'::jsonb;
  v_top jsonb := '{}'::jsonb;          -- { 'gy:gx': top_region }
  v_max_cards bigint := 0;
  v_total_cards bigint := 0;
  v_total_new_finds bigint := 0;
  v_overseas bigint := 0;
  v_untagged bigint := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'admin_required' USING ERRCODE = '42501';
  END IF;

  v_days := LEAST(GREATEST(COALESCE(p_days, 90), 7), 365);
  v_start_ts := now() - make_interval(days => v_days);

  -- 기간내 총계 1회 스캔: 한국 유효좌표 카드수 / 그중 새발견 / 국외(유효좌표·bbox 밖) / 좌표없음.
  --   valid = lat·lng NOT NULL 이고 (0,0) 아님. in_korea = bbox 내. (valid 일 때만 in_korea 유의미)
  SELECT
    count(*) FILTER (WHERE t.valid AND t.in_korea),
    count(*) FILTER (WHERE t.valid AND t.in_korea AND t.is_new),
    count(*) FILTER (WHERE t.valid AND NOT t.in_korea),
    count(*) FILTER (WHERE NOT t.valid)
  INTO v_total_cards, v_total_new_finds, v_overseas, v_untagged
  FROM (
    SELECT
      (lat IS NOT NULL AND lng IS NOT NULL AND (lat <> 0 OR lng <> 0)) AS valid,
      (lat BETWEEN 33.0 AND 38.7 AND lng BETWEEN 124.5 AND 131.9) AS in_korea,
      (tags @> ARRAY['새발견']) AS is_new
    FROM public.map_features
    WHERE created_at >= v_start_ts
  ) t;

  -- 셀별 최빈 region_name(top_region). region_name(054) 부재 시 전부 null 폴백.
  --   셀별 GROUP BY region 후 DISTINCT ON 으로 최다 카운트 region 선택(동률이면 아무거나).
  BEGIN
    SELECT coalesce(jsonb_object_agg(d.k, d.region), '{}'::jsonb)
    INTO v_top
    FROM (
      SELECT DISTINCT ON (g.gy, g.gx)
        (g.gy::text || ':' || g.gx::text) AS k,
        g.region AS region
      FROM (
        SELECT
          floor(lat / 0.05)::int AS gy,
          floor(lng / 0.05)::int AS gx,
          btrim(region_name) AS region,
          count(*) AS c
        FROM public.map_features
        WHERE created_at >= v_start_ts
          AND lat IS NOT NULL AND lng IS NOT NULL AND (lat <> 0 OR lng <> 0)
          AND lat BETWEEN 33.0 AND 38.7 AND lng BETWEEN 124.5 AND 131.9
          AND region_name IS NOT NULL AND btrim(region_name) <> ''
        GROUP BY 1, 2, 3
      ) g
      ORDER BY g.gy, g.gx, g.c DESC
    ) d;
  EXCEPTION WHEN undefined_column THEN
    v_top := '{}'::jsonb;
  END;

  -- 셀 집계(한국 bbox 유효좌표만) → cards DESC 상한 500. 셀 중심 좌표는 격자 키로 재계산.
  WITH cells AS (
    SELECT
      floor(lat / 0.05)::int AS gy,
      floor(lng / 0.05)::int AS gx,
      count(*) AS cards,
      count(*) FILTER (WHERE tags @> ARRAY['새발견']) AS new_finds
    FROM public.map_features
    WHERE created_at >= v_start_ts
      AND lat IS NOT NULL AND lng IS NOT NULL AND (lat <> 0 OR lng <> 0)
      AND lat BETWEEN 33.0 AND 38.7 AND lng BETWEEN 124.5 AND 131.9
    GROUP BY 1, 2
    ORDER BY cards DESC
    LIMIT 500
  )
  SELECT
    coalesce(jsonb_agg(jsonb_build_object(
      'lat',        round((c.gy * 0.05 + 0.025)::numeric, 4),
      'lng',        round((c.gx * 0.05 + 0.025)::numeric, 4),
      'cards',      c.cards,
      'new_finds',  c.new_finds,
      'top_region', v_top ->> (c.gy::text || ':' || c.gx::text)
    ) ORDER BY c.cards DESC), '[]'::jsonb),
    coalesce(max(c.cards), 0)
  INTO v_cells, v_max_cards
  FROM cells c;

  RETURN jsonb_build_object(
    'days',            v_days,
    'grid',            0.05,
    'cells',           v_cells,
    'max_cards',       v_max_cards,
    'total_cards',     v_total_cards,
    'total_new_finds', v_total_new_finds,
    'overseas_cards',  v_overseas,
    'untagged_coords', v_untagged,
    'generated_at',    now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_geo_density(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_geo_density(int) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
