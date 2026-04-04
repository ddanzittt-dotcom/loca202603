-- ============================================================
-- Migration 011: 일일 성장 한도 (축당 30점, 매일 리셋)
-- 의존: 010_gamification_v2.sql
-- ============================================================

-- 1) user_stats에 일일 축 컬럼 추가
ALTER TABLE public.user_stats
  ADD COLUMN IF NOT EXISTS daily_creator   INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS daily_explorer  INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS daily_influence INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS daily_trust     INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS daily_reset_date DATE NOT NULL DEFAULT CURRENT_DATE;


-- 2) 일일 리셋 헬퍼
CREATE OR REPLACE FUNCTION public.maybe_reset_daily(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.user_stats SET
    daily_creator = 0,
    daily_explorer = 0,
    daily_influence = 0,
    daily_trust = 0,
    daily_reset_date = CURRENT_DATE
  WHERE user_id = p_user_id AND daily_reset_date < CURRENT_DATE;
END;
$$;


-- 3) record_map_action 교체 (일일 한도 적용)
CREATE OR REPLACE FUNCTION public.record_map_action(
  p_action_type TEXT,
  p_event_key   TEXT,
  p_map_id      UUID DEFAULT NULL,
  p_feature_id  UUID DEFAULT NULL,
  p_payload     JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_xp      INTEGER := 0;
  v_cr      INTEGER := 0;
  v_ex      INTEGER := 0;
  v_in      INTEGER := 0;
  v_tr      INTEGER := 0;
  v_stat_col TEXT := NULL;
  v_daily_cap INTEGER := 30;
  v_cur_daily INTEGER;
  v_actual_cr INTEGER;
  v_actual_ex INTEGER;
  v_actual_in INTEGER;
  v_actual_tr INTEGER;
  v_capped BOOLEAN := false;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'not_authenticated');
  END IF;

  PERFORM public.ensure_user_stats(v_user_id);
  PERFORM public.maybe_reset_daily(v_user_id);

  -- 액션별 XP + 축 배분
  CASE p_action_type
    WHEN 'map_create' THEN
      v_xp := 20; v_cr := 20; v_stat_col := 'maps';
    WHEN 'feature_create_pin' THEN
      v_xp := 5; v_cr := 5; v_stat_col := 'pins';
    WHEN 'feature_create_route' THEN
      v_xp := 10; v_cr := 10; v_stat_col := 'routes';
    WHEN 'feature_create_area' THEN
      v_xp := 10; v_cr := 10; v_stat_col := 'areas';
    WHEN 'feature_enrich' THEN
      v_xp := 3; v_cr := 2; v_tr := 1;
    WHEN 'map_publish' THEN
      v_xp := 30; v_in := 30;
    WHEN 'map_import' THEN
      v_xp := 10; v_ex := 10;
    WHEN 'map_completion_70' THEN
      v_xp := 15; v_cr := 10; v_tr := 5;
    WHEN 'map_completion_90' THEN
      v_xp := 25; v_cr := 15; v_tr := 10;
    WHEN 'survey_submit' THEN
      v_xp := 5; v_tr := 5;
    ELSE
      RETURN jsonb_build_object('error', 'unknown_action', 'action_type', p_action_type);
  END CASE;

  -- 중복 체크
  IF EXISTS (
    SELECT 1 FROM public.gamification_events
    WHERE user_id = v_user_id AND event_key = p_event_key
  ) THEN
    RETURN jsonb_build_object('status', 'already_rewarded');
  END IF;

  -- 일일 한도 적용: 각 축별로 남은 여유분만큼만 부여
  SELECT daily_creator, daily_explorer, daily_influence, daily_trust
  INTO v_cur_daily, v_cur_daily, v_cur_daily, v_cur_daily
  FROM public.user_stats WHERE user_id = v_user_id;

  -- 각 축별 현재 daily 값 개별 조회
  SELECT daily_creator INTO v_cur_daily FROM public.user_stats WHERE user_id = v_user_id;
  v_actual_cr := LEAST(v_cr, GREATEST(0, v_daily_cap - v_cur_daily));

  SELECT daily_explorer INTO v_cur_daily FROM public.user_stats WHERE user_id = v_user_id;
  v_actual_ex := LEAST(v_ex, GREATEST(0, v_daily_cap - v_cur_daily));

  SELECT daily_influence INTO v_cur_daily FROM public.user_stats WHERE user_id = v_user_id;
  v_actual_in := LEAST(v_in, GREATEST(0, v_daily_cap - v_cur_daily));

  SELECT daily_trust INTO v_cur_daily FROM public.user_stats WHERE user_id = v_user_id;
  v_actual_tr := LEAST(v_tr, GREATEST(0, v_daily_cap - v_cur_daily));

  -- 실제 XP = 캡 적용된 축 합산
  v_xp := v_actual_cr + v_actual_ex + v_actual_in + v_actual_tr;
  v_capped := (v_actual_cr < v_cr) OR (v_actual_ex < v_ex) OR (v_actual_in < v_in) OR (v_actual_tr < v_tr);

  -- XP가 0이면 기록은 하되 보상 없음
  INSERT INTO public.gamification_events (
    user_id, action_type, event_key, map_id, feature_id,
    xp_delta, creator_delta, explorer_delta, influence_delta, trust_delta, payload
  ) VALUES (
    v_user_id, p_action_type, p_event_key, p_map_id, p_feature_id,
    v_xp, v_actual_cr, v_actual_ex, v_actual_in, v_actual_tr, p_payload
  );

  -- user_stats 업데이트
  UPDATE public.user_stats SET
    xp           = xp + v_xp,
    creator_xp   = creator_xp + v_actual_cr,
    explorer_xp  = explorer_xp + v_actual_ex,
    influence_xp = influence_xp + v_actual_in,
    trust_xp     = trust_xp + v_actual_tr,
    daily_creator   = daily_creator + v_actual_cr,
    daily_explorer  = daily_explorer + v_actual_ex,
    daily_influence = daily_influence + v_actual_in,
    daily_trust     = daily_trust + v_actual_tr,
    updated_at   = now(),
    last_rewarded_at = now()
  WHERE user_id = v_user_id;

  -- 카운터 컬럼 증가
  IF v_stat_col = 'maps' THEN
    UPDATE public.user_stats SET maps = maps + 1 WHERE user_id = v_user_id;
  ELSIF v_stat_col = 'pins' THEN
    UPDATE public.user_stats SET pins = pins + 1 WHERE user_id = v_user_id;
  ELSIF v_stat_col = 'routes' THEN
    UPDATE public.user_stats SET routes = routes + 1 WHERE user_id = v_user_id;
  ELSIF v_stat_col = 'areas' THEN
    UPDATE public.user_stats SET areas = areas + 1 WHERE user_id = v_user_id;
  ELSIF p_action_type = 'map_publish' THEN
    UPDATE public.user_stats SET publishes = publishes + 1 WHERE user_id = v_user_id;
  ELSIF p_action_type = 'map_import' THEN
    UPDATE public.user_stats SET imports = imports + 1 WHERE user_id = v_user_id;
  ELSIF p_action_type = 'survey_submit' THEN
    UPDATE public.user_stats SET memos = memos + 1 WHERE user_id = v_user_id;
  END IF;

  -- 레벨 재계산
  UPDATE public.user_stats SET
    level = CASE
      WHEN xp >= 3000 THEN 6
      WHEN xp >= 1200 THEN 5
      WHEN xp >= 500  THEN 4
      WHEN xp >= 200  THEN 3
      WHEN xp >= 50   THEN 2
      ELSE 1
    END
  WHERE user_id = v_user_id;

  PERFORM public.update_user_streak(v_user_id);

  RETURN jsonb_build_object(
    'status', 'ok',
    'xp_delta', v_xp,
    'creator_delta', v_actual_cr,
    'explorer_delta', v_actual_ex,
    'influence_delta', v_actual_in,
    'trust_delta', v_actual_tr,
    'capped', v_capped
  );
