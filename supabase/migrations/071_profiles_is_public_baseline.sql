-- ============================================================
-- 071_profiles_is_public_baseline
-- [#5 재현성] profiles.is_public 을 fresh replay 에서도 존재하도록 보장 + 공개 SELECT 부여.
--
-- 배경:
--   is_public 은 046(레포에서 제거된 웹 MVP 마이그레이션)에서 추가됐다가 048 에서 DROP,
--   058 이 다시 GRANT 하는 구조라 fresh replay 가 058 에서 "컬럼 없음"으로 중단됐다.
--   (라이브엔 컬럼이 존재해 지금까지 문제 없었음 — 전형적 마이그레이션 드리프트, #5.)
--   058 의 GRANT 목록에서 is_public 을 제거(058 파일 수정)하고, 이 마이그레이션에서
--   컬럼 생성 + GRANT 를 멱등으로 처리해 replay 순서를 바로잡는다.
--
-- 방식(멱등 — 라이브/신규 환경 모두 안전):
--   - ADD COLUMN IF NOT EXISTS  → 라이브엔 이미 존재하므로 no-op.
--   - GRANT SELECT (is_public)   → 재부여(무해).
--
-- 참고: is_public 은 현재 앱 로직에서 소비되지 않는 예비 컬럼(공개 프로필 토글 여지).
--   삭제하지 않고 스키마에 명시적으로 남겨 재현성만 확보한다. 향후 공개 프로필 기능에서
--   실제로 게이팅에 쓸 때 소비 로직을 추가하면 된다.
--
-- 적용 주의사항:
--   1. 070 이후(신규 071). Supabase SQL Editor(postgres 롤). 라이브에선 사실상 no-op.
--   2. 검증: fresh 환경에서 002~071 을 순서대로 재생 시 058 에서 더 이상 멈추지 않아야 한다.
--      라이브: 아래 실행 후 에러 없이 통과하면 정상.
-- ============================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT false;

GRANT SELECT (is_public) ON public.profiles TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
