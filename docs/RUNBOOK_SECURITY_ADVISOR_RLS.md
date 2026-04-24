# Security Advisor RLS 대응 런북

대상 이슈:

- `Table public.organizations has RLS policies but RLS is not enabled`
- `Table public.organizations is public, but RLS has not been enabled`

## 1) 적용 순서

아래 순서로 SQL을 적용합니다.

1. `supabase/migrations/027_enable_organizations_rls.sql`
2. `supabase/migrations/028_enable_rls_for_policy_tables.sql`

빠른 복구가 목적이면 SQL Editor에서 아래 파일 1개를 그대로 실행해도 됩니다.

- `supabase/manual/security_apply_and_verify.sql`

권장: Supabase SQL Editor에서 순서대로 실행 후 `NOTIFY pgrst, 'reload schema';`까지 반영 확인.

## 2) 점검 SQL 실행

`supabase/manual/security_preflight_checks.sql` 전체 실행

또는 `supabase/manual/security_apply_and_verify.sql` 실행 시 조치 + 점검을 한 번에 수행 가능

기대 결과:

- "정책은 있는데 RLS가 꺼진 테이블" 조회 결과가 0건
- `organizations` 조회 결과의 `rls_enabled = true`

## 3) 즉시 수동 복구 SQL (긴급)

```sql
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
NOTIFY pgrst, 'reload schema';
```

## 4) 배포 전 체크리스트

- [ ] Security Advisor에서 `organizations` 관련 경고 사라짐
- [ ] dashboard 로그인/조직 조회/조직 수정 기능 정상
- [ ] `loca202603` `lint`, `build` 통과
