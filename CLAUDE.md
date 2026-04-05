# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# LOCA Project Reference

## Overview
LOCA는 로컬 큐레이션 지도 앱이다. 사용자가 자신만의 지도를 만들고, 핀/경로/영역을 기록하며, 다른 사용자와 공유하는 모바일 퍼스트 플랫폼이다.
프로덕션 번들에서 복원(recovery)된 소스코드로, 현재 편집 가능한 React/Vite 구조로 재구성되어 있다.

## Tech Stack
- **Frontend**: React 19 + Vite 8, JavaScript (JSX), ES2020+, React.lazy 코드 스플리팅
- **Map**: Naver Maps API (단일 사용, Leaflet 제거됨)
- **Storage**: localStorage (기본) / Supabase PostgreSQL + Storage (클라우드)
- **Mobile**: Capacitor 8 (Android/iOS)
- **PWA**: Service Worker (Workbox), manifest.webmanifest
- **Utilities**: fflate (gzip 압축), html2canvas (스크린샷), qrcode (QR 생성)
- **Auth**: Supabase Auth (이메일, Google OAuth, Kakao OAuth)
- **Analytics**: 자체 이벤트 로깅 (view_logs 테이블, 오프라인 큐 지원)
- **Deploy**: Vercel (Serverless Functions 포함)

## UI 플로우 맵
화면 간 이동, 바텀시트 트리거, 운영자/참여자 워크플로우 등은 → **`docs/UI_FLOW.md`** 참조.

