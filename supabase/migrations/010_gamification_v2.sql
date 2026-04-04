-- ============================================================
-- Migration 010: 게이미피케이션 v2 (서버 authoritative 성장 엔진)
-- 의존: 009_gamification.sql (user_stats, user_badges, update_user_streak)
-- 주의: 기존 010_growth_engine.sql 대체. view_logs 미접촉.
-- ============================================================

-- ─── 1) user_stats 확장 ───
ALTER TABLE public.user_stats
  ADD COLUMN IF NOT EXISTS maps           INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pins           INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS routes         INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS areas          INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS creator_xp     INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS explorer_xp    INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS influence_xp   INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS trust_xp       INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS current_title  TEXT,
  ADD COLUMN IF NOT EXISTS last_rewarded_at TIMESTAMPTZ;


-- ─── 2) gamification_events: XP 변동 이력 (감사 로그) ───
CREATE TABLE IF NOT EXISTS public.gamification_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  action_type     TEXT NOT NULL,
  event_key       TEXT NOT NULL,
  map_id          UUID,
  feature_id      UUID,
  xp_delta        INTEGER NOT NULL DEFAULT 0,
  creator_delta   INTEGER NOT NULL DEFAULT 0,
  explorer_delta  INTEGER NOT NULL DEFAULT 0,
  influence_delta INTEGER NOT NULL DEFAULT 0,
  trust_delta     INTEGER NOT NULL DEFAULT 0,
  payload         JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- 유저별 중복 보상 방지 (같은 유저가 같은 event_key로 두 번 받을 수 없음)
  UNIQUE(user_id, event_key)
);

CREATE INDEX IF NOT EXISTS idx_gam_events_user ON public.gamification_events(user_id);
CREATE INDEX IF NOT EXISTS idx_gam_events_action ON public.gamification_events(action_type);

ALTER TABLE public.gamification_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gam_events_select_self" ON public.gamification_events
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "gam_events_insert_self" ON public.gamification_events
  FOR INSERT WITH CHECK (auth.uid() = user_id);


-- ─── 3) event_checkins: 행사 체크인 기록 ───
-- participant_key: 로그인 유저 'u:<user_id>', 비로그인 's:<session_id>'
CREATE TABLE IF NOT EXISTS public.event_checkins (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  map_id          UUID NOT NULL REFERENCES public.maps(id) ON DELETE CASCADE,
  feature_id      UUID NOT NULL REFERENCES public.map_features(id) ON DELETE CASCADE,
  participant_key TEXT NOT NULL,
  user_id         UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  session_id      TEXT,
  proof_type      TEXT NOT NULL DEFAULT 'gps',
  proof_meta      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(map_id, feature_id, participant_key)
);

CREATE INDEX IF NOT EXISTS idx_event_checkins_map ON public.event_checkins(map_id);
CREATE INDEX IF NOT EXISTS idx_event_checkins_participant ON public.event_checkins(participant_key);

ALTER TABLE public.event_checkins ENABLE ROW LEVEL SECURITY;

-- 본인 체크인 조회 (로그인 유저)
CREATE POLICY "checkins_select_self" ON public.event_checkins
  FOR SELECT USING (auth.uid() = user_id);

-- 비로그인 참여자도 INSERT 가능 (SECURITY DEFINER RPC를 통해)
-- RPC가 SECURITY DEFINER이므로 직접 INSERT 정책은 로그인 유저용만
CREATE POLICY "checkins_insert_auth" ON public.event_checkins
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 운영자는 자기 지도의 체크인 전체 조회
CREATE POLICY "checkins_select_map_owner" ON public.event_checkins
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.maps WHERE maps.id = map_id AND maps.user_id = auth.uid())
  );


-- ─── 4) event_completions: 행사 완주 기록 ───
CREATE TABLE IF NOT EXISTS public.event_completions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  map_id          UUID NOT NULL REFERENCES public.maps(id) ON DELETE CASCADE,
  participant_key TEXT NOT NULL,
  user_id         UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  session_id      TEXT,
  checkin_count   INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(map_id, participant_key)
);

CREATE INDEX IF NOT EXISTS idx_event_completions_map ON public.event_completions(map_id);

ALTER TABLE public.event_completions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "completions_select_self" ON public.event_completions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "completions_insert_auth" ON public.event_completions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "completions_select_map_owner" ON public.event_completions
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.maps WHERE maps.id = map_id AND maps.user_id = auth.uid())
  );


