-- ============================================================
-- Migration 053: 회원탈퇴 RPC (delete_my_account)
--
-- 배경:
--   개인정보보호법상 탈퇴(동의 철회)는 가입만큼 쉬워야 하지만
--   앱에는 계정 삭제 수단이 없었다 (로그아웃만 존재).
--   auth.users 삭제는 클라이언트 anon 키로 불가능하므로
--   SECURITY DEFINER RPC 로 제공한다.
--
-- 동작:
--   1. 호출자 본인(auth.uid())만 삭제 가능 — 파라미터 없음, 위임 불가
--   2. 본인 업로드 미디어(카드 사진/음성, 기록 사진)의 storage.objects 행 정리
--      (실패해도 탈퇴는 진행 — 예외 가드)
--   3. auth.users 행 삭제 → FK cascade 로 나머지 전부 정리:
--      - profiles → maps → map_publications / map_features → feature_memos / feature_media
--      - follows, map_collaborators, user_saved_recommend_maps, user_saved_records
--      - community_records.auth_user_id / view_logs.viewer_id 등은 SET NULL (익명화되어 잔존)
--
-- 적용 주의사항:
--   1. 052 이후 실행 (신규 번호 053). Supabase SQL Editor 에서 실행.
--   2. SQL Editor(postgres 롤)에서 실행해야 함수 owner 가 postgres 가 되어
--      auth.users / storage.objects 접근 권한이 확보된다.
--      만약 실행 시 "permission denied for table users" 가 나면
--      Supabase 지원 문서의 delete-user 패턴대로 Edge Function(service_role) 방식으로 대체할 것.
--   3. storage.objects 행 삭제는 파일을 API 에서 접근 불가로 만든다.
--      (원본 blob 은 Supabase 내부 정리 대상 — 외부 노출 경로 없음)
--   4. 검증: 테스트 계정 로그인 → 지도/카드/사진 생성 → 계정 화면에서 탈퇴 →
--      (a) 재로그인 불가, (b) maps/profiles 에서 해당 uid 행 0건,
--      (c) 본인이 만든 커뮤니티 기록은 auth_user_id NULL 로 잔존 확인.
--   5. 롤백: DROP FUNCTION public.delete_my_account();
-- ============================================================

CREATE OR REPLACE FUNCTION public.delete_my_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- 1) 본인 업로드 미디어의 storage 행 정리 (권한 문제 등으로 실패해도 탈퇴는 계속)
  BEGIN
    -- 카드(feature)에 붙은 사진/음성: 내 지도의 카드 + 내가 만든(mapless 포함) 카드
    DELETE FROM storage.objects o
    USING public.feature_media fm
    JOIN public.map_features mf ON mf.id = fm.feature_id
    LEFT JOIN public.maps m ON m.id = mf.map_id
    WHERE o.bucket_id = 'media'
      AND o.name = fm.storage_path
      AND (mf.created_by = v_uid OR m.user_id = v_uid);

    -- 기록(memo)에 첨부한 사진: 내 기록의 photo_urls 에서 storage 경로 추출
    DELETE FROM storage.objects o
    WHERE o.bucket_id = 'media'
      AND o.name IN (
        SELECT split_part(regexp_replace(url.value, '^.*/object/public/media/', ''), '?', 1)
        FROM public.feature_memos fm2,
             LATERAL jsonb_array_elements_text(fm2.photo_urls) AS url(value)
        WHERE fm2.user_id = v_uid
          AND url.value LIKE '%/object/public/media/%'
      );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'delete_my_account: storage cleanup skipped (%)', SQLERRM;
  END;

  -- 2) auth 계정 삭제 → profiles ON DELETE CASCADE 로 앱 데이터 연쇄 정리
  DELETE FROM auth.users WHERE id = v_uid;
END;
$$;

-- 본인 인증된 사용자만 호출 가능
REVOKE ALL ON FUNCTION public.delete_my_account() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_my_account() FROM anon;
GRANT EXECUTE ON FUNCTION public.delete_my_account() TO authenticated;
