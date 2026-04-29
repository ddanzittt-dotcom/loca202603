# LOCA · 홈 탭 시각 리디자인 구현 브리프

## 배경

LOCA 홈 탭(`HomeScreen.jsx`)의 **시각 디자인만** 정돈하는 작업입니다. 정보 구조 · 우선순위 · 컴포넌트 구성 · 인터랙션은 **건드리지 않습니다**. 옷을 다림질하는 수준의 마감 작업입니다.

## 작업 스코프

**범위 안**
- 홈 탭의 컬러 토큰 정합성
- 타이포 통일 (명조체 적용 영역)
- 카드 radius / 보더 / 그림자 정돈
- 캐릭터·이름·레벨·통계의 시각 위계 정돈
- 디테일 마감 (XP 바 그라데이션, 구분선, FAB 그림자 등)

**범위 밖**
- 정보 우선순위 변경
- 새 섹션 추가 (내 지도, 모두의 지도, 이벤트 배너 등 모두 **추가 금지**)
- 컴포넌트 구조 재설계
- 라벨 텍스트 변경
- 인터랙션 동작 변경
- 데이터 흐름 변경

> **주의**: 별도 보고서나 시안에서 "내 지도", "모두의 지도", "이벤트 배너"를 홈에 추가하자는 제안이 있더라도, 이 작업에서는 절대 반영하지 마세요. 홈 탭 5개 섹션 구조를 유지합니다.

## 참고 파일

작업 시작 전 이 세 파일을 모두 열어보세요.

1. `DESIGN.md` — 디자인 시스템 토큰 (Single Source of Truth)
2. `design/loca_home_redesign_v4.html` — **시각적 정답지** (기존/신규 사용자 두 케이스)
3. `src/screens/HomeScreen.jsx` — 수정 대상 컴포넌트

시안은 구현의 기준입니다. 픽셀 값, 간격, 컬러까지 v4를 따르되, DESIGN.md와 충돌하면 DESIGN.md를 우선합니다.

## 선행 단계 (권장 순서)

1. 현재 `HomeScreen.jsx`의 5개 섹션 위치와 데이터 흐름 파악
2. `DESIGN.md` 토큰과 현재 사용 중인 색상/폰트의 차이 식별
3. 시안 v4의 각 변경점이 기존 코드의 어디에 매핑되는지 정리
4. 그 다음 변경 착수

기존 컴포넌트 시그니처(props, state, 이벤트 핸들러)는 절대 바꾸지 마세요. **CSS와 JSX 마크업의 시각 속성**만 변경 대상입니다.

---

## 홈 탭 5개 섹션 (모두 유지)

```
1. 헤더 (LOCA 로고 + 알림 벨)
2. 프로필 카드
   ├ 캐릭터 + 이름 + 핸들 + 레벨 + tier
   ├ XP 바 + 메타
   ├ 통계 3개 (장소 / 지도 / 연속)
   └ RESUME / FIRST STEP 모듈
3. MY LOG 히어로 (기록하기 / 시작하기)
4. PICKED 추천 지도 (가로 스크롤)
5. 탭바
```

각 섹션의 **개수, 순서, 역할은 변경 금지**.

---

## 신규 / 기존 사용자 분기 (유지)

| 항목 | 기존 사용자 (Lv 5+) | 신규 사용자 (Lv 1) |
|---|---|---|
| 캐릭터 | 모험 뭉게 (warm 톤) | 아기 뭉게 (sky 톤) |
| 인사말 | (없음) | "WELCOME" 배지 + "수아 님," |
| 프로필 glow | warm bg | sky bg |
| XP 바 | 채워진 상태 (62%) | 거의 빈 상태 (4%) |
| 통계 영역 | 3개 통계 표시 | (시안에서는 통계 자리에 FIRST STEP 모듈로 대체했지만, 실 구현에서는 기존 정책 유지) |
| RESUME | "성수 카페 산책 · 장소 3개" | "FIRST STEP · 첫 장소를 남겨볼까요?" |
| 히어로 타이틀 | "오늘은 어디에 다녀왔어요?" | "오늘부터 나만의 지도" |
| 히어로 sub | (없음) | "좋았던 장소 한 곳부터 시작해요" |
| 히어로 CTA | "기록하기" | "시작하기" |
| PICKED 타이틀 | "LOCA가 고른 지도" | "이런 지도부터 둘러볼까요" |
| 탭바 FAB | 정적 | pulse 애니메이션 |