END;
$$;


-- 4) submit_event_checkin 교체 (일일 한도 적용)
CREATE OR REPLACE FUNCTION public.submit_event_checkin(
  p_map_id        UUID,
  p_feature_id    UUID,
  p_session_id    TEXT DEFAULT NULL,
  p_lat           DOUBLE PRECISION DEFAULT NULL,
  p_lng           DOUBLE PRECISION DEFAULT NULL,
  p_accuracy      DOUBLE PRECISION DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id        UUID := auth.uid();
  v_participant_key TEXT;
  v_proof_meta     JSONB;
  v_checkin_count  INTEGER;
  v_total_pins     INTEGER;
  v_already_done   BOOLEAN;
  v_base_xp        INTEGER := 15;
  v_daily_cap      INTEGER := 30;
  v_cur_daily      INTEGER;
  v_actual_xp      INTEGER;
  v_result         JSONB := '{}'::jsonb;
BEGIN
  IF v_user_id IS NOT NULL THEN
    v_participant_key := 'u:' || v_user_id::text;
  ELSIF p_session_id IS NOT NULL THEN
    v_participant_key := 's:' || p_session_id;
  ELSE
    RETURN jsonb_build_object('error', 'no_identity');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.event_checkins
    WHERE map_id = p_map_id AND feature_id = p_feature_id AND participant_key = v_participant_key
  ) THEN
    RETURN jsonb_build_object('status', 'already_checked_in');
  END IF;

  v_proof_meta := jsonb_build_object('lat', p_lat, 'lng', p_lng, 'accuracy', p_accuracy);

  INSERT INTO public.event_checkins (
    map_id, feature_id, participant_key, user_id, session_id, proof_type, proof_meta
  ) VALUES (
    p_map_id, p_feature_id, v_participant_key, v_user_id, p_session_id, 'gps', v_proof_meta
  );

  -- 로그인 유저만 XP (일일 한도 적용)
  IF v_user_id IS NOT NULL THEN
    PERFORM public.ensure_user_stats(v_user_id);
    PERFORM public.maybe_reset_daily(v_user_id);

    SELECT daily_explorer INTO v_cur_daily FROM public.user_stats WHERE user_id = v_user_id;
    v_actual_xp := LEAST(v_base_xp, GREATEST(0, v_daily_cap - v_cur_daily));

    INSERT INTO public.gamification_events (
      user_id, action_type, event_key, map_id, feature_id,
      xp_delta, explorer_delta, payload
    ) VALUES (
      v_user_id, 'event_checkin',
      'checkin:' || p_map_id || ':' || p_feature_id,
      p_map_id, p_feature_id,
      v_actual_xp, v_actual_xp, v_proof_meta
    ) ON CONFLICT (user_id, event_key) DO NOTHING;

    UPDATE public.user_stats SET
      xp            = xp + v_actual_xp,
      checkins      = checkins + 1,
      explorer_xp   = explorer_xp + v_actual_xp,
      daily_explorer = daily_explorer + v_actual_xp,
      updated_at    = now(),
      last_rewarded_at = now()
    WHERE user_id = v_user_id;
  ELSE
    v_actual_xp := 0;
  END IF;

  -- 완주 체크
  SELECT COUNT(*) INTO v_checkin_count
  FROM public.event_checkins
  WHERE map_id = p_map_id AND participant_key = v_participant_key;

  SELECT COUNT(*) INTO v_total_pins
  FROM public.map_features
  WHERE map_id = p_map_id AND type = 'pin';

  v_already_done := EXISTS (
    SELECT 1 FROM public.event_completions
    WHERE map_id = p_map_id AND participant_key = v_participant_key
  );

  v_result := jsonb_build_object(
    'status', 'checked_in',
    'xp_earned', v_actual_xp,
    'checkin_count', v_checkin_count,
    'total_checkpoints', v_total_pins
  );

  IF v_checkin_count >= v_total_pins AND NOT v_already_done AND v_total_pins > 0 THEN
    INSERT INTO public.event_completions (
      map_id, participant_key, user_id, session_id, checkin_count
    ) VALUES (
      p_map_id, v_participant_key, v_user_id, p_session_id, v_checkin_count
    );

    IF v_user_id IS NOT NULL THEN
      -- 완주 XP도 일일 한도 적용
      SELECT daily_explorer INTO v_cur_daily FROM public.user_stats WHERE user_id = v_user_id;
      DECLARE v_comp_xp INTEGER := LEAST(50, GREATEST(0, v_daily_cap - v_cur_daily));
      BEGIN
        INSERT INTO public.gamification_events (
          user_id, action_type, event_key, map_id,
          xp_delta, explorer_delta, payload
        ) VALUES (
          v_user_id, 'event_completion',
          'completion:' || p_map_id,
          p_map_id, v_comp_xp, v_comp_xp,
          jsonb_build_object('checkin_count', v_checkin_count)
        ) ON CONFLICT (user_id, event_key) DO NOTHING;

        UPDATE public.user_stats SET
          xp            = xp + v_comp_xp,
          completions   = completions + 1,
          explorer_xp   = explorer_xp + v_comp_xp,
          daily_explorer = daily_explorer + v_comp_xp,
          updated_at    = now()
        WHERE user_id = v_user_id;

        UPDATE public.user_stats SET
          level = CASE
            WHEN xp >= 3000 THEN 6
            WHEN xp >= 1200 THEN 5
            WHEN xp >= 500  THEN 4
            WHEN xp >= 200  THEN 3
            WHEN xp >= 50   THEN 2
            ELSE 1
          END
        WHERE user_id = v_user_id;

        PERFORM public.update_user_streak(v_user_id);
        v_result := v_result || jsonb_build_object('completed', true, 'completion_xp', v_comp_xp);
      END;
    ELSE
      v_result := v_result || jsonb_build_object('completed', true, 'completion_xp', 0);
    END IF;
  END IF;

  RETURN v_result;
