// 국가유산청 상세(SearchKindOpenapiDt.do) → explore_catalog 문화재 행의 image·summary·addr 보강 (백로그 A2)
// 실측(2026-07-17): 상세 파라미터의 ccbaAsno 는 목록 XML 의 13자리 원문을 그대로 넘겨야 한다
//   (예: 0000010000000). 8자리 등으로 가공하면 HTTP 200 이지만 전 필드 빈 값이 온다.
// 제공 필드: imageUrl(공식 이미지, 공공누리), content(소개문), ccbaLcad(상세주소 — 목록엔 시군구까지만).
// 실행:  node scripts/ingest/enrich-heritage-detail.mjs --dry-run / (없이) 보강 적재
// 주의: ingest-heritage.mjs 적재 후 실행 (id=heritage:{ccbaCpno} 기준 — 카탈로그에 있는 행만 갱신).
//       부분 컬럼 upsert 는 conflict 판정 전에 INSERT tuple 의 NOT NULL(source 등)이 평가되어
//       실패한다(실측) — 행별 update 로 값 있는 컬럼만 갱신한다.

import { cliFlags, loadEnv, serviceSupabase } from "./_shared.mjs"

const LIST_URL = "https://www.khs.go.kr/cha/SearchKindOpenapiList.do"
const DETAIL_URL = "https://www.khs.go.kr/cha/SearchKindOpenapiDt.do"
// ingest-heritage.mjs 와 동일 종목 (국가지정 6 + 시도지정·자료·등록 5)
const KINDS = ["11", "12", "13", "15", "16", "18", "21", "23", "24", "31", "79"]
const CONCURRENCY = 4
const SUMMARY_MAX = 500

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

async function fetchXml(url) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15000)
  try {
    const resp = await fetch(url, { signal: controller.signal })
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    return await resp.text()
  } finally {
    clearTimeout(timer)
  }
}

// 목록 재순회 — 상세 호출에 필요한 (kdcd, ctcd, asno 13자리, cpno) 확보 (종목당 페이지 500단위 수 콜)
async function fetchListRefs({ limit = null } = {}) {
  const refs = []
  for (const kdcd of KINDS) {
    for (let pageIndex = 1; pageIndex <= 60; pageIndex += 1) {
      const params = new URLSearchParams({ ccbaCncl: "N", ccbaKdcd: kdcd, pageUnit: "500", pageIndex: String(pageIndex) })
      const xml = await fetchXml(`${LIST_URL}?${params.toString()}`)
      const items = xml.match(/<item>[\s\S]*?<\/item>/g) || []
      for (const block of items) {
        const cpno = pickTag(block, "ccbaCpno")
        const asno = pickTag(block, "ccbaAsno")
        const ctcd = pickTag(block, "ccbaCtcd")
        if (cpno && asno && ctcd) refs.push({ id: `heritage:${cpno}`, kdcd, ctcd, asno })
      }
      const total = Number(pickTag(xml, "totalCnt")) || 0
      process.stdout.write(`\r[list] 종목 ${kdcd} — 누적 ${refs.length}건`)
      if (limit && refs.length >= limit) return refs.slice(0, limit)
      if (items.length === 0 || (total && pageIndex * 500 >= total)) break
    }
    if (limit && refs.length >= limit) break
  }
  process.stdout.write("\n")
  return refs
}

