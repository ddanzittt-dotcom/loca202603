# LOCA UI 플로우 맵 + 화면별 컴포넌트 매핑

> 이 문서는 다른 AI 또는 새 팀원에게 LOCA 앱의 화면 구조와 사용자 흐름을 이해시키기 위한 것이다.
> 코드 구조는 `CLAUDE.md` 참조. 이 문서는 **화면 간 이동 흐름**과 **컴포넌트 관계**에 집중한다.

---

## 1. 앱 진입점과 라우팅

```
URL 접속
  │
  ├─ /s/:slug (또는 /s/:slug?utm_source=qr)
  │   → [봇 UA] api/og/[slug].js → OG HTML 반환
  │   → [일반]  App.jsx → sharedMapData 로딩 → SharedMapViewer (전용 화면)
  │
  ├─ /shared?data=v2:... (비발행 지도 공유)
  │   → App.jsx → sharedMapData 디코딩 → SharedMapViewer
  │
  ├─ /share-target (Web Share Target API)
  │   → App.jsx → pendingSharePlace → SharePlaceSheet
  │
  └─ / (일반 접속)
      → App.jsx → 탭 네비게이션 (홈)
```

**핵심 분기**: `sharedMapData`가 있으면 탭 UI를 건너뛰고 `SharedMapViewer`만 렌더링한다.

---

## 2. 메인 앱 화면 구조

```
┌─────────────────────────────────────────┐
│  top-bar: "LOCA" 브랜드 + 컨텍스트 버튼  │
├─────────────────────────────────────────┤
│                                         │
│              <main> 영역                │
│   (activeTab에 따라 한 화면씩 렌더링)     │
│                                         │
├─────────────────────────────────────────┤
│  BottomNav: ⌂홈 🗺지도 📍장소 ⌕검색 ☺프로필  │
└─────────────────────────────────────────┘
         + 바텀시트들 (오버레이)
         + Toast (하단 알림)
         + 오프라인 배너 (상단)
```

---

## 3. 탭별 화면과 전환 플로우

### 3.1 홈 탭 (`activeTab === "home"`)

```
HomeScreen
  ├─ 추천 지도 카드 목록 (demoMaps)
  │   └─ 카드 탭 → openDemoMap() → 에디터(readOnly)
  │
  └─ 커뮤니티 지도 미리보기
      └─ 탭 → openCommunityMapEditor() → 에디터(communityMode)
```

**컴포넌트**: `HomeScreen.jsx` → `MapPreview` (ui.jsx)

---

### 3.2 지도 탭 (`activeTab === "maps"`)

지도 탭은 두 가지 뷰를 가진다:

```
┌──────────────────┐      ┌──────────────────────────────────────────┐
│  MapsListScreen  │      │           MapEditorScreen                │
│  (mapsView=list) │─────>│           (mapsView=editor)              │
│                  │      │                                          │
│  ┌─ 내 지도 목록 ┐│      │  ┌─ NaverMap (지도 캔버스)                │
│  │ 카드1  [편집] ││ 열기  │  │  + 핀/경로/범위 렌더링                 │
│  │ 카드2  [편집] ││─────>│  │  + 내 위치 캐릭터 마커                 │
│  │ 카드3  [편집] ││      │  │  + 드래프트 그리기                     │
│  └───────────────┘│      │  └────────────────────────────────────── │
│                   │      │  ┌─ 상단 검색창 (주소/지명)               │
│  [+ 새 지도 만들기]│      │  ├─ 플로팅 액션 (위치/라벨/핀/경로/범위)   │
│   → MapFormSheet │      │  ├─ 필터 바 (전체/핀/경로/범위)            │
│                   │      │  ├─ 목록 스트립 (가로 스크롤)              │
│  [편집] 버튼       │      │  ├─ 피처 요약 카드 (선택 시)              │
│   → MapFormSheet │      │  ├─ 공유 버튼 🔗 → ShareSheet            │
└──────────────────┘      │  ├─ 공지 버튼 📢 → AnnouncementSheet     │
       ↑                  │  └─ ← 뒤로 → MapsListScreen              │
       │                  └──────────────────────────────────────────┘
    뒤로가기
```

