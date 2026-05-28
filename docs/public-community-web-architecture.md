# LOCA 웹 모두의 지도 MVP 구성 정리

작성일: 2026-05-24

## MVP 작업 브리프

이 문서는 앱과 별도로 접근 가능한 `LOCA 웹 모두의 지도 MVP`를 정리하기 위한 기준 문서다.

핵심 방향:

- 웹은 편집 도구가 아니라 발견, 검색, 저장, 제보의 입구다.
- 앱은 저장한 장소와 길을 바탕으로 내 지도를 편집하고, 공유하고, 협업하고, 꾸미는 본체다.
- 웹 기본값은 비로그인처럼 보여야 한다.
- 사용자는 처음부터 로그인하지 않고도 모두의 지도와 추천할지도를 보고, 검색하고, 공유하고, 저장할 수 있어야 한다.
- 단, 저장 데이터는 `localStorage-only`가 아니라 서버에 저장되어야 한다.
- 비로그인 저장은 guest/anonymous user 기반 서버 저장으로 구현한다.
- 사용자가 저장함을 연결하면 이메일 매직링크 또는 향후 카카오 로그인으로 정식 계정과 연결한다.
- 저장함 연결 후에는 기존 guest/anonymous 저장 데이터를 auth user 저장 데이터로 이관한다.
- 추천할지도는 인스타 릴스 콘텐츠로 제작된 추천지도들을 모아두는 코너다.
- 모두의 지도는 원천 장소·길 기록이 쌓이는 지도다.
- 추천할지도는 그 원천 기록 또는 에디터 큐레이션을 지도 콘텐츠로 묶은 것이다.
- 영역/일대 작성은 공개 MVP에서 제외한다.
- 길은 유지하되, MVP에서는 지도에 선을 그리지 않고 대표 위치 1개 + 설명 + 키워드로 남긴다.
- 지도 위에는 단순하게, 카드 안에는 풍부하게 보여준다.
- 픽셀 이미지 마커를 사용하되, UI 전체를 픽셀 게임처럼 만들지 않는다.
- 추천할지도 릴스 콘텐츠는 댓글 자동 DM으로 웹 링크를 보낼 수 있도록 `source_context`와 `reel_id`를 추적할 수 있게 설계한다.
- 실제 Instagram API/DM 자동화는 이번 구현 범위에서 제외하고, 링크 유입 추적 구조만 준비한다.

작업 원칙:

- 한 번에 전체를 갈아엎지 않고 단계별로 수정한다.
- 기존 앱 라우팅과 앱 `NaverMap` 사용처를 깨지 않는다.
- 공개 웹 스타일은 `src/styles/public-community.css` 중심으로 수정한다.
- service role key 또는 관리자 권한은 프론트에 노출하지 않는다.
- Supabase RLS에서 anon Postgres role과 Supabase Auth anonymous user를 혼동하지 않는다.
- 변경 후 파일별 요약과 다음 TODO를 보고한다.

## 목적

`loca.im`에 앱과 별도로 접근 가능한 공개 웹 화면을 만들기 위한 초안이다.

현재 목표는 다음과 같다.

- 비로그인 사용자도 모두의 지도 화면에 접근
- 지도 위에서 앱처럼 장소, 길, 영역을 직접 맵핑
- 현재 위치 기준 근처 작성 제한 UX 검증
- 추후 Supabase 저장과 실시간 반영 연결을 쉽게 할 수 있는 구조 확보
- 지도 검색 웹페이지의 기본 프레임 확보

## 진입 경로

현재 공개 웹 화면은 `src/main.jsx`에서 앱 라우팅보다 먼저 분기한다.

- `/community-web`
  - 공개 모두의 지도 웹페이지
  - `PublicCommunityPage page="community"` 렌더링

- `/maps/search`
  - 공개 지도 검색 웹페이지
  - `PublicCommunityPage page="search"` 렌더링

그 외 경로는 기존 앱 `App`으로 진입한다.

관련 파일:

- `src/main.jsx`
- `src/screens/PublicCommunityPage.jsx`
- `src/styles/public-community.css`

## 주요 파일

### `src/screens/PublicCommunityPage.jsx`

공개 웹페이지의 핵심 화면이다.

포함하는 주요 요소:

- `CommunityWebPage`
  - `/community-web` 화면
  - 지도 중심의 모두의 지도 웹 UI
  - 장소, 길, 영역 작성 흐름
  - 현재 위치 확인
  - 검색 필터
  - 로컬 임시 기록 추가

- `SearchWebPage`
  - `/maps/search` 화면
  - 공개 지도 검색 프레임
  - Supabase 연결 시 `getPublishedMaps(24)` 사용
  - 연결이 없으면 `demoMaps` 사용

- `PublicMapCanvas`
  - 기존 `NaverMap` 컴포넌트를 재사용
  - `draftMode`, `draftPoints`, `onMapTap`을 넘겨 앱과 비슷한 지도 맵핑 흐름 구현

