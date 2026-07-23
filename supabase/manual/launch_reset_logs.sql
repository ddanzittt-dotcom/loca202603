-- ============================================================
-- 출시 전 로그 초기화 (2026-07-19)
--
-- 범위(사용자 결정): "내 계정 + 모든 콘텐츠는 유지, 로그만 리셋".
--   - 삭제: view_logs(조회·방문 분석 로그)  ← 대시보드 트래픽/조회 수치가 0으로 리셋
--   - 선택 삭제: user_feedback(치즈냥 테스트 피드백)  ← 피드백 탭까지 비우려면
--   - 보존: profiles(계정)·maps·map_features(카드)·feature_memos(기록)·
--           feature_media(사진)·map_publications(발행)·map_saves·follows·
--           map_collaborators·community_records·explore_catalog(참조 26,546건) 등 전부.
--
-- ⚠️ 되돌릴 수 없음. 실행 위치: Supabase SQL Editor (postgres 롤).
-- ⚠️ 반드시 STEP 1(개수 확인)을 먼저 실행해 규모를 눈으로 보고 나서 STEP 2로 진행.
--
-- 참고: view_logs 는 실제 사용자가 방문하면 즉시 다시 쌓이기 시작한다(정상).
--       기존 일일 정리 스케줄(loca_prune_old_view_logs_daily)과 충돌 없음.
-- ============================================================

-- ── STEP 1) 삭제 전 개수 확인 (먼저 이 블록만 실행) ────────────
SELECT 'view_logs'     AS table_name, count(*) AS rows FROM public.view_logs
UNION ALL
SELECT 'user_feedback' AS table_name, count(*) AS rows FROM public.user_feedback;


-- ── STEP 2) 분석 로그 삭제 ("로그만 리셋"의 핵심) ─────────────
--   위 개수를 확인했다면 아래 트랜잭션을 실행한다.
BEGIN;
  DELETE FROM public.view_logs;
COMMIT;


-- ── STEP 3) (선택) 테스트 피드백 삭제 — 피드백 탭도 비우려면 ──
--   피드백 기록을 남겨두고 싶으면 이 블록은 건너뛴다.
BEGIN;
  DELETE FROM public.user_feedback;
COMMIT;


-- ── STEP 4) 재확인 (삭제한 테이블이 0 이면 정상) ─────────────
SELECT 'view_logs'     AS table_name, count(*) AS rows FROM public.view_logs
UNION ALL
SELECT 'user_feedback' AS table_name, count(*) AS rows FROM public.user_feedback;
