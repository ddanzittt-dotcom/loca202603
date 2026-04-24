-- ============================================================
-- Migration 026:
-- Transactional feature change request resolution
-- ============================================================

CREATE OR REPLACE FUNCTION public.resolve_feature_change_request_tx(
  p_request_id uuid,
  p_decision text,
  p_review_note text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_now timestamptz := now();
  v_request public.feature_change_requests%rowtype;
  v_next_status text;
  v_payload jsonb := '{}'::jsonb;
  v_action text;
  v_applied_feature_id uuid;
  v_operator_note text;

  v_type text;
  v_title text;
  v_emoji text;
  v_note text;
  v_highlight boolean;
  v_sort_order integer;
  v_lat double precision;
  v_lng double precision;
  v_points jsonb;
  v_created_by uuid;
  v_created_by_name text;
  v_tags text[];

  v_feature public.map_features%rowtype;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'auth_required');
  END IF;

  IF p_request_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'request_id_required');
  END IF;

  IF p_decision NOT IN ('approved', 'rejected') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_decision');
  END IF;

  SELECT *
  INTO v_request
  FROM public.feature_change_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'request_not_found');
  END IF;

  IF v_request.status <> 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'request_not_pending');
  END IF;

  IF NOT (
    public.is_map_owner(v_request.map_id)
    OR public.is_map_collaborator(v_request.map_id, 'operator')
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'forbidden');
  END IF;

  v_payload := COALESCE(v_request.payload, '{}'::jsonb);
  v_action := COALESCE(v_request.action, '');
  v_next_status := CASE WHEN p_decision = 'approved' THEN 'approved' ELSE 'rejected' END;
  v_applied_feature_id := v_request.feature_id;

  IF p_decision = 'approved' THEN
    IF v_action = 'insert' THEN
      v_type := COALESCE(NULLIF(v_payload->>'type', ''), 'pin');
      v_title := COALESCE(NULLIF(BTRIM(v_payload->>'title'), ''), '새 항목');
      v_emoji := NULLIF(v_payload->>'emoji', '');
      IF v_emoji IS NULL THEN
        v_emoji := CASE
          WHEN v_type = 'route' THEN '🛣️'
          WHEN v_type = 'area' THEN '🟩'
          ELSE '📍'
        END;
      END IF;
      v_note := COALESCE(v_payload->>'note', '');
      v_highlight := CASE
        WHEN LOWER(COALESCE(v_payload->>'highlight', '')) IN ('true', 't', '1', 'yes', 'y') THEN true
        ELSE false
      END;
      v_sort_order := COALESCE(NULLIF(v_payload->>'sortOrder', '')::integer, 0);
      v_created_by := COALESCE(NULLIF(v_payload->>'createdBy', '')::uuid, v_request.requested_by);
      v_created_by_name := NULLIF(v_payload->>'createdByName', '');

      v_tags := ARRAY[]::text[];
      IF jsonb_typeof(v_payload->'tags') = 'array' THEN
        SELECT COALESCE(array_agg(value), ARRAY[]::text[])
        INTO v_tags
        FROM jsonb_array_elements_text(v_payload->'tags') AS value;
      END IF;

      IF v_type = 'pin' THEN
        v_lat := NULLIF(v_payload->>'lat', '')::double precision;
        v_lng := NULLIF(v_payload->>'lng', '')::double precision;
        v_points := NULL;
      ELSE
        v_lat := NULL;
        v_lng := NULL;
        v_points := CASE
          WHEN jsonb_typeof(v_payload->'points') = 'array' THEN v_payload->'points'
          ELSE '[]'::jsonb
        END;
      END IF;

      INSERT INTO public.map_features (
        map_id,
        type,
        title,
        emoji,
        tags,
        note,
        highlight,
        lat,
        lng,
        points,
        sort_order,
        created_by,
        created_by_name,
        updated_at
      )
      VALUES (
        v_request.map_id,
        v_type,
        v_title,
        v_emoji,
        v_tags,
        v_note,
        v_highlight,
        v_lat,
        v_lng,
        v_points,
        v_sort_order,
        v_created_by,
        v_created_by_name,
        v_now
      )
      RETURNING id INTO v_applied_feature_id;

    ELSIF v_action = 'update' THEN
      IF v_request.feature_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'feature_id_required_for_update');
      END IF;

      SELECT *
      INTO v_feature
      FROM public.map_features
      WHERE id = v_request.feature_id
        AND map_id = v_request.map_id
      FOR UPDATE;

      IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'feature_not_found');
      END IF;

      v_type := COALESCE(NULLIF(v_payload->>'type', ''), v_feature.type, 'pin');
      v_title := COALESCE(NULLIF(BTRIM(v_payload->>'title'), ''), v_feature.title, '새 항목');
      v_emoji := COALESCE(NULLIF(v_payload->>'emoji', ''), v_feature.emoji);
      v_note := COALESCE(v_payload->>'note', v_feature.note, '');
      v_highlight := CASE
        WHEN v_payload ? 'highlight' THEN
          CASE
            WHEN LOWER(COALESCE(v_payload->>'highlight', '')) IN ('true', 't', '1', 'yes', 'y') THEN true
            ELSE false
          END
        ELSE COALESCE(v_feature.highlight, false)
      END;
      v_sort_order := CASE
        WHEN v_payload ? 'sortOrder' THEN COALESCE(NULLIF(v_payload->>'sortOrder', '')::integer, v_feature.sort_order)
        ELSE v_feature.sort_order
      END;
      v_created_by := CASE
        WHEN v_payload ? 'createdBy' THEN NULLIF(v_payload->>'createdBy', '')::uuid
        ELSE v_feature.created_by
      END;
      v_created_by_name := CASE
        WHEN v_payload ? 'createdByName' THEN NULLIF(v_payload->>'createdByName', '')
        ELSE v_feature.created_by_name
      END;

      v_tags := COALESCE(v_feature.tags, ARRAY[]::text[]);
      IF v_payload ? 'tags' THEN
        IF jsonb_typeof(v_payload->'tags') = 'array' THEN
          SELECT COALESCE(array_agg(value), ARRAY[]::text[])
          INTO v_tags
          FROM jsonb_array_elements_text(v_payload->'tags') AS value;
        ELSE
          v_tags := ARRAY[]::text[];
        END IF;
      END IF;

      IF v_type = 'pin' THEN
        v_lat := CASE
          WHEN v_payload ? 'lat' THEN NULLIF(v_payload->>'lat', '')::double precision
          ELSE v_feature.lat
        END;
        v_lng := CASE
          WHEN v_payload ? 'lng' THEN NULLIF(v_payload->>'lng', '')::double precision
          ELSE v_feature.lng
        END;
        v_points := NULL;
      ELSE
        v_lat := NULL;
        v_lng := NULL;
        v_points := CASE
          WHEN v_payload ? 'points' THEN
            CASE
              WHEN jsonb_typeof(v_payload->'points') = 'array' THEN v_payload->'points'
              ELSE '[]'::jsonb
            END
          ELSE COALESCE(v_feature.points, '[]'::jsonb)
        END;
      END IF;

      UPDATE public.map_features
      SET
        type = v_type,
        title = v_title,
        emoji = v_emoji,
        tags = v_tags,
        note = v_note,
        highlight = v_highlight,
        lat = v_lat,
        lng = v_lng,
        points = v_points,
        sort_order = COALESCE(v_sort_order, 0),
        created_by = v_created_by,
        created_by_name = v_created_by_name,
        updated_at = v_now
      WHERE id = v_feature.id
      RETURNING id INTO v_applied_feature_id;

    ELSIF v_action = 'delete' THEN
      IF v_request.feature_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'feature_id_required_for_delete');
      END IF;

      DELETE FROM public.map_features
      WHERE id = v_request.feature_id
        AND map_id = v_request.map_id
      RETURNING id INTO v_applied_feature_id;

      IF v_applied_feature_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'feature_not_found');
      END IF;
    ELSE
      RETURN jsonb_build_object('success', false, 'error', 'unsupported_action');
    END IF;
  END IF;

  IF p_decision = 'approved'
     AND (v_action = 'insert' OR v_action = 'update')
     AND (v_payload ? 'operatorNote')
     AND v_applied_feature_id IS NOT NULL THEN
    v_operator_note := LEFT(COALESCE(v_payload->>'operatorNote', ''), 4000);
    BEGIN
      PERFORM public.upsert_feature_operator_note(v_applied_feature_id, v_operator_note);
    EXCEPTION
      WHEN undefined_function THEN
        INSERT INTO public.feature_operator_notes (feature_id, map_id, note, updated_by)
        VALUES (v_applied_feature_id, v_request.map_id, v_operator_note, v_user_id)
        ON CONFLICT (feature_id) DO UPDATE
        SET
          map_id = EXCLUDED.map_id,
          note = EXCLUDED.note,
          updated_by = EXCLUDED.updated_by,
          updated_at = now();
    END;
  END IF;

  UPDATE public.feature_change_requests
  SET
    status = v_next_status,
    reviewed_by = v_user_id,
    review_note = LEFT(COALESCE(p_review_note, ''), 2000),
    reviewed_at = v_now,
    feature_id = COALESCE(v_applied_feature_id, feature_id),
    updated_at = v_now
  WHERE id = v_request.id;

  RETURN jsonb_build_object(
    'success', true,
    'id', v_request.id,
    'status', v_next_status,
    'reviewed_at', v_now,
    'review_note', LEFT(COALESCE(p_review_note, ''), 2000),
    'feature_id', COALESCE(v_applied_feature_id, v_request.feature_id)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_feature_change_request_tx(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_feature_change_request_tx(uuid, text, text) TO service_role;

NOTIFY pgrst, 'reload schema';
