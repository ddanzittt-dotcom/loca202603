// 두루누비 코스 → explore_catalog (tab: walk, source: durunubi, route)
// v3.3 V1~V4 실측 반영: courseList 에 좌표가 없어 gpxpath(GPX 파일 URL)를 받아
// 시작점(첫 트랙포인트) + 다운샘플 폴리라인(≤400점)을 함께 적재한다.
// 코스 수가 고정(코리아둘레길 284)에 가까워 1회성 배치로 충분 — 런타임엔 두루누비 호출 없음.
//
// 실행:  node scripts/ingest/ingest-durunubi.mjs --dry-run          (필드·GPX 응답 검증, 3코스만)
//        node scripts/ingest/ingest-durunubi.mjs --limit=20         (부분 적재)
//        node scripts/ingest/ingest-durunubi.mjs                    (전체 적재)
//
// 커버 범위 확인(스펙 v3.3 체크리스트): 실행 로그의 totalCount·brdDiv 분포로
// "코리아둘레길 한정인지 전국 걷기길 포함인지"가 판별된다.

import { downsample, parseGpxPoints } from "../../src/lib/gpx.js"
import {
  cliFlags, dataGoKrKey, fetchDurunubiAll, loadEnv,
  pick, printCoverage, printDrySample, serviceSupabase, toNum, upsertCatalog,
} from "./_shared.mjs"

const COURSE_ENDPOINT = "https://apis.data.go.kr/B551011/Durunubi/courseList"
const MAX_POINTS = 400 // 폴리라인 다운샘플 상한 — DB 행 크기·공유 URL gzip·썸네일 성능 (v3.3 V3)
const GPX_DELAY_MS = 150 // 파일 서버 예의용 간격

const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms) })

// 소요시간 정규화 → 분. 값이 "420"(분)일 수도 "7"(시간)일 수도 있어 크기로 판별.
function toDurationMin(raw) {
  const value = toNum(raw)
  if (value == null || value <= 0) return null
  return value <= 24 ? Math.round(value * 60) : Math.round(value)
}

const LEVEL_LABELS = { 1: "쉬움", 2: "보통", 3: "어려움" }

async function fetchGpx(url) {
  const resp = await fetch(url)
  if (!resp.ok) throw new Error(`GPX ${resp.status}`)
  return resp.text()
}

const flags = cliFlags()
const env = loadEnv()
const apiKey = (env.DURUNUBI_API_KEY || "").trim() || dataGoKrKey(env)

const courses = await fetchDurunubiAll(COURSE_ENDPOINT, apiKey, {
  limit: flags.dryRun ? 3 : flags.limit,
})

// 커버 범위 판별 로그 — brdDiv(걷기/자전거) 분포
const byDiv = new Map()
for (const course of courses) {
  const div = pick(course, ["brdDiv"]) || "(미상)"
  byDiv.set(div, (byDiv.get(div) || 0) + 1)
}
console.log(`[coverage-check] brdDiv 분포: ${JSON.stringify(Object.fromEntries(byDiv))} — DNWW=걷기, DNBW=자전거`)

// 걷기 코스만 (자전거길이 섞여 오면 제외). brdDiv 미상이면 유지.
const walking = courses.filter((course) => {
  const div = pick(course, ["brdDiv"])
  return !div || div === "DNWW"
})
console.log(`[filter] 걷기 코스 ${walking.length}/${courses.length}건 — GPX 다운로드 시작`)

const mapped = []
const failures = []
for (let index = 0; index < walking.length; index += 1) {
  const course = walking[index]
  const crsIdx = pick(course, ["crsIdx"])
  const title = pick(course, ["crsKorNm"])
  const gpxUrl = pick(course, ["gpxpath"])
  process.stdout.write(`\r[gpx] ${index + 1}/${walking.length} ${title.slice(0, 24)}          `)
  if (!crsIdx || !title || !gpxUrl) {
    failures.push({ title: title || "(무제)", reason: "필수 필드 누락" })
    continue
  }
  try {
    const xml = await fetchGpx(gpxUrl)
    const rawPoints = parseGpxPoints(xml)
    if (rawPoints.length < 2) {
      failures.push({ title, reason: `트랙포인트 부족(${rawPoints.length})` })
      continue
    }
    const points = downsample(rawPoints, MAX_POINTS)
    const [lng, lat] = points[0] // 시작점 = 첫 트랙포인트 (V2)
    mapped.push({
      id: `durunubi:${crsIdx}`,
      source: "durunubi",
      tab: "walk",
      title,
      category: "둘레길",
      addr: pick(course, ["sigun"]),
      lat,
      lng,
      region_text: pick(course, ["sigun"]) || null,
      route_distance_km: toNum(pick(course, ["crsDstnc"])),
      route_duration_min: toDurationMin(pick(course, ["crsTotlRqrmHour"])),
      route_level: LEVEL_LABELS[toNum(pick(course, ["crsLevel"]))] || null,
      summary: pick(course, ["crsSummary"]).replace(/\s+/g, " ").slice(0, 160) || null,
      source_url: "https://www.durunubi.kr/",
      source_ref: crsIdx,
      detail: {
        routeIdx: pick(course, ["routeIdx"]) || null,
        cycle: pick(course, ["crsCycle"]) || null,
        rawPointCount: rawPoints.length,
      },
      points,
    })
  } catch (error) {
    failures.push({ title, reason: error.message })
  }
  await sleep(GPX_DELAY_MS)
}
process.stdout.write("\n")

console.log(`[map] 코스 ${walking.length} → 적재 대상 ${mapped.length}, 실패 ${failures.length}`)
if (failures.length) {
  console.log("[failures] (지오코딩 품질 리스크 §8 — 노출 제외 + 로그)")
  for (const failure of failures.slice(0, 10)) console.log(`  - ${failure.title}: ${failure.reason}`)
}

if (flags.dryRun) {
  printDrySample(courses, mapped)
} else {
  const supabase = serviceSupabase(env)
  await upsertCatalog(supabase, mapped, "durunubi")
  printCoverage(mapped)
  console.log("[done] 두루누비 적재 완료")
}