## Project Structure
```
src/
  App.jsx              # 중앙 상태 허브 + 라우팅 + lazy 로딩
  main.jsx             # React 엔트리, SW 등록
  screens/             # 전체 페이지 컴포넌트 (전부 React.lazy)
    HomeScreen.jsx     # 추천 지도, 커뮤니티 미리보기
    MapsListScreen.jsx # 내 지도 목록 + 검색 + 스켈레톤/빈상태
    MapEditorScreen.jsx# 지도 편집, 피처 그리기, 공유, 공지 관리
    MapShareEditor.jsx # 지도 공유 이미지 생성 (프레임/스티커/QR)
    SharedMapViewer.jsx# 공유 뷰어 + 이벤트 지도 체크인/공지/설문 + 오프라인
    PlacesScreen.jsx   # 전체 피처 검색 + EmptyState
    SearchScreen.jsx   # 사용자 검색/팔로우 + EmptyState
    ProfileScreen.jsx  # 프로필, 발행 지도, 캐릭터 선택, 초대코드 입력
    AuthScreen.jsx     # 로그인/회원가입 + 한국어 에러 메시지
  components/
    ui.jsx             # 재사용 UI (BottomNav, BottomSheet, MapCard, Spinner, SkeletonCard, EmptyState, ErrorCard, Toast)
    NaverMap.jsx       # 네이버 지도 통합, 피처 렌더링, 캐릭터 마커
    MapErrorBoundary.jsx
    MediaWidgets.jsx   # 사진/음성 녹음 위젯
    sheets/            # 바텀시트 컴포넌트
      AnnouncementSheet.jsx  # 공지 CRUD (생성/수정/토글/삭제/미리보기)
      FeatureDetailSheet.jsx
      MapFormSheet.jsx       # 지도 생성/수정 + B2B 카테고리/템플릿 선택
      PostDetailSheet.jsx
      PublishSheet.jsx
      SharePlaceSheet.jsx
      ShareSheet.jsx         # 지도 공유 바텀시트 (QR/링크/카카오/이미지)
      UserProfileSheet.jsx
  hooks/
    useAppState.js     # useLocalStorageState, useOnlineStatus, useToast, useInstallPrompt
    useFeatureEditing.js # 피처 편집 + 메모 클라우드 동기화 + 핀 위치 재지정
    useFeaturePool.js  # 피처 풀 관리
    useMapCRUD.js      # 지도 CRUD + 발행/저장 이벤트 로깅 + 템플릿 생성
    useMediaHandlers.js # 미디어 핸들러 + Supabase Storage 업로드
  lib/
    analytics.js       # 이벤트 로깅 (logEvent, getSessionId, setUtmSource, 오프라인 큐)
    supabase.js        # Supabase 클라이언트 (detectSessionInUrl: true)
    auth.js            # 인증 헬퍼 (이메일, OAuth, Vercel 도메인 지원)
    mapService.js      # Supabase CRUD + B2B 서비스 + 공지 CRUD + friendlySupabaseError
    appUtils.js        # 압축, 직렬화, 포맷 유틸, URL 파싱 (/s/:slug), buildSlugShareUrl
    mediaStore.js      # IndexedDB + Supabase Storage 듀얼 미디어 저장소
    supabaseHealthCheck.js  # 프로덕션 환경 검증 스크립트 (dev 전용, 번들 미포함)
  data/
    sampleData.js      # 데모 데이터 (지도 3개, 피처, 유저, 포스트)
    templates.js       # 이벤트 지도 템플릿 (스탬프투어, 맛집투어)
  legacy/
    styles.css         # 원본 프로덕션 스타일시트 (보존)
  map-editor-overlays.css  # 에디터 오버레이 + 스피너/스켈레톤/빈상태/에러카드/공지관리 스타일
  map-labels.css           # 지도 라벨 + 캐릭터 마커 스타일
  map-share-editor.css     # 공유 이미지 에디터 스타일
  shared-viewer.css        # 공유 뷰어 + 이벤트 지도 + 토스트 스타일
  registerServiceWorker.js

api/                        # Vercel Serverless Functions
  og/[slug].js             # OG 메타태그 동적 생성 (봇 UA 감지)
  og-image/[slug].js       # 동적 OG 이미지 (테마 색상 SVG)

supabase/
  loca_v1_schema.sql             # 기본 DB 스키마 + RLS (7 테이블)
  migrations/
    002_dashboard_schema.sql     # 대시보드 인프라 (view_logs 확장, announcements, survey_responses)
    003_b2b_schema.sql           # B2B 모드 (초대코드, maps.category 'event')
    004_rls_hardening.sql        # RLS 보안 강화 (코드 목록 차단, rate limit, 메모 관리)

public/
  sw.js                # Workbox 서비스워커 (precache 제거됨)
  manifest.webmanifest
  icons/

android/, ios/         # Capacitor 네이티브 프로젝트
vercel.json            # Vercel 배포 설정 (봇 라우팅, SPA rewrite, 캐시 헤더)
netlify.toml           # Netlify 배포 설정 (대안)
DEPLOY.md              # 배포 가이드 (Vercel/Netlify + Supabase 설정)
```

## Key Architecture Decisions

### State Management
- **App.jsx**가 중앙 상태 허브 (대형 로직은 커스텀 훅으로 분리)
- 듀얼 모드: `cloudMode = hasSupabaseEnv && Boolean(authUser)` — 로그인 시 자동 전환
- 로그아웃 시 `resetToLoggedOut()` — 15개 상태 전체 초기화 + 데모 데이터 복원
- `onAuthStateChange`로 세션 만료/외부 로그아웃 자동 감지

### Data Model
- **Map**: title, description, theme(5색), tags[], category(personal|stamp|media|infra|**event**), visibility, slug, config(JSONB), dashboard_modules(JSONB)
- **Feature 3종**: Pin(좌표), Route(좌표 배열), Area(다각형)
- 모든 Feature: title, emoji, tags[], note, highlight, memos[], photos[], voices[]

### DB Tables (Supabase) — 12개
**기본 (v1):** profiles, maps, map_publications, map_features, feature_memos, follows, view_logs
**대시보드 (v2):** announcements, survey_responses
**B2B (v3):** invitation_codes, invitation_redemptions
**보안 (v4):** invitation_code_attempts (rate limit 추적)

