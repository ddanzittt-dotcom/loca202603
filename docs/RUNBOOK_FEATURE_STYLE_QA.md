# Feature Style 적용/검증 런북

## 1. 목적

핀/경로/영역의 스타일(`color`, `lineStyle`)이 DB에 정상 저장되고 재조회되는지 운영 전 확인한다.

대상:

- `supabase/migrations/030_feature_style_customization.sql`
- `supabase/manual/030_feature_style_apply_and_verify.sql`
- `scripts/qa-feature-style.mjs`

## 2. DB 적용/검증 (Supabase SQL Editor)

1. `supabase/manual/030_feature_style_apply_and_verify.sql` 전체 실행
2. 아래 결과를 확인

- `information_schema.columns` 조회 결과에 `public.map_features.style` 존재
- `map_features_style_is_object` 제약 존재
- `null_style_rows = 0`

## 3. 자동 QA 실행

필수 환경변수:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `LOCA_QA_USER_A_EMAIL`
- `LOCA_QA_USER_A_PASSWORD`
- `LOCA_QA_USER_B_EMAIL`
- `LOCA_QA_USER_B_PASSWORD`

DB/권한 QA 실행:

```bash
npm run qa:feature-style
```

기대 결과:

- `PASS` 로그만 출력
- `.qa-artifacts/feature-style-qa-*.json` 파일 생성
- `allPass: true`

검증 항목:

- owner가 pin/route/area 스타일 저장 가능
- 저장 후 재조회 시 style JSON 값 일치
- owner가 route style 업데이트 가능
- non-owner가 owner feature style 변경 불가(RLS 차단)

UI 스모크 실행(실제 앱 화면에서 스타일 표시 확인):

```bash
# 앱 서버 실행 후
npm run qa:feature-style-ui
```

검증 항목:

- `map/{id}` 진입 후 FeatureDetailSheet에서 pin/route/area 스타일이 활성 상태로 보이는지
- route의 선 종류가 `shortdash`, area의 선 종류가 `shortdot`로 활성 표시되는지

## 4. 장애 시 점검 포인트

1. `style` 컬럼이 미적용이면 SQL 재실행 후 `NOTIFY pgrst, 'reload schema'` 확인
2. QA 계정 로그인 실패 시 계정 비밀번호/이메일 재확인
3. RLS 차단 결과가 기대와 다르면 `map_features` 정책과 collaborator role 상태를 점검
