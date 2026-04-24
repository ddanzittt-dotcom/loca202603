# Event Collaboration QA Runbook

목적:

- 운영 반영 전 이벤트 협업 권한/승인 플로우를 자동 점검
- 실패 시 환경 변수 누락/계정 이슈를 빠르게 분리

## 1) 사전 조건

- `.env` 또는 `.env.local`에 아래 값 설정
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
  - `LOCA_QA_USER_A_EMAIL`
  - `LOCA_QA_USER_A_PASSWORD`
  - `LOCA_QA_USER_B_EMAIL`
  - `LOCA_QA_USER_B_PASSWORD`
- QA 계정 2개는 반드시 이메일 확인(confirmed) 완료 상태

## 2) 실행 순서

### 2-1. 사전 점검

```bash
npm run qa:event-collab-preflight
```

성공 기준:

- `PRECHECK_OK` 출력
- User A/B 로그인 검증 통과

### 2-2. 본 점검

```bash
npm run qa:event-collab-roles
```

또는 한 번에:

```bash
npm run qa:event-collab-roles:ready
```

## 3) 결과 확인

- 산출물: `.qa-artifacts/event-collab-roles-qa-<timestamp>.json`
- 핵심 지표:
  - `allPass=true`
  - assertion pass/total 확인

## 4) 자주 발생하는 실패와 조치

1. `Missing LOCA_QA_USER_*`
: 환경 변수 누락, `.env.local`에 추가 후 재실행

2. `Email not confirmed`
: Supabase Auth에서 QA 계정 이메일 확인 처리

3. 권한 정책 관련 실패
: `supabase/manual/security_apply_and_verify.sql` 실행 후 재시도