### Sharing & OG 메타
- **미발행 지도**: gzip 압축 → `/shared?data=v2:...` (자체 포함)
- **발행된 지도**: `/s/:slug?utm_source=link|kakao|qr` (Supabase 조회)
- **OG 메타**: Vercel Serverless Function이 봇 UA 감지 → 동적 HTML 반환 (카카오/페이스북/트위터)
- **OG 이미지**: `/api/og-image/:slug` — 테마 색상 기반 SVG 동적 생성

### B2C / B2B·B2G 모드 분리
- `maps.category`: `personal` (B2C), `event` (B2B/B2G 유료)
- 초대코드 → `redeem_invitation_code()` RPC (분당 5회 rate limit)
- 이벤트 지도 기능: 체크인, 공지사항 (CRUD 관리 UI), 완주 후 설문
- MapEditorScreen 헤더에 📢 공지 관리 버튼 (이벤트 지도 + cloudMode일 때만)

### 이벤트 로깅 + 오프라인 큐
- `analytics.js`: logEvent → 성공 시 즉시 전송, 실패/오프라인 시 `loca.event_queue` localStorage에 저장
- `flushEventQueue()`: 온라인 복귀 시 자동 실행 (2초 딜레이), 최대 5회 재시도
- 설문도 오프라인 큐 지원 (`loca.survey_queue` localStorage)
- 공지사항 오프라인 캐시 (sessionStorage)

### 에러 처리 체계
- `friendlySupabaseError(error)`: 6종 에러 한국어 매핑 (네트워크/권한/인증/중복/미발견/서버)
- `friendlyError()` (AuthScreen): 인증 에러 한국어 매핑
- UI 컴포넌트: `<Spinner>`, `<SkeletonCard>`, `<EmptyState>`, `<ErrorCard>`
- 오프라인 배너: `useOnlineStatus()` 훅 → 앱 상단에 "오프라인 모드" 표시

### 코드 스플리팅
- 9개 스크린 전부 `React.lazy()` — 라우트별 독립 청크
- vendor 분리: vendor-react (190KB), vendor-supabase (166KB), vendor-utils (33KB), html2canvas (200KB)
- 라이트웹(`/s/:slug`) 접속 시 불필요한 스크린/라이브러리 로딩 안 됨
- SharedMapViewer 청크: 8KB (gzip 2.9KB)

### RLS 보안
- invitation_codes: SELECT 정책 없음 (코드 목록 직접 조회 불가, RPC만 허용)
- invitation_code_attempts: 분당 5회 rate limit
- feature_memos UPDATE: 지도 소유자만 status 변경 가능 (콘텐츠 관리)
- survey_responses: INSERT open, UPDATE/DELETE 불가

## Commands
```bash
npm run dev           # 개발 서버 (localhost:5173)
npm run dev:host      # 모바일 접근 가능한 dev 서버
npm run build         # 프로덕션 빌드 → dist/ (코드 스플리팅 + bundle-report.html)
npm run preview       # 빌드 미리보기
npm run lint          # ESLint
npm run cap:sync      # Capacitor 빌드+동기화
npm run cap:android   # Android Studio 열기
npm run cap:ios       # Xcode 열기
```

## Environment
`.env` 파일 (선택사항, 없으면 localStorage 전용 모드):
```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-public-anon-key
```

## Conventions
- UI 텍스트는 전부 한국어 (ko-KR)
- 이모지를 아이콘/아바타로 적극 활용
- 5개 테마 색상: #635BFF, #12B981, #F97316, #EF4444, #0EA5E9
- `normalize*` 함수로 DB row → JS 객체 변환
- `friendlySupabaseError()`로 사용자 에러 메시지 통일
- Naver Maps SDK는 비동기 폴링으로 로드 확인
- MapErrorBoundary로 지도 크래시 격리
- Service Worker는 precache 없이 운영
- logEvent()는 오프라인 큐 포함, 에러 시에도 앱 안 깨짐

