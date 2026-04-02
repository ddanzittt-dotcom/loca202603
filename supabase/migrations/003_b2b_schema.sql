-- ============================================================
-- LOCA B2B/B2G 스키마 마이그레이션 v3
-- 실행: Supabase SQL Editor에서 전체 복사 후 실행
-- ============================================================

-- -------------------------------------------------------
-- 1. maps.category CHECK 확장 — 'event' 추가
-- -------------------------------------------------------
ALTER TABLE public.maps DROP CONSTRAINT IF EXISTS maps_category_check;
ALTER TABLE public.maps ADD CONSTRAINT maps_category_check
  CHECK (category IN ('personal', 'stamp', 'media', 'infra', 'event'));

-- -------------------------------------------------------
-- 2. 신규 테이블: invitation_codes (초대코드)
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.invitation_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  label text DEFAULT '',
  max_uses integer DEFAULT NULL,
  used_count integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS: 인증된 유저가 코드 조회 가능 (검증용)
ALTER TABLE public.invitation_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "invitation_codes_select_authenticated" ON public.invitation_codes;
CREATE POLICY "invitation_codes_select_authenticated"
  ON public.invitation_codes
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- -------------------------------------------------------
-- 3. 신규 테이블: invitation_redemptions (코드 사용 기록)
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.invitation_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  code_id uuid REFERENCES public.invitation_codes(id) ON DELETE CASCADE NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, code_id)
);

CREATE INDEX IF NOT EXISTS idx_invitation_redemptions_user_id ON public.invitation_redemptions(user_id);

-- RLS: 본인 행만 조회/삽입
ALTER TABLE public.invitation_redemptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "redemptions_select_self" ON public.invitation_redemptions;
CREATE POLICY "redemptions_select_self"
  ON public.invitation_redemptions
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "redemptions_insert_self" ON public.invitation_redemptions;
CREATE POLICY "redemptions_insert_self"
  ON public.invitation_redemptions
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- -------------------------------------------------------
-- 4. 초대코드 사용 RPC (원자적 검증 + 기록)
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.redeem_invitation_code(code_text text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_code_id uuid;
  v_max_uses integer;
  v_used_count integer;
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  -- 코드 조회
  SELECT id, max_uses, used_count INTO v_code_id, v_max_uses, v_used_count
  FROM public.invitation_codes
  WHERE code = code_text AND is_active = true
  FOR UPDATE;

  IF v_code_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_code');
  END IF;

  -- 사용 횟수 초과 확인
  IF v_max_uses IS NOT NULL AND v_used_count >= v_max_uses THEN
    RETURN jsonb_build_object('success', false, 'error', 'code_exhausted');
  END IF;

  -- 이미 사용한 코드인지 확인
  IF EXISTS (
    SELECT 1 FROM public.invitation_redemptions
    WHERE user_id = v_user_id AND code_id = v_code_id
  ) THEN
    RETURN jsonb_build_object('success', true, 'error', 'already_redeemed');
  END IF;

  -- 사용 기록 삽입 + 카운트 증가
  INSERT INTO public.invitation_redemptions (user_id, code_id)
  VALUES (v_user_id, v_code_id);

  UPDATE public.invitation_codes SET used_count = used_count + 1 WHERE id = v_code_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- -------------------------------------------------------
-- 5. 개발용 테스트 초대코드
-- -------------------------------------------------------
INSERT INTO public.invitation_codes (code, label)
VALUES
  ('LOCA-TEST-2026', '개발 테스트용'),
  ('LOCA-PILOT-B2G', '파일럿 B2G 코드')
ON CONFLICT (code) DO NOTHING;
