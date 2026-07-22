-- ============================================================
-- Migration 085: 이웃 제보 자연(nature) 탭 허용 (084 후속)
--
-- 개요:
--   기여 시스템 1차는 3탭(enjoy·learn·walk)만 받았다(084 tab CHECK). 2차로
--   '자연(nature)' 관측 제보를 추가한다. 자연은 생물 관측이라 발행 후 탐색탭에서
--   explore_catalog(tab='nature', source='contribution')를 wildlife 카드 모양으로
--   변환해 /api/wildlife 목록과 병합한다(클라이언트 처리).
--
--   변경점 2가지:
--   1) explore_contributions.tab CHECK 에 'nature' 추가.
--   2) submit_contribution RPC 의 탭 화이트리스트에 'nature' 추가(그 외 로직 동일).
--   admin_review_contribution 은 행의 tab 을 그대로 미러하므로 변경 불필요
--   (explore_catalog.tab 은 CHECK 없음 — nature 도 그대로 기록됨).
--
-- 적용 주의사항:
--   1. 084 이후 실행 (신규 번호 085). Supabase SQL Editor(postgres 롤).
--   2. 검증: 앱에서 자연 탭 제보 → explore_contributions 에 tab='nature' 행 생성 →
--      /admin 승인 → explore_catalog 에 tab='nature', source='contribution' 미러 확인.
--   3. 롤백: tab CHECK 를 3탭으로 되돌리고 submit_contribution 을 084 본문으로 재정의.
-- ============================================================

-- 1) tab CHECK 확장 (084 인라인 CHECK 이름: explore_contributions_tab_check)
ALTER TABLE public.explore_contributions
  DROP CONSTRAINT IF EXISTS explore_contributions_tab_check;
ALTER TABLE public.explore_contributions
  ADD CONSTRAINT explore_contributions_tab_check
  CHECK (tab IN ('enjoy', 'learn', 'walk', 'nature'));

-- 2) submit_contribution — 탭 화이트리스트에 'nature' 추가 (084 본문과 동일, 이 줄만 변경)
CREATE OR REPLACE FUNCTION public.submit_contribution(
  p_tab text,
  p_title text,
  p_addr text,
  p_lat double precision,
  p_lng double precision,
  p_category text DEFAULT NULL,
  p_summary text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_source_url text DEFAULT NULL,
  p_image text DEFAULT NULL,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL,
  p_apply_start date DEFAULT NULL,
  p_apply_end date DEFAULT NULL,
  p_detail jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_salt constant text := 'loca_contrib_v1:';
  v_uid uuid := auth.uid();
  v_title text;
  v_addr text;
  v_detail jsonb;
  v_key text;
  v_recent int;
  v_id uuid;
BEGIN
  -- 로그인 강제 — 제보는 실명성(계정)이 있어야 검수·기여자 표기가 성립한다
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  IF p_tab IS NULL OR p_tab NOT IN ('enjoy', 'learn', 'walk', 'nature') THEN
    RAISE EXCEPTION 'invalid_tab' USING ERRCODE = '22023';
  END IF;

  v_title := btrim(coalesce(p_title, ''));
  IF char_length(v_title) < 1 OR char_length(v_title) > 120 THEN
    RAISE EXCEPTION 'invalid_title' USING ERRCODE = '22023';
  END IF;

  v_addr := btrim(coalesce(p_addr, ''));
  IF char_length(v_addr) < 1 OR char_length(v_addr) > 200 THEN
    RAISE EXCEPTION 'invalid_addr' USING ERRCODE = '22023';
  END IF;

  -- 좌표 유효성 — 대한민국 bbox 근사 (장소검색 결과에서 오므로 정상값이 기대되지만 방어)
  IF p_lat IS NULL OR p_lng IS NULL
     OR p_lat < 32.5 OR p_lat > 39.5 OR p_lng < 124.0 OR p_lng > 132.5 THEN
    RAISE EXCEPTION 'invalid_location' USING ERRCODE = '22023';
  END IF;

  -- 즐기기(행사)는 기간이 없으면 목록에서 걸러진다(클라이언트 eventDdayBadge) → 시작일 필수
  IF p_tab = 'enjoy' AND p_start_date IS NULL THEN
    RAISE EXCEPTION 'date_required' USING ERRCODE = '22023';
  END IF;

  -- 길이 상한(초과는 절단이 아니라 거절 — 클라이언트가 이미 제한)
  IF char_length(coalesce(p_summary, '')) > 500
     OR char_length(coalesce(p_phone, '')) > 40
     OR char_length(coalesce(p_source_url, '')) > 500
     OR char_length(coalesce(p_image, '')) > 1000
     OR char_length(coalesce(p_category, '')) > 40 THEN
    RAISE EXCEPTION 'field_too_long' USING ERRCODE = '22023';
  END IF;

  -- detail — object 아니거나 4KB 초과면 비운다
  v_detail := coalesce(p_detail, '{}'::jsonb);
  IF jsonb_typeof(v_detail) <> 'object' OR pg_column_size(v_detail) > 4096 THEN
    v_detail := '{}'::jsonb;
  END IF;

  -- rate limit — 24시간 내 10건 (uid 해시, 원 uid 역산 불가). 탈퇴 후 역추적 방지.
  v_key := 'c:' || md5(v_salt || v_uid::text);
  SELECT count(*) INTO v_recent
  FROM public.explore_contributions
  WHERE rate_key = v_key AND submitted_at > now() - interval '24 hours';
  IF v_recent >= 10 THEN
    RAISE EXCEPTION 'rate_limited' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.explore_contributions (
    status, tab, created_by, rate_key,
    title, addr, lat, lng, category, summary, phone, source_url, image,
    start_date, end_date, apply_start, apply_end, detail
  ) VALUES (
    'pending', p_tab, v_uid, v_key,
    v_title, v_addr, p_lat, p_lng,
    nullif(btrim(coalesce(p_category, '')), ''),
    nullif(btrim(coalesce(p_summary, '')), ''),
    nullif(btrim(coalesce(p_phone, '')), ''),
    nullif(btrim(coalesce(p_source_url, '')), ''),
    nullif(btrim(coalesce(p_image, '')), ''),
    p_start_date, p_end_date, p_apply_start, p_apply_end, v_detail
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'id', v_id, 'status', 'pending');
END;
$$;

REVOKE ALL ON FUNCTION public.submit_contribution(text, text, text, double precision, double precision, text, text, text, text, text, date, date, date, date, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_contribution(text, text, text, double precision, double precision, text, text, text, text, text, date, date, date, date, jsonb) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
