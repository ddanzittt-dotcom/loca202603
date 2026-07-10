# 행사 수집 아키텍처 (소규모 지역행사·프로그램 커버리지 확장)

> 상태: **설계(design) — 코드 착수 전**. 2026-07-10 작성.
> 목적: TourAPI(축제)만으로는 못 잡는 **구청·주민센터·도서관·소극장 단위 소규모 행사/프로그램**을 앱 탐색 큐레이션에 채워 넣는다.
> 관련 코드: [`api/events.js`](../api/events.js), [`src/lib/exploreCuration.js`](../src/lib/exploreCuration.js), [`src/screens/ExploreCurationScreen.jsx`](../src/screens/ExploreCurationScreen.jsx)

---

## 1. 문제 정의

현재 `/api/events` 는 한국관광공사 **TourAPI**(`searchFestival2` + `locationBasedList2`)만 실시간 프록시한다.
TourAPI에는 지자체가 관광공사에 **등록한 축제/행사만** 들어 있어, 다음이 통째로 빠진다:

- 구청·주민센터·문화의집 자체 프로그램/강좌/공지
- 도서관 프로그램·북토크
- 대학로급 소극장 공연, 소규모 전시
- 지역 문화재단 상설 프로그램

핵심 통찰: **막힌 건 "API 전반"이 아니라 "TourAPI"다.** 소규모 행사 상당수는 아직 **안 붙인 공공 API**로 잡히고, 그래도 남는 공백만 **크롤링**으로 보완하는 게 비용 대비 옳다.

---

## 2. 소스 카탈로그 (우선순위)

| # | 소스 | 방식 | 커버리지 | 인증 | 포맷 | 합법성 | 우선순위 |
|---|---|---|---|---|---|---|---|
| A1 | **문화포털 공연전시정보** (culture.go.kr / data.go.kr) | 공공 API | 전국 공연·전시·문화행사 (지자체 포함) | data.go.kr 키 | JSON/XML | 🟢 공공 | **P0** |
| A2 | **KOPIS 공연예술통합전산망** | 공공 API | 전국 공연(소극장 포함), 공연시설 | KOPIS 키 | **XML** | 🟢 공공 | **P0** |
| A3 | **서울열린데이터광장 문화행사** (+ 각 시·도 열린데이터광장) | 공공 API | 지자체 문화행사·공연·전시 | 지역별 키 | JSON/XML | 🟢 공공 | P1 |
| A4 | **도서관정보나루** | 공공 API | 도서관 프로그램·행사 | 키 | JSON | 🟢 공공 | P1 |
| C1 | 구청·문화의집 게시판 (특정 자치구부터) | 크롤 | 동네 프로그램/공지 | 없음 | HTML | 🟢 공공저작물(출처표기) | P2 |
| C2 | 지역 문화재단·소극장 자체 홈페이지 | 크롤 | 상설 프로그램 | 없음 | HTML | 🟡 robots/ToS 확인 | P3 |
| X | 인스타 / 당근 동네생활 / 네이버 카페·밴드 | (크롤) | 초하이퍼로컬 | — | — | 🔴 **ToS 금지·배제** | 제외 |

- **P0(A1·A2)를 먼저 붙이면 크롤링 없이도 소규모 커버리지가 크게 오른다.** 유지보수도 크롤러보다 훨씬 싸다.
- **X등급(🔴)은 초기 범위에서 명시적으로 배제.** ToS 위반 + 구조가 자주 바뀌어 유지보수 지옥 + 차단/법적 리스크. 필요하면 공식 파트너십/오픈API로만.
- 주의: **KOPIS는 응답이 XML** → JSON만 파싱하는 현 `events.js`와 달리 XML 파서 어댑터가 필요.

---

## 3. 아키텍처 — 수집과 조회를 분리

현 `events.js`는 **요청 시점 실시간 프록시**다. 크롤링을 이 패턴으로 하면 안 된다:
Vercel 함수 타임아웃(Hobby 10s), 요청마다 대상 사이트 타격 → ToS·차단·rate 문제, 페이지 구조 깨지면 사용자 화면 즉시 파손.

→ **수집(쓰기)과 조회(읽기)를 분리한다.**

