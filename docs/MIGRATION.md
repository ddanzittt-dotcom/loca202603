# LOCA Migration Notes

## Completed

- Recovered the application into normal React/Vite source files.
- Moved bundled sample data into `src/data/sampleData.js`.
- Rebuilt the main screens under `src/screens/`.
- Rebuilt shared UI and map behavior under `src/components/`.
- Removed the minified legacy application bundle from active use.

## Remaining legacy asset

- `src/legacy/styles.css` is still the preserved production stylesheet.

## Next recommended cleanup

1. Split large sheet sections out of `src/App.jsx` if a screen needs heavier iteration.
2. Replace preserved legacy CSS gradually with scoped source styles when visual redesign work starts.
3. Add automated interaction tests for map editing and import/export flows.

## 운영: view_logs 보존 스케줄 (수동 적용 필수)

`view_logs`는 로그인·익명 열람자 이벤트가 행 단위로 **무한 누적**된다. migration 013이 정리 함수 `prune_old_view_logs(before)`를 만들어 두지만 **자동 실행되지 않는다.** 사용자 증가 시 DB 저장·백업 비용을 좌우하므로, 운영 DB에서 아래를 **1회 실행**해 일일 정리 스케줄을 걸어야 한다.

- 실행 위치: Supabase 대시보드 → SQL Editor
- 실행 파일: [`supabase/manual/013_scale_guardrails_schedule.sql`](../supabase/manual/013_scale_guardrails_schedule.sql) 전체 붙여넣기
- 선행 조건:
  - migration 013(`prune_old_view_logs` 함수 정의)이 이미 적용돼 있어야 한다.
  - `pg_cron` 확장이 필요하다(스크립트가 `CREATE EXTENSION IF NOT EXISTS pg_cron`으로 활성화 시도 — Supabase Pro 이상에서 사용 가능).
  - 180일 이전 raw 로그를 **영구 삭제**하므로, 장기 분석이 필요하면 먼저 export/백업을 확보한다.
- 적용 확인: `SELECT jobid, jobname, schedule, active FROM cron.job ORDER BY jobid;` — `loca_prune_old_view_logs_daily` 1건이 보이면 정상.
- 즉시 1회 정리(선택): `SELECT public.prune_old_view_logs(now() - INTERVAL '180 days');`

> **참고(2026-07):** 같은 013에 있던 시간별 롤업 `refresh_map_daily_metrics`는 스케줄에서 제외했다. 이 함수는 B2C 전환에서 제거된 `event_checkins`/`survey_responses`를 참조해 실행 시 실패하며, 결과 테이블 `map_daily_metrics`도 현재 앱이 사용하지 않는다. 대시보드용 사전집계가 다시 필요해지면 B2C 스키마에 맞는 롤업을 새로 작성한다.
