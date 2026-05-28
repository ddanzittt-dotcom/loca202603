# 모두의 지도 샘플 데이터 운영

사용자 테스트 중 빈 지도가 어색하지 않도록 `community-map`에 샘플 장소/길/영역을 넣는 절차입니다. 샘플은 실제 사용자 기록과 구분되도록 `LCOA 샘플` 작성자명, `LCOA 샘플` 태그, 고정 UUID, 그리고 가능하면 DB의 `is_sample` 메타데이터를 함께 사용합니다.

## 1. 권장 마이그레이션

Supabase SQL Editor에서 먼저 아래 파일을 적용합니다.

```text
supabase/migrations/043_community_sample_features.sql
```

이 마이그레이션은 `map_features`에 다음 컬럼을 추가합니다.

- `is_sample`: 샘플 여부
- `sample_batch`: 샘플 묶음 이름
- `sample_key`: 샘플 항목의 안정적인 키

마이그레이션 전에도 스크립트는 고정 UUID와 `LCOA 샘플` 태그 기준으로 동작하지만, 운영에서는 마이그레이션 적용 후 쓰는 것이 가장 안전합니다.

## 2. 권한 준비

쓰기 작업은 둘 중 하나가 필요합니다.

```powershell
$env:SUPABASE_SERVICE_ROLE_KEY="..."
```

또는 실제 인증 가능한 샘플 계정:

```powershell
$env:LOCA_SAMPLE_USER_EMAIL="lcoa-sample@example.com"
$env:LOCA_SAMPLE_USER_PASSWORD="..."
```

샘플 계정 방식은 RLS를 그대로 타므로, 해당 계정이 삽입한 샘플 또는 community-map owner 권한으로 삭제할 수 있습니다. 확실한 정리는 service role 방식이 가장 안정적입니다.

## 3. 상태 확인

```powershell
npm.cmd run sample:community:status
```

## 4. 샘플 넣기

기본 동작은 같은 샘플 묶음을 먼저 정리한 뒤 다시 넣습니다.

```powershell
npm.cmd run sample:community:seed
```

다른 batch 이름을 쓰려면:

```powershell
node scripts/community-sample-data.mjs seed --batch lcoa-user-test-2026-06
```

## 5. 샘플 지우기

현재 batch 샘플만 삭제:

```powershell
npm.cmd run sample:community:cleanup
```

`is_sample=true`인 모든 샘플을 지우려면:

```powershell
node scripts/community-sample-data.mjs cleanup --all
```

삭제는 실제 사용자 기록 전체를 대상으로 하지 않습니다. 우선 `is_sample`과 `sample_batch`를 사용하고, 컬럼이 아직 없으면 이 저장소에 정의된 고정 샘플 UUID와 `LCOA 샘플` 태그가 모두 맞는 행만 정리합니다.