---

## Development History

### Sprint 1: 소스 복원 + 기본 구조 (2026-03-15)
- 프로덕션 번들에서 소스코드 복원 → React/Vite 구조로 재구성
- Supabase Auth 스캐폴딩 (이메일, Google, Kakao OAuth)
- 모바일 앱 릴리즈 준비 (Capacitor)

### Sprint 2: 안정화 + UI 개선 (2026-03-29)
- App.jsx 대규모 리팩토링 (바텀시트 → sheets/, 로직 → 커스텀 훅)
- LeafletMap 삭제, 데모 데이터 축소, CSP 해결
- Service Worker 안정화 (precache 제거)
- 미디어 버그 수정, 지도 에디터 UI 개선, 캐릭터 마커

### Sprint 3: 대시보드 인프라 + B2B 모드 + 클라우드 연동 (2026-04-01)

#### Phase 1 — 대시보드 데이터 수집 기반
- DB 스키마 마이그레이션 002 (view_logs 확장, announcements, survey_responses)
- 이벤트 로깅 시스템 (analytics.js)
- SharedMapViewer 추적 연동 (map_view, feature_click)

#### Phase 2 — B2C / B2B·B2G 모드 분리
- DB 스키마 마이그레이션 003 (초대코드, maps.category 'event')
- 초대코드 입력 UI, MapFormSheet 카테고리 선택
- SharedMapViewer 이벤트 모드 (체크인, 공지, 설문)

#### Phase 3 — Supabase 클라우드 연동 완성
- 메모 동기화, 슬러그 URL 로딩, 미디어 Storage 연동

#### Phase 4 — 앱 전체 이벤트 로깅 (10개 이벤트 타입)

#### Phase 5 — 배포 + 인프라
- Vercel 배포 (vercel.json, netlify.toml, DEPLOY.md)
- Supabase Health Check 스크립트 (supabaseHealthCheck.js)

#### Phase 6 — 인증 플로우 E2E 점검
- OAuth 콜백 감지 수정 (detectSessionInUrl: true)
- Vercel 도메인 + *.vercel.app 패턴 허용 (auth.js)
- 로그아웃 상태 완전 초기화 (resetToLoggedOut, 15개 상태)
- 세션 만료 자동 감지 (onAuthStateChange)
- 비로그인→로그인 데이터 보존 (로컬 데이터 마이그레이션 안내 토스트)
- AuthScreen 에러 메시지 한국어 매핑 (friendlyError, 6종)

#### Phase 7 — RLS 보안 강화
- DB 마이그레이션 004 (코드 목록 조회 차단, rate limit, 메모 관리 권한)
- 초대코드 무차별 대입 방지 (분당 5회, invitation_code_attempts)
- feature_memos UPDATE 정책 (지도 소유자 콘텐츠 관리)

#### Phase 8 — 오프라인 안정성 강화
- 이벤트 큐 시스템 (analytics.js 전면 재작성, localStorage 큐)
- 체크인 오프라인 처리 + 토스트 피드백
- 설문 오프라인 큐 (loca.survey_queue)
- 공지사항 sessionStorage 캐시
- useOnlineStatus 훅 + 오프라인 배너
- 온라인 복귀 시 자동 flush (2초 딜레이)

#### Phase 9 — 라이트웹 성능 최적화
- React.lazy 코드 스플리팅 (9개 스크린)
- Vite manualChunks (vendor-react, vendor-supabase, vendor-utils)
- 번들 분석기 (rollup-plugin-visualizer → dist/bundle-report.html)
- 단일 531KB → 24개 청크 분리, 라이트웹 gzip ~135KB

