-- 024: 인기 지도 큐레이션 플래그
-- 관리자가 Supabase 콘솔에서 직접 설정. UI에서 관리하지 않음.
-- 사용법: UPDATE maps SET is_curated = TRUE WHERE id = 'xxx-yyy';

ALTER TABLE maps ADD COLUMN IF NOT EXISTS is_curated BOOLEAN DEFAULT FALSE;
