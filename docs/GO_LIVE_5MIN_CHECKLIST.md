# GO LIVE 5-Minute Checklist

대상:

- LOCA 메인 앱 (`loca202603`)
- Supabase + Vercel 운영 반영 직전 최종 점검

## 1) DB Gate (SQL Editor)

1. `supabase/manual/release_gate_checks_025_028.sql` 실행
2. 아래 조건 3개 확인
   - 필수 RPC 3개 조회됨
   - `organizations.rls_enabled = true`
   - "policy 있는데 RLS off" 조회 결과 0건

## 2) QA Gate (Local)

1. 환경변수 설정
   - `LOCA_QA_USER_A_EMAIL`
   - `LOCA_QA_USER_A_PASSWORD`
   - `LOCA_QA_USER_B_EMAIL`
   - `LOCA_QA_USER_B_PASSWORD`
2. 명령 실행
   - `npm.cmd run qa:event-collab-roles:ready`
   - `npm.cmd run qa:event-collab-assert-latest`
3. 통과 조건
   - `allPass=true`
   - assert-latest `QA_ASSERT_OK`

## 3) Build Gate (Local)

1. `npm.cmd run lint`
2. `npm.cmd run build`
3. 둘 다 성공해야 배포 진행

## 4) Vercel Gate (Dashboard)

1. Environment Variables 확인
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_PUBLIC_WEB_ORIGIN`
   - `TMAP_APP_KEY` (서버 전용)
2. Production Deployment 실행
3. 배포 후 즉시 스모크
   - 홈 진입
   - 로그인
   - 지도 상세(`/s/:slug`)
   - 대시보드 주요 조회

## 5) Rollback Trigger

아래 중 하나라도 발생하면 즉시 롤백:

1. 협업 권한 오류(편집/승인 플로우 실패)
2. `organizations` RLS 관련 Advisor 경고 재발
3. 주요 경로 5xx 지속 발생

## 6) 배포 후 30분 모니터링

1. Supabase: DB 에러 로그, RLS 정책 오류
2. Vercel: Function 에러, 응답 지연 상승
3. 사용자 핵심 경로(로그인/조회/저장) 수동 재검증
