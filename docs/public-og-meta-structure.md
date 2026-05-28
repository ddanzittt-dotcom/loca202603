# LOCA Public OG Meta Structure

이 문서는 모두의 지도와 추천할지도 공유 카드용 메타 데이터 구조 초안이다.

## 대상

1. 추천할지도 상세: `/recommend/:slug`
2. 장소·길 기록 상세: 향후 `/records/:id` 또는 `/community/records/:id`
3. 모두의 지도 검색 결과: `/community-web?q=...`
4. 추천할지도 검색 결과: `/maps/search?q=...`

## 현재 구현 범위

- `src/lib/publicOgMeta.js`에 메타 구성 함수를 추가했다.
- React/Vite 클라이언트에서 `document.title`, `og:*`, `twitter:*` meta를 갱신한다.
- `/recommend/:slug`는 demo data 기준으로 초기 진입 시에도 메타를 구성한다.
- SPA 내부 검색어 변경 시 모두의 지도/추천할지도 검색 메타를 갱신한다.

## OG 규칙

### 추천할지도 상세

- title: `{추천지도 제목} | LOCA 추천할지도`
- description: `subtitle || description || reason`
- image: `cover_image_url || cover_image || /icons/icon-512.png`
- url: `/recommend/:slug`
- type: `article`

필요 필드:

- `title`
- `slug`
- `subtitle`
- `description`
- `reason`
- `cover_image_url`
- `cover_image`

### 장소·길 기록 상세

- title: `{기록 제목} | LOCA 모두의 지도`
- description: `intro || note || description`
- image: `photo_url || fallback`
- type: `article`

fallback 규칙:

- 사진이 있으면 `photo_url`
- 사진이 없으면 pixel marker + 제목 기반 카드
- 현재는 `/icons/icon-512.png`를 안전 fallback으로 사용
- 향후 동적 이미지 endpoint 예시: `/api/og/public-record?title=...&icon=...`

필요 필드:

- `title`
- `intro` 또는 `description`
- `photo_url`
- `pixel_icon_key`
- `type`
- `public_url`

### 모두의 지도 검색 결과

- title: `{검색어} | LOCA 모두의 지도`
- description: `사람들이 남긴 장소와 길을 지도에서 찾아보세요.`
- image: `/icons/icon-512.png`
- url: `/community-web?q=...`

### 추천할지도 검색 결과

- title: `{검색어} | LOCA 추천할지도`
- description: `릴스에서 소개한 추천지도를 모아두는 지도 검색 코너`
- image: `/icons/icon-512.png`
- url: `/maps/search?q=...`

## Vite SPA 한계

카카오톡, Threads, Instagram DM 크롤러는 대개 서버가 처음 내려주는 HTML의 meta를 읽는다. 클라이언트에서 `document.head`를 갱신하는 방식은 브라우저 탭/일부 봇에서는 보이지만, 카카오톡 공유 카드에서는 안정적이지 않을 수 있다.

## 실제 운영 TODO

- Vercel/서버/Edge Function에서 `/recommend/:slug`, `/community-web`, `/maps/search`, 기록 상세 URL 요청 시 HTML meta를 서버에서 주입한다.
- fallback OG 이미지 생성 endpoint를 만든다.
  - 추천지도: cover image가 없으면 추천지도 제목 + 지역 + 키워드 카드
  - 기록: pixel marker + 제목 + 장소/길 badge 카드
- 추천지도/기록 상세 데이터를 서버에서 조회할 수 있는 public read API를 만든다.
- Instagram DM 자동화 유입에는 `source_context=instagram_reel_dm`, `reel_id`, `slug`를 함께 추적한다.