```
┌──────────────────────── 수집 (하루 1~2회, 요청 경로 밖) ────────────────────────┐
│  GitHub Actions cron  (또는 Cloud Run Job / Supabase Edge Function scheduled)   │
│                                                                                 │
│   for each source adapter (A1, A2, A3, A4, C1, …):                              │
│     fetch()      원본 호출/크롤 (rate-limit, robots 존중)                        │
│     parse()      소스 포맷 → raw record                                          │
│     normalize()  → 공통 스키마 (events.js normalizeItem 로직 재사용)             │
│     geocode()    주소 → 좌표 (좌표 없는 레코드만; 카카오 로컬 API)               │
│   dedupe()        (source, external_id) + 제목·주소 fallback (events.js 재사용)  │
│   upsert → Supabase  curated_events                                             │
└─────────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼  (앱은 DB만 읽음)
┌──────────────────────────── 조회 (요청 경로) ──────────────────────────────────┐
│  /api/events  →  ① TourAPI 실시간(현행 유지)  +  ② Supabase curated_events 조회 │
│                  → 병합 · dedupe · 거리필터 · 정렬 (기존 로직 확장)              │
│                  → 엣지 캐시(s-maxage=1800) 그대로                               │
└─────────────────────────────────────────────────────────────────────────────────┘
```

**이득:**
- 크롤러가 죽어도 사용자 화면은 안 깨진다(마지막 수집분이 DB에 남음).
- ToS/rate 문제는 요청 사용자 수와 무관하게 "하루 N회 수집"으로 상한이 고정된다.
- 신선도/모더레이션을 DB에서 관리(`fetched_at`, 만료, 필요시 숨김).

---

## 4. 데이터 모델 — `curated_events` (migration **065**)

> 다음 migration 번호는 **065** (현재 064까지 존재). RLS 포함.

```sql
create table public.curated_events (
  id           uuid primary key default gen_random_uuid(),
  source       text not null,            -- 'culture' | 'kopis' | 'seoul_odp' | 'gu_gangnam' ...
  external_id  text not null,            -- 소스 원본 id (없으면 해시)
  title        text not null,
  category     text,                     -- 정규화 카테고리 (행사/공연/전시/강좌 …)
  addr         text,
  lat          double precision,
  lng          double precision,
  start_date   text,                     -- YYYYMMDD (TourAPI 컨벤션과 통일)
  end_date     text,
  image        text,
  tel          text,
  source_url   text,                     -- 출처 링크 (표기 의무 대응)
  raw          jsonb,                     -- 원본 스냅샷 (디버깅/재정규화용)
  fetched_at   timestamptz not null default now(),
  expires_at   timestamptz,              -- end_date + 여유, 또는 수집 정책상 TTL
  unique (source, external_id)
);

create index curated_events_geo_idx  on public.curated_events (lat, lng);
create index curated_events_date_idx on public.curated_events (end_date);

-- RLS: 앱(anon)은 읽기만. 쓰기는 service_role(스케줄 워커)만.
alter table public.curated_events enable row level security;
create policy curated_events_read on public.curated_events
  for select using (true);
-- INSERT/UPDATE/DELETE 정책 없음 → service_role 키만 통과 (RLS 우회)
```

**upsert 키:** `(source, external_id)` → 재수집 시 갱신, 중복 자동 방지.
**만료 청소:** 수집 워커 말미에 `delete ... where expires_at < now()` (또는 조회 시 `end_date >= today` 필터로 소프트 처리).

---

## 5. 어댑터 규약 (소스 추가 = 파일 1개)

소스마다 아래 인터페이스만 구현. 한 소스가 깨져도 나머지는 계속 돈다.

```
// api/_lib/eventSources/<source>.js
export default {
  source: 'culture',
  async fetch(ctx) { /* 원본 호출/크롤 → raw[] */ },
  parse(raw)       { /* raw → record[] (소스 포맷 해체) */ },
  normalize(rec)   { /* record → 공통 스키마 (4장 컬럼) */ },
}
```

