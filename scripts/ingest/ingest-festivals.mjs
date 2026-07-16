// 전국문화축제표준데이터 → explore_catalog (tab: enjoy, source: festival)
// 누적형 데이터라 종료일 지난 레코드는 적재 시점에 제외 (스펙 v3.3 §3-① 종료일자 필터 필수).
// api/events.js 가 이 카탈로그를 병합해 ① 즐기기의 면 단위 축제 안전망으로 쓴다.
// 실행:  node scripts/ingest/ingest-festivals.mjs --dry-run / (없이) 적재

import {
  cliFlags, dataGoKrKey, fetchStandardDataAll, loadEnv,
  pick, printCoverage, printDrySample, serviceSupabase, stableId, toNum, upsertCatalog,
} from "./_shared.mjs"

const ENDPOINT = "http://api.data.go.kr/openapi/tn_pubr_public_cltur_fstvl_api"

function toDateOnly(value) {
  const text = String(value || "").trim().replace(/\./g, "-").slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null
}

function todayStr() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
}

function mapRow(row, today) {
  const lat = toNum(pick(row, ["latitude", "lat"]))
  const lng = toNum(pick(row, ["longitude", "lot", "lng"]))
  if (lat == null || lng == null || (lat === 0 && lng === 0)) return null

  const title = pick(row, ["fstvlNm"])
  if (!title) return null

  const startDate = toDateOnly(pick(row, ["fstvlStartDate"]))
  const endDate = toDateOnly(pick(row, ["fstvlEndDate"]))
  // 종료일 필터: 종료일(없으면 시작일)이 오늘 이전이면 지난 축제 → 제외
  const lastDay = endDate || startDate
  if (!lastDay || lastDay < today) return null

  const content = pick(row, ["fstvlCo"])

  return {
    id: stableId("festival", title, lat.toFixed(5), lng.toFixed(5), startDate || ""),
    source: "festival",
    tab: "enjoy",
    title,
    category: "축제",
    addr: pick(row, ["rdnmadr", "lnmadr", "opar"]),
    lat,
    lng,
    phone: pick(row, ["phoneNumber"]) || null,
    start_date: startDate,
    end_date: endDate,
    summary: content ? content.slice(0, 160) : null,
    source_url: pick(row, ["homepageUrl"]) || null,
    detail: {
      place: pick(row, ["opar"]) || null,
      host: pick(row, ["auspcInsttNm", "mnnstNm"]) || null,
    },
    data_reference_date: pick(row, ["referenceDate"]) || null,
  }
}

const flags = cliFlags()
const env = loadEnv()
const apiKey = dataGoKrKey(env)
const today = todayStr()

const rows = await fetchStandardDataAll(ENDPOINT, apiKey, { limit: flags.dryRun ? 100 : flags.limit })
const mapped = rows.map((row) => mapRow(row, today)).filter(Boolean)
console.log(`[map] 원본 ${rows.length} → 적재 대상 ${mapped.length} (종료일 ${today} 이후만)`)

if (flags.dryRun) {
  printDrySample(rows, mapped)
} else {
  const supabase = serviceSupabase(env)
  await upsertCatalog(supabase, mapped, "festival")
  printCoverage(mapped)
  console.log("[done] 문화축제 적재 완료 — 분기마다 재실행 권장 (지난 축제 자동 정리)")
}
