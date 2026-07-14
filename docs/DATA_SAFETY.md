# DATA_SAFETY — 사용자 데이터 안전 보관 (백업·복구·재현성)

> LOCA 사용자가 작성한 데이터(지도·카드·기록·메모·사진·음성)를 최대한 안전하게 보관·복구하기 위한 기준. P0 보안감사 #5(DB 재현성) 대응으로 작성. 관련: `RUNBOOK_STAGING_PROD_GATE.md`, `MIGRATION.md`.

## 1. 데이터가 어디에 있나 (인벤토리)

사용자 데이터는 **두 곳**에 나뉘어 있고, **둘 다** 백업돼야 완전하다.

| 계층 | 내용 | 위치 |
|------|------|------|
| **Postgres DB** | profiles, maps, map_features, map_feature_placements, feature_memos, **feature_media(메타/URL)**, map_publications, map_collaborators, community_records, follows, view_logs, user_feedback | Supabase Database |
| **Storage** | **사진·음성 원본 파일** (feature_media.storage_path 가 가리키는 실제 바이트) | Supabase Storage `media` 버킷 |

즉 `feature_media` 행은 DB에 있지만 **실제 사진 파일은 Storage에 따로** 있다. DB만 복원하면 URL은 살아나도 파일이 없으면 깨진다 → 둘 다 챙겨야 한다.

## 2. 1차 안전망 — Supabase 백업 (출시 전 **반드시** 확인)

### DB 백업 / PITR
- **위치**: Supabase Dashboard → Project → **Database → Backups**.
- **플랜별**:
  - **Pro 이상**: 매일 자동 백업(보관 7일+) + **PITR(Point-in-Time Recovery)** 옵션 — 원하는 시점으로 복구.
  - **Free**: 자동 백업이 없거나 제한적 → **출시 전 Pro 승급 + PITR 활성화 강력 권장.**
- **확인 항목**:
  - [ ] Backups 탭에 최근 백업이 주기적으로 찍히는가
  - [ ] PITR 토글 ON (실수 삭제·손상 시 시점 복구 가능)

### Storage(사진·음성) 백업 — 별도로 챙겨야 함
- Storage 객체는 **DB 백업에 포함되지 않는다** (별도 계층).
- Supabase 는 객체 내구성(복제)은 제공하지만 "특정 시점 복원"은 DB 만큼 간단치 않으니 대시보드에서 현재 플랜의 Storage 백업 범위를 확인할 것.
- **권장**:
  - [ ] 중요 미디어는 정기적으로 `media` 버킷을 외부(별도 S3/스크립트)로 스냅샷
  - [ ] 파일 삭제를 즉시 하드 딜리트하지 않도록 소프트 딜리트/유예 고려 (후속 과제)

## 3. 2차 안전망 — 사용자 자가 백업 (앱 내 "데이터 내보내기")

- 위치: **내 정보 관리 → 데이터 내보내기** (`AccountScreen.exportData`) → `LOCA_backup_YYYY-MM-DD.json`.
- 담기는 것: `profile, maps, features(기록·메모 포함), shares`.
- **한계**: **사진·음성 원본 바이트는 미포함**(파일은 URL 참조). 완전 복원엔 Storage 파일이 별도로 필요.
- **개선 백로그**:
  - [ ] 내보내기에 memos 명시 포함 확인 + 미디어 아카이브(zip) 옵션
  - [ ] 탈퇴 화면에서 "먼저 내보내기" 안내는 이미 있음 (`AccountScreen`), 미디어 한계 문구 추가

## 4. 재현성 — 스키마를 처음부터 다시 만들 수 있는가

- **현황**: 마이그레이션 fresh replay 는 과거 058 에서 막혔다(`is_public` — 046에서 추가됐으나 파일 제거, 048 DROP, 058 GRANT). → **이번에 수정**(058 GRANT 에서 제외 + `071_profiles_is_public_baseline` 로 멱등 생성/부여).
- **알려진 드리프트(라이브엔 있으나 repo 부재 — 재현 시 불일치)**:
  - `memos_select_public_shared` 정책 / `is_map_publicly_viewable()` 함수 — 2026-07-14 발견, `070` 으로 정책 제거(공개 메모 노출이었음). 함수는 잔존 가능.
  - `profiles.is_public` 라이브 orphan 컬럼(071 로 명시화).
- **번호 중복**: 005·013·020·022·030 (파일명으로 구분).
- **권장 복구 경로**: **"마이그레이션 재생"이 아니라 "백업 복원"이 1순위.** 진짜 재현성이 필요하면 **출시 후 라이브 스키마를 pg_dump 로 떠 단일 베이스라인(squash)** 을 만들고 002~071 은 history 로 보관. (출시 후 과제)

## 5. 앱 내부 데이터 손실 벡터 (다른 P0 와 연결)

- **비로그인 로컬 데이터 미이관**: 로그인 시 자동 이관이 아니라 "데이터 가져오기" 수동 안내. 미이관 상태로 로그아웃하면 데모 복원으로 사라질 수 있음. → #3 과 함께 개선.
- **계정 전환 레이스(#3)**: 늦게 도착한 이전 계정 응답이 현재 상태/localStorage 를 덮어쓸 수 있음(epoch/abort 없음). → 별도 조치 예정.
- **지도 삭제 시 공유 카드 제거(#4)**: DB 는 050 의 `ON DELETE SET NULL` 로 카드 보존하나, 클라이언트 `deleteMap` 이 scalar mapId 로 상태에서 제거+미디어 정리 → 클라 경로 교정 필요.

## 6. 이번 커밋에서 한 것

- `058` fresh-replay 블로커 해소(`is_public` GRANT 제외) + `071` 로 `is_public` 멱등 생성/부여 → **스키마 재현성 복구**(컬럼은 보존).
- 본 문서(`DATA_SAFETY.md`) 신설.

## 출시 전 체크리스트

- [ ] **Supabase DB 백업/PITR 활성 확인** (Pro 플랜) — 최우선
- [ ] **Storage(media) 백업 방안 결정** (외부 스냅샷 등)
- [ ] `071` 라이브 적용(멱등, no-op) — 마이그레이션 이력 정합
- [ ] 데이터 내보내기 미디어 미포함 한계 인지 / 개선 백로그 등록
- [ ] (출시 후) 스키마 베이스라인 squash + 드리프트 전수 대조