// 소개문 정리 — 태그 제거·공백 정규화 후 카드/시트에 맞게 절단
function cleanContent(text) {
  const clean = String(text || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
  if (!clean) return ""
  return clean.length > SUMMARY_MAX ? `${clean.slice(0, SUMMARY_MAX - 1).trim()}…` : clean
}

async function fetchDetail(ref) {
  const params = new URLSearchParams({ ccbaKdcd: ref.kdcd, ccbaCtcd: ref.ctcd, ccbaAsno: ref.asno })
  const xml = await fetchXml(`${DETAIL_URL}?${params.toString()}`)
  return {
    image: pickTag(xml, "imageUrl"),
    summary: cleanContent(pickTag(xml, "content")),
    addr: pickTag(xml, "ccbaLcad").replace(/\s+/g, " ").trim(),
  }
}

const flags = cliFlags()
const env = loadEnv()

const refs = await fetchListRefs({ limit: flags.dryRun ? 3 : flags.limit })
console.log(`[list] 목록 ${refs.length}건`)

if (flags.dryRun) {
  for (const ref of refs) {
    const detail = await fetchDetail(ref)
    console.log(JSON.stringify({ id: ref.id, image: detail.image, addr: detail.addr, summary: `${detail.summary.slice(0, 80)}…` }, null, 1))
  }
  console.log("[dry-run] DB 미접촉 — 표본 상세만 출력")
  process.exit(0)
}

const supabase = serviceSupabase(env)

// 카탈로그에 실재하는 문화재 행만 대상
const existingIds = new Set()
for (let from = 0; ; from += 1000) {
  const { data, error } = await supabase
    .from("explore_catalog")
    .select("id")
    .eq("source", "heritage")
    .range(from, from + 999)
  if (error) throw new Error(`카탈로그 조회 실패: ${error.message}`)
  for (const row of data || []) existingIds.add(row.id)
  if (!data || data.length < 1000) break
}
console.log(`[catalog] 대상 문화재 행 ${existingIds.size}건`)

const targets = refs.filter((ref) => existingIds.has(ref.id))
const updates = []
let done = 0
let failed = 0
let imageFilled = 0

async function worker(queue) {
  for (;;) {
    const ref = queue.shift()
    if (!ref) return
    let detail = null
    for (let attempt = 0; attempt < 2 && !detail; attempt += 1) {
      try {
        detail = await fetchDetail(ref)
      } catch {
        if (attempt === 1) failed += 1
        else await new Promise((resolve) => { setTimeout(resolve, 500) })
      }
    }
    if (detail) {
      // 값 있는 컬럼만 갱신 — 빈 값으로 기존 데이터를 덮지 않는다
      const cols = {}
      if (detail.image) cols.image = detail.image
      if (detail.summary) cols.summary = detail.summary
      if (detail.addr) cols.addr = detail.addr
      if (Object.keys(cols).length) updates.push({ id: ref.id, cols })
      if (detail.image) imageFilled += 1
    }
    done += 1
    if (done % 100 === 0 || done === targets.length) {
      process.stdout.write(`\r[detail] ${done}/${targets.length} (이미지 ${imageFilled}, 실패 ${failed})`)
    }
    await new Promise((resolve) => { setTimeout(resolve, 30) })
  }
}

const queue = [...targets]
await Promise.all(Array.from({ length: CONCURRENCY }, () => worker(queue)))
process.stdout.write("\n")

let written = 0
let writeFailed = 0
async function writeWorker(writeQueue) {
  for (;;) {
    const row = writeQueue.shift()
    if (!row) return
    const { error } = await supabase.from("explore_catalog").update(row.cols).eq("id", row.id)
    if (error) writeFailed += 1
    written += 1
    if (written % 100 === 0 || written === updates.length) {
      process.stdout.write(`\r[update] ${written}/${updates.length}건 (실패 ${writeFailed})`)
    }
  }
}

const writeQueue = [...updates]
await Promise.all(Array.from({ length: 8 }, () => writeWorker(writeQueue)))
process.stdout.write("\n")
if (writeFailed > 0) {
  console.error(`[warn] 갱신 실패 ${writeFailed}건 — 재실행하면 나머지가 채워진다 (멱등)`)
  process.exitCode = 1
}
console.log(`[done] 문화재 상세 보강 — 이미지 ${imageFilled}건, 갱신 ${written - writeFailed}건, 상세 실패 ${failed}건`)
