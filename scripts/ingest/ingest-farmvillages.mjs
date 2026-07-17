// 전국농어촌체험휴양마을표준데이터 → explore_catalog (tab: learn, source: farmvillage)
// ② 배우기의 체험 기둥 (스펙 §3-②). 농촌+어촌 포괄, 사진(exprnPicUrl) 제공 — 카드 썸네일에 사용.
// 실행:  node scripts/ingest/ingest-farmvillages.mjs --dry-run / (없이) 적재

import {
  cliFlags, dataGoKrKey, fetchStandardDataAll, loadEnv,
  pick, printCoverage, printDrySample, serviceSupabase, stableId, toNum, upsertCatalog,
} from "./_shared.mjs"

const ENDPOINT = "https://api.data.go.kr/openapi/tn_pubr_public_frhl_exprn_vilage_api"

function mapRow(row) {
  const lat = toNum(pick(row, ["latitude", "lat"]))
  const lng = toNum(pick(row, ["longitude", "lot", "lng"]))
  if (lat == null || lng == null || (lat === 0 && lng === 0)) return null

  const title = pick(row, ["exprnVilageNm"])
  if (!title) return null

  const programs = pick(row, ["exprnCn"]).replace(/\+/g, " · ")
  const image = pick(row, ["exprnPicUrl"]).replace(/^http:/, "https:")

  return {
    id: stableId("farmvillage", title, lat.toFixed(5), lng.toFixed(5)),
    source: "farmvillage",
    tab: "learn",
    title,
    category: "체험마을",
    addr: pick(row, ["rdnmadr", "lnmadr"]),
    lat,
    lng,
    region_text: [pick(row, ["ctprvnNm"]), pick(row, ["signguNm"])].filter(Boolean).join(" ") || null,
    phone: pick(row, ["phoneNumber"]) || null,
    summary: programs ? programs.slice(0, 160) : null,
    image: image || null,
    source_url: pick(row, ["homepageUrl"]) || null,
    detail: {
      kind: pick(row, ["exprnSe"]).replace(/\+/g, " · ") || null, // 체험구분 (농촌생활/어촌생활/레포츠 등)
      facilities: pick(row, ["holdFclty"]).replace(/\+/g, " · ") || null,
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
  await upsertCatalog(supabase, mapped, "farmvillage")
  printCoverage(mapped)
  console.log("[done] 농어촌체험휴양마을 적재 완료 — 반기 갱신 시 재실행")
}
