// 전국도서관표준데이터 → explore_catalog (tab: learn, source: library)
// "가볼 만한 공간" 시설 POI (스펙 D1-A, 소속 ② 확정 C2) — 운영시간·휴관일 포함.
// 프로그램 정보는 이 데이터에 없음: 도서관 강좌는 평생학습강좌 데이터가 자동으로 잡는다(D1-B).
// 실행:  node scripts/ingest/ingest-libraries.mjs --dry-run / (없이) 적재

import {
  cliFlags, dataGoKrKey, fetchStandardDataAll, loadEnv,
  pick, printCoverage, printDrySample, serviceSupabase, stableId, toNum, upsertCatalog,
} from "./_shared.mjs"

const ENDPOINT = "https://api.data.go.kr/openapi/tn_pubr_public_lbrry_api"

function hhmm(value) {
  const text = String(value || "").trim()
  return /^\d{2}:\d{2}$/.test(text) && text !== "00:00" ? text : ""
}

function mapRow(row) {
  const lat = toNum(pick(row, ["latitude", "lat"]))
  const lng = toNum(pick(row, ["longitude", "lot", "lng"]))
  if (lat == null || lng == null || (lat === 0 && lng === 0)) return null

  const title = pick(row, ["lbrryNm"])
  if (!title) return null

  const open = hhmm(pick(row, ["weekdayOperOpenHhmm"]))
  const close = hhmm(pick(row, ["weekdayOperColseHhmm", "weekdayOperCloseHhmm"]))
  const closeDay = pick(row, ["closeDay"]).replace(/\+/g, " · ")
  const hours = open && close ? `평일 ${open}~${close}` : ""
  const summary = [hours, closeDay ? `휴관 ${closeDay}` : ""].filter(Boolean).join(" · ")

  return {
    id: stableId("library", title, lat.toFixed(5), lng.toFixed(5)),
    source: "library",
    tab: "learn",
    title,
    category: pick(row, ["lbrrySe"]) || "도서관",
    addr: pick(row, ["rdnmadr", "lnmadr"]),
    lat,
    lng,
    phone: pick(row, ["phoneNumber"]) || null,
    summary: summary ? summary.slice(0, 160) : null,
    source_url: pick(row, ["homepageUrl"]) || null,
    detail: {
      closeDay: closeDay || null,
      satHours: [hhmm(pick(row, ["satOperOperOpenHhmm", "satOperOpenHhmm"])), hhmm(pick(row, ["satOperCloseHhmm"]))].filter(Boolean).join("~") || null,
      seats: toNum(pick(row, ["seatCo"])),
      books: toNum(pick(row, ["bookCo"])),
      institution: pick(row, ["operInstitutionNm"]) || null,
    },
    data_reference_date: pick(row, ["referenceDate"]) || null,
  }
}

const flags = cliFlags()
const env = loadEnv()
const apiKey = dataGoKrKey(env)

const rows = await fetchStandardDataAll(ENDPOINT, apiKey, { limit: flags.dryRun ? 50 : flags.limit })
const mapped = rows.map(mapRow).filter(Boolean)
console.log(`[map] 원본 ${rows.length} → 적재 대상 ${mapped.length}`)

if (flags.dryRun) {
  printDrySample(rows, mapped)
} else {
  const supabase = serviceSupabase(env)
  await upsertCatalog(supabase, mapped, "library")
  printCoverage(mapped)
  console.log("[done] 도서관 적재 완료")
}