> 분기 자체는 기존 그대로. **콘텐츠 텍스트는 절대 임의로 바꾸지 마세요**. 이미 있는 게 맞으면 그대로 두고, 없으면 시안 텍스트를 적용.

---

## 시각 변경 사항 (12가지)

이 12가지를 정확히 적용하면 끝입니다. 그 이상도, 이하도 안 됩니다.

### 1. 명조체 통일

**적용 대상** (모두 `Nanum Myeongjo` serif):
- LOCA 로고 (헤더)
- 사용자 이름 ("수아", "수아 님,")
- 히어로 타이틀 ("오늘은 어디에 다녀왔어요?", "오늘부터 나만의 지도")
- PICKED 섹션 타이틀 ("LOCA가 고른 지도", "이런 지도부터 둘러볼까요")

**제외 대상** (기존 sans 유지):
- 영문 보조 태그 (MY LOG, RESUME, PICKED, FIRST STEP, WELCOME)
- 핸들 (@sua_walks)
- 통계 숫자, 메타 정보, 버튼 텍스트

### 2. 카드 radius 18px로 통일

| 컴포넌트 | 기존 | 변경 |
|---|---|---|
| 프로필 카드 | `22px` | `18px` |
| 히어로 카드 | `22px` | `18px` |
| PICKED 컨테이너 | `22px` | `18px` |
| PICKED 썸네일 | `12px` | `12px` (유지) |
| RESUME 아이콘 박스 | `11px` | `12px` |
| PICKED 카드 thumb | 유지 | 유지 |

### 3. 프로필 카드 glow 블롭 확대

```css
.pc-glow {
  position: absolute;
  top: -36px;          /* 기존: -30px */
  right: -32px;        /* 기존: -30px */
  width: 130px;        /* 기존: 120px */
  height: 130px;       /* 기존: 120px */
  border-radius: 50%;
  background: var(--accent-warm-bg);
  opacity: 0.55;       /* 기존: 0.4 */
}
.pc-glow.new {
  background: var(--accent-sky-bg);
  opacity: 0.7;
}
```

### 4. 캐릭터 이름과 사용자 이름 역할 분리

**캐릭터 아래** = 캐릭터 이름만 (`모험 뭉게`, `아기 뭉게`)
**캐릭터 옆 우측** = 사용자 이름만 (`수아`, `수아 님,`)

이전엔 두 곳에 같은 정보가 섞여 보였던 부분을 명확히 분리. 마크업 자체를 새로 만들 필요 없이 **현재 위치의 텍스트가 정확한지만 확인**하면 됩니다.

### 5. 레벨 칩 다이어트

```css
.pc-lv {
  font-size: 10px;          /* 기존: 12px */
  font-weight: 500;
  color: #fff;
  background: var(--color-secondary);
  padding: 2px 9px;         /* 기존: 3px 10px */
  border-radius: 999px;
  letter-spacing: 0.3px;
}
```

### 6. XP 바 그라데이션

```css
.pc-xp-bar {
  width: 100%;
  height: 5px;              /* 기존: 6px */
  background: var(--color-background);
  border-radius: 3px;
  overflow: hidden;
  border: 0.5px solid rgba(0,0,0,0.04);   /* 신규: 윤곽선 */
}
.pc-xp-fill {
  height: 100%;
  background: linear-gradient(90deg, #E9B547 0%, #F2C870 100%);
  /* 기존: 단색 #E9B547 */
  border-radius: 3px;
}
```

### 7. 통계 3개 사이에 세로 구분선

```css
.pc-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  padding: 14px 0;
}
.pc-stat {
  position: relative;
}
.pc-stat:not(:last-child)::after {
  content: '';
  position: absolute;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 0.5px;
  height: 16px;
  background: rgba(0,0,0,0.08);
}
```

이전엔 grid 분할만으로 처리되어 카운트 사이 경계가 흐릿했습니다. 16px 짜리 세로 구분선이 들어가면 시각 위계가 살아납니다.

### 8. 통계 숫자 / 라벨 정돈

```css
.pc-stat-num {
  font-size: 13.5px;        /* 기존: 14px */
  font-weight: 500;
  font-variant-numeric: tabular-nums;   /* 신규 */
  letter-spacing: -0.2px;
}
.pc-stat-label {
  font-size: 10.5px;        /* 기존: 11px */
  color: var(--color-text-tertiary);
}
```

### 9. RESUME 모듈 정돈

