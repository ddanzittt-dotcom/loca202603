-- ============================================================
-- Migration 049: 게이미피케이션 전면 제거 (009·010·011 teardown)
--
-- 배경: 레벨/XP/뱃지/souvenir UI는 2026-05에 제거됐고, 서버 기록
-- (record_map_action RPC)도 2026-07 앱 코드에서 제거됨. 관련 테이블과
-- RPC를 DB에서 정리한다. 행사(event) 시절의 체크인/완주 테이블도
-- 게이미피케이션 v2(010)의 일부라 함께 제거한다.
--
-- 적용 주의사항:
--   1. user_stats(누적 XP)·user_badges·user_souvenirs 의 사용자 데이터가
--      영구 삭제된다. 되돌릴 수 없다. 보존이 필요하면 실행 전 백업할 것.
--   2. 048 이후에 실행 (번호 순서).
--   3. 함수 시그니처가 프로젝트 이력에 따라 다를 수 있어 전 버전을 모두 DROP.
-- ============================================================

-- RPC (011 이 010 의 함수를 재정의했으므로 양쪽 시그니처 모두 제거)
DROP FUNCTION IF EXISTS public.get_game_profile(uuid);
DROP FUNCTION IF EXISTS public.record_map_action(text, text, uuid, uuid, jsonb);
DROP FUNCTION IF EXISTS public.submit_event_checkin(uuid, uuid, text, jsonb);
DROP FUNCTION IF EXISTS public.submit_event_checkin(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.submit_survey_reward(uuid, text);
DROP FUNCTION IF EXISTS public.maybe_reset_daily(uuid);
DROP FUNCTION IF EXISTS public.ensure_user_stats(uuid);
DROP FUNCTION IF EXISTS public.update_user_streak(uuid);

-- 테이블 (참조 순서: 이벤트/로그 → 뱃지 → 통계)
DROP TABLE IF EXISTS public.gamification_events;
DROP TABLE IF EXISTS public.event_checkins;
DROP TABLE IF EXISTS public.event_completions;
DROP TABLE IF EXISTS public.map_imports;
DROP TABLE IF EXISTS public.user_souvenirs;
DROP TABLE IF EXISTS public.user_badges;
DROP TABLE IF EXISTS public.user_stats;

NOTIFY pgrst, 'reload schema';
