# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# LOCA Project Reference

## Overview
LOCA는 **B2C 로컬 큐레이션 지도 웹서비스**(도메인 loca.im)다. 사용자가 자신만의 지도를 만들고, 핀/경로/영역을 기록하며, 발행·공유·커뮤니티로 나누는 모바일 퍼스트 플랫폼이다.
프로덕션 번들에서 복원(recovery)된 소스코드로, 현재 편집 가능한 React/Vite 구조로 재구성되어 있다.

> **⚠️ 2026-07 B2C 전환:** 행사지도(event map)/B2B/운영자(manager) 기능은 앱 코드에서 전면 제거됨. 아래 문서에 남아 있는 이벤트/체크인/설문/공지/대시보드/초대코드/B2B 서술은 **과거 이력**이며 현재 코드에는 없다. **유지된 것:** 지도 제작·편집, 발행·공유, 커뮤니티(모두의 지도), 공동편집 협업(`map_collaborators`), 게이미피케이션(레벨/XP/배지), 알림, 소셜 프로필.

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
    MapsListScreen.jsx # 내 지도 목록 + 검색 + 스켈레톤/빈상태
    MapEditorScreen.jsx# 지도 편집, 피처 그리기, 공유
    MapShareEditor.jsx # 지도 공유 이미지 생성 (프레임/스티커/QR)
    SharedMapViewer.jsx# 발행/공유 지도 읽기 전용 뷰어 + 라이브러리 저장 + 공유
    PlacesScreen.jsx   # 전체 피처 검색 + EmptyState
    ProfileScreen.jsx  # 프로필, 발행 지도
    AuthScreen.jsx     # 로그인/회원가입 + 한국어 에러 메시지
    PublicCommunityPage.jsx # 모두의 지도 public 웹 (/community-web, main.jsx에서 분기)
                       # 구 홈/탐색/검색 스크린은 웹 워크스페이스 개편(2026-06)으로 삭제됨
                       # 현재 탭: 로그인 / 지도 제작 / 지도 목록 / 장소 목록 / 프로필 (BottomNav.v2)
  components/
    ui.jsx             # 재사용 UI (BottomSheet, MapCard, Spinner, SkeletonCard, EmptyState, Toast)
    BottomNav.v2.jsx   # 하단 내비게이션 v2
    NaverMap.jsx       # 네이버 지도 통합, 피처 렌더링
    MapErrorBoundary.jsx
    sheets/            # 바텀시트 컴포넌트
      FeatureDetailSheet.jsx
      MapFormSheet.jsx       # 지도 생성/수정
      CollaboratorsSheet.jsx # 공동편집 협업자 초대/관리
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

### DB Tables (Supabase) — 앱이 쓰는 것
**핵심:** profiles, maps, map_publications, map_features, feature_memos, follows, view_logs
**협업/커뮤니티:** map_collaborators, community_records(모두의 지도)
**게이미피케이션:** user_stats, user_badges, user_souvenirs

> 과거 이벤트/B2B 테이블(announcements, survey_responses, event_checkins, invitation_codes 등)은 migrations 이력에 남아 있으나 **앱 코드에서 미사용**.

> **Migration 번호 주의 (2026-07):**
> - 라이브 DB에는 웹 MVP 실험분 **046**(spots·place_records·map_items·user_saves)·**047**(map_invite_links)이 적용된 뒤 파일만 레포에서 제거됨. **신규 migration은 048부터** 번호를 쓰고, 046·047은 재사용 금지.
> - 중복 번호 존재: 005·013·020·022·030. 이 중 B2B 전용(`005_organizations`, `013_rate_limit_comments_features`, `022_dashboard_tenant_rbac`, `022_event_collab_roles_and_approval`)은 신규 환경 구축 시 실행하지 않는다.

### Sharing & OG 메타
- **미발행 지도**: gzip 압축 → `/shared?data=v2:...` (자체 포함)
- **발행된 지도**: `/s/:slug?utm_source=link|kakao|qr` (Supabase 조회)
- **OG 메타**: Vercel Serverless Function이 봇 UA 감지 → 동적 HTML 반환 (카카오/페이스북/트위터)
- **OG 이미지**: `/api/og-image/:slug` — 테마 색상 기반 SVG 동적 생성

### B2C 전용 (구 event/B2B 제거됨)
- `maps.category`: `personal` 등 B2C 카테고리만 사용. `event` 분기·`isEventMap` 헬퍼는 제거됨
- 초대코드/B2B 게이팅(`redeemInvitationCode`/`checkB2BAccess`), 체크인·완주·설문·공지 CRUD, 대시보드 진입 UI 모두 제거됨
- 발행/공유 지도는 `SharedMapViewer`(읽기 전용 + 라이브러리 저장 + 공유)로만 렌더

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

## Supabase 설정 체크리스트 (운영 전 필수)
- [ ] `loca_v1_schema.sql` + 최신 migrations 순서대로 실행 (RLS 포함)
- [ ] Storage → 새 버킷 `media` 생성 (Public 체크)
- [ ] Authentication → URL Configuration → Site URL + Redirect URLs 설정
> 구 이벤트/B2B 마이그레이션(002_dashboard, 003_b2b, 004_rls 등)은 앱에서 미사용 — 신규 환경엔 실행 불필요.

## Health Check
개발 서버에서 브라우저 콘솔:
```js
import('/src/lib/supabaseHealthCheck.js').then(m => m.runHealthCheck())
```

## 참조 문서
- `docs/EVENT_MAP_ARCHITECTURE.md` — participant/manager 역할 분리, 데이터 흐름
- `docs/QA_CHECKLIST.md` — 13개 카테고리, 50+ 체크 항목
- `docs/UI_FLOW.md` — 화면 간 이동, 바텀시트 트리거
- `DESIGN.md` — UI 디자인 시스템 (색상, 타이포그래피, 컴포넌트 규격)
