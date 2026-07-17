// 전국길관광정보표준데이터 → explore_catalog (tab: walk, source: trail)
// 스펙 D4-A — 좌표 필드가 전무해 시작지점 주소를 지오코딩해 "포인트로 격하".
// 총길이·소요시간은 카드 메타, 경유지 텍스트(coursInfo)는 상세 시트에서 노출.
// 두루누비(해안·DMZ 한정)가 못 덮는 내륙 걷기길을 이 소스가 전담한다.
// 실행:  node scripts/ingest/ingest-trails.mjs --dry-run / (없이) 적재 (지오코딩 수분)

import {
  cliFlags, dataGoKrKey, fetchStandardDataAll, geocodeAddresses, kakaoRestKey, loadEnv,
  pick, printCoverage, printDrySample, serviceSupabase, stableId, toNum, upsertCatalog,
} from "./_shared.mjs"

const ENDPOINT = "https://api.data.go.kr/openapi/tn_pubr_public_stret_tursm_info_api"

// "2시간", "1시간 30분", "40분" → 분
function toDurationMin(raw) {
  const text = String(raw || "").trim()
  if (!text) return null
  const hours = Number((text.match(/(\d+(?:\.\d+)?)\s*시간/) || [])[1] || 0)
  const minutes = Number((text.match(/(\d+)\s*분/) || [])[1] || 0)
  const total = Math.round(hours * 60 + minutes)
  if (total > 0) return total
  const bare = toNum(text)
  return bare != null && bare > 0 ? (bare <= 24 ? Math.round(bare * 60) : Math.round(bare)) : null
}

function preRow(row) {
  const title = pick(row, ["stretNm"])
  if (!title) return null
  const addr = pick(row, ["beginRdnmadr", "beginLnmadr"])
  if (!addr) return null

  return {
    id: stableId("trail", title, addr),
    source: "trail",
    tab: "walk",
    title,
    category: "걷기길",
    addr,
    phone: pick(row, ["phoneNumber"]) || null,
    route_distance_km: toNum(pick(row, ["stretLt"])),
    route_duration_min: toDurationMin(pick(row, ["reqreTime"])),
    summary: pick(row, ["stretIntrcn"]).replace(/\s+/g, " ").slice(0, 160) || null,
    detail: {
      course: pick(row, ["coursInfo"]) || null, // 경유지 텍스트 — 상세 시트 노출 (D4-A)
      beginSpot: pick(row, ["beginSpotNm"]) || null,
      endSpot: pick(row, ["endSpotNm"]) || null,
      institution: pick(row, ["institutionNm"]) || null,
    },
    data_reference_date: pick(row, ["referenceDate"]) || null,
  }
}

const flags = cliFlags()
const env = loadEnv()
const apiKey = dataGoKrKey(env)

const rows = await fetchStandardDataAll(ENDPOINT, apiKey, { limit: flags.dryRun ? 60 : flags.limit })
const pre = rows.map(preRow).filter(Boolean)
console.log(`[filter] 원본 ${rows.length} → 시작주소 보유 ${pre.length}`)

const hasKakaoKey = Boolean((env.KAKAO_REST_KEY || env.KAKAO_REST_API_KEY || "").trim())
const targets = flags.dryRun ? pre.slice(0, 3) : pre
let mapped = []
let geocodeFailed = 0
if (hasKakaoKey) {
  const geocoded = await geocodeAddresses(targets.map((row) => row.addr), kakaoRestKey(env))
  for (const row of targets) {
    const point = geocoded.get(row.addr)
    if (!point) { geocodeFailed += 1; continue } // 실패 = 노출 제외 + 로그 (스펙 §8)
    mapped.push({ ...row, lat: point.lat, lng: point.lng })
  }
  console.log(`[geocode] 성공 ${mapped.length} / 제외 ${geocodeFailed}`)
} else if (flags.dryRun) {
  console.log("[geocode] KAKAO_REST_KEY 없음 — dry-run이라 좌표 없이 매핑만 표시")
  mapped = targets.map((row) => ({ ...row, lat: null, lng: null }))
} else {
  kakaoRestKey(env)
}

if (flags.dryRun) {
  printDrySample(rows, mapped)
} else {
  const supabase = serviceSupabase(env)
  await upsertCatalog(supabase, mapped, "trail")
  printCoverage(mapped)
  console.log("[done] 걷기길 적재 완료")
}
