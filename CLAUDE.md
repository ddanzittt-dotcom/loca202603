# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# LOCA Project Reference

## Overview
LOCA는 로컬 큐레이션 지도 앱이다. 사용자가 자신만의 지도를 만들고, 핀/경로/영역을 기록하며, 다른 사용자와 공유하는 모바일 퍼스트 플랫폼이다.
프로덕션 번들에서 복원(recovery)된 소스코드로, 현재 편집 가능한 React/Vite 구조로 재구성되어 있다.

## Tech Stack
- **Frontend**: React 19 + Vite 8, JavaScript (JSX), ES2020+
- **Map**: Naver Maps API (주력), Leaflet (보조)
- **Storage**: localStorage (기본) / Supabase PostgreSQL (옵션, 스캐폴딩만 존재)
- **Mobile**: Capacitor 8 (Android/iOS)
- **PWA**: Service Worker (Workbox), manifest.webmanifest
- **Utilities**: fflate (gzip 압축), html2canvas (스크린샷), qrcode (QR 생성)
- **Auth**: Supabase Auth (이메일, Google OAuth, Kakao OAuth)

## Project Structure
```
src/
  App.jsx              # 중앙 상태 허브 + 라우팅 (가장 큰 파일)
  main.jsx             # React 엔트리, SW 등록
  screens/             # 전체 페이지 컴포넌트
    HomeScreen.jsx     # 추천 지도, 커뮤니티 미리보기
    MapsListScreen.jsx # 내 지도 목록 + 검색
    MapEditorScreen.jsx# 지도 편집, 피처 그리기, 공유
    MapShareEditor.jsx # 지도 공유 이미지 생성 (프레임/스티커/QR)
    SharedMapViewer.jsx# 공유받은 지도 읽기 전용 뷰어
    PlacesScreen.jsx   # 전체 피처 검색
    SearchScreen.jsx   # 사용자 검색/팔로우
    ProfileScreen.jsx  # 프로필, 발행 지도
    AuthScreen.jsx     # 로그인/회원가입
  components/
    ui.jsx             # 재사용 UI (BottomNav, BottomSheet, MapCard 등)
    NaverMap.jsx       # 네이버 지도 통합, 피처 렌더링
    MapErrorBoundary.jsx
    LeafletMap.jsx     # 리플렛 (보조)
  hooks/
    useAppState.js     # useLocalStorageState, useToast, useInstallPrompt
  lib/
    supabase.js        # Supabase 클라이언트 초기화
    auth.js            # 인증 헬퍼 (이메일, OAuth, 비밀번호 재설정)
    mapService.js      # Supabase CRUD 전체 (600줄+)
    appUtils.js        # 압축, 직렬화, 포맷 유틸
    mediaStore.js      # IndexedDB 미디어 Blob 저장소 (loca-media)
  data/
    sampleData.js      # 데모 데이터 (지도, 피처, 유저, 포스트)
  legacy/
    styles.css         # 원본 프로덕션 스타일시트 (보존)
  map-editor-overlays.css
  map-labels.css
  registerServiceWorker.js

supabase/
  loca_v1_schema.sql   # DB 스키마 + RLS 정책 (7 테이블)

public/
  sw.js                # Workbox 서비스워커
  manifest.webmanifest
  icons/

android/, ios/         # Capacitor 네이티브 프로젝트
```

## Key Architecture Decisions

### State Management
- **App.jsx**가 모든 상태의 중앙 허브 역할
- localStorage 키: `loca.mobile.maps`, `loca.mobile.features`, `loca.mobile.shares`, `loca.mobile.followed`
- Supabase 연동은 스캐폴딩만 존재, 아직 화면에 와이어링되지 않음
- 듀얼 모드: localStorage(기본) / Supabase cloud(옵션)

### Data Model
- **Map**: title, description, theme(5색), tags[], category(personal|stamp|media|infra), visibility(public|unlisted|private), slug
- **Feature 3종**:
  - **Pin**: 단일 좌표 (lat, lng) + emoji
  - **Route**: 순서 있는 좌표 배열
  - **Area**: 다각형 꼭짓점 배열
- 모든 Feature: title, emoji, tags[], note, highlight 지원
- **Publication**: map_id, caption, likes_count, saves_count

### DB Tables (Supabase)
profiles, maps, map_publications, map_features, feature_memos, follows, view_logs

### Sharing Mechanism
gzip 압축 (fflate) → base64 URL-safe 인코딩, `v2:` 프리픽스 버전 관리

### Navigation
5-탭 BottomNav: Home(⌂) | Maps(🗺) | Places(📍) | Search(⌕) | Profile(☺)
모달: MapSheet, FeatureSheet, PublishSheet

## Commands
```bash
npm run dev           # 개발 서버 (localhost:5173)
npm run dev:host      # 모바일 접근 가능한 dev 서버
npm run build         # 프로덕션 빌드 → dist/
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
- Naver Maps SDK는 비동기 폴링으로 로드 확인
- MapErrorBoundary로 지도 크래시 격리

## Current Status
- localStorage 기반으로 **완전히 작동** 중
- Supabase 스캐폴딩(schema, auth, mapService) 준비 완료, 화면 연결 미완
- 프로덕션 번들에서 복원한 소스 → ESLint 통과 확인 (2026-03-15)
- 다음 단계: Supabase 클라우드 연동을 화면별로 점진 적용
