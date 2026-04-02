-- ============================================================
-- Migration 009: 게이미피케이션 (유저 통계 + 뱃지)
-- ============================================================

-- 1) user_stats: 유저별 누적 통계 캐시
CREATE TABLE IF NOT EXISTS public.user_stats (
  user_id     UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  xp          INTEGER NOT NULL DEFAULT 0,
  level       INTEGER NOT NULL DEFAULT 1,
  checkins    INTEGER NOT NULL DEFAULT 0,
  completions INTEGER NOT NULL DEFAULT 0,
  memos       INTEGER NOT NULL DEFAULT 0,
  imports     INTEGER NOT NULL DEFAULT 0,
  publishes   INTEGER NOT NULL DEFAULT 0,
  streak_days INTEGER NOT NULL DEFAULT 0,
  last_active_date DATE DEFAULT CURRENT_DATE,
  regions     INTEGER NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_stats ENABLE ROW LEVEL SECURITY;

-- 본인 통계만 조회/수정
CREATE POLICY "user_stats_select_self" ON public.user_stats
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "user_stats_insert_self" ON public.user_stats
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_stats_update_self" ON public.user_stats
  FOR UPDATE USING (auth.uid() = user_id);

-- 2) user_badges: 획득한 뱃지 기록
CREATE TABLE IF NOT EXISTS public.user_badges (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  badge_id  TEXT NOT NULL,
  earned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, badge_id)
);

CREATE INDEX IF NOT EXISTS idx_user_badges_user_id ON public.user_badges(user_id);

ALTER TABLE public.user_badges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_badges_select_self" ON public.user_badges
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "user_badges_insert_self" ON public.user_badges
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 3) 연속 기록(streak) 업데이트 함수
CREATE OR REPLACE FUNCTION public.update_user_streak(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_last_date DATE;
  v_today DATE := CURRENT_DATE;
BEGIN
  SELECT last_active_date INTO v_last_date
  FROM public.user_stats
  WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    INSERT INTO public.user_stats (user_id, streak_days, last_active_date)
    VALUES (p_user_id, 1, v_today);
    RETURN;
  END IF;

  IF v_last_date = v_today THEN
    RETURN; -- 오늘 이미 갱신됨
  ELSIF v_last_date = v_today - 1 THEN
    UPDATE public.user_stats
    SET streak_days = streak_days + 1, last_active_date = v_today, updated_at = now()
    WHERE user_id = p_user_id;
  ELSE
    UPDATE public.user_stats
    SET streak_days = 1, last_active_date = v_today, updated_at = now()
    WHERE user_id = p_user_id;
  END IF;
END;
$$;
