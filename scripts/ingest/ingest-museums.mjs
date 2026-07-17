// 전국박물관미술관정보표준데이터 → explore_catalog (tab: learn, source: museum)
// 배우기 탭 "보고 배우는 상설 공간" — 박물관·미술관·기념관·과학관 등. (2026-07 배우기 보강)
// 목록에 위경도 내장이라 지오코딩 불필요. 관람시간·휴관·관람료(어른/청소년/어린이)·소개 포함.
// 실행:  node scripts/ingest/ingest-museums.mjs --dry-run / (없이) 적재

import {
  cliFlags, dataGoKrKey, fetchStandardDataAll, loadEnv,
  pick, printCoverage, printDrySample, serviceSupabase, stableId, toNum, upsertCatalog,
} from "./_shared.mjs"

const ENDPOINT = "https://api.data.go.kr/openapi/tn_pubr_public_museum_artgr_info_api"

function hhmm(value) {
  const text = String(value || "").trim()
  return /^\d{1,2}:\d{2}$/.test(text) && text !== "00:00" ? text : ""
}

// 관람료 표기 — 0/무료/빈값을 "무료"로, 숫자는 "N원"으로
function feeText(value) {
  const raw = String(value || "").trim()
  if (!raw) return ""
  if (/무료|free/i.test(raw)) return "무료"
  const num = toNum(raw)
  if (num == null) return raw
  return num === 0 ? "무료" : `${num.toLocaleString()}원`
}

function mapRow(row) {
  const lat = toNum(pick(row, ["latitude", "lat"]))
  const lng = toNum(pick(row, ["longitude", "lot", "lng"]))
  if (lat == null || lng == null || (lat === 0 && lng === 0)) return null

  const title = pick(row, ["fcltyNm", "museumNm"])
  if (!title) return null

  // 구분: 국립/공립/사립/대학 + 박물관/미술관 성격(이름 기반 폴백)
  const gubun = pick(row, ["fcltyType", "museumType", "clCode"])
  const isArt = /미술관|갤러리|아트/.test(title)
  const category = isArt ? "미술관" : "박물관"

  const open = hhmm(pick(row, ["weekdayOperOpenHhmm"]))
  const close = hhmm(pick(row, ["weekdayOperColseHhmm", "weekdayOperCloseHhmm"]))
  const closeDay = pick(row, ["rstdeInfo", "closeDay"]).replace(/\+/g, " · ").replace(/,/g, " · ")
  const hours = open && close ? `평일 ${open}~${close}` : ""
  const intro = pick(row, ["fcltyIntrcn", "fcltyInfo"])
  const summary = [hours, closeDay ? `휴관 ${closeDay}` : "", intro].filter(Boolean).join(" · ")

  const adult = feeText(pick(row, ["adultChrge"]))
  const youth = feeText(pick(row, ["yngbgsChrge"]))
  const child = feeText(pick(row, ["childChrge"]))

  return {
    id: stableId("museum", title, lat.toFixed(5), lng.toFixed(5)),
    source: "museum",
    tab: "learn",
    title,
    category: gubun ? `${gubun} ${category}` : category,
    addr: pick(row, ["rdnmadr", "lnmadr"]),
    lat,
    lng,
    region_text: pick(row, ["insttNm"]) || null,
    phone: pick(row, ["operPhoneNumber", "phoneNumber"]) || null,
    summary: summary ? summary.slice(0, 200) : null,
    source_url: pick(row, ["homepageUrl"]) || null,
    detail: {
      hours: hours || null,
      hldyHours: [hhmm(pick(row, ["holidayOperOpenHhmm"])), hhmm(pick(row, ["holidayCloseOpenHhmm"]))].filter(Boolean).join("~") || null,
      closeDay: closeDay || null,
      adultFee: adult || null,
      youthFee: youth || null,
      childFee: child || null,
      etcFee: pick(row, ["etcChrgeInfo"]) || null,
      institution: pick(row, ["operInstitutionNm", "institutionNm"]) || null,
      traffic: pick(row, ["trnsportInfo"]) || null,
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
  await upsertCatalog(supabase, mapped, "museum")
  printCoverage(mapped)
  console.log("[done] 박물관·미술관 적재 완료")
}
