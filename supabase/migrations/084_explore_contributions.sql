-- ============================================================
-- Migration 084: 탐색탭 이웃 제보(기여) 시스템 — explore_contributions
--
-- 개요:
--   사용자가 탐색탭(즐기기·배우기·걷기·머물기)에 들어갈 항목을 직접 제보하고,
--   관리자가 /admin 에서 승인하면 탐색 카탈로그(explore_catalog)로 발행되는 흐름.
--   1차 범위는 3개 탭(enjoy·learn·walk) 한정 — '자연(nature)'은 병합 인프라가
--   달라 2차로 미룬다(tab CHECK 로 DB 레벨에서 강제).
--
--   설계 근거:
--   - 제출/검수 테이블은 RLS 로 잠그고 SECURITY DEFINER RPC 로만 변경한다
--     (065 user_feedback 과 동일 패턴). 단, 제보자는 자기 제보 상태를 볼 수 있어야
--     하므로 "본인 행 SELECT" 정책만 연다(피드백과 다른 점).
--   - 발행은 explore_catalog 미러 방식: 승인 시 source='contribution' 행을
--     upsert(id='contribution:<uuid>') → 탐색 클라이언트/RPC(074~076)를 그대로 재사용.
--     반려·철회 시 미러 행 삭제.
--   - explore_catalog 는 쓰기 정책이 없어 service_role 만 쓸 수 있다(074). /admin 은
--     사용자 JWT 로 도는 클라이언트라 직접 못 쓴다 → 미러 쓰기를 SECURITY DEFINER
--     RPC 안에서 수행(함수 owner=테이블 owner 라 RLS 우회). 승인과 발행이 한 트랜잭션.
--   - ★기여자 표기(닉네임)는 "승인 시점에 미러 detail 로 스냅샷"한다.★
--     explore_catalog 는 anon 이 읽고 profiles JOIN 이 금지(058)이며, 제보자가 탈퇴하면
--     (053, created_by→SET NULL) JOIN 이 깨진다. 스냅샷이라야 발행 카드가 독립적으로 산다.
--
-- 사진 처리(승인 시 복사 방식):
--   이 migration 은 image 를 URL 로만 저장/미러한다. 실제 파일 복사는 클라이언트가 한다.
--   - 제출: 제보자가 media 버킷의 임시 경로(contrib/pending/<uid>/...)에 업로드 → 그 URL 저장
--   - 승인: 관리자 브라우저가 storage.copy(임시 → contrib/pub/<id>...) 로 관리자 소유 사본을
--           만들고, 그 영구 URL 을 admin_review_contribution(p_image:=영구URL) 로 넘긴다.
--           RPC 는 제보 행과 미러의 image 를 영구 URL 로 교체한다. 이로써 제보자가 탈퇴해
--           임시 파일이 정리돼도 발행 카드 사진은 유지된다.
--
-- 적용 주의사항:
--   1. 083 이후 실행 (신규 번호 084). Supabase SQL Editor(postgres 롤)에서 실행 —
--      미러 함수가 explore_catalog(=postgres owner)를 RLS 우회로 쓰려면 owner 가 맞아야 한다.
--   2. 074~076(explore_catalog + apply_start/end·image 컬럼)이 선행 적용돼 있어야 한다.
--   3. is_platform_admin(uuid) (055) 선행 필요 — 이미 라이브 적용됨.
--   4. 스모크 테스트:
--        -- 제출(로그인 필요 → SQL Editor 는 auth.uid()=NULL 이라 not_authenticated 로 막힘=정상)
--        -- 앱에서 로그인 후 제보 → 아래로 확인:
--        SELECT id, tab, title, status, created_by FROM public.explore_contributions
--          ORDER BY submitted_at DESC LIMIT 5;
--        -- admin RPC 도 SQL Editor 에선 admin_required 로 막힘(정상). 앱 /admin 에서 확인.
--   5. 롤백:
--        DROP FUNCTION IF EXISTS public.admin_review_contribution(uuid, text, text, text);
--        DROP FUNCTION IF EXISTS public.admin_list_contributions(text, int);
--        DROP FUNCTION IF EXISTS public.submit_contribution(text, text, text, double precision, double precision, text, text, text, text, date, date, date, date, jsonb);
--        DELETE FROM public.explore_catalog WHERE source='contribution';  -- 발행된 미러 정리
--        DROP TABLE IF EXISTS public.explore_contributions;
-- ============================================================