**에디터 모드 종류** (`editorMode`):
- `browse`: 기본 (탐색)
- `pin`: 맵 탭 → 새 핀 생성
- `route`: 맵 탭 → 경로 점 추가
- `area`: 맵 탭 → 범위 점 추가
- `relocate`: 맵 탭 → 기존 핀 위치 변경

---

### 3.3 장소 탭 (`activeTab === "places"`)

```
PlacesScreen
  ├─ 검색 입력
  ├─ 전체 피처 목록 (모든 지도의 핀/경로/범위)
  │   └─ 항목 탭 → openFeatureFromPlaces()
  │       → 해당 지도 에디터 열기 + 피처 선택 + FeatureDetailSheet
  └─ EmptyState (피처 0개일 때)
```

---

### 3.4 검색 탭 (`activeTab === "search"`)

```
SearchScreen
  ├─ 사용자 검색 입력
  ├─ 유저 카드 목록
  │   ├─ 프로필 탭 → UserProfileSheet
  │   └─ [팔로우/팔로잉] 버튼
  └─ EmptyState (결과 없음)
```

---

### 3.5 프로필 탭 (`activeTab === "profile"`)

```
ProfileScreen
  ├─ 프로필 헤더 (아바타, 이름, 핸들)
  ├─ 캐릭터 선택 (남/녀)
  ├─ 발행 지도 그리드
  │   └─ 지도 탭 → PostDetailSheet
  ├─ [프로필에 지도 올리기] → PublishSheet
  ├─ [로그아웃] (cloudMode일 때)
  ├─ [로컬 데이터 가져오기] (cloudMode + 로컬 데이터 있을 때)
  └─ [초대코드 입력] (B2B 접근용)
      └─ 코드 입력 → redeemInvitationCode → hasB2BAccess = true
```

---

## 4. 바텀시트 전체 목록

App.jsx에서 모든 바텀시트를 관리한다. 화면 위에 오버레이로 표시된다.

| 바텀시트 | 트리거 | 내용 |
|----------|--------|------|
| **MapFormSheet** | 지도 목록 [+ 새 지도] 또는 [편집] 버튼 | 지도 제목/설명/테마/카테고리 입력. B2B일 때 템플릿 선택 |
| **FeatureDetailSheet** | 피처 더블탭 또는 [상세보기] | 이름/내용/아이콘/태그/위치 편집. 사진/음성/메모 CRUD |
| **ShareSheet** | 에디터 🔗 버튼 | QR 프리뷰+다운로드, 링크 복사, 카카오 공유, 이미지 공유 |
| **AnnouncementSheet** | 에디터 📢 버튼 (이벤트 지도만) | 공지 목록/생성/수정/토글/삭제/미리보기 |
| **PublishSheet** | 프로필 [프로필에 지도 올리기] | 미발행 지도 선택 + 한마디 입력 → 발행 |
| **UserProfileSheet** | 검색 탭에서 유저 탭 | 유저 프로필 + 발행 지도 목록 |
| **PostDetailSheet** | 프로필/홈에서 포스트 탭 | 발행된 지도 상세 (좋아요, 지도 열기, 공유 해제) |
| **SharePlaceSheet** | Web Share Target 또는 외부 링크 파싱 | 공유받은 장소를 내 지도에 저장 |

---

## 5. 공유 뷰어 (라이트웹) 전용 플로우

`/s/:slug` 접속 시 탭 UI 없이 단독 화면으로 표시된다.

