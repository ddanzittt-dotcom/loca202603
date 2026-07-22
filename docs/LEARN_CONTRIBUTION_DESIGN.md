# 탐색탭 이웃 제보(기여) 시스템 (migration 084)

> 2026-07-22 구현 완료 — 1차 범위는 **3개 탭(즐기기·배우기·걷기·머물기)**.
> '자연(nature)'은 병합 인프라(생물 카드 변환)가 달라 2차로 유보.
> (초안은 "② 배우기 한정"이었으나, 사용자 결정으로 3탭으로 확장해 출시.)

사용자가 탐색탭에 들어갈 항목을 직접 제보 → 관리자가 `/admin`에서 승인 → `explore_catalog`로 발행되는 흐름.

## 1. 데이터 모델 (migration 084)

`explore_contributions` — 제보 저장소.
- `status`: pending | published | rejected | retracted
- `tab`: enjoy | learn | walk (**CHECK 로 3탭 강제** — nature 제외)
- `created_by`: auth.users ON DELETE SET NULL (탈퇴해도 발행 카드는 독립 생존)
- 카드 필드: title·addr·lat·lng·category·summary·phone·source_url·image·start/end·apply_start/end·detail(jsonb)
- 심의 메타: submitted_at·reviewed_at·reviewed_by·reject_reason·rate_key

**RLS**: 본인 행 SELECT만 개방(제보 상태 확인용). INSERT/UPDATE/DELETE 정책 없음 → 변경은 RPC 전용.

**RPC 3종** (전부 SECURITY DEFINER, 065 user_feedback 패턴):
- `submit_contribution(...)` — **로그인 필수**(익명 불허). 서버 검증(탭 화이트리스트·한국 bbox·길이·detail 4KB) + rate limit(24h 10건, uid 해시). 즐기기는 `start_date` 필수(날짜 없으면 목록서 걸러짐).
- `admin_list_contributions(status, limit)` — 상태별 목록 + 카운트 + 제보자 닉네임. `is_platform_admin` 게이트.
- `admin_review_contribution(id, status, reject_reason, image)` — **승인 시 같은 트랜잭션에서 `explore_catalog`에 `id='contribution:<uuid>'` 미러 upsert**(source='contribution'), 반려 시 미러 삭제(source 가드).

## 2. 발행 방식 — explore_catalog 미러

`published` 전환 시 미러 upsert → 탐색 클라이언트·RPC(074~076)를 재사용.
- **walk/learn**: `fetchCatalogItems`가 tab만 보고 자동 병합 → 즉시 노출.
- **enjoy**: `/api/events.js`가 `source=in.(festival,contribution)`로 병합(dev엔 /api 없어 프로덕션에서만).
- **기여자 표기(decision #4)**: 닉네임을 승인 시점에 미러 `detail.contributor`로 **스냅샷**. explore_catalog는 anon이 읽고 profiles JOIN 금지(058)+제보자 탈퇴(SET NULL) 대비 — 스냅샷이라야 카드가 독립적으로 산다. 상세 시트가 "○○님" 으로 표기.
- 소스 라벨 "이웃 제보"(`SOURCE_LABELS`/`EVENT_SOURCE_LABELS`), kind='contribution'(인터리빙 한 묶음·px-map 스프라이트 폴백).

## 3. 사진 — 승인 시 복사 (decision #2)

- 제출: 제보자가 `media` 버킷 `contrib-pending/<id>`에 업로드(1280px·jpeg 0.72, `useMediaHandlers` 규격). Storage INSERT는 authenticated 허용(067), 버킷 public read.
- 승인: 관리자 브라우저가 `copyContributionPhotoToPermanent`로 `contrib-pub/<contribution_id>`에 `.copy()`(새 객체 owner=admin) → 영구 URL을 `admin_review_contribution(p_image)`로 전달 → 제보 행·미러의 image 교체.
- 효과: 제보자가 탈퇴해 임시 파일이 정리돼도 발행 카드 사진은 유지.

## 4. 진입점 UI (decision #E → a)

- `ExploreCurationScreen`: 즐기기·배우기·걷기 3탭에서만 CTA 노출(전체·자연 제외).
  - 목록 하단 풀폭 "여기 없는 곳을 알고 있나요? 제보하기" + 빈 상태 "아는 곳 직접 제보하기".
- `ContributeSheet`(2단계): 탭 선택+위치(검색/지도찍기 — CollectSheet 재사용) → 탭별 필드 → 제출.
  - 탭별: 즐기기(시작일 필수·종료일) / 배우기(기관·접수기간→배지·일정·수강료) / 걷기(종류 select).
  - **비로그인은 로그인 유도**. 상업 업소·광고 반려 안내(decision #C·#3).

## 5. 관리 (검수 탭)

`/admin` → "제보 검수" 탭 (피드백 탭 골격 복제).
- 검토 대기/게시됨/반려됨 필터 + pending 카운트 배지.
- 카드: 탭 배지·제목·사진·주소·기간·접수·기관·일정·수강료·연락처·링크·제보자·제출일.
- 승인(사진 영구복사 후 미러 발행) / 반려(사유 인라인, 게시됐던 건이면 미러 삭제).
- **전원 pending → 승인** 단순 흐름 (초안의 신뢰등급 즉시게시 분기 D-A·D-B는 제외 — 규모 커지면 추가).

## 6. 결정 반영 요약

| 항목 | 결정 |
|---|---|
| 범위 | 1차 3탭(enjoy·learn·walk), 자연은 2차 |
| 사진 | 승인 시 admin 소유로 복사(contrib-pub) |
| 상업 장소 | 운영 정책으로 반려 + 폼 안내 (별도 자동차단 없음) |
| 기여자 표기 | 닉네임 스냅샷 표기(프로필 연결은 안 함) |
| 신뢰등급 즉시게시 | 미도입(전원 관리자 승인) |
| 자온길 12공방 시딩 | **작업 안 함**(폐기) |

## 7. 2차 백로그

- ④ 자연 제보(생물 카드 변환 + `fetchCatalogItems("nature")` 병합 신규).
- 제보자 "내 제보" 목록 화면(RLS 본인 SELECT는 이미 열려 있음), 철회(retracted) UI.
- 신고 기반 사후 심의, 기관 인증 배지, 상업 장소 기여 재개 조건.
