-- ============================================================
-- Migration 057: 종합 데이터 인사이트 RPC (get_admin_insights)
--
-- 관리화면(/admin)의 "데이터 자산" 섹션용. platform_admin 전용.
-- 056(get_admin_overview)의 기본 카운트에 더해:
--   - 동네 랭킹 (region_name 기준 TOP 15 + 최근 7일)
--   - NEW FIND (태그 '새발견' — CollectSheet 가 저장, 지도에 없던 장소)
--   - 인기 태그 TOP 15
--   - 주간 추이 (최근 8주: 새 카드/기록/가입)
--   - 협업 현황 (map_collaborators: 초대 상태별/수락률/협업 지도/협업 기여 카드)
--   - 품질·건전성 (동네 태깅률/사진/반복 기록/7일 활성 채집자)
--   - 유통 (view_logs 유입 소스 분포, 저장/좋아요)
--
-- 방어적 설계: status 컬럼(044)·map_saves(015)·photo_urls(030) 등이 없는
-- 환경에서도 함수 전체가 죽지 않도록 해당 항목만 NULL 처리.
--
-- 적용: 056 이후(신규 번호 057). Supabase SQL Editor 에서 실행.
-- 검증: 관리자 로그인 → loca.im/admin → "데이터 자산" 섹션 렌더 확인.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_admin_insights()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_region_top jsonb;
  v_top_tags jsonb;
  v_weekly jsonb;
  v_sources jsonb;
  v_collab jsonb := NULL;
  v_saves_total bigint := NULL;
  v_memo_photo_cnt bigint := NULL;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'admin_required' USING ERRCODE = '42501';
  END IF;

  -- 동네 랭킹 TOP 15 (+ 최근 7일 신규)
  SELECT coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) INTO v_region_top
  FROM (
    SELECT region_name AS region,
           count(*) AS total,
           count(*) FILTER (WHERE created_at >= now() - interval '7 days') AS d7,
           count(*) FILTER (WHERE '새발견' = ANY(tags)) AS new_finds
    FROM public.map_features
    WHERE region_name IS NOT NULL AND btrim(region_name) <> ''
    GROUP BY region_name
    ORDER BY total DESC
    LIMIT 15
  ) r;

  -- 인기 태그 TOP 15 ('새발견' 은 별도 집계라 제외)
  SELECT coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) INTO v_top_tags
  FROM (
    SELECT tag, count(*) AS cnt
    FROM public.map_features, unnest(tags) AS tag
    WHERE btrim(tag) <> '' AND tag <> '새발견'
    GROUP BY tag
    ORDER BY cnt DESC
    LIMIT 15
  ) r;

  -- 주간 추이 (최근 8주)
  SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.week_start), '[]'::jsonb) INTO v_weekly
  FROM (
    SELECT w::date AS week_start,
      (SELECT count(*) FROM public.map_features f WHERE f.created_at >= w AND f.created_at < w + interval '7 days') AS features,
      (SELECT count(*) FROM public.feature_memos m WHERE m.created_at >= w AND m.created_at < w + interval '7 days') AS memos,
      (SELECT count(*) FROM public.profiles p WHERE p.created_at >= w AND p.created_at < w + interval '7 days') AS users
    FROM generate_series(
      date_trunc('week', now()) - interval '7 weeks',
      date_trunc('week', now()),
      interval '1 week'
    ) AS w
  ) r;

  -- 유입 소스 분포 (view_logs.source)
  SELECT coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) INTO v_sources
  FROM (
    SELECT coalesce(nullif(btrim(source), ''), 'direct') AS source, count(*) AS cnt
    FROM public.view_logs
    GROUP BY 1
    ORDER BY cnt DESC
    LIMIT 8
  ) r;

  -- 협업 현황 (044 status 컬럼 없으면 NULL)
  BEGIN
    SELECT jsonb_build_object(
      'invites_pending',  count(*) FILTER (WHERE status = 'pending'),
      'invites_accepted', count(*) FILTER (WHERE status = 'accepted'),
      'invites_rejected', count(*) FILTER (WHERE status = 'rejected'),
      'maps_with_collab', count(DISTINCT map_id) FILTER (WHERE status = 'accepted'),
      'collaborating_users', count(DISTINCT user_id) FILTER (WHERE status = 'accepted'),
      'collab_features', (
        SELECT count(*)
        FROM public.map_features f
        JOIN public.maps m ON m.id = f.map_id
        WHERE f.created_by IS NOT NULL AND f.created_by <> m.user_id
      )
    ) INTO v_collab
    FROM public.map_collaborators;
  EXCEPTION WHEN undefined_column OR undefined_table THEN
    v_collab := NULL;
  END;

  -- 지도 저장(map_saves) — 테이블 없으면 NULL
  BEGIN
    SELECT count(*) INTO v_saves_total FROM public.map_saves;
  EXCEPTION WHEN undefined_table THEN
    v_saves_total := NULL;
  END;

  -- 사진 첨부 기록 수 (feature_memos.photo_urls, 030) — 컬럼 없으면 NULL
  BEGIN
    SELECT count(*) INTO v_memo_photo_cnt
    FROM public.feature_memos
    WHERE jsonb_typeof(photo_urls) = 'array' AND jsonb_array_length(photo_urls) > 0;
  EXCEPTION WHEN undefined_column THEN
    v_memo_photo_cnt := NULL;
  END;

  RETURN jsonb_build_object(
    'region_top', v_region_top,
    'top_tags', v_top_tags,
    'weekly', v_weekly,
    'sources', v_sources,
    'collab', v_collab,

    -- NEW FIND (지도에 없던 장소)
    'new_find_total', (SELECT count(*) FROM public.map_features WHERE '새발견' = ANY(tags)),
    'new_find_7d',    (SELECT count(*) FROM public.map_features WHERE '새발견' = ANY(tags) AND created_at >= now() - interval '7 days'),

    -- 품질·건전성
    'features_geo_total',   (SELECT count(*) FROM public.map_features WHERE lat IS NOT NULL AND lng IS NOT NULL AND (lat <> 0 OR lng <> 0)),
    'features_region_tagged', (SELECT count(*) FROM public.map_features WHERE region_name IS NOT NULL AND btrim(region_name) <> ''),
    'features_with_media',  (SELECT count(DISTINCT feature_id) FROM public.feature_media),
    'media_total',          (SELECT count(*) FROM public.feature_media),
    'memo_photo_count',     v_memo_photo_cnt,
    'repeat_record_features', (
      SELECT count(*) FROM (
        SELECT feature_id FROM public.feature_memos GROUP BY feature_id HAVING count(*) >= 2
      ) s
    ),
    'active_creators_7d', (
      SELECT count(DISTINCT created_by) FROM public.map_features
      WHERE created_by IS NOT NULL AND created_at >= now() - interval '7 days'
    ),

    -- 유통·소비
    'saves_total', v_saves_total,
    'likes_total', (SELECT coalesce(sum(likes_count), 0) FROM public.map_publications),

    'generated_at', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_insights() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_insights() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
