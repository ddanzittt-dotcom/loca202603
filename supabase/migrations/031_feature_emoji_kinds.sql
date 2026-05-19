-- 031_feature_emoji_kinds.sql
-- 장소 이모지에 unicode / pixel / photo 3가지 종류를 도입한다.
-- 기존 map_features.emoji TEXT 컬럼은 그대로 두고(unicode 폴백),
-- emoji_kind, emoji_pixel_id, emoji_photo_url 3개 컬럼을 추가한다.
--
-- 적용 주의사항:
--   1) 이 마이그레이션은 컬럼 추가만 하므로 무중단 적용 가능.
--   2) 적용 직후 클라이언트가 emoji_kind=null 인 row를 어떻게 다루는지는
--      앱 측 normalizeFeature 에서 처리 (null → 'unicode' 로 간주).
--   3) photo emoji 를 저장하려면 Storage 버킷 'media' 의
--      emoji-photos/ prefix 가 사용 가능해야 한다. 별도 RLS 없이 'media' 버킷의
--      기존 정책을 그대로 사용한다 (인증된 사용자 INSERT, public SELECT).
--   4) emoji_pixel_id 는 클라이언트 PIXEL_ART 카탈로그 id (예: 'px-heart')와 매칭.
--      카탈로그가 빌드에 포함되므로 DB 에 별도 lookup 테이블은 만들지 않는다.

ALTER TABLE map_features
  ADD COLUMN IF NOT EXISTS emoji_kind      TEXT,
  ADD COLUMN IF NOT EXISTS emoji_pixel_id  TEXT,
  ADD COLUMN IF NOT EXISTS emoji_photo_url TEXT;

-- emoji_kind 도메인 체크 (NULL 허용 — NULL 은 'unicode' 와 동등하게 취급)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'map_features_emoji_kind_check'
  ) THEN
    ALTER TABLE map_features
      ADD CONSTRAINT map_features_emoji_kind_check
      CHECK (emoji_kind IS NULL OR emoji_kind IN ('unicode', 'pixel', 'photo'));
  END IF;
END $$;

-- 기존 row 에 대해 명시적으로 emoji_kind='unicode' 백필 (가독성 목적, 동작상 필수 아님)
UPDATE map_features
SET emoji_kind = 'unicode'
WHERE emoji_kind IS NULL
  AND emoji IS NOT NULL
  AND emoji <> '';

-- 인덱스: pixel 카탈로그 사용량 집계용 (선택)
CREATE INDEX IF NOT EXISTS idx_map_features_emoji_pixel_id
  ON map_features (emoji_pixel_id)
  WHERE emoji_kind = 'pixel';

COMMENT ON COLUMN map_features.emoji_kind      IS '이모지 종류: unicode | pixel | photo (NULL = unicode 폴백)';
COMMENT ON COLUMN map_features.emoji_pixel_id  IS 'PIXEL_ART 카탈로그 id (emoji_kind=pixel 일 때 사용)';
COMMENT ON COLUMN map_features.emoji_photo_url IS '사진 맵핑 이모지의 Public URL (emoji_kind=photo 일 때 사용)';
