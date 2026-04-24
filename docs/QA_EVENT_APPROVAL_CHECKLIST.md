# LOCA 이벤트 협업 승인 플로우 QA 체크리스트

대상:

- `feature_change_requests` 승인/반려 플로우
- 역할 기반 권한(`owner`, `operator`, `editor`, `viewer`)
- 연관 RPC
  - `resolve_feature_change_request_tx`
  - `upsert_feature_operator_note`

## 1. 사전 준비

- [ ] Supabase에 `025`, `026` 마이그레이션 적용 완료
- [ ] 테스트 계정 2개 이상 준비 (A: owner, B: editor/operator/viewer)
- [ ] 이벤트 지도 1개 이상 준비 (`maps.category='event'`)
- [ ] 로컬 `.env`에 `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` 설정

## 2. 자동 QA (권장)

`loca202603` 루트에서 실행:

```powershell
$env:LOCA_QA_USER_A_EMAIL="qa-user-a@example.com"
$env:LOCA_QA_USER_A_PASSWORD="your-password-a"
$env:LOCA_QA_USER_B_EMAIL="qa-user-b@example.com"
$env:LOCA_QA_USER_B_PASSWORD="your-password-b"

npm.cmd run qa:event-collab-roles
```

성공 기준:

- 콘솔 요약이 `allPass=true`
- 산출물 `.qa-artifacts/event-collab-roles-qa-<timestamp>.json` 생성

## 3. 수동 QA 시나리오

### 3-1. editor 요청 생성

- [ ] editor가 핀 추가/수정/삭제 시 직접 반영되지 않고 요청으로 생성됨
- [ ] `feature_change_requests.status='pending'` 확인

### 3-2. owner/operator 승인

- [ ] owner 또는 operator가 pending 요청을 승인 가능
- [ ] 승인 시 요청 상태가 `approved`로 변경
- [ ] 승인 액션(insert/update/delete)이 실제 `map_features`에 반영
- [ ] (insert/update) `operatorNote`가 있으면 메모가 저장됨

### 3-3. owner/operator 반려

- [ ] owner 또는 operator가 요청 반려 가능
- [ ] 반려 시 요청 상태가 `rejected`로 변경
- [ ] feature 데이터는 변경되지 않음

### 3-4. 권한 차단

- [ ] viewer는 직접 feature 추가/수정/삭제 불가
- [ ] viewer는 승인/반려 불가
- [ ] editor는 승인/반려 불가

## 4. DB 확인 쿼리

요청 상태 확인:

```sql
select id, map_id, action, status, requested_by, reviewed_by, reviewed_at, feature_id
from feature_change_requests
order by created_at desc
limit 50;
```

연산 결과 feature 확인:

```sql
select id, map_id, type, title, updated_at
from map_features
where map_id = '<MAP_ID>'
order by updated_at desc
limit 50;
```

운영자 메모 확인:

```sql
select feature_id, map_id, note, updated_by, updated_at
from feature_operator_notes
where map_id = '<MAP_ID>'
order by updated_at desc
limit 50;
```

## 5. 실패 시 점검 포인트

1. `resolve_feature_change_request_tx` 함수 존재 여부
2. 함수 실행 권한(`GRANT EXECUTE`) 누락 여부
3. PostgREST schema cache reload 상태
4. RLS 정책 충돌 여부(특히 `feature_change_requests`, `map_features`, `feature_operator_notes`)

## 6. 완료 기준 (Exit Criteria)

- [ ] 자동 QA 1회 이상 `allPass=true`
- [ ] 수동 시나리오(승인/반려/권한차단) 전부 통과
- [ ] 운영 쿼리 샘플로 데이터 정합성 확인
