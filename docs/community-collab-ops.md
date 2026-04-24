# 모두의 지도 협업 운영 가이드 (019 + 2계정 QA)

이 문서는 아래 3가지를 한 번에 처리하기 위한 실행 가이드다.

1. `019_community_collab_rls.sql` 실제 반영
2. 실계정 2개 이상으로 공동 작성 QA
3. 대규모 확장(실시간/모더레이션)을 다음 단계로 분리

---

## 1) 019 마이그레이션 실제 반영

대상 파일:

- `supabase/migrations/019_community_collab_rls.sql`
- (권장 같이 반영) `supabase/migrations/020_maps_collab_rls_recursion_fix.sql`

권장 방법:

1. Supabase Dashboard → SQL Editor
2. 위 파일 내용 전체 복사/실행
3. 실행 성공 로그 확인

핵심 반영 내용:

- `community-map`에서 인증 사용자 `INSERT` 허용
- `community-map`에서 작성자 본인 또는 맵 owner `UPDATE/DELETE` 허용
- collaborator `SELECT` 허용 정책 보강
- `maps`/`map_collaborators` 정책 순환 참조 제거 (020)

주의:

- 이 단계가 빠지면 앱 코드가 있어도 공동 작성(추가/수정/삭제)이 권한 에러로 실패할 수 있다.
- 020을 누락하면 `infinite recursion detected in policy for relation "maps"`가 날 수 있다.

---

## 2) 2계정 공동 작성 QA 실행

## 사전 조건

아래 중 하나가 필요하다.

1. 이미 존재하는 테스트 계정 2개 (권장)
2. 신규 계정 자동 생성 허용(`LOCA_QA_ALLOW_SIGNUP=1`)

현재 프로젝트에서는 Auth rate limit이 강하면 자동 생성이 실패할 수 있으므로, 가능하면 기존 계정 2개를 넣어서 실행한다.

## 실행 명령 (PowerShell)

```powershell
cd C:/Users/csene/Desktop/claude/0328 CODE/loca202603

$env:LOCA_QA_USER_A_EMAIL="qa-user-a@example.com"
$env:LOCA_QA_USER_A_PASSWORD="your-password-a"
$env:LOCA_QA_USER_B_EMAIL="qa-user-b@example.com"
$env:LOCA_QA_USER_B_PASSWORD="your-password-b"

# community-map이 아직 없다면 1로 설정
$env:LOCA_QA_ALLOW_CREATE_COMMUNITY="1"

npm.cmd run qa:community-collab
```

결과:

- `.qa-artifacts/community-collab-qa-<timestamp>.json` 생성
- 콘솔에 각 항목 `PASS/FAIL` 출력

검증 항목:

1. A가 community feature 추가
2. B가 A feature 조회 가능
3. B가 A feature 수정 시도(실패 기대)
4. B가 A feature 삭제 시도(실패 기대)
5. B가 community feature 추가
6. B가 본인 feature 수정
7. B가 본인 feature 삭제
8. B가 A feature에 댓글(메모) 작성

---

## 3) 대규모 확장 항목은 별도 단계로 분리

이번 단계 범위:

- 권한 정책 안정화
- 2계정 협업 동작 검증

다음 단계(별도 스프린트):

1. 실시간 동기화(다중 사용자 동시 편집 반영)
2. 운영자 모더레이션(숨김/신고/차단/감사 로그)

이렇게 분리하면 MVP 안정성(권한/저장 흐름)과 확장 기능(운영 자동화)의 리스크를 분리할 수 있다.