- `ComposerCard`
  - 지도 안 하단 오버레이 작성 패널
  - 장소, 길, 영역 선택
  - 이름, 설명 입력
  - 마지막 점 취소
  - 초기화
  - 장소 남기기 / 길 완성하기 / 영역 완성하기 버튼

### `src/styles/public-community.css`

공개 웹 화면 전용 스타일이다.

현재 UX 방향:

- 거지맵처럼 진입 즉시 지도 중심
- 설명성 히어로는 제거
- 상단 정보는 지도 위 작은 오버레이로 압축
- 검색창, 위치 확인 안내, 작성 패널 모두 지도 안 오버레이로 배치
- 모바일에서도 지도 중심 사용성을 우선

## 현재 구현된 동작

### 장소 작성

1. `장소` 선택
2. 지도 클릭
3. 임시 핀 생성
4. 이름 입력
5. `장소 남기기` 클릭
6. 현재 페이지의 로컬 상태 `localFeatures`에 추가

### 길 작성

1. `길` 선택
2. 지도에서 점을 2개 이상 클릭
3. `마지막 점 취소` 또는 `초기화` 가능
4. `길 완성하기` 클릭
5. 현재 페이지의 로컬 상태 `localFeatures`에 추가

### 영역 작성

1. `영역` 선택
2. 지도에서 꼭짓점을 3개 이상 클릭
3. `마지막 점 취소` 또는 `초기화` 가능
4. `영역 완성하기` 클릭
5. 현재 페이지의 로컬 상태 `localFeatures`에 추가

## 데이터 흐름

현재는 실제 저장 전 단계다.

읽기:

- Supabase 환경이 있으면 `getCommunityMapBundle()` 호출
- 성공 시 실제 `community-map` 번들 사용
- 실패하거나 환경이 없으면 `communityMapFeaturesSeed` 사용

쓰기:

- 아직 Supabase에 저장하지 않는다.
- 완성된 기록은 브라우저 메모리의 `localFeatures`에만 추가된다.
- 새로고침하면 로컬 추가분은 사라진다.

## 근처 작성 제한

현재 위치 확인은 브라우저 `navigator.geolocation`을 사용한다.

구현된 제한:

- 현재 위치가 있으면 지도에 찍은 점이 2km 밖인지 검사
- 2km 밖이면 작성 흐름에서 메시지 표시
- 현재 위치 좌표는 서버에 저장하지 않는 방향으로 설계

주의:

- 현재 단계에서는 클라이언트 UX 검증용 제한이다.
- 실제 운영에서는 서버 쪽 검증 또는 최소한의 rate limit, 신고, 숨김 기능이 필요하다.

## 기존 앱 컴포넌트 재사용

웹 모두의 지도는 기존 `NaverMap`을 재사용한다.

사용하는 props:

- `features`
- `selectedFeatureId`
- `draftPoints`
- `draftMode`
- `focusPoint`
- `fitTrigger`
- `onMapTap`
- `onFeatureTap`
- `showLabels`
- `myLocation`

장점:

- 앱 지도와 같은 렌더링 규칙 사용
- 장소, 길, 영역 표시 방식 재사용
- 클러스터, 라벨, 초안 선/영역 표시 흐름 재사용

## 지도 검색 페이지

경로: `/maps/search`

현재 기능:

- 검색 입력
- 공개 지도 카드 목록
- Supabase 환경이 있으면 `getPublishedMaps(24)` 호출
- 없으면 `demoMaps` 표시
- slug가 있는 지도는 `/s/:slug`로 이동
- slug가 없으면 `/community-web`로 이동

## 아직 미구현인 부분

다음 단계에서 연결할 항목:

- Supabase `map_features` 실제 insert
- 익명 작성용 세션 ID 생성
- IP hash 또는 rate limit 정책
- 신고하기
- 관리자 숨김/삭제
- Realtime 구독
- 작성 완료 후 앱의 모두의 지도에 즉시 반영
- 약관/동의 문구 정식화
- 사진/링크 업로드 제한 정책
- 비로그인 작성 횟수 제한

## 추천 다음 단계

1. `createCommunityFeatureAnonymous()` 같은 별도 쓰기 함수 추가
2. Supabase RLS 또는 RPC로 익명 작성 가능 범위 정의
3. `community-map`에만 비로그인 insert 허용
4. 클라이언트에서 2km 검사 유지
5. 서버에서도 좌표/세션/rate limit 검증
6. `map_features.status` 또는 별도 moderation 필드로 `visible`, `hidden`, `pending` 구분
7. 앱의 모두의 지도 화면에 Supabase Realtime 구독 연결

## 현재 설계 판단

현재 프레임은 “먼저 마찰 없이 많이 모으는 실험”에 맞춰져 있다.

다만 운영 전에는 최소한 다음 안전장치는 필요하다.

- 위치 권한 안내
- 현재 위치 미저장 고지
- 작성 내용 공개 고지
- 신고/숨김
- 스팸 rate limit
- 관리자 도구
