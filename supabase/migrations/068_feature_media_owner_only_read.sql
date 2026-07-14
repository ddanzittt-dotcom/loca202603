-- ============================================================
-- 068_feature_media_owner_only_read
-- [P0 / 출시 차단] 개인 미디어(사진·음성)를 발행/공유해도 비공개로 유지.
--
-- 설계 확정:
--   "사진·음성 = 내 개인 기록은 지도를 공유해도 공유되지 않는다.
--    공유 지도엔 장소 정보(제목·한 줄 note·태그)만 담긴다."
--
-- 배경(공유 경로는 이미 개인 미디어를 제외한다):
--   - 자체포함 공유(/shared?data=): appUtils 에서 memos/photos/voices 제외
--   - 발행(/s/:slug): 스냅샷(map_features 만) 렌더 — 미디어 없음
--   그러나 데이터 층에 노출이 남아 있었다:
--   - 005 feature_media_select 가 "발행 지도(is_published)면 누구나 조회" 허용
--     → 발행 지도의 사진/음성 public_url 을 익명/타 계정이 REST 로 조회 가능
--   - 스냅샷 없는 레거시 발행 지도는 뷰어가 getMapBundle 로 폴백해 미디어 로드
--   media 버킷도 public 이라, 위로 새어나간 URL 은 로그인 없이 열린다.
--
-- 방식:
--   005 의 feature_media_select 에서 is_published 공개 분기를 제거하고
--   "지도 소유자"로만 제한한다. 052 의 created_by(내가 만든 카드) 분기와 OR
--   병존하므로 최종 조회 권한 = (지도 소유자) OR (카드 작성자) — 둘 다 로그인·본인 전제.
--   → 발행/공유 지도에서 개인 미디어는 데이터 층에서 완전히 비공개.
--
-- 영향:
--   - 공유 뷰어(스냅샷)는 원래 미디어를 안 쓰므로 변화 없음.
--   - 레거시 폴백(getMapBundle)으로 보던 발행 지도의 미디어는 이제 비노출(의도된 변경).
--   - 커뮤니티(모두의 지도)는 feature_media 대신 emoji_photo_url 사용 → 영향 없음.
--   - 협업자는 원래도 "발행 지도" 조건으로만 남의 미디어를 봤으므로 사실상 영향 미미.
--     (미공개 협업 지도의 미디어 공유가 필요하면 후속으로 map_collaborators 분기를 추가)
--
-- 적용 주의사항:
--   1. 005/052/067 이후(신규 068). Supabase SQL Editor(postgres 롤)에서 실행.
--   2. 검증: 익명 또는 타 계정으로 "발행된 남의 지도"의 feature_media 를 REST 조회 →
--      0 rows 면 정상. 본인은 본인 지도/카드의 미디어를 그대로 조회 가능해야 한다.
-- ============================================================

-- 005 의 공개(is_published) 분기 제거 → 지도 소유자로만 제한
DROP POLICY IF EXISTS "feature_media_select" ON public.feature_media;
CREATE POLICY "feature_media_select"
  ON public.feature_media
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.map_features mf
      JOIN public.maps m ON m.id = mf.map_id
      WHERE mf.id = feature_media.feature_id
        AND m.user_id = auth.uid()
    )
  );

-- 참고: 052 의 "feature_media_select_own_feature"(created_by = auth.uid()) 정책은
--       그대로 유지 → mapless 채집 카드의 미디어도 작성자 본인은 계속 조회 가능.

NOTIFY pgrst, 'reload schema';