```css
.pc-resume-ico {
  width: 36px;              /* 기존: 34px */
  height: 36px;
  border-radius: 12px;      /* 기존: 11px */
  background: var(--accent-warm-bg);
  color: var(--color-primary);
}
.pc-resume-ico.new {        /* 신규 사용자용 */
  background: var(--accent-amber-bg);
  color: var(--accent-amber-fg);
}
.pc-resume-cta {
  font-size: 11.5px;
  color: var(--color-primary);   /* 일관된 primary orange */
  font-weight: 500;
}
```

### 10. 히어로 블롭 3개 (기존 사용자 포함)

기존 시안에서는 신규 사용자에게만 3번째 블롭(`hero-blob3`)이 있었습니다. v4에서는 둘 다 사용 또는 둘 다 미사용 중 선택. 권장은 **둘 다 사용** (살짝 더 활기 있는 톤).

```css
.hero-blob1 {
  position: absolute;
  top: -22px;
  right: -28px;
  width: 96px;
  height: 96px;
  border-radius: 50%;
  background: rgba(255,107,53,0.18);
}
.hero-blob2 {
  position: absolute;
  top: 14px;
  right: 24px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: rgba(233,181,71,0.55);
}
.hero-blob3 {
  position: absolute;
  top: 32px;
  right: 56px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: rgba(233,181,71,0.4);
}
```

### 11. PICKED 카드 약간 확대

```css
.pk-card {
  flex: 0 0 96px;           /* 기존: 94px */
}
.pk-thumb {
  width: 100%;
  height: 64px;             /* 기존: 60px */
  border-radius: 12px;
  margin-bottom: 8px;       /* 기존: 6px */
}
.pk-name {
  font-size: 11.5px;        /* 기존: 12px */
  letter-spacing: -0.1px;
  line-height: 1.3;
}
.pk-author {
  font-size: 9.5px;
  color: var(--color-text-tertiary);
}
```

PICKED 카드 데이터를 4개 이상 노출하여 가로 스크롤 어포던스를 강화하세요. 기존에 3개만 있었다면 1개 추가 (시안의 4번째: 전주 한옥마을 류).

### 12. 탭바 FAB 그림자 강화

```css
.tab-fab {
  width: 46px;
  height: 46px;
  border-radius: 50%;
  background: var(--color-primary);
  color: #fff;
  margin: -8px auto 0;      /* 기존: -6px */
  border: 0;
  box-shadow: 0 4px 14px rgba(255,107,53,0.32);   /* 신규 */
}
.tab-fab.pulse::after {
  content: '';
  position: absolute;
  inset: -5px;              /* 기존: -4px */
  border-radius: 50%;
  border: 1.5px solid var(--color-primary);
  opacity: 0.4;
  animation: pulse 1.8s ease-out infinite;
}
@keyframes pulse {
  0%, 100% { opacity: 0.4; transform: scale(1); }
  50% { opacity: 0; transform: scale(1.18); }
}
```

`pulse` 클래스는 **신규 사용자에게만** 적용 (기존 분기 로직 유지).

---

## 컬러 토큰 정합성 (DESIGN.md 준수)

기존 시안에서 임의로 사용된 색상 값들이 있다면 DESIGN.md 토큰으로 교체하세요.

