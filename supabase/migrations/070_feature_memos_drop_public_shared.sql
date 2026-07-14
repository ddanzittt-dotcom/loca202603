-- ============================================================
-- 070_feature_memos_drop_public_shared
-- [P0 / 출시 차단] 069 보완 — 드리프트된 "공개 메모 조회" 정책 제거.
--
-- 배경:
--   068/069 적용 후 pg_policies 검증에서, repo 마이그레이션에 없는 정책이
--   라이브 DB 에 존재함을 발견:
--     - feature_memos "memos_select_public_shared" (USING: is_map_publicly_viewable(...))
--       → 공개(publicly viewable) 지도의 메모를 "누구나(익명 포함)" 조회 허용.
--   RLS 정책은 permissive(OR) 라, 069 로 memos_select_visible_or_owner 를 소유자
--   전용으로 조여도 이 정책이 남아 있으면 메모(개인 기록)가 여전히 공개된다.
--   이 정책과 is_map_publicly_viewable 함수는 repo 어디에도 없다 → 마이그레이션 드리프트
--   (제거된 마이그레이션 또는 대시보드 직접 생성). #5(DB 재현성)와 연결된 증상.
--
-- 방식:
--   공개 메모 조회 정책만 제거한다. 남는 feature_memos SELECT 정책은 전부
--   인증·소유/협업 스코프라 익명/무관 사용자 조회가 불가능해진다:
--     - memos_select_visible_or_owner       (069: 지도 소유자)
--     - memos_select_own_feature            (052: 카드 작성자)
--     - memos_select_personal_collaborator  (039: 소유자/수락 협업자 — can_view_personal_map)
--     - memos_select_dashboard_scope        (022: 소유자/플랫폼관리자 — org 없으면 owner+admin)
--     - memos_select_event_collaborator     (023: category='event' 전용, B2C 매칭 0 → dead)
--
-- 참고:
--   - feature_media 는 검증상 공개 정책이 없다(068 로 소유자/작성자/협업자만) → 추가 조치 불필요.
--   - is_map_publicly_viewable 함수 자체는 다른 곳에서 참조될 수 있어 남겨둔다(정책만 제거).
--   - #5 진행 시 라이브 DB ↔ repo 정책/함수 드리프트 전수 재조정 필요(추가 드리프트 가능성).
--
-- 적용 주의사항:
--   1. 069 이후(신규 070). Supabase SQL Editor(postgres 롤). 멱등(IF EXISTS).
--   2. 재검증: 아래 쿼리에서 memos_select_public_shared 가 사라지고, feature_memos 의
--      어떤 SELECT 정책 qual 에도 is_map_publicly_viewable / visibility 공개분기가 없어야 정상.
--        SELECT policyname, qual FROM pg_policies
--        WHERE schemaname='public' AND tablename='feature_memos' AND cmd='SELECT';
-- ============================================================

DROP POLICY IF EXISTS "memos_select_public_shared" ON public.feature_memos;

NOTIFY pgrst, 'reload schema';