-- ─── 5) map_imports: 지도 가져오기 기록 ───
CREATE TABLE IF NOT EXISTS public.map_imports (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  source_map_id   UUID,                  -- nullable: 외부/삭제된 지도도 추적
  source_ref      TEXT NOT NULL,         -- 'map:<uuid>', 'shared:<data_hash>', 'slug:<slug>'
  target_map_id   UUID,                  -- 생성된 내 지도 ID
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(source_ref, user_id)
);

CREATE INDEX IF NOT EXISTS idx_map_imports_user ON public.map_imports(user_id);

ALTER TABLE public.map_imports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "imports_select_self" ON public.map_imports
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "imports_insert_self" ON public.map_imports
  FOR INSERT WITH CHECK (auth.uid() = user_id);


-- ─── 6) user_souvenirs: 행사/지역 수집품 ───
CREATE TABLE IF NOT EXISTS public.user_souvenirs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  souvenir_code TEXT NOT NULL,
  map_id        UUID,
  meta          JSONB NOT NULL DEFAULT '{}'::jsonb,
  earned_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- map_id가 있는 경우: (user_id, souvenir_code, map_id) 중복 방지
CREATE UNIQUE INDEX IF NOT EXISTS idx_souvenirs_with_map
  ON public.user_souvenirs(user_id, souvenir_code, map_id)
  WHERE map_id IS NOT NULL;

-- map_id가 NULL인 경우: (user_id, souvenir_code) 중복 방지
CREATE UNIQUE INDEX IF NOT EXISTS idx_souvenirs_without_map
  ON public.user_souvenirs(user_id, souvenir_code)
  WHERE map_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_user_souvenirs_user ON public.user_souvenirs(user_id);

ALTER TABLE public.user_souvenirs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "souvenirs_select_self" ON public.user_souvenirs
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "souvenirs_insert_self" ON public.user_souvenirs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 프로필 공개: 다른 사용자의 수비니어도 조회 가능
CREATE POLICY "souvenirs_select_public" ON public.user_souvenirs
  FOR SELECT USING (true);


-- ─── 7) helper: ensure_user_stats ───
CREATE OR REPLACE FUNCTION public.ensure_user_stats(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.user_stats (user_id)
  VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;
END;
$$;


-- ─── 8) RPC: record_map_action ───
-- 범용 지도/피처 액션 XP 처리
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
  v_cr      INTEGER := 0;  -- creator
  v_ex      INTEGER := 0;  -- explorer
  v_in      INTEGER := 0;  -- influence
  v_tr      INTEGER := 0;  -- trust
  v_stat_col TEXT := NULL;  -- user_stats counter column
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'not_authenticated');
  END IF;

  PERFORM public.ensure_user_stats(v_user_id);

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

  -- 중복 체크 (이미 보상받은 이벤트)
  IF EXISTS (
    SELECT 1 FROM public.gamification_events
    WHERE user_id = v_user_id AND event_key = p_event_key
  ) THEN
    RETURN jsonb_build_object('status', 'already_rewarded');
  END IF;

  -- gamification_events 기록
  INSERT INTO public.gamification_events (
    user_id, action_type, event_key, map_id, feature_id,
    xp_delta, creator_delta, explorer_delta, influence_delta, trust_delta, payload
  ) VALUES (
    v_user_id, p_action_type, p_event_key, p_map_id, p_feature_id,
    v_xp, v_cr, v_ex, v_in, v_tr, p_payload
  );

  -- user_stats XP 업데이트
  UPDATE public.user_stats SET
    xp           = xp + v_xp,
    creator_xp   = creator_xp + v_cr,
    explorer_xp  = explorer_xp + v_ex,
    influence_xp = influence_xp + v_in,
    trust_xp     = trust_xp + v_tr,
    updated_at   = now(),
    last_rewarded_at = now()
  WHERE user_id = v_user_id;

  -- 카운터 컬럼 증가 (maps, pins, routes, areas)
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

  -- 스트릭
  PERFORM public.update_user_streak(v_user_id);

  RETURN jsonb_build_object(
    'status', 'ok',
    'xp_delta', v_xp,
    'creator_delta', v_cr,
    'explorer_delta', v_ex,
    'influence_delta', v_in,
    'trust_delta', v_tr
  );
