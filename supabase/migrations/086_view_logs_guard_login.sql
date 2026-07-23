-- ============================================================
-- 086_view_logs_guard_login
-- 목적: 카카오·구글 간편 로그인 도입에 따라 로그인 방식 계측 이벤트('login')를
--       view_logs 화이트리스트에 추가한다.
--
-- 배경:
--   081 의 view_logs_guard() 트리거는 화이트리스트 밖 event_type 을 **조용히 폐기**한다
--   (RETURN NULL — 클라이언트는 성공한 것처럼 보인다). 따라서 이 마이그레이션을 적용하기
--   전에는 앱이 login 이벤트를 보내도 한 건도 쌓이지 않는다. **앱 배포보다 먼저 적용할 것.**
--
-- 이벤트 형태:
--   event_type = 'login'
--   meta       = { "provider": "email" | "kakao" | "google", "isSignup": bool }
--   → /admin 에서 로그인 수단 비중·신규 가입 경로 분석에 사용.
--
-- 하는 일 (멱등):
--   081 의 view_logs_guard() 를 CREATE OR REPLACE 로 재정의하고 화이트리스트에 'login' 추가.
--   나머지 로직(meta 4096바이트 초과 시 '{}', source/session_id 길이 절단)은 081 과 동일.
--
-- 적용 주의사항:
--   1. 085 이후 신규 086. Supabase SQL Editor(postgres 롤)에서 실행.
--   2. 트리거 자체는 081 에서 이미 붙어 있으므로 함수만 교체하면 된다(아래 CREATE TRIGGER 는
--      멱등 보장을 위한 재생성 — 트리거가 유실된 환경에서도 안전).
--   3. 신규 이벤트 타입을 또 추가할 때는 이 파일이 아니라 다음 번호로 새 마이그레이션을 만들고,
--      src/lib/analytics.js 의 EVENT_TYPES 와 반드시 함께 갱신할 것.
--   4. 적용 후 확인:
--        select event_type, meta from public.view_logs
--         where event_type = 'login' order by created_at desc limit 20;
-- ============================================================

CREATE OR REPLACE FUNCTION public.view_logs_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- ★ 신규 이벤트 타입 추가 시 이 화이트리스트와 src/lib/analytics.js EVENT_TYPES 를 함께 갱신할 것
  IF NEW.event_type IS NULL
     OR length(NEW.event_type) > 40
     OR NEW.event_type NOT IN (
       'map_view',
       'qr_scan',
       'session_start',
       'session_end',
       'login',
       'collect',
       'walk_start',
       'explore_detail_view',
       'feature_create',
       'feature_click',
       'feature_view',
       'feature_view_end',
       'share_click',
       'place_card_share',
       'map_save',
       'map_like',
       'map_publish',
       'map_unpublish',
       'map_import',
       'map_add_to_profile',
       'map_remove_from_profile',
       'map_set_public',
       'map_set_unlisted',
       'follow_toggle',
       'feedback_submitted'
     )
  THEN
    RETURN NULL;  -- 조용히 폐기
  END IF;

  IF pg_column_size(NEW.meta) > 4096 THEN
    NEW.meta := '{}'::jsonb;
  END IF;

  NEW.source := left(NEW.source, 40);
  NEW.session_id := left(NEW.session_id, 64);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_view_logs_guard ON public.view_logs;
CREATE TRIGGER trg_view_logs_guard
BEFORE INSERT ON public.view_logs
FOR EACH ROW EXECUTE FUNCTION public.view_logs_guard();

NOTIFY pgrst, 'reload schema';