#### Phase 10 — 에러/로딩/빈 상태 UX
- UI 컴포넌트: Spinner, SkeletonCard, EmptyState, ErrorCard (ui.jsx)
- friendlySupabaseError (mapService.js) — 6종 에러 한국어 매핑
- MapsListScreen 스켈레톤 + 빈 상태, PlacesScreen/SearchScreen EmptyState

#### Phase 11 — 통합 테스트 + 버그 수정
- 운영자→참여자 전체 플로우 코드 추적 (시나리오 1~3)
- 설문 오프라인 큐 추가 (기존에 데이터 유실 버그)
- 공지사항 오프라인 캐시 추가
- 체크인 이벤트에 feature_type 메타 추가

#### Phase 12 — 공지 관리 운영 도구
- mapService.js: 공지 CRUD 5개 함수 (getAllAnnouncements, create, update, toggle, delete)
- AnnouncementSheet.jsx: 바텀시트 기반 공지 관리 UI (목록/생성/수정/토글/삭제/미리보기)
- MapEditorScreen 헤더에 📢 버튼 (이벤트 지도 + cloudMode)

#### Phase 13 — OG 메타태그 + 카카오 공유
- Vercel Serverless Function: api/og/[slug].js (봇 UA → OG HTML, 일반 → SPA 302)
- 동적 OG 이미지: api/og-image/[slug].js (테마 색상 SVG)
- vercel.json 봇 라우팅 (카카오/페이스북/트위터/슬랙/디스코드)
- buildSlugShareUrl() — utm_source 자동 포함
- 발행된 지도는 슬러그 URL 사용 (/s/:slug?utm_source=link)
- index.html 기본 OG 메타태그 추가

### Sprint 4: 공유 UX + 이벤트 템플릿 + 안정화 (2026-04-02)

#### Phase 1 — QR 코드 고해상도 + 공유 시트
- ShareSheet.jsx: BottomSheet 기반 공유 UI (QR 프리뷰, 링크 복사, 카카오 공유, 이미지 공유)
- QR 인쇄용 다운로드 (1024px PNG, 지도 제목 + URL 텍스트 포함)
- QR 중앙 📍 로고 삽입 (errorCorrectionLevel: "H")
- 파일명 규칙: LOCA_QR_{제목}_{slug}.png
- 각 공유 방식에 utm_source 자동 태깅 (link, kakao, qr)

#### Phase 2 — utm_source 전체 플로우 검증
- analytics.js: 세션 레벨 utm_source (sessionStorage) → 모든 이벤트에 자동 포함
- buildRow()에서 meta.utm_source 필드 자동 추가
- SharedMapViewer: 마운트 시 setUtmSource() 호출
- feature_click, checkin, completion 이벤트에 utm_source 전파
- OG 리다이렉트에서 utm_source 명시적 보존

#### Phase 3 — 이벤트 지도 템플릿
- src/data/templates.js: "동네 스탬프투어" (5포인트), "맛집 투어" (3포인트)
- MapFormSheet: 이벤트 지도 생성 시 템플릿 선택 UI
- useMapCRUD: 템플릿 피처 순차 생성 + 기본 공지 자동 생성
- 부분 실패 허용 (for...of 순차 처리)

#### Phase 4 — 리허설 1차 이슈 수정
- NaverMap: 미설정 핀(0,0) 렌더링/fitBounds 스킵 (CRITICAL)
- FeatureDetailSheet: 핀 위치 편집 UI ("지도에서 위치 지정" + 좌표 표시)
- useFeatureEditing: "relocate" 모드 (핀 위치 재지정 → 맵 탭으로 좌표 갱신)
- MapEditorScreen: relocate 모드 안내 배너

#### Phase 5 — 리허설 2차 안정화
- 빈 지도(0 피처) 발행 방지 + PublishSheet 빈 지도 시각 피드백
- console.log 디버그 코드 정리 (analytics.js, mediaStore.js)
- share-panel 반응형 개선 (max-width: calc(100vw - 32px))
- 깨진 문자열 수정 (publishMap 토스트)