END;
$$;


-- 5) get_game_profile 교체 (daily 포함)
CREATE OR REPLACE FUNCTION public.get_game_profile(p_user_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_uid UUID := COALESCE(p_user_id, auth.uid());
  v_stats RECORD;
  v_badges JSONB;
  v_souvenirs JSONB;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('error', 'no_user');
  END IF;

  PERFORM public.ensure_user_stats(v_uid);
  PERFORM public.maybe_reset_daily(v_uid);

  SELECT * INTO v_stats FROM public.user_stats WHERE user_id = v_uid;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('badge_id', badge_id, 'earned_at', earned_at)), '[]'::jsonb)
  INTO v_badges
  FROM public.user_badges WHERE user_id = v_uid;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'souvenir_code', souvenir_code, 'map_id', map_id,
    'meta', meta, 'earned_at', earned_at
  ) ORDER BY earned_at DESC), '[]'::jsonb)
  INTO v_souvenirs
  FROM public.user_souvenirs WHERE user_id = v_uid;

  RETURN jsonb_build_object(
    'stats', jsonb_build_object(
      'xp', v_stats.xp,
      'level', v_stats.level,
      'maps', v_stats.maps,
      'pins', v_stats.pins,
      'routes', v_stats.routes,
      'areas', v_stats.areas,
      'checkins', v_stats.checkins,
      'completions', v_stats.completions,
      'memos', v_stats.memos,
      'imports', v_stats.imports,
      'publishes', v_stats.publishes,
      'streak_days', v_stats.streak_days,
      'regions', v_stats.regions,
      'creator_xp', v_stats.creator_xp,
      'explorer_xp', v_stats.explorer_xp,
      'influence_xp', v_stats.influence_xp,
      'trust_xp', v_stats.trust_xp,
      'current_title', v_stats.current_title,
      'daily_creator', v_stats.daily_creator,
      'daily_explorer', v_stats.daily_explorer,
      'daily_influence', v_stats.daily_influence,
      'daily_trust', v_stats.daily_trust,
      'daily_cap', 30
    ),
    'badges', v_badges,
    'souvenirs', v_souvenirs
  );
END;
$$;
