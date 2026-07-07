# LOCA Design System — DESIGN.md

> 이 문서는 LOCA 앱의 모든 UI 구현에 대한 단일 참조 소스(Single Source of Truth)입니다.
> 모든 화면과 컴포넌트는 이 가이드라인을 따릅니다.

> **🟧 v2 리디자인 (2026-05) — Phase 1·2 적용 완료**:
> Cream & Ember 톤 전면 개편. 모바일 앱 4탭(홈/지도/탐색/프로필) + 지도 상세(MapEditor·SharedMapViewer·FeatureDetailSheet·FeatureEditSheet·MemoComposeSheet) 모두 `--v2` modifier 스코프로 v2 룩 적용됨.
>
> **Web Workspace 리디자인 (2026-06)**:
> 운영 웹은 `로그인 / 지도 제작 / 지도 목록 / 장소 목록 / 프로필` 5개 목적 화면만 사용합니다. 데스크톱은 좌측 고정 워크스페이스 내비게이션과 넓은 콘텐츠 캔버스를 기본으로 하며, 모바일에서만 하단 탭 내비게이션을 유지합니다.
>
> **Soft Social Places 선택 (2026-06-28)**:
> 10~30대 웹 톤은 운영툴보다 "친구와 같이 장소를 모으는 저장함"에 가깝게 잡습니다. 메인 웹 쉘은 화이트, 소프트 민트, 코랄, 옐로 포인트를 쓰고 카피는 `관리`보다 `모으기`, `저장함`, `같이 보기`, `공개 준비`를 우선합니다.
>
> 새 화면·컴포넌트는 **[0. v2 Design Tokens](#0-v2-design-tokens-cream--ember)** 섹션의 토큰을 사용합니다.
> 아래 1~7 섹션의 v1 토큰은 **deprecated** — 신규 작업에서는 절대 채택하지 마세요. 마이그레이션 매핑은 `src/styles/tokens.css` 헤더 주석 참조.
>
> 적용된 stylesheets (`src/styles/`):
> - tokens-v2.css · app-shell.css · visuals.css · animations.css
> - home-v2.css · maps-v2.css · explore-v2.css
> - map-detail-v2.css · feature-detail-v2.css · feature-sheets-v2.css
> - dashboard-v2.css · account-v2.css (내 대시보드 / 내 정보 관리, 각 스크린이 직접 import)
>
> 키프레임은 `animations.css` 한 곳에 모아두었습니다(loca-pin-pulse · pin-bob · sheet-in · backdrop-in · fab-rotate · record-pulse). 모든 애니메이션은 `prefers-reduced-motion: reduce` 에서 자동 비활성화.

---

## 0. v2 Design Tokens (Cream & Ember)

참고자료: `참고자료/design-source/themes.js` (`LOCA_THEMES.ember`), `참고자료/README.md`.
CSS 변수 정의: `src/styles/tokens-v2.css`.

### 0.1 Surfaces

| 토큰 | Hex | 용도 |
|---|---|---|
| `--bg` | `#FAF8F2` | 페이지 배경 (크림) |
| `--bg-deep` | `#EFE9D8` | 토글·필 배경 |
| `--bg-warm` | `#E8DFC4` | 미디어 placeholder 시작색 |
| `--card` | `#FFFFFF` | 카드 배경 |

### 0.2 Ink (텍스트 위계)

| 토큰 | Hex | 용도 |
|---|---|---|
| `--ink-strong` | `#0A0A0A` | 제목·강조 |
| `--ink` | `#161616` | 본문 |
| `--ink-soft` | `#3F3A33` | 부 본문 |
| `--ink-mute` | `#807668` | 메타·캡션 |
| `--ink-faint` | `#C2B8A6` | 비활성 |

### 0.3 Accent (Ember)

| 토큰 | Hex | 용도 |
|---|---|---|
| `--accent` | `#FF4D1A` | CTA · FAB · 핀 · "오늘" 강조 |
| `--accent-deep` | `#C2380B` | 라벨 · 링크 · 숫자 |
| `--accent-soft` | `#FFD0BC` | 핀 배경 · "오늘" 카드 보더 |
| `--accent-faint` | `#FFEBE0` | "오늘" 카드 배경 · 칩 · 호 라벨 |

### 0.4 보조 (테마 외 고정)

| 토큰 | Hex | 용도 |
|---|---|---|
| `--sage` / `--sage-soft` | `#5C7A4E` / `#E1EAD7` | 음성 칩 · 길 카운터 · info bar · "상세" 버튼 |
| `--lilac` / `--lilac-soft` | `#9C7BC8` / `#E8DEF5` | 경로(길) 기본색 — **단색만, 그라데이션 금지** |
| `--cocoa` / `--cocoa-soft` | `#8E5A2C` / `#F0DDC4` | 영역 기본색 |
| `--mustard` / `--mustard-soft` | `#FFD865` / `#FFF1B8` | 인기 뱃지 |

### 0.5 카테고리 권장 컬러

핀·경로·영역에 일관되게 적용하는 카테고리 매핑. 사용자가 컬러를 직접 정하면 그것이 우선하지만, 시드·추천·기본값은 아래를 따른다.

| 카테고리 | 토큰 | 색 |
|---|---|---|
| 음식 (food) | `--cat-food` = `--accent` | 엠버 |
| 문화 (culture) | `--cat-culture` = `--sage` | 세이지 |
| 기타 (etc) | `--cat-etc` = `--third` | 토프 |

같은 컬러 = 한 그룹. 형태(원/선/면)로 핀·경로·영역 타입을 구분. **경로 점에 번호 매기지 않음** — 시작점(흰 채움)·끝점(컬러 채움) 두 마커만.

### 0.6 Typography (v2)

| 요소 | 크기 | weight | letter-spacing |
|---|---|---|---|
| 타이틀 (헤더) | 22~28px | **800** | -0.025em ~ -0.04em |
| 본문 강조 | 13~14px | 700~800 | -0.015em |
| 본문 | 12~13px | 500~600 | -0.005em |
| 메타·캡션 | 10~11px | 600~800 | (uppercase 메타: 0.12em) |
| 액센트 라벨 ("EDITOR'S PICK" 등) | 9.5px | 800 | 0.12em ~ 0.16em, uppercase |
| 숫자 | tabular-nums (`font-variant-numeric`) | | |

**v1 규칙 (~500까지) 폐지** — v2 작업에서는 700·800 자유롭게 사용.

### 0.7 Radius & Shadow

| 토큰 | 값 | 용도 |
|---|---|---|
| `--radius-chip` | 4px | 작은 칩·뱃지 |
| `--radius-small` | 6px | 메타 칩 |
| `--radius` | 12px | 인풋·카드 기본 |
| `--radius-big` | 16px | 큰 카드 |
| `--radius-pill` | 999px | 필 버튼·아바타 |
| `--shadow-card` | `0 2px 6px var(--line)` | 일반 카드 |
| `--shadow-float` | `0 8px 24px rgba(0,0,0,0.12)` | 떠있는 카드/시트 |
| `--shadow-sheet` | `0 -10px 40px rgba(0,0,0,0.22)` | 바텀 시트 |
| `--shadow-fab` | `0 8px 20px rgba(255,77,26,0.45)` | FAB |

### 0.8 Spacing

- 내부 패딩: 11~14px (카드), 18~22px (페이지 좌우)
- 갭: 4~10px (조밀), 12~18px (보통), 22~28px (섹션 사이)

### 0.9 Motion

| 토큰 | 값 | 용도 |
|---|---|---|
| `--ease-out` | `cubic-bezier(0.2, 0.7, 0.3, 1)` | 시트/FAB 진입 |
| `--duration-fast` | 0.15s | 토글·필터 |
| `--duration-base` | 0.22s | FAB 회전 |
| `--duration-sheet` | 0.25s | 바텀 시트 진입 |

키프레임: `loca-pin-pulse` (2.4s ease-out infinite, 펄스 확대+페이드), `loca-pin-bob` (2.6s ease-in-out infinite, 1.5px 떠오름). 정의 위치: `src/styles/animations.css` (Step 13 정리 단계에서 추가 예정).

---

## 0A. Web Workspace Direction

### 0A.1 Product IA

- 운영 웹의 1차 내비게이션은 `로그인`, `지도 제작`, `지도 목록`, `장소 목록`, `프로필`만 둡니다.
- `지도 제작`은 가장 최근 작업 지도 또는 새 지도 생성 흐름으로 진입하는 작업 목적지입니다.
- `지도 목록`은 지도 관리 허브입니다. 검색, 상태 필터, 협업 초대, 정렬, 편집 진입이 한 화면에서 보여야 합니다.
- `장소 목록`은 기록 데이터베이스입니다. 검색, 필터, 유형별 탐색이 웹의 표/리스트 밀도로 보여야 합니다.
- `프로필`은 공개 노출과 계정 설정을 분리해 보여주는 관리 화면이어야 합니다.

### 0A.2 Desktop Shell

- 960px 이상에서는 좌측 고정 레일을 사용합니다. 레일 폭은 248px 내외, 콘텐츠 좌측 여백은 280px 내외입니다.
- 상단 pill 내비게이션은 사용하지 않습니다. 웹에서는 좌측 레일이 현재 위치, 주요 행동, 계정 상태를 동시에 보여줍니다.
- 콘텐츠는 `max-width: 1440px` 안에서 헤더, 요약 지표, 작업 영역 순서로 구성합니다.
- 각 화면의 첫 화면에는 작업 맥락이 보여야 합니다. 단순 제목만 두지 말고 지도 수, 장소 수, 공개 상태, 최근 작업 같은 요약을 둡니다.
- 카드 radius는 `--radius` 또는 `--radius-big`만 사용합니다. 큰 섹션을 카드 안에 다시 넣지 않습니다.

### 0A.3 Mobile Shell

- 959px 이하에서는 하단 5탭을 유지합니다.
- 모바일에서는 기존 앱 조작 밀도를 유지하되, 웹 헤더와 요약 지표는 한 줄 또는 가로 스크롤 가능한 블록으로 축약합니다.
- 지도 제작 화면은 지도 조작을 우선합니다. 지도 편집 중에는 내비게이션을 숨깁니다.

### 0A.4 Web Density

- 데스크톱 지도 목록은 3열 이상 반응형 그리드를 목표로 합니다.
- 데스크톱 장소 목록은 필터와 결과가 같은 작업 영역 안에 붙어 있어야 하며, 리스트 행은 스캔 가능한 높이를 유지합니다.
- 로그인 화면은 단일 모바일 폼이 아니라 제품 설명 패널과 로그인 폼이 나뉜 2열 구성을 사용합니다.
- 빈 상태와 로딩 상태는 화면 중앙의 앱식 안내가 아니라 해당 작업 영역 안의 안내 패널로 보입니다.

### 0A.5 Soft Social Places Tokens

- Web background: `#F8FBF7`, map surface `#E9F4DF`, card `#FFFFFF`.
- Primary text: `#171817`, body text `#22261F`, muted text `#7C847B`.
- Accent: coral `#FF6B3A`, faint coral `#FFE0D0`, soft coral `#FFB29A`.
- Social accents: mint `#49B88E`, mint soft `#DDF5E8`, yellow `#F8D85E`, sky `#A7CEFF`.
- Desktop rail active item uses coral-faint surface with dark text, not black active blocks.
- CTA uses dark ink pill for broad social actions, coral stays as pins, saved-state, and warmth cue.
- Radius stays restrained: 8px for web cards and panels, `999px` only for chips, search, avatars, and CTAs.

---

## 1. Brand Identity

- **앱 이름**: LOCA
- **로고 스타일 (v2)**: `loca` + 엠버 점(`.` `--accent`), font-weight 900, letter-spacing -0.04em
- **로고 스타일 (v1, 레거시)**: Bold, letter-spacing: -0.5px, color: #2D4A3E
- **타겟 사용자**: 20~30대 (참고자료에서는 여성을 1차 타깃으로 명시), 로컬 탐험·장소 기록에 관심 있는 사용자
- **디자인 톤**: 따뜻한 뉴트럴(Cream & Ember), AI스럽지 않은 감성. **보라색 그라데이션 금지** (lilac 단색은 허용 — 경로 기본색).

---

## 2. Color System

### 2.1 Brand Colors

| 토큰 | Hex | 용도 |
|------|-----|------|
| `--color-primary` | `#FF6B35` | CTA 버튼, 핀 마커, 강조 요소 |
| `--color-secondary` | `#2D4A3E` | 로고, 헤더 요소, Editor 뱃지, 모자 |
| `--color-background` | `#FAF5EE` | 앱 전체 배경 |
| `--color-card` | `#FFFFFF` | 카드, 리스트 컨테이너 배경 |
| `--color-text-primary` | `#1A1A1A` | 제목, 본문 |
| `--color-text-secondary` | `#888888` | 보조 텍스트 (구 #aaaaaa도 혼용) |
| `--color-text-tertiary` | `#aaaaaa` | 힌트, placeholder |
| `--color-text-description` | `#666666` | 설명, 바이오 |
| `--color-danger` | `#E24B4A` | 삭제 버튼 |

### 2.2 Accent Colors

| 토큰 | 배경 | 텍스트 | 용도 |
|------|------|--------|------|
| `--accent-warm` | `#FFF4EB` | `#993C1D` | 핀, 카페, 한옥, 전시 관련 |
| `--accent-amber` | `#FAEEDA` | `#633806` | 맛집, 빵, 야경 관련 |
| `--accent-mint` | `#E1F5EE` | `#085041` | 산책, 여행, 바다, 레벨 뱃지 |
| `--accent-sky` | `#E6F1FB` | `#0C447C` | 하늘, 초기 캐릭터 |
| `--accent-purple` | `#EEEDFE` | `#3C3489` | 밤하늘 캐릭터 |

### 2.3 Mapping Type Colors

맵핑 타입(핀/경로/구역)에 일관되게 사용하는 컬러 세트.

| 타입 | 아이콘 색 | 아이콘 배경 | 태그 배경 | 태그 텍스트 |
|------|----------|------------|----------|------------|
| 핀 (pin) | `#FF6B35` (fill) | `#FFF4EB` | `#FFF4EB` | `#993C1D` |
| 경로 (route) | `#0F6E56` (stroke) | `#E1F5EE` | `#E1F5EE` | `#085041` |
| 구역 (area) | `#854F0B` (stroke) | `#FAEEDA` | `#FAEEDA` | `#633806` |

### 2.4 Border & Divider

| 용도 | 값 |
|------|-----|
| 카드 보더 | `0.5px solid rgba(0,0,0,.06)` |
| 카드 보더 (약간 강조) | `0.5px solid rgba(0,0,0,.08)` |
| 리스트 구분선 | `0.5px solid rgba(0,0,0,.04)` |
| 세컨더리 버튼 보더 | `0.5px solid rgba(45,74,62,.2)` |
| 삭제 버튼 보더 | `0.5px solid rgba(226,75,74,.2)` |

### 2.5 Regional Color System

지도 카드 배경색을 장소의 광역시도에 따라 자동 배정. 각 광역시도는 4단계 스펙트럼(dark/mid/light/pale)을 가짐.

```typescript
const REGION_COLORS: Record<string, [string, string, string, string]> = {
  // 수도권 (Warm Earth)
  서울: ['#D4836B', '#D99580', '#E0A896', '#E8BCAD'],
  경기: ['#C48B4C', '#D4A06A', '#E0B585', '#ECCAA0'],
  인천: ['#C87F5A', '#D49572', '#E0AB8C', '#ECC2A8'],
  // 충청권 (Green)
  대전: ['#7A9E6B', '#92B284', '#AAC49D', '#C2D6B8'],
  세종: ['#6E9470', '#88AA89', '#A2BEA3', '#BCD3BD'],
  충북: ['#8A9B5E', '#9FB078', '#B4C492', '#C9D6AE'],
  충남: ['#7D9978', '#96AE91', '#AFC3AA', '#C8D8C4'],
  // 호남권 (Teal)
  광주: ['#5A9E91', '#74B2A5', '#90C4B8', '#ACD6CC'],
  전북: ['#5B9485', '#76AA9C', '#92BEB2', '#AED2C8'],
  전남: ['#4E8E8A', '#6AA5A0', '#88BAB6', '#A6D0CC'],
  // 영남권 (Blue)
  부산: ['#5B7EA5', '#7596B8', '#90AECA', '#ABC6DC'],
  대구: ['#7A7BA5', '#9495B8', '#AEAFCA', '#C8C9DC'],
  울산: ['#6B82A0', '#859AB4', '#9FB2C6', '#BACAD8'],
  경북: ['#6E7A9E', '#8894B2', '#A3AEC5', '#BEC8D8'],
  경남: ['#5E7E98', '#7896AE', '#94AEC2', '#B0C6D6'],
  // 기타
  강원: ['#4A7A60', '#649478', '#80AE92', '#9CC8AC'],
  제주: ['#C47A6E', '#D09488', '#DCAEA2', '#E8C8BE'],
};
```

#### 사용법

```typescript
function getCardColors(province: string, district: string) {
  const palette = REGION_COLORS[province] || REGION_COLORS['서울'];
  const hash = [...district].reduce((h, c) => c.charCodeAt(0) + ((h << 5) - h), 0);
  const idx = Math.abs(hash) % 4;
  return {
    base: palette[3],      // 카드 전체 배경
    blob1: palette[0],     // 좌하단 blob (opacity .45)
    blob2: palette[3],     // 우상단 blob (opacity .5)
    blob3: palette[1],     // 중앙 blob (opacity .3)
    chip: palette[0],      // 지역 칩 (opacity .4)
  };
}
```

---

## 3. Typography

### 3.1 Font Family

| 용도 | 폰트 |
|------|------|
| 본문 (기본) | Pretendard |
| 섹션 타이틀 (인기 지도, 내 지도 등) | MaruBuri (serif) |

### 3.2 Font Scale

| 요소 | 크기 | 굵기 | 색상 |
|------|------|------|------|
| 페이지 타이틀 | 20px | 500 | `#1A1A1A` |
| 섹션 타이틀 | 14~16px | 500 | `#1A1A1A` (serif) |
| 카드 제목 | 13~14px | 500 | `#1A1A1A` |
| 본문 | 11~12px | 400 | `#666666` |
| 보조 텍스트 | 10~11px | 400 | `#aaaaaa` |
| 태그/뱃지 | 9~10px | 500 | (컬러별 상이) |
| 미니 라벨 | 8~9px | 400~500 | `#aaaaaa` |

### 3.3 규칙

- `letter-spacing: -0.3px` — 섹션 타이틀(serif)에 적용
- `line-height: 1.4~1.5` — 본문/설명
- `font-weight: 500`까지만 사용 (600, 700 사용 금지)

---

## 4. Spacing & Layout

### 4.1 Page Padding

| 영역 | padding |
|------|---------|
| 화면 좌우 | 14~16px |
| 헤더 상단 | 12~14px |
| 섹션 간 간격 | 14~16px |

### 4.2 Border Radius

| 요소 | radius |
|------|--------|
| 카드 | 14px |
| 리스트 컨테이너 | 14px |
| 입력 필드 | 10~12px |
| 버튼 | 10px |
| 태그/뱃지 | 8~10px |
| 아바타/아이콘 | 10~14px (라운드 사각형) |
| 원형 (알림 등) | 50% |

### 4.3 Gap

| 용도 | gap |
|------|-----|
| 카드 그리드 (2열) | 7~8px |
| 리스트 아이템 내부 | 10~12px |
| 태그 칩 사이 | 4~6px |
| 버튼 나란히 | 8px |
| 섹션 내 요소 간 | 10~12px |

---

## 5. Components

### 5.1 Buttons

#### Primary (CTA)

```css
background: #FF6B35;
color: #fff;
font-size: 11px;
font-weight: 500;
padding: 7~9px 0;
border-radius: 10px;
border: none;
```

#### Secondary (Outlined)

```css
background: #fff;
color: #2D4A3E;
font-size: 11px;
font-weight: 500;
padding: 7~9px 0;
border-radius: 10px;
border: 0.5px solid rgba(45,74,62,.2);
```

#### Danger (삭제)

```css
background: #fff;
color: #E24B4A;
font-size: 11px;
font-weight: 500;
padding: 8px 0;
border-radius: 10px;
border: 0.5px solid rgba(226,75,74,.2);
```

#### Follow (팔로우)

| 상태 | 배경 | 텍스트 | 보더 |
|------|------|--------|------|
| 팔로우 전 | `#FF6B35` | `#fff` | 없음 |
| 팔로잉 | `#fff` | `#2D4A3E` | `0.5px solid rgba(45,74,62,.2)` |
| 미니 팔로우 (검색) | `#FFF4EB` | `#FF6B35` | 없음 |

### 5.2 Tags / Badges

#### 카테고리 태그 (칩)

```css
padding: 2~3px 7~8px;
border-radius: 8px;
font-size: 9~10px;
font-weight: 500;
```

색상은 §2.3 Mapping Type Colors 또는 §2.2 Accent Colors 참조.

#### Editor / Event 뱃지

| 타입 | 배경 | 텍스트 |
|------|------|--------|
| Editor | `#2D4A3E` | `#E1F5EE` |
| Event | `#FF6B35` | `#FFFFFF` |

#### Level 뱃지

```css
font-size: 9px;
font-weight: 500;
padding: 2px 7px;
border-radius: 8px;
```

색상은 캐릭터 스펙(LOCA_Character_Spec.md) §6 참조.

#### 필터 칩

| 상태 | 배경 | 텍스트 | 보더 |
|------|------|--------|------|
| 활성 | `#2D4A3E` | `#E1F5EE` | 없음 |
| 비활성 | `#fff` | `#1A1A1A` | `0.5px solid rgba(0,0,0,.08)` |

### 5.3 Input Fields

```css
width: 100%;
background: #FAF5EE;
border: none;
border-radius: 10~12px;
padding: 9~10px 12px;
font-size: 12px;
color: #1A1A1A;
```

Placeholder: `color: #aaa`

### 5.4 Search Bar

```css
background: #fff;
border-radius: 12px;
padding: 9px 12px;
border: 0.5px solid rgba(0,0,0,.06);
/* 좌측에 SearchIcon 14px #aaa */
```

### 5.5 Cards

#### 지도 카드 (Full-bleed immersive)

```
높이: 208px (내 지도 탭) / 145~155px (갤러리 축소)
border-radius: 14px (일반) / 11px (갤러리)
overflow: hidden
배경: 지역 컬러 pale 톤
```

구조:
- 배경: Soft gradient zone (3개 ellipse blob)
- 좌상단: 지역 칩 (`rgba(0,0,0,.3)` bg, `#fff` text, 8~10px)
- 우상단: Editor/Event 뱃지
- 하단: `linear-gradient(transparent, rgba(0,0,0,.5))` 오버레이
  - 제목 (14px, 500, #fff)
  - 맵핑 카운트 (핀/경로/구역 아이콘 + 숫자)
  - 수정일 or D-day

#### 리스트 카드 (컨테이너)

```css
background: #fff;
border-radius: 14px;
padding: 4px 14px;
border: 0.5px solid rgba(0,0,0,.05);
```

내부 아이템 구분: `border-bottom: 0.5px solid rgba(0,0,0,.04)`

### 5.6 Floating Action Button (FAB)

```css
width: 36px;
height: 36px;
border-radius: 10px;
background: #fff;
border: 0.5px solid rgba(0,0,0,.06);
```

활성 상태: 해당 타입 컬러로 border 1.5px
토글 ON: `background: #FF6B35; border: none; color: #fff`

### 5.7 Avatar

| 용도 | 크기 | radius |
|------|------|--------|
| 프로필 | 54px | 14px |
| 홈 히어로 카드 | 46px | 14px |
| 추천 에디터 (카드) | 38~40px | 50% |
| 추천 에디터 (리스트) | 40px | 50% |

배경색: 지역 컬러 pale 톤
이니셜 색: 지역 컬러 dark 톤
인증 뱃지: `16px, border-radius: 5px, bg: #2D4A3E, border: 2px solid #FAF5EE`

### 5.8 Stat Bar (통계)

```css
background: #fff;
border-radius: 12px;
border: 0.5px solid rgba(0,0,0,.05);
display: flex;
```

각 항목: `flex: 1; text-align: center; padding: 8px 0`
숫자: `font-size: 17px; font-weight: 500; color: #1A1A1A`
라벨: `font-size: 9px; color: #aaa`
구분선: `width: 0.5px; background: rgba(0,0,0,.06)`

### 5.9 Tab Bar

| 상태 | 텍스트 색 | 굵기 | 하단 선 |
|------|----------|------|---------|
| 활성 | `#1A1A1A` | 500 | `2px solid #FF6B35` |
| 비활성 | `#aaa` | 400 | 없음 |

공통: `font-size: 12px; padding: 10px 0; flex: 1; text-align: center`

---

## 6. Bottom Navigation

### 구조

5개 탭: 홈, 지도, 장소, 검색, 프로필

```css
height: 52px;
background: #fff;
border-top: 0.5px solid rgba(0,0,0,.06);
display: flex;
align-items: center;
justify-content: space-around;
```

### 아이콘

| 상태 | 스타일 | 색상 |
|------|--------|------|
| 비선택 | stroke-only, 1.5px | `#aaa` |
| 선택 | filled | `#2D4A3E` |

선택된 탭 하단에 dot indicator:
```css
width: 4px;
height: 4px;
border-radius: 50%;
background: #FF6B35;
margin: 3px auto 0;
```

라벨 텍스트 없음 (아이콘만).

---

## 7. Mapping Type Icons

앱 전체에서 핀/경로/구역을 표현하는 통일 아이콘.

### 핀 (Pin)

```svg
<!-- Filled drop shape -->
<svg viewBox="0 0 24 24" fill="#FF6B35" stroke="none">
  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/>
  <circle cx="12" cy="10" r="2.5" fill="#FFF4EB"/>
</svg>
```

### 경로 (Route)

```svg
<!-- Polyline -->
<svg viewBox="0 0 24 24" fill="none" stroke="#0F6E56" stroke-width="1.8" stroke-linecap="round">
  <path d="M4 19L10 7L16 14L20 5"/>
</svg>
```

### 구역 (Area)

```svg
<!-- Dashed rounded rect -->
<svg viewBox="0 0 24 24" fill="none" stroke="#854F0B" stroke-width="1.8" stroke-linecap="round" stroke-dasharray="3 2">
  <rect x="4" y="4" width="16" height="16" rx="3"/>
</svg>
```

### 사이즈 가이드

| 용도 | 아이콘 크기 | 숫자 크기 |
|------|-----------|----------|
| 지도 바 (카운트) | 10px | 10px |
| 카드 하단 | 9~10px | 9~10px |
| 갤러리 카드 | 7~8px | 8px |
| 장소 목록 좌측 | 18px | - |
| 필터 칩 내부 | 8px | - |
| 장소 카드 (횡스크롤) | 14px | - |

---

## 8. Map Pin Design

지도 위에 표시되는 핀 마커 스타일.

### 핀 dot

```css
width: 12px;
height: 12px;
border-radius: 50%;
background: #FF6B35;
border: 2px solid #fff;
```

### 이름 라벨 (토글 ON 시)

```css
background: #fff;
padding: 2px 6px;
border-radius: 6px;
font-size: 8px;
font-weight: 500;
color: #1A1A1A;
margin-top: 2px;
border: 0.5px solid rgba(0,0,0,.06);
white-space: nowrap;
```

### 선택 상태

```css
border: 2px solid #2D4A3E; /* 기본: 2px solid #fff */
```

### 타입별 dot 색상

| 타입 | dot 색 |
|------|--------|
| 핀 | `#FF6B35` |
| 경로 포인트 | `#0F6E56` |
| 구역 중심 | `#854F0B` |

---

## 9. Header Patterns

### 앱 헤더 (공통)

```tsx
<div style={{
  padding: '12~14px 14~16px 4~6px',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
}}>
  <span style={{
    fontSize: 14~15, fontWeight: 700,
    color: '#2D4A3E', letterSpacing: -0.5,
  }}>LOCA</span>
  {/* 우측: 알림 or 설정 아이콘 */}
</div>
```

알림 아이콘: `28px circle, bg: #2D4A3E, icon: #FAF5EE`

### 타인 프로필/상세 진입 시

```tsx
{/* 좌측에 뒤로가기 추가 */}
<BackIcon size={18} color="#2D4A3E" />
{/* 우측에 더보기 아이콘 */}
<MoreIcon size={18} color="#2D4A3E" /> {/* ··· */}
```

### 지도 편집 시

```tsx
{/* 헤더 아래에 편집 상태 표시 */}
<p style={{ fontSize: 9, color: '#aaa' }}>{mapName} · 편집 중</p>
{/* 반투명 배경 */}
background: rgba(250, 245, 238, .95);
```

---

## 10. Empty States

### 공통 구조

```tsx
<div style={{
  display: 'flex', flexDirection: 'column',
  alignItems: 'center', padding: '40~60px 20px', gap: 8~10,
}}>
  {/* 아이콘 원 */}
  <div style={{
    width: 48~56, height: 48~56, borderRadius: '50%',
    background: '#FFF4EB',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  }}>
    <Icon size={20~24} color="#FF6B35" />
  </div>
  {/* 제목 */}
  <p style={{ fontSize: 13~14, fontWeight: 500, color: '#1A1A1A' }}>
    {title}
  </p>
  {/* 설명 */}
  <p style={{ fontSize: 11~12, color: '#aaa', textAlign: 'center' }}>
    {description}
  </p>
  {/* CTA (선택) */}
  <button>...</button>
</div>
```

### 화면별 빈 상태 메시지

| 화면 | 제목 | 설명 | CTA |
|------|------|------|-----|
| 장소 목록 (0개) | 아직 저장한 장소가 없어요 | 지도에서 핀을 찍거나 경로를 그려보세요 | - |
| 프로필 지도 (0개) | 아직 만든 지도가 없어요 | 첫 번째 지도를 만들어보세요 | - |
| 검색 결과 없음 | "{query}"에 대한 결과가 없어요 | 다른 키워드로 검색해보세요 | - |
| 찾기 (에디터 0명) | 아직 에디터가 없어요 | 친구를 초대해서 서로의 지도를 구독해보세요 | 친구 초대하기 |

---

## 11. Auto-Generated Editor Tags

에디터의 지도 데이터를 분석해 자동 생성되는 태그.

### 추출 로직

가장 많이 핀 찍힌 장소 카테고리(카카오/네이버 API 기준) → 태그 매핑.

### 매핑 테이블

| 장소 카테고리 | 표시 태그 | 색상 그룹 |
|-------------|-----------|-----------|
| 카페 | 카페 탐험가 | Warm |
| 음식점 | 로컬 맛집 | Amber |
| 빵/디저트 | 빵지순례 | Amber |
| 공원/산책로 | 산책 코스 | Mint |
| 관광명소 | 여행 스팟 | Mint |
| 전통/한옥 | 한옥 전문 | Warm |
| 야경/전망대 | 야경 스팟 | Amber |
| 전시/갤러리 | 전시 큐레이터 | Warm |
| 해변/바다 | 바다 여행 | Mint |
| 기타/혼합 | 동네 탐험가 | Warm |

### 색상 그룹

| 그룹 | 배경 | 텍스트 |
|------|------|--------|
| Warm | `#FFF4EB` | `#993C1D` |
| Amber | `#FAEEDA` | `#633806` |
| Mint | `#E1F5EE` | `#085041` |

---

## 12. Character System (뭉게)

폭신한 구름 캐릭터. 10단계 진화.

### 성장 요약

| Lv | 이름 | 등급명 | 구름색 | 봉우리 | 핵심 소품 |
|----|------|--------|--------|--------|-----------|
| 1 | 아기 뭉게 | 씨앗 탐험가 | 반투명 | 2 | 없음 |
| 2 | 맑은 뭉게 | 새싹 탐험가 | 흰색 | 3 | 볼터치 |
| 3 | 꽃 뭉게 | 꼬마 탐험가 | 흰색 | 4 | 꽃 |
| 4 | 탐험 뭉게 | 동네 탐험가 | 흰색 | 5 | 모자+가방 |
| 5 | 모험 뭉게 | 거리 탐험가 | 흰색 | 6 | 모자+배낭+반짝이 |
| 6 | 노을 뭉게 | 로컬 가이드 | 핑크 | 6 | 색상 진화 |
| 7 | 밤하늘 뭉게 | 에디터 | 보라 | 6 | 별 이펙트 |
| 8 | 황금 뭉게 | 시니어 에디터 | 황금 | 6 | 왕관 |
| 9 | 오로라 뭉게 | 마스터 에디터 | 민트 | 6 | 큰 왕관 |
| 10 | 레전드 뭉게 | 레전드 | 순백 | 7 | 대관+파티클 |

### 렌더링 사이즈

| 용도 | 사이즈 |
|------|--------|
| 지도 마커 | 24~40px (Lv에 따라) |
| 프로필 아바타 | 54px |
| 홈 프로필 카드 | 46px |
| 등급표 | 80px |

상세 스펙: `LOCA_Character_Spec.md` 참조.

---

## 13. Screen Inventory

각 화면의 상세 스펙은 개별 파일 참조.

| 화면 | 스펙 파일 | 핵심 컴포넌트 |
|------|-----------|-------------|
| 홈 | (본 문서 기준) | 프로필 히어로, 업적 배너, 인기 지도, 이벤트 |
| 내 지도 탭 | `LOCA_MapCard_Spec.md` | 지도 카드 (Full-bleed, 지역 컬러) |
| 장소 목록 | `LOCA_PlacesList_Spec.md` | 타입별 아이콘, 필터 칩 |
| 찾기 | `LOCA_Search_Spec.md` | 내 근처/추천 에디터, 자동 태그 |
| 프로필 | `LOCA_Profile_Spec.md` | 내/타인 분기, 팔로우, 2열 갤러리 |
| 지도 편집 | `LOCA_MapEditor_Spec.md` | FAB 도구, 핀 라벨, 필터 |
| 장소 상세 | `LOCA_PlaceDetail_Spec.md` | 2탭 (정보/기록), 퀵 프리뷰 |
| 지도 피드 상세 | `LOCA_MapFeedDetail_Spec.md` | 작성자 정보, 장소 미리보기 |
| 캐릭터 등급 | `LOCA_Character_Spec.md` | 뭉게 10단계, 렌더링 가이드 |

---

## 14. Do's and Don'ts

### Do's

- 지역 컬러 시스템을 일관되게 사용
- 핀/경로/구역 타입 컬러를 모든 화면에서 통일
- 입력 필드 배경은 항상 `#FAF5EE`
- 카드 보더는 항상 `0.5px`
- 버튼 radius는 `10px`
- 태그/뱃지는 `8px` radius
- 빈 상태에 항상 따뜻한 안내 메시지

### Don'ts

- 보라색 그라데이션 사용 금지 (AI스러움)
- `font-weight: 600` 이상 사용 금지
- 이모지를 아이콘 대신 사용 금지 (SVG 아이콘 사용)
- `border-radius: 50%`를 카드에 사용 금지 (아바타/알림에만)
- 단색 배경 카드 사용 금지 (blob 패턴 사용)
- 거리(km) 직접 표시 금지 (위치 특정 위험 — 구 단위만)
- "새 장소"를 기본 이름으로 방치 금지 (실제 장소명 유도)
- 소셜 인터랙션 (좋아요/댓글) 현재 미구현

---

## 15. File Structure Reference

```
/specs/
  DESIGN.md                  ← 이 파일 (전체 가이드라인)
  LOCA_MapCard_Spec.md       ← 지도 카드 컴포넌트
  LOCA_PlacesList_Spec.md    ← 장소 목록 화면
  LOCA_Search_Spec.md        ← 찾기 화면
  LOCA_Profile_Spec.md       ← 프로필 화면
  LOCA_MapEditor_Spec.md     ← 지도 편집 화면
  LOCA_PlaceDetail_Spec.md   ← 장소 상세 화면
  LOCA_MapFeedDetail_Spec.md ← 지도 피드 상세
  LOCA_Character_Spec.md     ← 캐릭터 등급 시스템

/assets/characters/
  cloud_lv1.svg ~ cloud_lv10.svg  ← 캐릭터 SVG 레퍼런스
```
