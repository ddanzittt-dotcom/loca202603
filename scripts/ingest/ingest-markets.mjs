// 전국전통시장표준데이터 → explore_catalog (tab: walk, source: market)
// 시장개설주기("5일+10일")를 끝자리 배열로 파싱해 저장 — 클라이언트가 "오늘 장" 배지 판정 (스펙 v3.3 §3-③)
// 실행:  node scripts/ingest/ingest-markets.mjs --dry-run / (없이) 적재

import { parseMarketDays } from "../../src/lib/marketDays.js"
import {
  cliFlags, dataGoKrKey, fetchStandardDataAll, loadEnv,
  pick, printCoverage, printDrySample, serviceSupabase, stableId, toNum, upsertCatalog,
} from "./_shared.mjs"

const ENDPOINT = "http://api.data.go.kr/openapi/tn_pubr_public_trdit_mrkt_api"

function mapRow(row) {
  const lat = toNum(pick(row, ["latitude", "lat"]))
  const lng = toNum(pick(row, ["longitude", "lot", "lng"]))
  if (lat == null || lng == null || (lat === 0 && lng === 0)) return null

  const title = pick(row, ["mrktNm", "trdMrktNm", "fcltyNm"])
  if (!title) return null

  const cycle = pick(row, ["mrktEstblCycle", "estblCycle", "mrktCycle", "opnCycle"])
  // 취급품목 실제 필드명은 trtmntPrdlst ("농산물+수산물+신발" 형태) — dry-run 실측 확인
  const items = pick(row, ["trtmntPrdlst", "hndlItm", "hndlnItm", "saleItm", "tradItm", "prdlstNm"]).replace(/\+/g, " · ")
  const marketDays = parseMarketDays(cycle)

  return {
    id: stableId("market", title, lat.toFixed(5), lng.toFixed(5)),
    source: "market",
    tab: "walk",
    title,
    category: pick(row, ["mrktType"]) || "전통시장",
    addr: pick(row, ["rdnmadr", "lnmadr"]),
    lat,
    lng,
    phone: pick(row, ["phoneNumber"]) || null,
    market_cycle: cycle || null,
    market_days: marketDays.length ? marketDays : null,
    summary: items ? `취급품목 ${items}`.slice(0, 160) : null,
    source_url: pick(row, ["homepageUrl"]) || null,
    detail: {
      stores: pick(row, ["storNumber"]) || null, // 점포 수
      since: pick(row, ["estblYear"]) || null, // 개설 연도
    },
    data_reference_date: pick(row, ["referenceDate"]) || null,
  }
}

const flags = cliFlags()
const env = loadEnv()
const apiKey = dataGoKrKey(env)

const rows = await fetchStandardDataAll(ENDPOINT, apiKey, { limit: flags.dryRun ? 50 : flags.limit })
const mapped = rows.map(mapRow).filter(Boolean)
const withCycle = mapped.filter((row) => row.market_days).length
console.log(`[map] 원본 ${rows.length} → 적재 대상 ${mapped.length} (오일장 주기 파싱 성공 ${withCycle})`)

if (flags.dryRun) {
  printDrySample(rows, mapped)
} else {
  const supabase = serviceSupabase(env)
  await upsertCatalog(supabase, mapped, "market")
  printCoverage(mapped)
  console.log("[done] 전통시장 적재 완료")
}
