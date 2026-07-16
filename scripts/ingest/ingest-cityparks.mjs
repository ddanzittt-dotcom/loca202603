// 전국도시공원정보표준데이터 → explore_catalog (tab: walk, source: citypark)
// 스펙 v3.3 T4 — 근린·문화·체육·수변공원 위주, 어린이·소공원은 제외(놀이터 범람 방지).
// 실행:  node scripts/ingest/ingest-cityparks.mjs --dry-run   (필드 검증)
//        node scripts/ingest/ingest-cityparks.mjs             (적재)

import {
  cliFlags, dataGoKrKey, fetchStandardDataAll, loadEnv,
  pick, printCoverage, printDrySample, serviceSupabase, stableId, toNum, upsertCatalog,
} from "./_shared.mjs"

const ENDPOINT = "http://api.data.go.kr/openapi/tn_pubr_public_cty_park_info_api"

// 제외 구분: 어린이공원·소공원 (T4). 구분 미상이면 면적 1만㎡ 미만 제외.
const EXCLUDED_KIND = /어린이|소공원/
const MIN_AREA_WHEN_UNKNOWN = 10000

function mapRow(row) {
  const lat = toNum(pick(row, ["latitude", "lat"]))
  const lng = toNum(pick(row, ["longitude", "lot", "lng"]))
  if (lat == null || lng == null || (lat === 0 && lng === 0)) return null

  const title = pick(row, ["parkNm", "fcltyNm"])
  if (!title) return null

  const kind = pick(row, ["parkSe"])
  const area = toNum(pick(row, ["parkAr"]))
  if (kind && EXCLUDED_KIND.test(kind)) return null
  if (!kind && (area == null || area < MIN_AREA_WHEN_UNKNOWN)) return null

  const facilities = ["mvmFclty", "amsmtFclty", "cnvnncFclty", "cltrFclty", "etcFclty"]
    .map((key) => pick(row, [key])).filter(Boolean).join(" · ")
  const addr = pick(row, ["rdnmadr", "lnmadr"])

  // 원본 관리번호(manageNo)가 안정 키 — 좌표·이름이 정정돼도 같은 행으로 upsert 된다 (dry-run 실측 확인)
  const manageNo = pick(row, ["manageNo"])

  return {
    id: manageNo ? `citypark:${manageNo}` : stableId("citypark", title, lat.toFixed(5), lng.toFixed(5)),
    source: "citypark",
    tab: "walk",
    title,
    category: kind || "공원",
    addr,
    lat,
    lng,
    phone: pick(row, ["phoneNumber"]) || null,
    summary: facilities ? facilities.slice(0, 160) : null,
    detail: { parkAr: area, institution: pick(row, ["institutionNm"]) || null },
    data_reference_date: pick(row, ["referenceDate"]) || null,
  }
}

const flags = cliFlags()
const env = loadEnv()
const apiKey = dataGoKrKey(env)

const rows = await fetchStandardDataAll(ENDPOINT, apiKey, { limit: flags.dryRun ? 50 : flags.limit })
const mapped = rows.map(mapRow).filter(Boolean)
console.log(`[map] 원본 ${rows.length} → 적재 대상 ${mapped.length} (어린이·소공원 필터 적용)`)

if (flags.dryRun) {
  printDrySample(rows, mapped)
} else {
  const supabase = serviceSupabase(env)
  await upsertCatalog(supabase, mapped, "citypark")
  printCoverage(mapped)
  console.log("[done] 도시공원 적재 완료")
}