-- 1) 테이블
CREATE TABLE IF NOT EXISTS public.explore_contributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'published', 'rejected', 'retracted')),
  tab text NOT NULL
    CHECK (tab IN ('enjoy', 'learn', 'walk')),          -- 1차 3탭 (nature 제외)
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  rate_key text NOT NULL,

  -- 카드 내용 (explore_catalog 골격과 정합 — 승인 시 그대로 미러)
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  addr text NOT NULL CHECK (char_length(addr) BETWEEN 1 AND 200),
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  category text,                                         -- 걷기 종류(공원/시장/골목…)·강좌 분류 등 카드 배지
  summary text,
  phone text,
  source_url text,
  image text,                                            -- 제출: 임시 URL / 승인: 영구 URL 로 교체
  start_date date, end_date date,                        -- 즐기기 개최기간 / 배우기 교육기간
  apply_start date, apply_end date,                      -- 배우기 접수기간 ("접수중" 배지)
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,             -- 탭별 부가필드(기관명·요일·시간·수강료 등)

  -- 심의 메타
  submitted_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid,
  reject_reason text
);

COMMENT ON TABLE public.explore_contributions IS
  '탐색탭 이웃 제보(기여) — RLS 로 본인 행만 읽기, 변경은 RPC 로만. 승인 시 explore_catalog(source=contribution)로 미러 발행 (084)';

CREATE INDEX IF NOT EXISTS explore_contributions_status_idx
  ON public.explore_contributions (status, submitted_at DESC);
CREATE INDEX IF NOT EXISTS explore_contributions_created_by_idx
  ON public.explore_contributions (created_by, submitted_at DESC);
CREATE INDEX IF NOT EXISTS explore_contributions_rate_key_idx
  ON public.explore_contributions (rate_key, submitted_at DESC);

-- 2) RLS — 본인 행 SELECT 만 개방. INSERT/UPDATE/DELETE 정책 없음 → 직접 쓰기 차단(RPC 전용).
ALTER TABLE public.explore_contributions ENABLE ROW LEVEL SECURITY;

-- 직접 쓰기 권한 회수(이중 방어). SELECT 는 authenticated 에 남겨 RLS 정책이 동작하게 한다.
REVOKE ALL ON TABLE public.explore_contributions FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.explore_contributions FROM authenticated;
GRANT SELECT ON TABLE public.explore_contributions TO authenticated;

DROP POLICY IF EXISTS explore_contributions_own_read ON public.explore_contributions;
CREATE POLICY explore_contributions_own_read
  ON public.explore_contributions
  FOR SELECT
  USING (created_by = auth.uid());   -- 제보자는 자기 제보 상태(검토중/게시됨/반려)를 본다

-- 3) 제출 RPC — 로그인 필수(익명 불허, 피드백과 다른 점), 서버측 검증 + rate limit
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

  IF p_tab IS NULL OR p_tab NOT IN ('enjoy', 'learn', 'walk') THEN
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