```
SharedMapViewer (/s/:slug?utm_source=qr)
  │
  ├─ 헤더: 지도 제목 + [이벤트] 배지
  ├─ 공지 배너 (이벤트 + 공지 있을 때) → [✕] 닫기
  ├─ 체크인 진행률 바 (이벤트 + 체크인 활성)
  │
  ├─ NaverMap (읽기 전용)
  │   └─ 핀 탭 → 피처 선택
  │
  ├─ 선택된 피처 카드
  │   ├─ 제목, 타입, 설명, 태그
  │   └─ [체크인] 버튼 (이벤트 지도)
  │       ├─ 성공 → "체크인 완료!" 토스트
  │       ├─ 이미 완료 → 버튼 비활성 "✓ 체크인 완료"
  │       └─ 오프라인 → "오프라인 체크인 완료!" 토스트
  │
  ├─ [목록 보기] 토글 → 피처 리스트
  ├─ [LOCA 앱으로 저장하기] CTA
  │
  └─ 설문 팝업 (완주 시 자동)
      ├─ 별점 (1~5) + 한줄 후기
      ├─ [건너뛰기]
      └─ [제출] → 온라인: Supabase 저장 / 오프라인: 로컬 큐
```

---

## 6. 이미지 공유 에디터 (풀스크린 오버레이)

MapEditorScreen에서 "이미지 공유" 선택 시 표시된다.

```
MapShareEditor (shareEditorImage가 있을 때)
  │
  ├─ 헤더: [✕] 닫기 / "이미지 공유" / [공유] 버튼
  │
  ├─ 캔버스 프리뷰 (1080×1350)
  │   ├─ 프레임별 배경 + 지도 스크린샷
  │   ├─ 제목 + 태그 칩
  │   ├─ QR 코드 (우하단)
  │   └─ 드래그 가능한 스티커들
  │
  └─ 하단 컨트롤
      ├─ 프레임 선택 (매거진/큐트/파스텔/선셋/오션/포레스트/캔디팝)
      └─ 스티커 팔레트 (15종 이모지) + 되돌리기
```

---

## 7. 인증 플로우

```
앱 시작
  │
  ├─ hasSupabaseEnv === false → 로컬 전용 모드 (인증 없음)
  │
  └─ hasSupabaseEnv === true
      │
      ├─ 세션 있음 → authUser 설정 → cloudMode = true
      │   → loadCloudData() → 클라우드 데이터로 전환
      │
      └─ 세션 없음 → authReady = true
          │
          └─ 개인 탭(지도/장소/검색/프로필) 접근 시
              → AuthScreen 게이트 표시
              │
              ├─ 이메일 회원가입/로그인
              ├─ Google OAuth
              └─ Kakao OAuth
                  → 성공 → onAuthStateChange → cloudMode 전환
```

---

## 8. 운영자(B2B) 전체 워크플로우

```
1. 회원가입 + 로그인
   └─ ProfileScreen → AuthScreen → cloudMode

2. 초대코드 입력
   └─ ProfileScreen 하단 → 코드 입력 → hasB2BAccess = true

3. 이벤트 지도 생성
   └─ MapsListScreen [+ 새 지도]
      → MapFormSheet → [🎪 이벤트 지도] → 템플릿 선택
      → "동네 스탬프투어" 선택 → [저장]
      → 5개 체크포인트 자동 생성 + 기본 공지

4. 체크포인트 위치 지정
   └─ MapEditorScreen → 피처 목록에서 "체크포인트 1" 더블탭
      → FeatureDetailSheet → [지도에서 위치 지정]
      → "relocate" 모드 → 지도 탭 → 좌표 저장
      → 5개 반복

5. 공지사항 등록
   └─ MapEditorScreen → 📢 버튼
      → AnnouncementSheet → 공지 작성/수정

6. 발행 + QR 다운로드
   └─ ProfileScreen → [프로필에 지도 올리기]
      → PublishSheet → 지도 선택 → [프로필에 올리기]
      → MapEditorScreen → 🔗 버튼
      → ShareSheet → [인쇄용 QR 다운로드]
```

---

## 9. 참여자 플로우

```
QR 스캔 (또는 카카오 링크)
  │
  └─ /s/:slug?utm_source=qr
     → App.jsx → getPublishedMapBySlug() → sharedMapData
     → SharedMapViewer 렌더링
     │
     ├─ utm_source 파싱 → setUtmSource() (세션 저장)
     ├─ logEvent("map_view") — utm_source 포함
     │
     ├─ 공지 확인 (배너)
     ├─ 체크포인트 순회
     │   └─ 핀 탭 → [체크인] → logEvent("checkin")
     │      → checkedInIds에 추가 (sessionStorage)
     │
     ├─ 5/5 완주 → logEvent("completion")
     │   → 설문 자동 오픈
     │   → 별점 + 후기 → [제출]
     │   → submitSurveyResponse() (또는 오프라인 큐)
     │
     └─ [LOCA 앱으로 저장하기]
        → importSharedMapToLocal() → 내 지도에 복사
```

