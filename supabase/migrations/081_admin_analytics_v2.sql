-- ============================================================
-- Migration 081: /admin 분석 v2 — 시계열·KPI·지역 인사이트 RPC + view_logs 오염 방지
--
-- 목적:
--   1) get_admin_timeseries(p_days)      : 일별 시계열 (가입/카드/채집/조회/세션/발행/저장/기록/공유)
--   2) get_admin_kpis()                  : DAU·WAU·MAU(활동/기록), 재방문, 주간 리텐션 코호트, 퍼널
--   3) get_admin_region_insights(p_days) : 시도/시군구/동 단위 카드·기여자 집계 (내부 대시보드용)
--   4) get_admin_overview()              : 기존(056) 필드 전부 유지 + map_views_total/map_views_7d/sessions_7d 추가
--   5) view_logs BEFORE INSERT 가드 트리거: event_type 화이트리스트 + meta/source/session_id 크기 제한
--   6) view_logs(created_at)·(event_type, created_at) 인덱스 (IF NOT EXISTS)
--
-- 적용: 080 이후(신규 081). Supabase SQL Editor 에서 전체 복사 후 실행.
--
-- 적용 전에도 기존 앱 동작에는 영향 없음 — 신규 RPC 가 없으면 /admin 의
-- 신규 섹션만 에러 카드로 표시되고 나머지 화면·앱 기능은 그대로 동작한다.
--
-- ★ 캐비앳: 계측 복원(2026-07-19) 이전 기간의 map_view / collect / session 계열
--   지표는 클라이언트 로깅 누락으로 과소집계다. 시계열·KPI 를 읽을 때
--   2026-07-19 이전 구간은 절대값이 아닌 참고치로만 해석할 것.
--
-- 권한: 모든 RPC 는 platform_admin 전용(SECURITY DEFINER + is_platform_admin 가드).
-- 방어: map_saves 테이블·view_logs.session_id/event_type/meta 등이 없는 환경에서도
--   함수 전체가 죽지 않도록 해당 지표만 0/NULL 처리 (063 스타일 BEGIN...EXCEPTION).
-- ============================================================

-- ------------------------------------------------------------
-- 0. 인덱스 (기존 이름 확인: loca_v1_schema 의 idx_view_logs_created_at,
--    002 의 idx_view_logs_event_type / idx_view_logs_session_id 와 충돌 없음.
--    단, 013_scale_guardrails 의 idx_view_logs_event_created_at(event_type, created_at DESC)
--    는 기능 동등 — 존재하는 라이브 DB 에서는 중복 생성을 건너뛴다.)
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_view_logs_created_at
  ON public.view_logs(created_at);
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'view_logs'
      AND indexname = 'idx_view_logs_event_created_at'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_view_logs_event_type_created_at
      ON public.view_logs(event_type, created_at);
  END IF;
END $$;

