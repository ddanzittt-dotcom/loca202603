# LOCA Supabase Migration Runbook (025 -> 026)

이 문서는 다음 2개 마이그레이션을 운영 환경에 안전하게 반영하기 위한 실행 절차입니다.

- `supabase/migrations/025_increment_map_publication_like.sql`
- `supabase/migrations/026_resolve_feature_change_request_tx.sql`

## 1. 목적

- `025`: 좋아요 카운트를 RPC로 원자 증가시켜 동시성 유실을 방지
- `026`: 편집 승인 요청 처리(승인/반려)를 단일 트랜잭션 RPC로 묶어 데이터 일관성 보장

## 2. 적용 순서

반드시 아래 순서로 적용합니다.

1. `025_increment_map_publication_like.sql`
2. `026_resolve_feature_change_request_tx.sql`

이유:

- 앱 코드가 RPC 우선 + fallback 구조라 `025`/`026` 미적용 상태에서도 동작은 가능
- 다만 적용 후 즉시 원자성/트랜잭션 보장을 얻으려면 위 순서가 가장 안전

## 3. 적용 전 체크

- [ ] Supabase 프로젝트 백업/복원 포인트 확보
- [ ] 운영 트래픽 저점 시간대 배포 예약
- [ ] SQL Editor 실행 권한 확인
- [ ] 최근 앱 빌드가 `loca202603` 기준 `lint/test/build` 통과 상태인지 확인

## 4. 적용 방법 (Dashboard SQL Editor)

### 4-1. 025 적용

1. Supabase Dashboard -> SQL Editor
2. `025_increment_map_publication_like.sql` 전체 실행
3. 성공 로그 확인

검증 SQL:

```sql
select proname
from pg_proc
where proname = 'increment_map_publication_like';
```

### 4-2. 026 적용

1. 동일하게 `026_resolve_feature_change_request_tx.sql` 전체 실행
2. 성공 로그 확인

검증 SQL:

```sql
select proname
from pg_proc
where proname = 'resolve_feature_change_request_tx';
```

## 5. 반영 후 기능 검증 (필수)

### 5-1. 좋아요 원자 증가

- 동일 지도에 대해 다중 클라이언트에서 빠르게 좋아요를 눌렀을 때 카운트 누락이 없는지 확인

점검 SQL:

```sql
select map_id, likes_count
from map_publications
where map_id = '<MAP_ID>';
```

### 5-2. 승인 요청 트랜잭션

- editor가 요청 생성 -> owner/operator가 승인
- 승인 시 feature 반영 + 요청 상태 변경이 함께 반영되는지 확인
- 반려 시 feature 비반영 + 요청 상태만 `rejected`로 변경되는지 확인

점검 SQL:

```sql
select id, status, reviewed_by, reviewed_at, feature_id
from feature_change_requests
where map_id = '<MAP_ID>'
order by created_at desc
limit 20;
```

## 6. 장애 대응 / 롤백 가이드

현재 앱 코드는 RPC 실패 시 fallback 경로를 갖고 있으므로, 장애 시 우선 아래를 수행합니다.

1. 앱 재배포 없이 DB 함수 상태 확인 (`pg_proc`)
2. 권한 누락이면 `GRANT EXECUTE` 재적용
3. PostgREST 캐시 이슈면 스키마 reload 확인

긴급 롤백이 필요하면 함수만 제거 가능:

```sql
drop function if exists public.resolve_feature_change_request_tx(uuid, text, text);
drop function if exists public.increment_map_publication_like(uuid);
notify pgrst, 'reload schema';
```

주의:

- 위 롤백은 앱 동작을 fallback 경로로 되돌리는 목적입니다.
- 이미 처리된 데이터(승인/반려 이력)는 롤백되지 않습니다.
