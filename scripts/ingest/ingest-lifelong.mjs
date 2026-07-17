// 전국평생학습강좌표준데이터 → explore_catalog (tab: learn, source: lifelong)
// ② 배우기의 기둥 (스펙 §3-②). 선행 파이프라인 2개를 적재 시점에 수행:
//   ⓐ 지오코딩 — 좌표 필드가 없어 교육장 도로명주소를 카카오로 변환 (유니크 주소만)
//   ⓑ 적합 분류 (D3) — 자격증·어학·수험 계열 배제 (src/lib/learnFilter.js)
// 필터: 교육방법구분=오프라인, 교육 종료일이 지난 강좌 제외,
//        직업능력개발훈련비 지원(oadtCtLctreYn=Y)·학점은행(pntBankAckestYn=Y)은 직업·학위 성격 → 제외
// 실행:  node scripts/ingest/ingest-lifelong.mjs --dry-run  (지오코딩 3건만 표본)
//        node scripts/ingest/ingest-lifelong.mjs            (전체 — 카카오 지오코딩 수분 소요)

import { isLearnFitCourse } from "../../src/lib/learnFilter.js"
import {
  cliFlags, dataGoKrKey, fetchStandardDataAll, geocodeAddresses, kakaoRestKey, loadEnv,
  pick, printCoverage, printDrySample, serviceSupabase, stableId, toNum, upsertCatalog,
} from "./_shared.mjs"

const ENDPOINT = "https://api.data.go.kr/openapi/tn_pubr_public_lftm_lrn_lctre_api"

function toDateOnly(value) {
  const text = String(value || "").trim().replace(/\./g, "-").slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null
}

function todayStr() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
}

// 1차 필터+정규화 (좌표 없이) — 지오코딩 대상을 최소화한 뒤 주소를 채운다
function preRow(row, today) {
  const title = pick(row, ["lctreNm"])
  if (!title) return null

  // 오프라인만 (D3 확정 — "혼합"·온라인 제외)
  const method = pick(row, ["edcMthType", "edcMthdSe"])
  if (!method.includes("오프라인")) return null

  // 끝난 강좌 제외 (종료일 미상이면 시작일 기준)
  const startDay = toDateOnly(pick(row, ["edcStartDay"]))
  const endDay = toDateOnly(pick(row, ["edcEndDay"]))
  if (!(endDay || startDay) || (endDay || startDay) < today) return null

  const content = pick(row, ["lctreCo"])
  if (!isLearnFitCourse(title, content)) return null
  // 직업훈련비 지원·학점은행 인정 강좌 = 자격·학위 성격 (키워드가 못 잡는 것까지 규칙으로)
  if (pick(row, ["oadtCtLctreYn"]) === "Y" || pick(row, ["pntBankAckestYn"]) === "Y") return null

  const addr = pick(row, ["edcRdnmadr"])
  if (!addr) return null

  const institution = pick(row, ["operInstitutionNm"])
  const cost = toNum(pick(row, ["lctreCost"]))
  const time = [pick(row, ["edcStartTime"]), pick(row, ["edcColseTime", "edcEndTime"])].filter(Boolean).join("~")

  return {
    id: stableId("lifelong", title, institution, startDay || "", addr),
    source: "lifelong",
    tab: "learn",
    title,
    category: "강좌",
    addr,
    phone: pick(row, ["operPhoneNumber"]) || null,
    start_date: startDay,
    end_date: endDay,
    apply_start: toDateOnly(pick(row, ["rceptStartDate"])),
    apply_end: toDateOnly(pick(row, ["rceptEndDate"])),
    summary: content ? content.replace(/\s+/g, " ").slice(0, 160) : null,
    source_url: pick(row, ["homepageUrl"]) || null,
    detail: {
      institution: institution || null,
      place: pick(row, ["edcPlace"]) || null,
      instructor: pick(row, ["instrctrNm"]) || null,
      target: pick(row, ["edcTrgetType", "edcTrgetSe"]) || null,
      day: pick(row, ["operDay"]) || null,
      time: time || null,
      cost: cost != null ? cost : null,
      capacity: toNum(pick(row, ["psncpa"])),
      receptMethod: pick(row, ["rceptMthType"]) || null,
    },
    data_reference_date: pick(row, ["referenceDate"]) || null,
  }
}

const flags = cliFlags()
const env = loadEnv()
const apiKey = dataGoKrKey(env)
const today = todayStr()

const rows = await fetchStandardDataAll(ENDPOINT, apiKey, { limit: flags.dryRun ? 300 : flags.limit })
const pre = rows.map((row) => preRow(row, today)).filter(Boolean)
console.log(`[filter] 원본 ${rows.length} → 오프라인·기간유효·적합분류 통과 ${pre.length}`)

// 지오코딩 — dry-run은 표본 3건만. 키가 없어도 dry-run은 필터·매핑 검증 가능(좌표 없이).
const hasKakaoKey = Boolean((env.KAKAO_REST_KEY || env.KAKAO_REST_API_KEY || "").trim())
const targets = flags.dryRun ? pre.slice(0, 3) : pre
let mapped = []
let geocodeFailed = 0
if (hasKakaoKey) {
  const geocoded = await geocodeAddresses(targets.map((row) => row.addr), kakaoRestKey(env))
  for (const row of targets) {
    const point = geocoded.get(row.addr)
    if (!point) { geocodeFailed += 1; continue } // 실패 레코드 = 노출 제외 + 로그 (스펙 §8)
    mapped.push({ ...row, lat: point.lat, lng: point.lng })
  }
  console.log(`[geocode] 성공 ${mapped.length} / 제외 ${geocodeFailed}`)
} else if (flags.dryRun) {
  console.log("[geocode] KAKAO_REST_KEY 없음 — dry-run이라 좌표 없이 매핑만 표시")
  mapped = targets.map((row) => ({ ...row, lat: null, lng: null }))
} else {
  kakaoRestKey(env) // 명확한 에러 메시지와 함께 종료
}

if (flags.dryRun) {
  printDrySample(rows, mapped)
} else {
  const supabase = serviceSupabase(env)
  await upsertCatalog(supabase, mapped, "lifelong")
  printCoverage(mapped)
  console.log("[done] 평생학습강좌 적재 완료 — 분기 갱신 시 재실행 + 분류 표본 검수 (스펙 §8)")
}