-- ------------------------------------------------------------
-- 1. get_admin_timeseries(p_days) — 일별 시계열
--    날짜 경계: (created_at AT TIME ZONE 'Asia/Seoul')::date — 한국 달력 날짜 기준.
--    generate_series 로 모든 날짜 포함(활동 0인 날도 0), 오래된 날짜 → 최신 순.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_admin_timeseries(p_days int DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_days int;
  v_today date;
  v_start_date date;
  v_start_ts timestamptz;
  v_new_users jsonb := '{}'::jsonb;  -- { 'YYYY-MM-DD': count }
  v_new_cards jsonb := '{}'::jsonb;
  v_memos jsonb := '{}'::jsonb;
  v_vl jsonb := '{}'::jsonb;         -- { 'YYYY-MM-DD': {collects, map_views, publishes, shares} }
  v_sessions jsonb := '{}'::jsonb;
  v_active jsonb := '{}'::jsonb;
  v_saves jsonb := '{}'::jsonb;
  v_series jsonb := '[]'::jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'admin_required' USING ERRCODE = '42501';
  END IF;

  v_days := LEAST(GREATEST(COALESCE(p_days, 30), 7), 180);
  v_today := (now() AT TIME ZONE 'Asia/Seoul')::date;
  v_start_date := v_today - (v_days - 1);
  -- 스캔 최소화: 시작일의 KST 자정을 timestamptz 로 환산해 기간 필터를 먼저 적용
  v_start_ts := v_start_date::timestamp AT TIME ZONE 'Asia/Seoul';

  -- 신규 가입 (profiles.created_at)
  SELECT coalesce(jsonb_object_agg(s.k, s.cnt), '{}'::jsonb) INTO v_new_users
  FROM (
    SELECT to_char((created_at AT TIME ZONE 'Asia/Seoul')::date, 'YYYY-MM-DD') AS k, count(*) AS cnt
    FROM public.profiles
    WHERE created_at >= v_start_ts
    GROUP BY 1
  ) s;

  -- 신규 카드 (map_features.created_at)
  SELECT coalesce(jsonb_object_agg(s.k, s.cnt), '{}'::jsonb) INTO v_new_cards
  FROM (
    SELECT to_char((created_at AT TIME ZONE 'Asia/Seoul')::date, 'YYYY-MM-DD') AS k, count(*) AS cnt
    FROM public.map_features
    WHERE created_at >= v_start_ts
    GROUP BY 1
  ) s;

  -- 기록 (feature_memos.created_at)
  SELECT coalesce(jsonb_object_agg(s.k, s.cnt), '{}'::jsonb) INTO v_memos
  FROM (
    SELECT to_char((created_at AT TIME ZONE 'Asia/Seoul')::date, 'YYYY-MM-DD') AS k, count(*) AS cnt
    FROM public.feature_memos
    WHERE created_at >= v_start_ts
    GROUP BY 1
  ) s;

  -- view_logs 이벤트형 지표 (collect / map_view / map_publish / share) — event_type 없으면 전부 0
  BEGIN
    SELECT coalesce(jsonb_object_agg(s.k, s.v), '{}'::jsonb) INTO v_vl
    FROM (
      SELECT to_char((created_at AT TIME ZONE 'Asia/Seoul')::date, 'YYYY-MM-DD') AS k,
             jsonb_build_object(
               'collects',  count(*) FILTER (WHERE event_type = 'collect'),
               'map_views', count(*) FILTER (WHERE event_type = 'map_view'),
               'publishes', count(*) FILTER (WHERE event_type = 'map_publish'),
               'shares',    count(*) FILTER (WHERE event_type IN ('share_click', 'place_card_share'))
             ) AS v
      FROM public.view_logs
      WHERE created_at >= v_start_ts
      GROUP BY 1
    ) s;
  EXCEPTION WHEN undefined_column OR undefined_table THEN
    v_vl := '{}'::jsonb;
  END;

  -- 일별 세션 수 (DISTINCT session_id) — session_id 없으면 0
  BEGIN
    SELECT coalesce(jsonb_object_agg(s.k, s.cnt), '{}'::jsonb) INTO v_sessions
    FROM (
      SELECT to_char((created_at AT TIME ZONE 'Asia/Seoul')::date, 'YYYY-MM-DD') AS k,
             count(DISTINCT session_id) AS cnt
      FROM public.view_logs
      WHERE created_at >= v_start_ts AND session_id IS NOT NULL
      GROUP BY 1
    ) s;
  EXCEPTION WHEN undefined_column THEN
    v_sessions := '{}'::jsonb;
  END;

  -- 일별 활동 로그인 사용자 (DISTINCT viewer_id)
  SELECT coalesce(jsonb_object_agg(s.k, s.cnt), '{}'::jsonb) INTO v_active
  FROM (
    SELECT to_char((created_at AT TIME ZONE 'Asia/Seoul')::date, 'YYYY-MM-DD') AS k,
           count(DISTINCT viewer_id) AS cnt
    FROM public.view_logs
    WHERE created_at >= v_start_ts AND viewer_id IS NOT NULL
    GROUP BY 1
  ) s;

  -- 지도 저장 (map_saves.created_at) — 테이블 없으면 0
  BEGIN
    SELECT coalesce(jsonb_object_agg(s.k, s.cnt), '{}'::jsonb) INTO v_saves
    FROM (
      SELECT to_char((created_at AT TIME ZONE 'Asia/Seoul')::date, 'YYYY-MM-DD') AS k, count(*) AS cnt
      FROM public.map_saves
      WHERE created_at >= v_start_ts
      GROUP BY 1
    ) s;
  EXCEPTION WHEN undefined_table THEN
    v_saves := '{}'::jsonb;
  END;

  -- 전체 날짜 프레임에 병합 (활동 없는 날 = 0), 오래된 날짜 → 최신 순
  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'd',            dd.k,
      'new_users',    coalesce((v_new_users ->> dd.k)::bigint, 0),
      'new_cards',    coalesce((v_new_cards ->> dd.k)::bigint, 0),
      'collects',     coalesce((v_vl -> dd.k ->> 'collects')::bigint, 0),
      'map_views',    coalesce((v_vl -> dd.k ->> 'map_views')::bigint, 0),
      'sessions',     coalesce((v_sessions ->> dd.k)::bigint, 0),
      'active_users', coalesce((v_active ->> dd.k)::bigint, 0),
      'publishes',    coalesce((v_vl -> dd.k ->> 'publishes')::bigint, 0),
      'saves',        coalesce((v_saves ->> dd.k)::bigint, 0),
      'memos',        coalesce((v_memos ->> dd.k)::bigint, 0),
      'shares',       coalesce((v_vl -> dd.k ->> 'shares')::bigint, 0)
    ) ORDER BY dd.k), '[]'::jsonb)
  INTO v_series
  FROM (
    SELECT to_char(v_start_date + g.i, 'YYYY-MM-DD') AS k
    FROM generate_series(0, v_days - 1) AS g(i)
  ) dd;

  RETURN jsonb_build_object(
    'days', v_days,
    'series', v_series,
    'generated_at', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_timeseries(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_timeseries(int) TO authenticated, service_role;

-- ------------------------------------------------------------
-- 2. get_admin_kpis() — 활동/기록 DAU·WAU·MAU + 리텐션 코호트 + 퍼널
--    리텐션 주 경계: date_trunc('week', created_at AT TIME ZONE 'Asia/Seoul') — KST 기준.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_admin_kpis()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_a_dau bigint := 0;
  v_a_wau bigint := 0;
  v_a_mau bigint := 0;
  v_sessions_today bigint := 0;
  v_returning bigint := 0;
  v_c_dau bigint := 0;
  v_c_wau bigint := 0;
  v_c_mau bigint := 0;
  v_cohorts jsonb := '[]'::jsonb;
  v_week_kst timestamp;        -- 이번 주 시작 (KST 월요일 00:00, 벽시계)
  v_cohort_start_ts timestamptz;
  v_today date;
  v_f_signed bigint := 0;
  v_f_collected bigint := 0;
  v_f_built bigint := 0;
  v_f_published bigint := 0;
  v_f_shared bigint := 0;
  v_f30_signed bigint := 0;
  v_f30_collected bigint := 0;
  v_f30_built bigint := 0;
  v_f30_published bigint := 0;
  v_f30_shared bigint := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'admin_required' USING ERRCODE = '42501';
  END IF;

  -- 활동 지표: actor = COALESCE(viewer_id::text, session_id). 최근 30일 1회 스캔.
  -- session_id 없으면 viewer_id 만으로 폴백.
  BEGIN
    SELECT
      count(DISTINCT COALESCE(viewer_id::text, session_id)) FILTER (WHERE created_at >= now() - interval '1 day'),
      count(DISTINCT COALESCE(viewer_id::text, session_id)) FILTER (WHERE created_at >= now() - interval '7 days'),
      count(DISTINCT COALESCE(viewer_id::text, session_id)),
      count(DISTINCT session_id) FILTER (WHERE created_at >= now() - interval '1 day')
    INTO v_a_dau, v_a_wau, v_a_mau, v_sessions_today
    FROM public.view_logs
    WHERE created_at >= now() - interval '30 days';
  EXCEPTION WHEN undefined_column THEN
    SELECT
      count(DISTINCT viewer_id) FILTER (WHERE created_at >= now() - interval '1 day'),
      count(DISTINCT viewer_id) FILTER (WHERE created_at >= now() - interval '7 days'),
      count(DISTINCT viewer_id)
    INTO v_a_dau, v_a_wau, v_a_mau
    FROM public.view_logs
    WHERE created_at >= now() - interval '30 days';
    v_sessions_today := 0;
  END;

  -- 재방문(30일): meta->>'visitor_id' 가 서로 다른 KST 날짜 2일 이상 등장 — meta 없으면 0
  BEGIN
    SELECT count(*) INTO v_returning
    FROM (
      SELECT meta ->> 'visitor_id' AS vid
      FROM public.view_logs
      WHERE created_at >= now() - interval '30 days'
        AND COALESCE(meta ->> 'visitor_id', '') <> ''
      GROUP BY 1
      HAVING count(DISTINCT (created_at AT TIME ZONE 'Asia/Seoul')::date) >= 2
    ) s;
  EXCEPTION WHEN undefined_column THEN
    v_returning := 0;
  END;

  -- 기록 지표: map_features.created_by ∪ feature_memos.user_id 의 DISTINCT 사용자
  SELECT
    count(DISTINCT u.uid) FILTER (WHERE u.ts >= now() - interval '1 day'),
    count(DISTINCT u.uid) FILTER (WHERE u.ts >= now() - interval '7 days'),
    count(DISTINCT u.uid)
  INTO v_c_dau, v_c_wau, v_c_mau
  FROM (
    SELECT created_by AS uid, created_at AS ts FROM public.map_features
      WHERE created_by IS NOT NULL AND created_at >= now() - interval '30 days'
    UNION ALL
    SELECT user_id, created_at FROM public.feature_memos
      WHERE created_at >= now() - interval '30 days'
  ) u;

  -- 주간 리텐션 코호트: 최근 8개 가입 주(KST date_trunc('week')).
  -- 활동 = view_logs(viewer_id) ∪ map_features(created_by) ∪ feature_memos(user_id)
  -- wN = 가입 주 시작 + N주 ~ N+1주 구간에 활동한 코호트 유저 수.
  -- 아직 도래하지 않은 주차(cohort_week + N주 > now())는 null.
  v_week_kst := date_trunc('week', now() AT TIME ZONE 'Asia/Seoul');
  v_cohort_start_ts := (v_week_kst - interval '7 weeks') AT TIME ZONE 'Asia/Seoul';
  v_today := (now() AT TIME ZONE 'Asia/Seoul')::date;

  WITH weeks AS (
    SELECT ((v_week_kst - make_interval(weeks => g.i))::date) AS cw
    FROM generate_series(0, 7) AS g(i)
  ),
  coh AS (
    SELECT p.id, date_trunc('week', (p.created_at AT TIME ZONE 'Asia/Seoul'))::date AS cw
    FROM public.profiles p
    WHERE p.created_at >= v_cohort_start_ts
  ),
  su AS (
    SELECT cw, count(*) AS signups FROM coh GROUP BY cw
  ),
  acts AS (
    SELECT a.uid, (a.ts AT TIME ZONE 'Asia/Seoul')::date AS ad
    FROM (
      SELECT viewer_id AS uid, created_at AS ts FROM public.view_logs
        WHERE viewer_id IS NOT NULL AND created_at >= v_cohort_start_ts
      UNION ALL
      SELECT created_by, created_at FROM public.map_features
        WHERE created_by IS NOT NULL AND created_at >= v_cohort_start_ts
      UNION ALL
      SELECT user_id, created_at FROM public.feature_memos
        WHERE created_at >= v_cohort_start_ts
    ) a
  ),
  wk AS (
    SELECT c.cw, ((act.ad - c.cw) / 7) AS wn, c.id AS uid
    FROM coh c
    JOIN acts act ON act.uid = c.id
    WHERE act.ad >= c.cw AND (act.ad - c.cw) < 35
  ),
  agg AS (
    SELECT cw,
      count(DISTINCT uid) FILTER (WHERE wn = 0) AS w0,
      count(DISTINCT uid) FILTER (WHERE wn = 1) AS w1,
      count(DISTINCT uid) FILTER (WHERE wn = 2) AS w2,
      count(DISTINCT uid) FILTER (WHERE wn = 3) AS w3,
      count(DISTINCT uid) FILTER (WHERE wn = 4) AS w4
    FROM wk GROUP BY cw
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'cohort_week', to_char(w.cw, 'YYYY-MM-DD'),
      'signups', coalesce(su.signups, 0),
      'w0', CASE WHEN w.cw      <= v_today THEN coalesce(agg.w0, 0) END,
      'w1', CASE WHEN w.cw + 7  <= v_today THEN coalesce(agg.w1, 0) END,
      'w2', CASE WHEN w.cw + 14 <= v_today THEN coalesce(agg.w2, 0) END,
      'w3', CASE WHEN w.cw + 21 <= v_today THEN coalesce(agg.w3, 0) END,
      'w4', CASE WHEN w.cw + 28 <= v_today THEN coalesce(agg.w4, 0) END
    ) ORDER BY w.cw), '[]'::jsonb)
  INTO v_cohorts
  FROM weeks w
  LEFT JOIN su  ON su.cw  = w.cw
  LEFT JOIN agg ON agg.cw = w.cw;

  -- 퍼널 (전체, 유저 수 기준)
  SELECT count(*) INTO v_f_signed FROM public.profiles;
  SELECT count(DISTINCT created_by) INTO v_f_collected
    FROM public.map_features WHERE created_by IS NOT NULL;
  SELECT count(DISTINCT user_id) INTO v_f_built FROM public.maps;
  SELECT count(DISTINCT user_id) INTO v_f_published FROM public.maps WHERE is_published;
  BEGIN
    SELECT count(DISTINCT viewer_id) INTO v_f_shared
    FROM public.view_logs
    WHERE event_type IN ('share_click', 'place_card_share') AND viewer_id IS NOT NULL;
  EXCEPTION WHEN undefined_column THEN
    v_f_shared := 0;
  END;

  -- 퍼널 (최근 30일 가입자 코호트로 모든 단계 분자·분모 한정)
  SELECT count(*) INTO v_f30_signed
    FROM public.profiles WHERE created_at >= now() - interval '30 days';
  SELECT count(DISTINCT f.created_by) INTO v_f30_collected
    FROM public.map_features f
    JOIN public.profiles p ON p.id = f.created_by
    WHERE p.created_at >= now() - interval '30 days';
  SELECT count(DISTINCT m.user_id) INTO v_f30_built
    FROM public.maps m
    JOIN public.profiles p ON p.id = m.user_id
    WHERE p.created_at >= now() - interval '30 days';
  SELECT count(DISTINCT m.user_id) INTO v_f30_published
    FROM public.maps m
    JOIN public.profiles p ON p.id = m.user_id
    WHERE m.is_published AND p.created_at >= now() - interval '30 days';
  BEGIN
    SELECT count(DISTINCT l.viewer_id) INTO v_f30_shared
    FROM public.view_logs l
    JOIN public.profiles p ON p.id = l.viewer_id
    WHERE l.event_type IN ('share_click', 'place_card_share')
      AND p.created_at >= now() - interval '30 days';
  EXCEPTION WHEN undefined_column THEN
    v_f30_shared := 0;
  END;

  RETURN jsonb_build_object(
    'activity', jsonb_build_object(
      'dau', v_a_dau,
      'wau', v_a_wau,
      'mau', v_a_mau,
      'sessions_today', v_sessions_today,
      'returning_visitors_30d', v_returning
    ),
    'content', jsonb_build_object(
      'dau', v_c_dau,
      'wau', v_c_wau,
      'mau', v_c_mau
    ),
    'retention', jsonb_build_object('cohorts', v_cohorts),
    'funnel', jsonb_build_object(
      'signed_up', v_f_signed,
      'collected', v_f_collected,
      'built_map', v_f_built,
      'published', v_f_published,
      'shared', v_f_shared
    ),
    'funnel_30d', jsonb_build_object(
      'signed_up', v_f30_signed,
      'collected', v_f30_collected,
      'built_map', v_f30_built,
      'published', v_f30_published,
      'shared', v_f30_shared
    ),
    'generated_at', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_kpis() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_kpis() TO authenticated, service_role;

-- ------------------------------------------------------------
-- 3. get_admin_region_insights(p_days) — 지역 단위 카드·기여자 집계
--    대상: region_name(054) 이 비어있지 않은 map_features.
--    서버는 억제하지 않고 contributors 원값을 반환한다 — 내부 대시보드용.
--    외부 제출 시 k-익명(k_threshold) 필터는 클라이언트(AdminScreen)가 담당.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_admin_region_insights(p_days int DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_days int;
  v_sido jsonb := '[]'::jsonb;
  v_sigungu jsonb := '[]'::jsonb;
  v_dong jsonb := '[]'::jsonb;
  v_untagged bigint := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'admin_required' USING ERRCODE = '42501';
  END IF;

  v_days := LEAST(GREATEST(COALESCE(p_days, 30), 7), 180);

  -- region_name 컬럼(054)이 없는 환경에서는 빈 결과로 폴백
  BEGIN
    -- 시도: split_part 1번째 파트, cards DESC 전체
    SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.cards DESC, r.region), '[]'::jsonb)
    INTO v_sido
    FROM (
      SELECT split_part(btrim(region_name), ' ', 1) AS region,
             count(*) AS cards,
             count(DISTINCT created_by) AS contributors,
             count(*) FILTER (WHERE tags @> ARRAY['새발견']) AS new_finds,
             count(*) FILTER (WHERE created_at >= now() - make_interval(days => v_days)) AS cards_recent
      FROM public.map_features
      WHERE region_name IS NOT NULL AND btrim(region_name) <> ''
      GROUP BY 1
    ) r;

    -- 시군구: 법정동코드 앞 5자리(시군구 코드) 기준 그룹핑, cards DESC TOP 30.
    --   첫 2토큰 방식은 일반구 도시('성남시 분당구' 등 2depth 내부 공백 복합명)에서
    --   구 단위가 유실되므로, region_code(법정동 10자리)가 있으면 left 5자리로 묶고
    --   없으면 region_name 의 마지막 토큰(동/읍/면)만 제거한 키로 폴백한다.
    --   표시명은 max(마지막 토큰 제거) — 동 누락 행('경기도 성남시 분당구')과 정상 행이
    --   섞여도 더 긴(구 단위까지 있는) 이름이 선택된다.
    SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.cards DESC, r.region), '[]'::jsonb)
    INTO v_sigungu
    FROM (
      SELECT max(regexp_replace(b.rn, '\s+\S+$', '')) AS region,
             count(*) AS cards,
             count(DISTINCT b.created_by) AS contributors,
             count(*) FILTER (WHERE b.tags @> ARRAY['새발견']) AS new_finds,
             count(*) FILTER (WHERE b.created_at >= now() - make_interval(days => v_days)) AS cards_recent
      FROM (
        SELECT btrim(region_name) AS rn, region_code, created_by, tags, created_at
        FROM public.map_features
        WHERE region_name IS NOT NULL AND btrim(region_name) <> ''
      ) b
      WHERE split_part(b.rn, ' ', 2) <> ''
      GROUP BY COALESCE(left(nullif(btrim(b.region_code), ''), 5), regexp_replace(b.rn, '\s+\S+$', ''))
      ORDER BY cards DESC
      LIMIT 30
    ) r;

    -- 동(법정동): region_name 그대로, cards DESC TOP 30
    SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.cards DESC, r.region), '[]'::jsonb)
    INTO v_dong
    FROM (
      SELECT btrim(region_name) AS region,
             count(*) AS cards,
             count(DISTINCT created_by) AS contributors,
             count(*) FILTER (WHERE tags @> ARRAY['새발견']) AS new_finds,
             count(*) FILTER (WHERE created_at >= now() - make_interval(days => v_days)) AS cards_recent
      FROM public.map_features
      WHERE region_name IS NOT NULL AND btrim(region_name) <> ''
      GROUP BY 1
      ORDER BY cards DESC
      LIMIT 30
    ) r;

    -- 좌표는 있는데 region_name 이 비어있는 카드 (역지오코딩 백필 대상)
    SELECT count(*) INTO v_untagged
    FROM public.map_features
    WHERE lat IS NOT NULL AND lng IS NOT NULL AND (lat <> 0 OR lng <> 0)
      AND (region_name IS NULL OR btrim(region_name) = '');
  EXCEPTION WHEN undefined_column THEN
    v_sido := '[]'::jsonb;
    v_sigungu := '[]'::jsonb;
    v_dong := '[]'::jsonb;
    v_untagged := 0;
  END;

  RETURN jsonb_build_object(
    'days', v_days,
    'k_threshold', 5,
    'sido', v_sido,
    'sigungu', v_sigungu,
    'dong', v_dong,
    'untagged_cards', v_untagged,
    'generated_at', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_region_insights(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_region_insights(int) TO authenticated, service_role;

-- ------------------------------------------------------------
-- 4. get_admin_overview() — 056 필드 전부 유지 + 3개 필드 추가
--    추가: map_views_total / map_views_7d (event_type='map_view'), sessions_7d
-- ------------------------------------------------------------
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
  v_map_views_total bigint := NULL;
  v_map_views_7d bigint := NULL;
  v_sessions_7d bigint := NULL;
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

  -- (081 추가) 지도 조회 이벤트 — event_type 없으면 NULL
  BEGIN
    SELECT count(*),
           count(*) FILTER (WHERE created_at >= now() - interval '7 days')
    INTO v_map_views_total, v_map_views_7d
    FROM public.view_logs
    WHERE event_type = 'map_view';
  EXCEPTION WHEN undefined_column THEN
    v_map_views_total := NULL;
    v_map_views_7d := NULL;
  END;

  -- (081 추가) 최근 7일 세션 수 — session_id 없으면 NULL
  BEGIN
    SELECT count(DISTINCT session_id) INTO v_sessions_7d
    FROM public.view_logs
    WHERE created_at >= now() - interval '7 days' AND session_id IS NOT NULL;
  EXCEPTION WHEN undefined_column THEN
    v_sessions_7d := NULL;
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
    'map_views_total', v_map_views_total,
    'map_views_7d',    v_map_views_7d,
    'sessions_7d',     v_sessions_7d,
    'generated_at',    now()
  ) INTO v;

  RETURN v;
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_overview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_overview() TO authenticated, service_role;

-- ------------------------------------------------------------
-- 5. view_logs 오염 방지 트리거 (BEFORE INSERT)
--    화이트리스트 밖 event_type 은 조용히 폐기(RETURN NULL — 클라이언트 에러 없음).
--    meta 4096바이트 초과 → '{}', source/session_id 는 길이 절단.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.view_logs_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- ★ 신규 이벤트 타입 추가 시 이 화이트리스트와 src/lib/analytics.js EVENT_TYPES 를 함께 갱신할 것
  IF NEW.event_type IS NULL
     OR length(NEW.event_type) > 40
     OR NEW.event_type NOT IN (
       'map_view',
       'qr_scan',
       'session_start',
       'session_end',
       'collect',
       'walk_start',
       'explore_detail_view',
       'feature_create',
       'feature_click',
       'feature_view',
       'feature_view_end',
       'share_click',
       'place_card_share',
       'map_save',
       'map_like',
       'map_publish',
       'map_unpublish',
       'map_import',
       'map_add_to_profile',
       'map_remove_from_profile',
       'map_set_public',
       'map_set_unlisted',
       'follow_toggle',
       'feedback_submitted'
     )
  THEN
    RETURN NULL;  -- 조용히 폐기
  END IF;

  IF pg_column_size(NEW.meta) > 4096 THEN
    NEW.meta := '{}'::jsonb;
  END IF;

  NEW.source := left(NEW.source, 40);
  NEW.session_id := left(NEW.session_id, 64);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_view_logs_guard ON public.view_logs;
CREATE TRIGGER trg_view_logs_guard
BEFORE INSERT ON public.view_logs
FOR EACH ROW EXECUTE FUNCTION public.view_logs_guard();

NOTIFY pgrst, 'reload schema';