| 임의 색상 | DESIGN.md 토큰 |
|---|---|
| `#F7F2E8` (오프 화이트) | `var(--color-background)` (#FAF5EE) |
| `#1E3A2C` (다크 그린) | `var(--color-secondary)` (#2D4A3E) |
| `#E97442` (오렌지) | `var(--color-primary)` (#FF6B35) |
| `#FCEAE0` (연한 살구) | `var(--accent-warm-bg)` (#FFF4EB) |
| `#993C1D` (warm 텍스트) | `var(--accent-warm-fg)` (#993C1D) — 동일 |
| `#9C9890` (회색 톤) | `var(--color-text-tertiary)` (#aaaaaa) 또는 `var(--color-text-description)` (#666666) |
| `#6B6760` (어두운 회색) | `var(--color-text-description)` (#666666) |
| `#F5C4B3` (캐릭터 서브) | 캐릭터 SVG 내부 fill로만 유지 |

색상은 모두 CSS 변수로 참조하세요. 하드코딩된 hex 값이 컴포넌트 안에 남아있으면 안 됩니다.

---

## 변경하지 말 것 (CHANGES NOT ALLOWED)

- ❌ 섹션 추가 / 제거 / 순서 변경
- ❌ 라벨 텍스트 변경 (예: "기록하기" → "기록 추가")
- ❌ 데이터 호출 방식 변경
- ❌ Props / State / 이벤트 핸들러 시그니처
- ❌ 캐릭터 SVG 내부 변경 (fill 값까지 포함)
- ❌ 인터랙션 동작 (탭, 스와이프, 모달 트리거)
- ❌ 라우팅 / navigation 흐름
- ❌ 신규 / 기존 분기 판정 로직
- ❌ 통계 표시 항목 (장소 / 지도 / 연속 그대로)
- ❌ 새로운 컴포넌트 의존성 추가

---

## 완료 기준 (Acceptance Criteria)

구현 완료 전 self-check:

- [ ] 5개 섹션 그대로 유지 (헤더 / 프로필 카드 / MY LOG / PICKED / 탭바)
- [ ] 명조체가 LOCA 로고, 사용자 이름, 히어로 타이틀, PICKED 타이틀 4곳에 적용
- [ ] 영문 태그(MY LOG, RESUME, PICKED, FIRST STEP, WELCOME)는 sans-serif 유지
- [ ] 카드 radius 18px로 통일 (프로필 / 히어로 / PICKED)
- [ ] 프로필 카드 glow 블롭 130×130px 확대
- [ ] 신규 사용자 프로필은 sky 톤, 기존은 warm 톤
- [ ] 캐릭터 이름과 사용자 이름이 명확히 분리됨
- [ ] 레벨 칩 10px / padding 2px 9px
- [ ] XP 바 그라데이션 (#E9B547 → #F2C870) + 0.5px border
- [ ] 통계 3개 사이에 16px 세로 구분선 노출
- [ ] 통계 숫자에 tabular-nums 적용
- [ ] RESUME 아이콘 36×36 + radius 12px
- [ ] 히어로 블롭 3개 (기존 / 신규 모두)
- [ ] PICKED 카드 96px 폭 + 64px 썸네일 + 4개 이상 데이터
- [ ] 탭바 FAB 46×46 + 그림자 `0 4px 14px rgba(255,107,53,0.32)`
- [ ] FAB pulse 애니메이션은 신규 사용자에게만 적용
- [ ] 임의 hex 색상 없이 모두 CSS 변수 참조
- [ ] 모바일 360px 뷰포트에서 레이아웃 깨짐 없음
- [ ] HTML 시안(v4)과 픽셀 단위 비교 검증
- [ ] **데이터 흐름, props, 핸들러, 라벨 텍스트 변경 0건**

---

## 진행 방식 제안

이 작업은 분량이 크지 않으니 한 번에 진행해도 됩니다. 다만 안전하게 단계를 나누고 싶다면:

1. **1단계** — 시안 v4와 현재 `HomeScreen.jsx` diff 확인, 변경 영역 매핑
2. **2단계** — 컬러 토큰 / 폰트 정합성 (12개 변경 중 1, 명조체 통일)
3. **3단계** — 프로필 카드 시각 정돈 (3, 4, 5, 6, 7, 8)
4. **4단계** — 히어로 / PICKED / 탭바 마감 (10, 11, 12)
5. **5단계** — RESUME 모듈 (9) + 컬러 토큰 최종 정리
6. **6단계** — Acceptance Criteria 체크 + 시안과 비교

각 단계마다 중간 커밋 권장. 커밋 메시지는 프로젝트 컨벤션을 따르고, 어떤 변경 항목을 적용했는지 명시.

---

## 결정·질문 필요 항목 (임의 판단 금지)

다음은 정책 / 기존 코드 의존성 관련이라 정답이 없습니다. **임의 판단 말고 질문으로 남겨주세요**:

1. **명조체 폰트 로딩 방식** — 이미 프로젝트에 Nanum Myeongjo가 등록되어 있는지, `MaruBuri`(DESIGN.md §3 명시)와 어느 것을 쓸지?
2. **PICKED 카드 4번째 데이터 출처** — 기존에 3개만 있었다면 4번째를 어디서 가져올지 (서버 데이터 추가? 더미?)
3. **신규 사용자 통계 3개 표시 정책** — 시안에서는 신규 사용자도 통계 영역을 그대로 유지하는데, 0/0/0 노출이 적절한지 또는 기존 "FIRST STEP" 모듈로 대체하는 게 맞는지?
4. **glow 블롭의 z-index 처리** — 기존 코드에 absolute 요소들이 있다면 z-index 충돌 여부

이 4가지는 프로젝트 정책 / 데이터 의존성에 따라 답이 달라집니다.