- `normalize`는 [`events.js`](../api/events.js)의 `normalizeItem`·`dedupeEvents`·`eventQualityScore` 로직을 공통 모듈로 추출해 재사용한다(중복 구현 금지).
- 지오코딩은 어댑터 밖 공통 단계: 좌표 없는 레코드만 카카오 로컬 API로 주소→좌표(호출량·비용 방어).
- **각 API의 정확한 엔드포인트/파라미터는 착수 시 해당 가이드에서 확정** (문화포털·KOPIS 링크는 §참고). 이 문서는 계약(interface)만 고정한다.

---

## 6. 스케줄 워커

- **1안(권장): GitHub Actions cron** — 인프라 추가 0, `SUPABASE_SERVICE_ROLE_KEY`·각 API 키를 repo secret으로. `node scripts/ingestEvents.mjs` 실행 → Supabase upsert. 하루 1~2회.
- 2안: Supabase Edge Function + `pg_cron` 스케줄 (DB 내부 완결, 단 함수 실행시간 제약).
- 3안: Cloud Run Job (크롤 규모 커지면). 초기엔 과함.

산출물은 요청 경로 밖이므로 Vercel 함수 타임아웃과 무관.

---

## 7. 크롤링 가드레일 (C등급 소스)

- `robots.txt` 확인·존중, `User-Agent` 명시(연락처 포함), 요청 간 딜레이(rate-limit).
- 출처 링크(`source_url`) 항상 저장·노출 → 공공저작물 출처표기 의무 대응.
- 파서는 **실패해도 워커 전체를 죽이지 않게** try/catch 격리 + 수집 0건 시 경고 로그.
- 🔴 인스타/당근/네이버 카페·밴드는 **범위 밖**. 코드에 어댑터를 두지 않는다.

---

## 8. 리스크

| 리스크 | 완화 |
|---|---|
| 크롤 대상 HTML 구조 변경 | 어댑터 격리 + 수집 0건 알림 → 조회는 마지막 DB분으로 계속 |
| 지오코딩 비용/쿼터 | 좌표 없는 레코드만 지오코딩 + 결과 캐시(`raw`에 저장) |
| 소스 간 중복(같은 행사) | `(source, external_id)` + 제목·주소 fallback dedupe |
| 데이터 신선도 | `fetched_at` 노출/모니터, `end_date`·`expires_at` 만료 청소 |
| KOPIS XML 파싱 | 전용 XML 파서 어댑터 (JSON 경로와 분리) |
| ToS/법적 | 🟢 공공 우선, 🟡 robots/ToS 확인, 🔴 배제 |

---

## 9. 단계적 로드맵

1. **P0 공공 API 확장 (크롤링 0)** — 공통 `normalize` 모듈 추출 → 문화포털(A1)·KOPIS(A2) 어댑터 → `/api/events` 병합. 커버리지 즉시 상승, 저비용.
   - ✅ `api/_lib/eventNormalize.js` 공통 모듈 추출 (2026-07-10)
   - ✅ `api/_lib/eventSources/culture.js` 문화포털(A1) 어댑터 + `/api/events` 병합, `CULTURE_API_KEY`(없으면 `TOUR_API_KEY` 재사용) fail-soft
   - ⬜ KOPIS(A2) — 목록에 좌표가 없어 공연시설 좌표 조회 or 지오코딩 필요(다음 증분)
2. **수집 파이프라인 PoC** — migration 065(`curated_events`) + GitHub Actions 워커 + 어댑터 1개(특정 자치구 게시판 C1)로 크롤→정규화→upsert 검증.
3. **조회 병합 정식화** — `/api/events`가 TourAPI + `curated_events`를 병합(기존 dedupe/거리/정렬 재사용), 엣지 캐시 유지.
4. **소스 확장** — A3·A4, 그다음 C2. 어댑터 추가만으로 확장.

---

## 참고 (API 가이드 — 착수 시 파라미터 확정용)

- 문화포털 오픈API 가이드: https://www.culture.go.kr/data/openapi/openapiInfo.do
- 문화체육관광부_문화예술공연(통합) (data.go.kr): https://www.data.go.kr/data/15121487/openapi.do
- KOPIS 오픈API: https://www.kopis.or.kr/por/cs/openapi/openApiList.do?menuId=MNU_00074
- 서울열린데이터광장: https://data.seoul.go.kr
- 도서관정보나루: https://www.data4library.kr
