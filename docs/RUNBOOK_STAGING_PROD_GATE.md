# Staging/Prod Release Gate

목적:

- 운영 반영 전에 DB 보안/마이그레이션/협업 QA를 동일 절차로 통과

## 1) DB 반영

Supabase SQL Editor에서 순서대로 실행:

1. `supabase/migrations/025_increment_map_publication_like.sql`
2. `supabase/migrations/026_resolve_feature_change_request_tx.sql`
3. `supabase/migrations/027_enable_organizations_rls.sql`
4. `supabase/migrations/028_enable_rls_for_policy_tables.sql`

빠른 보안 복구가 필요하면:

- `supabase/manual/security_apply_and_verify.sql`

## 2) DB 게이트 체크

SQL Editor에서 실행:

- `supabase/manual/release_gate_checks_025_028.sql`

통과 기준:

- RPC 3개 조회됨
- `organizations.rls_enabled = true`
- "policy 있는데 RLS off" 조회 결과 0건
- `organizations_*` 정책 4개 조회됨

## 3) 앱 QA 게이트

환경변수 설정 후 실행:

```bash
npm run qa:event-collab-roles:ready
npm run qa:event-collab-assert-latest
```

통과 기준:

- preflight 성공
- event-collab QA `allPass=true`
- assert-latest 성공

## 4) 최종 배포 승인 조건

- [ ] DB 게이트 통과
- [ ] QA 게이트 통과
- [ ] `loca202603` lint/build 통과