---

## 10. 데이터 소유권과 소스 구분

`activeMapSource`에 따라 에디터 동작이 달라진다:

| 소스 | 설명 | 편집 | 피처 저장소 |
|------|------|------|------------|
| `"local"` | 내 지도 | 가능 | features state |
| `"demo"` | 데모/추천 지도 | 읽기 전용 | demoFeatures (상수) |
| `"shared"` | 공유받은 지도 | 읽기 전용 | sharedMapData.features |
| `"community"` | 커뮤니티 지도 | 메모만 가능 | communityMapFeatures |

---

## 11. 상태 관리 요약

App.jsx가 중앙 상태 허브. 대형 로직은 커스텀 훅으로 분리.

```
App.jsx (중앙 상태)
  │
  ├─ useLocalStorageState(): maps, features, shares, followed, ...
  ├─ useState(): activeTab, mapsView, editorMode, authUser, ...
  │
  ├─ useMapCRUD(): saveMapSheet, publishMap, deleteMap, ...
  ├─ useFeatureEditing(): focusFeature, saveFeatureSheet, startRelocatePin, ...
  ├─ useFeaturePool(): activeFeaturePool (activeMap 기준 피처 필터링)
  ├─ useMediaHandlers(): handlePhotoSelected, startRecording, ...
  │
  └─ 클라우드 모드 판별
     cloudMode = hasSupabaseEnv && Boolean(authUser)
     → true일 때 Supabase 읽기/쓰기, false일 때 localStorage 전용
```

---

## 12. CSS 파일 매핑

| 파일 | 대상 |
|------|------|
| `legacy/styles.css` | 앱 전체 기본 레이아웃, 바텀시트, 카드, 버튼, 폼, 네비게이션 |
| `map-editor-overlays.css` | 에디터 헤더/검색/FAB/필터/목록/공유패널/공지관리/템플릿/핀위치 |
| `map-labels.css` | 지도 위 핀 마커, 경로/범위 라벨, 캐릭터 마커, 펄스 애니메이션 |
| `map-share-editor.css` | 이미지 공유 에디터 (캔버스 프리뷰, 프레임 칩, 스티커) |
| `shared-viewer.css` | SharedMapViewer 전용 (헤더, 진행률 바, 체크인, 설문, 토스트) |

---

## 13. 번들 구조 (코드 스플리팅)

```
index.html
  ├─ rolldown-runtime       (0.5KB)
  ├─ vendor-react           (190KB) — React 19
  ├─ vendor-supabase        (166KB) — Supabase 클라이언트
  ├─ vendor-utils            (33KB) — fflate, qrcode
  ├─ index                   (98KB) — App.jsx + hooks + sheets + ui
  ├─ index.css               (68KB)
  │
  └─ 라우트별 lazy 청크:
     ├─ HomeScreen            (2KB)
     ├─ MapsListScreen        (2KB)
     ├─ MapEditorScreen      (20KB) — 에디터 + ShareSheet
     ├─ MapShareEditor       (12KB) — 이미지 에디터 + 프레임 painters
     ├─ SharedMapViewer       (8KB) — 라이트웹 뷰어
     ├─ NaverMap              (8KB) — 네이버 지도 래퍼
     ├─ PlacesScreen          (2KB)
     ├─ SearchScreen          (2KB)
     ├─ ProfileScreen         (8KB)
     ├─ AuthScreen            (4KB)
     └─ html2canvas         (200KB) — 스크린샷 (에디터에서만 동적 import)
```

**라이트웹 (/s/:slug) 로딩 경로**: index + vendor-react + vendor-supabase + SharedMapViewer + NaverMap + CSS = **~151KB gzip**
