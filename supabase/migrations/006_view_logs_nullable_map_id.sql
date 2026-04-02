-- view_logs.map_id를 nullable로 변경
-- 앱 전역 이벤트(follow_toggle 등)는 map_id가 없다.

ALTER TABLE public.view_logs ALTER COLUMN map_id DROP NOT NULL;

-- FK constraint는 유지 (map_id가 있으면 유효한 maps.id여야 함)
