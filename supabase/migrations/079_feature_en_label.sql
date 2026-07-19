-- 079: 장소 카드 영문 라벨 (공유 카드용)
-- 인스타 공유 카드(카드 A/B)의 장소명 위에 얹는 영문/로마자 라벨.
-- 예) 민둥산 / MINDUNGSAN. 선택 입력 — 비어 있으면 공유 카드에서 그 줄을 생략한다.
-- 사용자가 직접 입력·수정하는 자유 텍스트라 로마자 자동변환 의존성은 두지 않는다.
--
-- 적용 주의: 앱(079 대응 빌드) 배포 **전에** 라이브 DB에 먼저 적용해야 한다.
-- 미적용 상태로 새 빌드가 나가면 카드 편집 저장이 알 수 없는 컬럼(42703)으로 실패한다.

alter table public.map_features
  add column if not exists en_label text;

comment on column public.map_features.en_label is '장소 영문/로마자 라벨 (공유 카드 장소명 위 표기, 선택)';
