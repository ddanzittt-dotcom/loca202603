-- ============================================================
-- Migration 062: 인구통계 교차 집계 RPC (get_admin_demographics)
--
-- "판매 가능한 데이터"의 실제 출구. platform_admin 전용(SECURITY DEFINER).
-- profiles.age_band/region_sido(060) × 행동(map_features)을 집계해
-- 개인 식별 없는 통계·트렌드로 뽑는다.
--
-- ★ k-익명 가드(K=5): 어떤 셀이든 그 셀에 속한 "고유 이용자 수"가 K 미만이면
--   결과에서 제외한다. 소수 표본으로 개인이 유추되는 것을 막는 필수 안전장치이며,
--   이 규칙이 있어야 익명 통계로서 외부 제공/판매가 성립한다.
--   숨긴 셀 개수(*_suppressed)를 함께 반환해 "조용한 누락"을 방지한다.
--
-- 반환 구조:
--   coverage            : 프로필 인구통계 입력률(관리자 완성도 지표, 집계 총계라 미가드)
--   age_distribution    : 연령대별 이용자 수 [{age_band, users}]  (K가드)
--   region_distribution : 시도별 이용자 수   [{region_sido, users}] (K가드)
--   age_x_region        : 연령대×시도 교차   [{age_band, region_sido, users}] (K가드)
--   age_x_neighborhood  : 연령대×동네(법정동) 활동 [{age_band, region, users, cards}] (K가드, cards순 TOP30)
--   k_threshold, generated_at
--
-- 방어적: age_band/region_sido/created_by 등이 없어도 함수가 죽지 않도록 처리.
-- 적용: 061 이후(신규 062). Supabase SQL Editor 실행. 신규 migration 은 063 부터.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_admin_demographics()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  K constant int := 5;  -- k-익명 임계값
  v_coverage jsonb;
  v_age jsonb; v_age_sup int := 0;
  v_region jsonb; v_region_sup int := 0;
  v_axr jsonb; v_axr_sup int := 0;
  v_axn jsonb; v_axn_sup int := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'admin_required' USING ERRCODE = '42501';
  END IF;

  -- 입력률(완성도) — 총계라 k-가드 불필요
  SELECT jsonb_build_object(
    'profiles_total', count(*),
    'with_age',       count(*) FILTER (WHERE age_band IS NOT NULL),
    'with_region',    count(*) FILTER (WHERE region_sido IS NOT NULL),
    'with_both',      count(*) FILTER (WHERE age_band IS NOT NULL AND region_sido IS NOT NULL)
  ) INTO v_coverage
  FROM public.profiles;

  -- 연령대 분포 (users >= K 만 노출)
  SELECT
    coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.age_band) FILTER (WHERE r.users >= K), '[]'::jsonb),
    count(*) FILTER (WHERE r.users < K)
  INTO v_age, v_age_sup
  FROM (
    SELECT age_band, count(*) AS users
    FROM public.profiles
    WHERE age_band IS NOT NULL
    GROUP BY age_band
  ) r;

  -- 시도 분포
  SELECT
    coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.users DESC) FILTER (WHERE r.users >= K), '[]'::jsonb),
    count(*) FILTER (WHERE r.users < K)
  INTO v_region, v_region_sup
  FROM (
    SELECT region_sido, count(*) AS users
    FROM public.profiles
    WHERE region_sido IS NOT NULL
    GROUP BY region_sido
  ) r;

  -- 연령대 × 시도 교차
  SELECT
    coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.users DESC) FILTER (WHERE r.users >= K), '[]'::jsonb),
    count(*) FILTER (WHERE r.users < K)
  INTO v_axr, v_axr_sup
  FROM (
    SELECT age_band, region_sido, count(*) AS users
    FROM public.profiles
    WHERE age_band IS NOT NULL AND region_sido IS NOT NULL
    GROUP BY age_band, region_sido
  ) r;

  -- 연령대 × 활동 동네(법정동) — 행동×인구통계 (핵심 판매 데이터)
  -- users = 그 셀에 기여한 고유 이용자 수(k-가드 기준), cards = 카드 수(가치 지표)
  BEGIN
    SELECT
      coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.cards DESC) FILTER (WHERE r.users >= K), '[]'::jsonb),
      count(*) FILTER (WHERE r.users < K)
    INTO v_axn, v_axn_sup
    FROM (
      SELECT p.age_band,
             f.region_name AS region,
             count(DISTINCT f.created_by) AS users,
             count(*) AS cards
      FROM public.map_features f
      JOIN public.profiles p ON p.id = f.created_by
      WHERE p.age_band IS NOT NULL
        AND f.region_name IS NOT NULL AND btrim(f.region_name) <> ''
      GROUP BY p.age_band, f.region_name
    ) r;
  EXCEPTION WHEN undefined_column OR undefined_table THEN
    v_axn := '[]'::jsonb; v_axn_sup := 0;
  END;

  RETURN jsonb_build_object(
    'k_threshold', K,
    'coverage', v_coverage,
    'age_distribution', v_age,           'age_suppressed', v_age_sup,
    'region_distribution', v_region,     'region_suppressed', v_region_sup,
    'age_x_region', v_axr,               'age_x_region_suppressed', v_axr_sup,
    'age_x_neighborhood', v_axn,         'age_x_neighborhood_suppressed', v_axn_sup,
    'generated_at', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_demographics() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_demographics() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