---

## Supabase 설정 체크리스트 (운영 전 필수)
- [ ] SQL Editor에서 `002_dashboard_schema.sql` 실행
- [ ] SQL Editor에서 `003_b2b_schema.sql` 실행
- [ ] SQL Editor에서 `004_rls_hardening.sql` 실행
- [ ] Storage → 새 버킷 `media` 생성 (Public 체크)
- [ ] Authentication → URL Configuration → Site URL + Redirect URLs 설정
- [ ] 초대코드 추가: `INSERT INTO invitation_codes (code, label) VALUES ('코드', '설명')`

## Health Check
개발 서버에서 브라우저 콘솔:
```js
import('/src/lib/supabaseHealthCheck.js').then(m => m.runHealthCheck())
```

### Sprint 5: participant/manager 역할 분리 + 행사 댓글 (2026-04-04)

#### Phase 0 — 코드베이스 조사 + 구현 계획
- 현재 행사 지도 구조를 participant/manager 관점으로 분석
- 8단계 구현 계획 수립

#### Phase 1 — 메인 앱 manager UI 제거
- MapEditorScreen에서 📊대시보드/👥협업/📢공지 버튼 제거
- isAdmin 상태, checkAdminRole(), DashboardScreen 제거
- DashboardScreen 번들에서 tree-shaking 제거 (20.8KB 절감)

#### Phase 2 — participant 행사 진입 분리
- 행사 지도(category==='event') → SharedMapViewer로 분기 (MapEditorScreen 미사용)
- 행사 참여 중 BottomNav 숨김 (몰입형)
- SharedMapViewer에 onBack prop 추가

#### Phase 3 — participant 행사 UI 재구성
- 상단 헤더 카드 (행사명, 진행률, 다음 목표)
- 하단 시트 (접힘: 다음 장소 / 펼침: 장소·공지·정보 탭)
- 지도 컨트롤 최소화 (📋 FAB만)
- 현재 목표 강조 (가장 가까운 미체크인 핀)
- 댓글 타임스탬프 추가

#### Phase 4 — 행사 댓글 백엔드
- event_comments, event_comment_reports 테이블
- create_event_comment, list_event_comments, report_event_comment RPC
- 서버 기준 권한 검증 (comments_enabled, checked_in_only, guest)
- 신고 3회 자동 reported 전환

#### Phase 5 — participant 댓글 UI
- 장소 카드 탭 (정보/댓글) 구조
- 댓글 작성/수정/삭제/신고
- pinned 댓글 상단 표시
- checked_in_only 안내, 빈 상태 UI
- 신고 사유 5종 선택 다이얼로그

#### Phase 6 — 대시보드 댓글 관리 기반
- loca-dashboard에 "댓글 관리" 탭 추가
- commentService.js (댓글 CRUD + 통계 + 신고)
- MapManagePage에 댓글 설정 섹션 추가

#### Phase 7 — 대시보드 댓글 moderation 강화
- 최근 활동 통계 (오늘/7일)
- 일괄 선택 + 일괄 숨김/공개
- 정책 설정 전용 탭 (maps.config 직접 read/write)
- 댓글 본문 접기/펼치기

#### Phase 8 — 문서화 + QA
- docs/EVENT_MAP_ARCHITECTURE.md (역할 분리, 흐름, 데이터 구조, limitations)
- docs/QA_CHECKLIST.md (13개 카테고리, 50+ 체크 항목)

## 다음 단계
- Supabase Realtime으로 댓글/체크인 실시간 갱신
- 댓글 페이지네이션 (50+건 대응)
- 메인 앱 ↔ 대시보드 SSO 연동
- 엑셀/CSV 내보내기 (댓글 + view_logs)
- 추가 이벤트 템플릿 (문화유산 투어, 캠퍼스 투어 등)
