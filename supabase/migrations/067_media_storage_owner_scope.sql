-- ============================================================
-- 067_media_storage_owner_scope
-- [P0 / 출시 차단] 스토리지 미디어 "타인 파일 변조·삭제" 차단.
--
-- 배경:
--   041 의 media 버킷 UPDATE/DELETE 정책이 경로 접두(photos/%, voices/%)만
--   확인하고 "소유자"를 확인하지 않는다. 그래서 로그인한 아무 사용자나
--   다른 사용자의 photos/*, voices/* 객체를 덮어쓰거나(upsert) 삭제할 수 있었다.
--   (경로가 photos/<id> 로 uid 접두가 없어 경로만으로는 소유자 구분이 안 됐다.)
--
-- 방식:
--   Supabase Storage 는 authenticated 세션 업로드 시 storage.objects.owner 에
--   업로더 uid 를 자동 기록한다. 이를 이용해 UPDATE/DELETE 를 소유자로 제한한다.
--     - 앱 코드/업로드 경로 변경 불필요, 기존 파일 이전 불필요(owner 는 이미 기록됨).
--     - upsert 로 남의 객체를 덮어쓰려는 시도는 UPDATE 로 평가되어 차단된다.
--   READ(public)·INSERT 정책은 이번 마이그레이션에서 건드리지 않는다
--     (공개 열람 정책 = 2B 별도 결정. 발행/공유 미디어는 공개 열람이 전제라
--      섣불리 private 로 바꾸면 저장된 public_url 이 전부 깨진다).
--
-- 알려진 트레이드오프(경미):
--   협업 지도에서 협업자 B 가 소유자 A 가 올린 미디어를 지우면, feature_media
--   행(DB)은 지워지지만 storage blob 은 owner!=B 라 남는다(고아 blob). 데이터
--   손실/보안 문제는 아니며, 필요 시 후속으로 app-ownership(맵 소유자/created_by)
--   기반 폴백 정책 또는 정리 잡을 추가한다. (탈퇴 정리 053 은 postgres 롤이라 정상 삭제)
--
-- 적용 주의사항:
--   1. 041 이후(신규 067). Supabase SQL Editor(postgres 롤)에서 실행.
--   2. 적용 전 [사전점검]으로 owner NULL 레거시 객체 수를 확인한다. 다수면
--      소유자가 자기 파일을 못 지우는 회귀가 생기니, 그 경우 app-ownership 폴백을 추가.
--   3. 검증: 사용자 B 로 로그인 → 사용자 A 의 photos/<id> 삭제 시도 → 0 rows(실패)면 정상.
--      본인 파일 삭제는 정상 동작해야 한다.
-- ============================================================

-- [사전점검] 적용 전에 따로 실행해 결과 확인 (0 이면 안전):
--   SELECT count(*) AS null_owner_objects
--   FROM storage.objects
--   WHERE bucket_id = 'media' AND owner IS NULL;

-- 1) UPDATE: 소유자만 (경로 접두 확인 → 소유자 확인으로 교체)
DROP POLICY IF EXISTS "media_bucket_authenticated_update" ON storage.objects;
CREATE POLICY "media_bucket_authenticated_update"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (bucket_id = 'media' AND owner = auth.uid())
  WITH CHECK (bucket_id = 'media' AND owner = auth.uid());

-- 2) DELETE: 소유자만
DROP POLICY IF EXISTS "media_bucket_authenticated_delete" ON storage.objects;
CREATE POLICY "media_bucket_authenticated_delete"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (bucket_id = 'media' AND owner = auth.uid());

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- [적용 후 확인] 정책이 소유자 조건으로 바뀌었는지
-- ------------------------------------------------------------
-- SELECT policyname, cmd, qual
-- FROM pg_policies
-- WHERE schemaname = 'storage' AND tablename = 'objects'
--   AND policyname LIKE 'media_bucket_%';
-- ============================================================
