-- 078: 표지 사진 초점(focus) 좌표
-- 카드 바인더·공유 카드의 표지 사진은 object-fit: cover 로 프레임을 채우는데,
-- 지금까지는 항상 중앙 크롭이라 사용자가 원하는 부분이 잘려나갔다.
-- 사진마다 초점 좌표(0~100%)를 저장해 두 카드가 같은 초점으로 크롭되게 한다.
-- NULL = 저장된 초점 없음(중앙 50/50 로 렌더).
--
-- 적용 주의: 앱 코드(078 대응 빌드) 배포 **전에** 이 마이그레이션을 라이브 DB에
-- 먼저 적용해야 한다. 미적용 상태에서 새 빌드가 나가면 사진 변경/위치 저장이
-- 알 수 없는 컬럼 에러(42703)로 실패한다.

alter table public.map_features
  add column if not exists emoji_photo_focus_x smallint
    check (emoji_photo_focus_x is null or (emoji_photo_focus_x between 0 and 100)),
  add column if not exists emoji_photo_focus_y smallint
    check (emoji_photo_focus_y is null or (emoji_photo_focus_y between 0 and 100));

comment on column public.map_features.emoji_photo_focus_x is '표지 사진 초점 X (object-position %, 0~100, NULL=중앙)';
comment on column public.map_features.emoji_photo_focus_y is '표지 사진 초점 Y (object-position %, 0~100, NULL=중앙)';
