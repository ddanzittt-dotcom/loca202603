-- ============================================================
-- Migration 063: get_admin_insights 하드닝 + 재적용
--
-- 배경: 057(get_admin_insights)이 라이브 DB 에 누락돼 /admin 인사이트 섹션이
--   "요청을 처리하지 못했어요(057 확인)" 로 실패했다(056 overview 만 적용된 상태).
--   재적용하면서 feature_media 참조를 예외처리로 감싸 방어적으로 하드닝한다
--   (해당 테이블이 없는 환경에서도 함수 전체가 죽지 않도록).
--
-- 변경점(057 대비): features_with_media / media_total 을 BEGIN...EXCEPTION 으로 감쌈.
-- 나머지 로직은 057 과 동일.
--
-- 적용: 062 이후(신규 063). Supabase SQL Editor 실행(이미 수동 적용됨 — 파일은 기록용).
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
  v_media_feats bigint := NULL;
  v_media_total bigint := NULL;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'admin_required' USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) INTO v_region_top
  FROM (
    SELECT region_name AS region, count(*) AS total,
           count(*) FILTER (WHERE created_at >= now() - interval '7 days') AS d7,
           count(*) FILTER (WHERE '새발견' = ANY(tags)) AS new_finds
    FROM public.map_features
    WHERE region_name IS NOT NULL AND btrim(region_name) <> ''
    GROUP BY region_name ORDER BY total DESC LIMIT 15
  ) r;

  SELECT coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) INTO v_top_tags
  FROM (
    SELECT tag, count(*) AS cnt
    FROM public.map_features, unnest(tags) AS tag
    WHERE btrim(tag) <> '' AND tag <> '새발견'
    GROUP BY tag ORDER BY cnt DESC LIMIT 15
  ) r;

  SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.week_start), '[]'::jsonb) INTO v_weekly
  FROM (
    SELECT w::date AS week_start,
      (SELECT count(*) FROM public.map_features f WHERE f.created_at >= w AND f.created_at < w + interval '7 days') AS features,
      (SELECT count(*) FROM public.feature_memos m WHERE m.created_at >= w AND m.created_at < w + interval '7 days') AS memos,
      (SELECT count(*) FROM public.profiles p WHERE p.created_at >= w AND p.created_at < w + interval '7 days') AS users
    FROM generate_series(date_trunc('week', now()) - interval '7 weeks', date_trunc('week', now()), interval '1 week') AS w
  ) r;

  SELECT coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) INTO v_sources
  FROM (
    SELECT coalesce(nullif(btrim(source), ''), 'direct') AS source, count(*) AS cnt
    FROM public.view_logs GROUP BY 1 ORDER BY cnt DESC LIMIT 8
  ) r;

  BEGIN
    SELECT jsonb_build_object(
      'invites_pending',  count(*) FILTER (WHERE status = 'pending'),
      'invites_accepted', count(*) FILTER (WHERE status = 'accepted'),
      'invites_rejected', count(*) FILTER (WHERE status = 'rejected'),
      'maps_with_collab', count(DISTINCT map_id) FILTER (WHERE status = 'accepted'),
      'collaborating_users', count(DISTINCT user_id) FILTER (WHERE status = 'accepted'),
      'collab_features', (
        SELECT count(*) FROM public.map_features f
        JOIN public.maps m ON m.id = f.map_id
        WHERE f.created_by IS NOT NULL AND f.created_by <> m.user_id)
    ) INTO v_collab FROM public.map_collaborators;
  EXCEPTION WHEN undefined_column OR undefined_table THEN v_collab := NULL; END;

  BEGIN SELECT count(*) INTO v_saves_total FROM public.map_saves;
  EXCEPTION WHEN undefined_table THEN v_saves_total := NULL; END;

  BEGIN
    SELECT count(*) INTO v_memo_photo_cnt FROM public.feature_memos
    WHERE jsonb_typeof(photo_urls) = 'array' AND jsonb_array_length(photo_urls) > 0;
  EXCEPTION WHEN undefined_column THEN v_memo_photo_cnt := NULL; END;

  BEGIN
    SELECT count(DISTINCT feature_id), count(*) INTO v_media_feats, v_media_total FROM public.feature_media;
  EXCEPTION WHEN undefined_table THEN v_media_feats := NULL; v_media_total := NULL; END;

  RETURN jsonb_build_object(
    'region_top', v_region_top, 'top_tags', v_top_tags, 'weekly', v_weekly,
    'sources', v_sources, 'collab', v_collab,
    'new_find_total', (SELECT count(*) FROM public.map_features WHERE '새발견' = ANY(tags)),
    'new_find_7d',    (SELECT count(*) FROM public.map_features WHERE '새발견' = ANY(tags) AND created_at >= now() - interval '7 days'),
    'features_geo_total',   (SELECT count(*) FROM public.map_features WHERE lat IS NOT NULL AND lng IS NOT NULL AND (lat <> 0 OR lng <> 0)),
    'features_region_tagged', (SELECT count(*) FROM public.map_features WHERE region_name IS NOT NULL AND btrim(region_name) <> ''),
    'features_with_media',  v_media_feats,
    'media_total',          v_media_total,
    'memo_photo_count',     v_memo_photo_cnt,
    'repeat_record_features', (SELECT count(*) FROM (SELECT feature_id FROM public.feature_memos GROUP BY feature_id HAVING count(*) >= 2) s),
    'active_creators_7d', (SELECT count(DISTINCT created_by) FROM public.map_features WHERE created_by IS NOT NULL AND created_at >= now() - interval '7 days'),
    'saves_total', v_saves_total,
    'likes_total', (SELECT coalesce(sum(likes_count), 0) FROM public.map_publications),
    'generated_at', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_insights() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_insights() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
