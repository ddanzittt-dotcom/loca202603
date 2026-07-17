// 국가유산청 국가지정문화재 → explore_catalog (tab: walk, source: heritage)
// 스펙 D6 — 1차 범위. 실측 확인(2026-07-17): 목록 API가 WGS84 좌표를 바로 제공(EPSG 변환 불필요),
// 서비스키 불필요, XML 전용. 해외 IP 차단 이슈는 이 스크립트를 국내(로컬)에서 실행하는 것으로 우회
// — 런타임(Vercel 미국 리전)은 이 API를 호출하지 않고 적재된 카탈로그만 읽는다.
// 실행:  node scripts/ingest/ingest-heritage.mjs --dry-run / (없이) 적재

import {
  cliFlags, loadEnv, printCoverage, printDrySample, serviceSupabase, upsertCatalog,
} from "./_shared.mjs"

const LIST_URL = "https://www.khs.go.kr/cha/SearchKindOpenapiList.do"

// "가서 볼 수 있는 공간·건물" 종목 — 무형(22)은 장소가 아니라 제외.
// 이동유물(불상·비석 등 좌표 0)은 mapItem 의 좌표 가드가 자동 제외한다.
// 국가지정 6종목(11~18) + 시도지정·자료·등록(21·23·24·31·79)으로 지역 밀도 확장 (2026-07 A1).
const KINDS = [
  { code: "11", label: "국보" },
  { code: "12", label: "보물" },
  { code: "13", label: "사적" },
  { code: "15", label: "명승" },
  { code: "16", label: "천연기념물" },
  { code: "18", label: "국가민속문화유산" },
  { code: "21", label: "시도유형문화유산" },
  { code: "23", label: "시도기념물" },
  { code: "24", label: "시도민속문화유산" },
  { code: "31", label: "문화유산자료" },
  { code: "79", label: "국가등록문화유산" },
]

function decode(text) {
  return String(text || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .trim()
}

function pickTag(block, tag) {
  const match = block.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "i"))
  return match ? decode(match[1]) : ""
}

async function fetchKind(kind, { limit = null } = {}) {
  const rows = []
  for (let pageIndex = 1; pageIndex <= 60; pageIndex += 1) {
    const params = new URLSearchParams({
      ccbaCncl: "N", // 지정 해제 제외
      ccbaKdcd: kind.code,
      pageUnit: "500",
      pageIndex: String(pageIndex),
    })
    const resp = await fetch(`${LIST_URL}?${params.toString()}`)
    if (!resp.ok) throw new Error(`문화재 목록 ${kind.label} HTTP ${resp.status}`)
    const xml = await resp.text()
    const items = xml.match(/<item>[\s\S]*?<\/item>/g) || []
    rows.push(...items)
    const total = Number(pickTag(xml, "totalCnt")) || rows.length
    process.stdout.write(`\r[fetch] ${kind.label} ${rows.length}/${total}건`)
    if (limit && rows.length >= limit) break
    if (rows.length >= total || items.length === 0) break
  }
  process.stdout.write("\n")
  return limit ? rows.slice(0, limit) : rows
}

function mapItem(block, kind) {
  const lat = Number(pickTag(block, "latitude"))
  const lng = Number(pickTag(block, "longitude"))
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat === 0 || lng === 0) return null

  const title = pickTag(block, "ccbaMnm1")
  if (!title) return null

  const sido = pickTag(block, "ccbaCtcdNm")
  const sigungu = pickTag(block, "ccsiName")
  const cpno = pickTag(block, "ccbaCpno") // 국가유산 종목별 고유번호 — 안정 키

  return {
    id: cpno ? `heritage:${cpno}` : `heritage:${kind.code}-${pickTag(block, "ccbaAsno")}-${pickTag(block, "ccbaCtcd")}`,
    source: "heritage",
    tab: "walk",
    title,
    category: pickTag(block, "ccmaName") || kind.label,
    addr: [sido, sigungu].filter(Boolean).join(" "), // 목록엔 시도·시군구까지만 (상세주소는 2차)
    lat,
    lng,
    region_text: [sido, sigungu].filter(Boolean).join(" ") || null,
    detail: {
      admin: pickTag(block, "ccbaAdmin") || null, // 관리 주체
      kindCode: kind.code,
    },
    source_url: `https://www.heritage.go.kr/heri/cul/culSelectDetail.do?ccbaCpno=${cpno}`,
  }
}

const flags = cliFlags()
const env = loadEnv()

const mapped = []
const rawSamples = []
for (const kind of KINDS) {
  const blocks = await fetchKind(kind, { limit: flags.dryRun ? 5 : null })
  if (rawSamples.length === 0 && blocks.length) rawSamples.push(blocks[0])
  for (const block of blocks) {
    const row = mapItem(block, kind)
    if (row) mapped.push(row)
  }
  if (flags.dryRun && kind.code !== "11") break // dry-run은 국보·보물만 표본
}
console.log(`[map] 적재 대상 ${mapped.length} (좌표 없는 항목 제외)`)

if (flags.dryRun) {
  console.log("\n[dry-run] 원본 XML 표본:\n" + (rawSamples[0] || "").slice(0, 600))
  printDrySample([{}], mapped)
} else {
  const supabase = serviceSupabase(env)
  await upsertCatalog(supabase, mapped, "heritage")
  printCoverage(mapped)
  console.log("[done] 문화재 적재 완료 — 국가지정 6 + 시도지정·자료·등록 5종목 (좌표 없는 이동유물 제외)")
}
