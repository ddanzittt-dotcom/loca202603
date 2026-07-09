-- ============================================================
-- 060_profiles_demographics
-- 회원가입 직후 온보딩에서 (선택) 연령대·거주 광역시도를 받아 profiles 에 저장한다.
-- 판매 가능 데이터(가명·익명 집계)의 "교차 축"으로만 쓰이며, 개별 노출 대상이 아니다.
--
-- 설계 원칙:
--   - 최소·거칠게: 연령대(10s~60s+)와 광역시도(17개)만. 생년월일/기초시군구/주소 X.
--   - 선택 입력: 온보딩에서 건너뛰기 가능(null 허용).
--   - 수집 방식: 가입폼이 아니라 가입 직후 온보딩 1스텝(본인이 profiles UPDATE).
--
-- ⚠️ 비공개 컬럼:
--   058 에서 profiles 공개 SELECT 를 명시 컬럼 목록으로 제한했다. age_band/region_sido 는
--   그 목록에 추가하지 않는다 → anon/authenticated 는 타인은 물론 본인 값도 API 로 직접
--   조회할 수 없다(인구통계가 공개 열거되면 판매용 익명화 취지에 반함).
--   집계는 admin RPC(057 등, SECURITY DEFINER = 소유자 권한)로만 접근한다.
--   UPDATE 는 테이블 기본 권한(058 은 SELECT 만 건드림) + 소유자 RLS 로 본인 행만 가능.
--
-- ⚠️ 적용 순서: 059 다음. 059(동의)와 독립적이라 함께 적용해도 무방. 신규 migration 은 061 부터.
-- ============================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS age_band     text,
  ADD COLUMN IF NOT EXISTS region_sido  text;

-- 정규 토큰만 허용(오염 방지). null 은 항상 허용(미입력/건너뛰기).
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_age_band_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_age_band_check
  CHECK (age_band IS NULL OR age_band IN ('10s','20s','30s','40s','50s','60s+'));

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_region_sido_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_region_sido_check
  CHECK (region_sido IS NULL OR region_sido IN (
    '서울','부산','대구','인천','광주','대전','울산','세종',
    '경기','강원','충북','충남','전북','전남','경북','경남','제주'
  ));

COMMENT ON COLUMN public.profiles.age_band    IS '연령대(선택): 10s/20s/30s/40s/50s/60s+ — 온보딩 수집, 집계 교차축';
COMMENT ON COLUMN public.profiles.region_sido IS '거주 광역시도(선택): 17개 시도명 — 온보딩 수집, 집계 교차축';

NOTIFY pgrst, 'reload schema';