-- 4) 관리자 목록 RPC — 상태 필터 + 전체 상태별 카운트(탭 뱃지용) + 제보자 닉네임
CREATE OR REPLACE FUNCTION public.admin_list_contributions(
  p_status text DEFAULT 'pending',
  p_limit int DEFAULT 100
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit int := least(greatest(coalesce(p_limit, 100), 1), 200);
  v_records jsonb;
  v_counts jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'admin_required' USING ERRCODE = '42501';
  END IF;
  IF p_status IS NULL OR p_status NOT IN ('pending', 'published', 'rejected', 'retracted') THEN
    RAISE EXCEPTION 'invalid_status' USING ERRCODE = '22023';
  END IF;

  SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.submitted_at DESC), '[]'::jsonb)
  INTO v_records
  FROM (
    SELECT c.id, c.status, c.tab, c.title, c.addr, c.lat, c.lng, c.category,
           c.summary, c.phone, c.source_url, c.image,
           c.start_date, c.end_date, c.apply_start, c.apply_end, c.detail,
           c.submitted_at, c.reviewed_at, c.reject_reason, c.created_by,
           p.nickname
    FROM public.explore_contributions c
    LEFT JOIN public.profiles p ON p.id = c.created_by
    WHERE c.status = p_status
    ORDER BY c.submitted_at DESC
    LIMIT v_limit
  ) r;

  SELECT jsonb_build_object(
    'pending',   count(*) FILTER (WHERE status = 'pending'),
    'published', count(*) FILTER (WHERE status = 'published'),
    'rejected',  count(*) FILTER (WHERE status = 'rejected'),
    'retracted', count(*) FILTER (WHERE status = 'retracted')
  ) INTO v_counts
  FROM public.explore_contributions;

  RETURN jsonb_build_object('records', v_records, 'counts', v_counts, 'generated_at', now());
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_contributions(text, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_contributions(text, int) TO authenticated, service_role;

-- 5) 관리자 심의 RPC — 승인(published)/반려(rejected)
--    승인: explore_catalog 미러 upsert (기여자 닉네임 스냅샷). p_image 주면 영구 URL 로 교체.
--    반려: 미러가 있으면 삭제(재심의로 게시→반려 전환 커버).
CREATE OR REPLACE FUNCTION public.admin_review_contribution(
  p_id uuid,
  p_status text,
  p_reject_reason text DEFAULT NULL,
  p_image text DEFAULT NULL          -- 승인 시 관리자 소유로 복사한 영구 사진 URL (있으면 교체)
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin uuid := auth.uid();
  v_row public.explore_contributions%ROWTYPE;
  v_mirror_id text;
  v_image text;
  v_nickname text;
  v_detail jsonb;
BEGIN
  IF v_admin IS NULL OR NOT public.is_platform_admin(v_admin) THEN
    RAISE EXCEPTION 'admin_required' USING ERRCODE = '42501';
  END IF;
  IF p_status IS NULL OR p_status NOT IN ('published', 'rejected') THEN
    RAISE EXCEPTION 'invalid_status' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_row FROM public.explore_contributions WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'record_not_found' USING ERRCODE = 'P0002';
  END IF;

  v_mirror_id := 'contribution:' || v_row.id::text;

  IF p_status = 'published' THEN
    IF v_row.lat IS NULL OR v_row.lng IS NULL THEN
      RAISE EXCEPTION 'missing_location' USING ERRCODE = '22023';
    END IF;

    -- 최종 사진: 관리자가 복사한 영구 URL 우선, 없으면 제출 URL 유지
    v_image := coalesce(nullif(btrim(coalesce(p_image, '')), ''), v_row.image);

    -- 기여자 닉네임 스냅샷 (탈퇴/anon 대비 — 발행 후엔 profiles 를 다시 보지 않는다)
    SELECT nickname INTO v_nickname FROM public.profiles WHERE id = v_row.created_by;
    v_nickname := coalesce(nullif(btrim(coalesce(v_nickname, '')), ''), '이웃');

    v_detail := coalesce(v_row.detail, '{}'::jsonb)
              || jsonb_build_object('contributor', v_nickname, 'contributed', true);

    -- 제보 행 상태 갱신
    UPDATE public.explore_contributions
    SET status = 'published', image = v_image,
        reviewed_at = now(), reviewed_by = v_admin, reject_reason = NULL
    WHERE id = v_row.id;

    -- explore_catalog 미러 발행 (source='contribution')
    INSERT INTO public.explore_catalog (
      id, source, tab, title, category, addr, lat, lng, region_text, phone,
      start_date, end_date, apply_start, apply_end,
      summary, image, detail, source_url, source_ref,
      data_reference_date, ingested_at
    ) VALUES (
      v_mirror_id, 'contribution', v_row.tab, v_row.title, v_row.category, v_row.addr,
      v_row.lat, v_row.lng, v_row.addr, v_row.phone,
      v_row.start_date, v_row.end_date, v_row.apply_start, v_row.apply_end,
      v_row.summary, v_image, v_detail, v_row.source_url, v_mirror_id,
      current_date, now()
    )
    ON CONFLICT (id) DO UPDATE SET
      tab = EXCLUDED.tab, title = EXCLUDED.title, category = EXCLUDED.category,
      addr = EXCLUDED.addr, lat = EXCLUDED.lat, lng = EXCLUDED.lng,
      region_text = EXCLUDED.region_text, phone = EXCLUDED.phone,
      start_date = EXCLUDED.start_date, end_date = EXCLUDED.end_date,
      apply_start = EXCLUDED.apply_start, apply_end = EXCLUDED.apply_end,
      summary = EXCLUDED.summary, image = EXCLUDED.image, detail = EXCLUDED.detail,
      source_url = EXCLUDED.source_url, data_reference_date = EXCLUDED.data_reference_date,
      ingested_at = EXCLUDED.ingested_at;

    RETURN jsonb_build_object('ok', true, 'id', v_row.id, 'status', 'published');

  ELSE  -- rejected
    UPDATE public.explore_contributions
    SET status = 'rejected',
        reject_reason = nullif(left(btrim(coalesce(p_reject_reason, '')), 500), ''),
        reviewed_at = now(), reviewed_by = v_admin
    WHERE id = v_row.id;

    -- 이전에 게시됐던 건이면 미러 제거 (source 가드로 다른 소스 오삭제 방지)
    DELETE FROM public.explore_catalog
    WHERE id = v_mirror_id AND source = 'contribution';

    RETURN jsonb_build_object('ok', true, 'id', v_row.id, 'status', 'rejected');
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_review_contribution(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_review_contribution(uuid, text, text, text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
