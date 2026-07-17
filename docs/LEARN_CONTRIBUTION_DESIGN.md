# ② 배우기 기여 시스템 설계 (스펙 v3.3 §6 · D9)

> 2026-07-17 초안 — 구현 전 하단 **결정 필요 항목(D-A~D-E)** 확정이 선행되어야 한다.
> 범위: 1차는 ② 배우기 한정 (공방 원데이클래스 · 도서관 프로그램 · 마을 강좌).
> 근거: ②의 기여 주체는 주로 기관(도서관·공방·마을회)이라 실명성·반복성이 있어 자연 검열 수준이 높다.

## 1. 데이터 모델 (migration 077 초안)

```sql
create table learn_contributions (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'pending',   -- pending | published | rejected | retracted
  created_by uuid not null references auth.users(id),

  -- 카드 내용 (explore_catalog 강좌(lifelong)와 동일 골격 — 발행 시 그대로 미러)
  title text not null,
  addr text not null,
  lat double precision,                     -- 자동검증 단계에서 지오코딩/검증
  lng double precision,
  summary text,
  phone text,
  source_url text,
  start_date date, end_date date,           -- 교육/프로그램 기간
  apply_start date, apply_end date,         -- 접수기간 ("접수중" 배지)
  detail jsonb,                             -- 기관·요일·시간·수강료·정원 등

  -- 심의 메타
  org_name text,                            -- 기관명 (기관 인증 배지 표기용)
  org_verified boolean not null default false,
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid,
  reject_reason text
);
-- RLS: 본인 행 CRUD(pending/retracted 한정) + published 공개 읽기 + admin 전체.
```

**발행 방식 — explore_catalog 미러(권장).** `published` 전환 시 `explore_catalog`에
`source='contribution'`, `tab='learn'` 행을 upsert(id = `contribution:<uuid>`).
→ 탐색 클라이언트·RPC(076)를 그대로 재사용, 클라이언트 변경 0. 반려/철회 시 미러 행 삭제.

## 2. 3단 심의 (1차 단순화)

1. **제출 시 자동 검증** — 금지어, 좌표 유효성(대한민국 bbox + 주소-좌표 근접), 중복(제목 정규화 + 500m), **상업 장소 차단(D7 — 방식은 D-C 결정)**
2. **신뢰 등급 분기** — 로컬 에디터·기관 인증 계정 → 즉시 게시(published), 일반 → pending(관리자 승인 대기)
3. **신고 기반 사후 심의 + 운영자 스팟체크** — `/admin`에 "배움 검수" 탭 추가 (pending 목록 승인/반려 + published 신고 처리)

## 3. 결정 필요 항목 — 구현 전 확정

| # | 질문 | 선택지 (권장 ★) |
|---|---|---|
| D-A | **기관 인증 방식** | ★(a) 관리자가 수동 지정(profiles에 org 플래그) — 1차 규모에 충분 / (b) 기관 이메일 도메인 검증 / (c) 사업자·고유번호 서류 확인 |
| D-B | **로컬 에디터 지정** | ★(a) admin이 profiles에 editor 플래그 수동 부여 / (b) 별도 신청·승인 플로우 |
| D-C | **상업 차단 기준** (D7) | ★(a) 1차 = 금지어 + 카카오 place-match 상호 매칭 시 pending 직행(자동 차단 아님, 오탐 방지) + 수동 검수 / (b) 상호 매칭 시 즉시 차단 / (c) 국세청 사업자 API 조회 |
| D-D | **자온길 12개 공방 시딩 데이터** | 공방 목록(이름·주소·프로그램·연락처)이 없음 — **사용자 제공 필요.** 제공되면 에디터 계정 시딩 스크립트로 초기 공백을 메운다 |
| D-E | **기여 입력 진입점 UI** | ★(a) 배우기 탭 하단 "우리 동네 배움 알리기" 버튼 → 제출 시트 / (b) 계정 메뉴 안 |

## 4. 확정 후 구현 순서

1. migration 077 (테이블+RLS) → 2. 제출 시트(LearnContributeSheet — CollectSheet 골격 재사용) →
3. 자동 검증(서버리스 or RPC) → 4. `/admin` 검수 탭 → 5. 미러 발행 로직 → 6. 자온길 시딩 → 7. QA(비로그인/일반/에디터/기관 4권한)

## 5. 이 설계가 미루는 것 (2차)

- ③ 공간 기여(익명 개인 중심 — 심의 고도화 후), 상업 장소 기여 재개 조건, 신고 UI 고도화, 기여자 프로필 노출
