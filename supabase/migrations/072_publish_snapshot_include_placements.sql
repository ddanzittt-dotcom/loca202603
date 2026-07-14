-- ============================================================
-- 072_publish_snapshot_include_placements
-- [P0 #4] 발행 스냅샷이 M:N 배치(map_feature_placements) 카드를 포함하도록.
--
-- 배경:
--   채집-우선(050) 이후 한 카드는 map_feature_placements 로 여러 지도에 배치될 수 있고,
--   카드의 scalar map_id 는 "주(primary) 지도" 하나만 가리킨다. 그런데 발행 스냅샷
--   (017 publish_map_revision)의 features 는
--       WHERE f.map_id = p_map_id
--   스칼라만 봐서, 배치(placement)로만 담긴 카드가 발행 지도 /s/:slug 에서 통째로 누락됐다.
--
-- 방식:
--   features 서브쿼리를 map_feature_placements 와 LEFT JOIN 해서
--     - 직접 소속(f.map_id = p_map_id) 이거나
--     - 배치(mfp.map_id = p_map_id)
--   인 카드를 모두 포함한다. UNIQUE(map_id, feature_id)(050) 라 조인 중복 없음.
--   스냅샷의 map_id 는 발행 지도로 정규화(to_jsonb(f) || {map_id: p_map_id})해 뷰어에서
--   일관되게 발행 지도 소속으로 렌더되게 한다. 정렬은 배치 순서 우선(mfp.sort_order),
--   없으면 카드 자체 sort_order.
--
-- 적용 주의사항:
--   1. 017 이후(신규 072). Supabase SQL Editor(postgres 롤). CREATE OR REPLACE 라 기존 GRANT 유지.
--   2. 이 마이그레이션은 "앞으로의 발행"에만 적용된다 — 이미 발행된 지도는 다시 발행(재발행)해야
--      스냅샷이 갱신된다(스냅샷은 발행 시점 동결이므로).
--   3. 검증: 카드를 지도 A 에서 만들고 지도 B 에 배치(A 에는 안 담김) → B 발행 → /s/:slug(B) 에
--      그 카드가 보이면 정상.
-- ============================================================

CREATE OR REPLACE FUNCTION public.publish_map_revision(
  p_map_id uuid,
  p_slug text DEFAULT NULL,
  p_note text DEFAULT NULL,
  p_visibility text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_map public.maps%ROWTYPE;
  v_now timestamptz := now();
  v_slug text;
  v_revision_no integer;
  v_snapshot jsonb;
  v_revision_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'auth_required');
  END IF;

  SELECT *
  INTO v_map
  FROM public.maps
  WHERE id = p_map_id
    AND user_id = v_user_id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'map_not_found_or_forbidden');
  END IF;

  v_slug := NULLIF(trim(COALESCE(p_slug, '')), '');
  IF v_slug IS NULL THEN
    v_slug := NULLIF(trim(COALESCE(v_map.slug, '')), '');
  END IF;
  IF v_slug IS NULL THEN
    v_slug := 'map-' || substr(replace(p_map_id::text, '-', ''), 1, 8) || '-' || to_char(extract(epoch FROM v_now)::bigint, 'FM999999999999');
  END IF;

  v_slug := lower(regexp_replace(v_slug, '\s+', '-', 'g'));
  v_slug := regexp_replace(v_slug, '[^a-z0-9\-_]+', '', 'g');
  v_slug := regexp_replace(v_slug, '-+', '-', 'g');
  v_slug := trim(both '-' FROM v_slug);
  IF v_slug = '' THEN
    v_slug := 'map-' || substr(replace(p_map_id::text, '-', ''), 1, 8) || '-' || to_char(extract(epoch FROM v_now)::bigint, 'FM999999999999');
  END IF;

  WHILE EXISTS (
    SELECT 1
    FROM public.map_publication_revisions r
    WHERE r.status = 'live'
      AND r.slug = v_slug
      AND r.map_id <> p_map_id
  ) LOOP
    v_slug := v_slug || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);
  END LOOP;

  SELECT COALESCE(MAX(revision_no), 0) + 1
  INTO v_revision_no
  FROM public.map_publication_revisions
  WHERE map_id = p_map_id;

  -- [072] features: 직접 소속(f.map_id) + M:N 배치(map_feature_placements) 카드를 모두 포함.
  --        배치 카드의 map_id 는 발행 지도로 정규화, 정렬은 배치 순서 우선.
  SELECT jsonb_build_object(
    'map', to_jsonb(m),
    'features', COALESCE((
      SELECT jsonb_agg(
               to_jsonb(f) || jsonb_build_object('map_id', p_map_id)
               ORDER BY COALESCE(mfp.sort_order, f.sort_order), f.created_at
             )
      FROM public.map_features f
      LEFT JOIN public.map_feature_placements mfp
        ON mfp.feature_id = f.id
       AND mfp.map_id = p_map_id
      WHERE f.map_id = p_map_id
         OR mfp.map_id = p_map_id
    ), '[]'::jsonb)
  )
  INTO v_snapshot
  FROM public.maps m
  WHERE m.id = p_map_id;

  UPDATE public.map_publication_revisions
  SET status = 'archived'
  WHERE map_id = p_map_id
    AND status = 'live';

  INSERT INTO public.map_publication_revisions (
    map_id,
    revision_no,
    status,
    slug,
    snapshot,
    note,
    created_by,
    published_at,
    created_at
  )
  VALUES (
    p_map_id,
    v_revision_no,
    'live',
    v_slug,
    COALESCE(v_snapshot, '{}'::jsonb),
    NULLIF(trim(COALESCE(p_note, '')), ''),
    v_user_id,
    v_now,
    v_now
  )
  RETURNING id INTO v_revision_id;

  UPDATE public.maps
  SET
    slug = v_slug,
    visibility = CASE
      WHEN p_visibility IN ('public', 'unlisted', 'private') THEN p_visibility
      WHEN visibility = 'private' THEN 'unlisted'
      ELSE visibility
    END,
    is_published = true,
    published_at = v_now,
    updated_at = v_now
  WHERE id = p_map_id;

  INSERT INTO public.map_publications (map_id, published_at)
  VALUES (p_map_id, v_now)
  ON CONFLICT (map_id) DO UPDATE
  SET
    published_at = EXCLUDED.published_at,
    updated_at = v_now;

  RETURN jsonb_build_object(
    'success', true,
    'revision_id', v_revision_id,
    'revision_no', v_revision_no,
    'slug', v_slug,
    'published_at', v_now
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.publish_map_revision(uuid, text, text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