END;
$$;


-- ─── 9) RPC: submit_event_checkin ───
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
  v_xp_delta       INTEGER := 15;
  v_result         JSONB := '{}'::jsonb;
BEGIN
  -- participant_key 결정
  IF v_user_id IS NOT NULL THEN
    v_participant_key := 'u:' || v_user_id::text;
  ELSIF p_session_id IS NOT NULL THEN
    v_participant_key := 's:' || p_session_id;
  ELSE
    RETURN jsonb_build_object('error', 'no_identity');
  END IF;

  -- 중복 체크인 방지
  IF EXISTS (
    SELECT 1 FROM public.event_checkins
    WHERE map_id = p_map_id AND feature_id = p_feature_id AND participant_key = v_participant_key
  ) THEN
    RETURN jsonb_build_object('status', 'already_checked_in');
  END IF;

  -- proof_meta 구성
  v_proof_meta := jsonb_build_object(
    'lat', p_lat, 'lng', p_lng, 'accuracy', p_accuracy
  );

  -- 체크인 기록
  INSERT INTO public.event_checkins (
    map_id, feature_id, participant_key, user_id, session_id, proof_type, proof_meta
  ) VALUES (
    p_map_id, p_feature_id, v_participant_key, v_user_id, p_session_id, 'gps', v_proof_meta
  );

  -- 로그인 유저만 XP 처리
  IF v_user_id IS NOT NULL THEN
    PERFORM public.ensure_user_stats(v_user_id);

    INSERT INTO public.gamification_events (
      user_id, action_type, event_key, map_id, feature_id,
      xp_delta, explorer_delta, payload
    ) VALUES (
      v_user_id, 'event_checkin',
      'checkin:' || p_map_id || ':' || p_feature_id,
      p_map_id, p_feature_id,
      v_xp_delta, v_xp_delta, v_proof_meta
    ) ON CONFLICT (user_id, event_key) DO NOTHING;

    UPDATE public.user_stats SET
      xp          = xp + v_xp_delta,
      checkins    = checkins + 1,
      explorer_xp = explorer_xp + v_xp_delta,
      updated_at  = now(),
      last_rewarded_at = now()
    WHERE user_id = v_user_id;
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
    'xp_earned', CASE WHEN v_user_id IS NOT NULL THEN v_xp_delta ELSE 0 END,
    'checkin_count', v_checkin_count,
    'total_checkpoints', v_total_pins
  );

  -- 완주 달성
  IF v_checkin_count >= v_total_pins AND NOT v_already_done AND v_total_pins > 0 THEN
    INSERT INTO public.event_completions (
      map_id, participant_key, user_id, session_id, checkin_count
    ) VALUES (
      p_map_id, v_participant_key, v_user_id, p_session_id, v_checkin_count
    );

    -- 로그인 유저 완주 XP
    IF v_user_id IS NOT NULL THEN
      INSERT INTO public.gamification_events (
        user_id, action_type, event_key, map_id,
        xp_delta, explorer_delta, payload
      ) VALUES (
        v_user_id, 'event_completion',
        'completion:' || p_map_id,
        p_map_id, 50, 50,
        jsonb_build_object('checkin_count', v_checkin_count)
      ) ON CONFLICT (user_id, event_key) DO NOTHING;

      UPDATE public.user_stats SET
        xp          = xp + 50,
        completions = completions + 1,
        explorer_xp = explorer_xp + 50,
        updated_at  = now()
      WHERE user_id = v_user_id;

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
    END IF;

    v_result := v_result || jsonb_build_object('completed', true, 'completion_xp', 50);
  END IF;

  RETURN v_result;
END;
$$;


-- ─── 10) RPC: submit_survey_reward ───
CREATE OR REPLACE FUNCTION public.submit_survey_reward(
  p_map_id UUID,
  p_event_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_key TEXT;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('status', 'skipped', 'reason', 'not_authenticated');
  END IF;

  PERFORM public.ensure_user_stats(v_user_id);

  v_key := COALESCE(p_event_key, 'survey:' || p_map_id);

  RETURN public.record_map_action('survey_submit', v_key, p_map_id);
END;
$$;


-- ─── 11) RPC: get_game_profile ───
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
      'current_title', v_stats.current_title
    ),
    'badges', v_badges,
    'souvenirs', v_souvenirs
  );
END;
$$;
