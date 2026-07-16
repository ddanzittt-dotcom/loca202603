// 탐색탭 사전 적재 공용 유틸 (스펙 v3.3 §3.5 — 사전 적재형 소스)
// - data.go.kr 표준데이터/두루누비 페이징 fetch
// - explore_catalog upsert (service_role)
// - --dry-run: 쓰기 없이 첫 페이지 필드/샘플 출력 (표준데이터 필드명 검증용)
//
// 필요 env (.env / .env.local / process.env, 뒤가 우선):
//   DATA_GO_KR_KEY (없으면 TOUR_API_KEY 재사용 — 같은 data.go.kr 계정 키로 활용신청만 하면 됨)
//   VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (dry-run 시 불필요)

import fs from "node:fs"
import path from "node:path"
import { createClient } from "@supabase/supabase-js"

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {}
  const out = {}
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    if (!line || /^\s*#/.test(line) || !line.includes("=")) continue
    const idx = line.indexOf("=")
    const key = line.slice(0, idx).trim()
    let value = line.slice(idx + 1).trim()
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    out[key] = value
  }
  return out
}

export function loadEnv() {
  const cwd = process.cwd()
  return {
    ...parseEnvFile(path.join(cwd, ".env")),
    ...parseEnvFile(path.join(cwd, ".env.local")),
    ...parseEnvFile(path.join(cwd, ".env.production.local")),
    ...process.env,
  }
}

export function cliFlags() {
  const args = process.argv.slice(2)
  const flags = { dryRun: args.includes("--dry-run"), limit: null }
  const limitArg = args.find((a) => a.startsWith("--limit="))
  if (limitArg) flags.limit = Number(limitArg.split("=")[1]) || null
  return flags
}

export function dataGoKrKey(env) {
  const key = (env.DATA_GO_KR_KEY || env.TOUR_API_KEY || "").trim()
  if (!key) {
    console.error("[ingest] DATA_GO_KR_KEY(또는 TOUR_API_KEY)가 없습니다 — data.go.kr 인증키를 .env에 추가하세요.")
    process.exit(1)
  }
  return key
}

export function serviceSupabase(env) {
  const url = (env.VITE_SUPABASE_URL || env.SUPABASE_URL || "").trim()
  const serviceKey = (env.SUPABASE_SERVICE_ROLE_KEY || "").trim()
  if (!url || !serviceKey) {
    console.error("[ingest] VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 필요합니다 (쓰기는 service_role 전용 — migration 074 참조).")
    process.exit(1)
  }
  return createClient(url, serviceKey, { auth: { persistSession: false } })
}

export const toNum = (value) => {
  const next = Number(String(value ?? "").replace(/,/g, "").trim())
  return Number.isFinite(next) ? next : null
}

// 후보 키 목록 중 첫 번째로 값이 있는 필드 — 표준데이터 로마자 필드명이 판마다 미세하게 달라 방어적으로 조회
export function pick(row, candidates) {
  for (const key of candidates) {
    const value = row?.[key]
    if (value != null && String(value).trim() !== "") return String(value).trim()
  }
  return ""
}

// 안정 id 해시 (원본 고유키가 없을 때: 이름+좌표 기반)
export function stableId(prefix, ...parts) {
  const text = parts.join("|")
  let hash = 5381
  for (let i = 0; i < text.length; i += 1) hash = ((hash << 5) + hash + text.charCodeAt(i)) >>> 0
  return `${prefix}:${hash.toString(36)}`
}

// ── data.go.kr 표준데이터 API (api.data.go.kr/openapi/*) ──
// 응답: { response: { header: { resultCode }, body: { items: [...], totalCount } } }
export async function fetchStandardDataAll(endpoint, apiKey, { limit = null } = {}) {
  const rows = []
  const numOfRows = 1000
  for (let pageNo = 1; pageNo <= 100; pageNo += 1) {
    const params = new URLSearchParams({
      serviceKey: apiKey,
      pageNo: String(pageNo),
      numOfRows: String(numOfRows),
      type: "json",
    })
    const resp = await fetch(`${endpoint}?${params.toString()}`)
    const text = await resp.text()
    let data
    try {
      data = JSON.parse(text)
    } catch {
      throw new Error(`표준데이터 응답이 JSON이 아닙니다 (인증키/활용신청 확인): ${text.slice(0, 200)}`)
    }
    const header = data?.response?.header
    if (header?.resultCode && !["00", "0000"].includes(String(header.resultCode))) {
      throw new Error(`표준데이터 오류 ${header.resultCode}: ${header.resultMsg || ""}`)
    }
    const body = data?.response?.body
    const items = Array.isArray(body?.items) ? body.items : (body?.items?.item ? [].concat(body.items.item) : [])
    rows.push(...items)
    const total = toNum(body?.totalCount) ?? rows.length
    process.stdout.write(`\r[fetch] ${rows.length}/${total}건`)
    if (limit && rows.length >= limit) break
    if (rows.length >= total || items.length === 0) break
  }
  process.stdout.write("\n")
  return limit ? rows.slice(0, limit) : rows
}

// ── 두루누비 (B551011 — TourAPI 계열 envelope: body.items.item) ──
export async function fetchDurunubiAll(endpoint, apiKey, { limit = null, extra = {} } = {}) {
  const rows = []
  const numOfRows = 100
  for (let pageNo = 1; pageNo <= 50; pageNo += 1) {
    const params = new URLSearchParams({
      serviceKey: apiKey,
      MobileOS: "ETC",
      MobileApp: "LOCA",
      _type: "json",
      numOfRows: String(numOfRows),
      pageNo: String(pageNo),
      ...extra,
    })
    const resp = await fetch(`${endpoint}?${params.toString()}`)
    const text = await resp.text()
    let data
    try {
      data = JSON.parse(text)
    } catch {
      throw new Error(`두루누비 응답이 JSON이 아닙니다 (인증키/활용신청 확인): ${text.slice(0, 200)}`)
    }
    const header = data?.response?.header
    if (header?.resultCode && header.resultCode !== "0000") {
      throw new Error(`두루누비 오류 ${header.resultCode}: ${header.resultMsg || ""}`)
    }
    const raw = data?.response?.body?.items?.item || []
    const items = Array.isArray(raw) ? raw : [raw]
    rows.push(...items.filter(Boolean))
    const total = toNum(data?.response?.body?.totalCount) ?? rows.length
    process.stdout.write(`\r[fetch] ${rows.length}/${total}건`)
    if (limit && rows.length >= limit) break
    if (rows.length >= total || items.length === 0) break
  }
  process.stdout.write("\n")
  return limit ? rows.slice(0, limit) : rows
}

// dry-run 출력 — 실제 필드명 확인용 (표준데이터 로마자 필드가 문서와 다를 수 있어 첫 실행 시 검증)
export function printDrySample(rows, mapped) {
  console.log(`\n[dry-run] 원본 ${rows.length}건 중 샘플 1건의 필드:`)
  console.log(Object.keys(rows[0] || {}).join(", ") || "(없음)")
  console.log("\n[dry-run] 원본 샘플:")
  console.log(JSON.stringify(rows[0] || {}, null, 2).slice(0, 1200))
  console.log(`\n[dry-run] 매핑 결과 ${mapped.length}건 중 샘플 2건:`)
  for (const row of mapped.slice(0, 2)) {
    const { points, ...rest } = row
    console.log(JSON.stringify({ ...rest, points: points ? `[${points.length}점]` : null }, null, 1))
  }
}

// 시도 단위 커버리지 요약 (스펙 §2 — 지역별 커버리지 운영 지표)
export function printCoverage(mapped) {
  const byRegion = new Map()
  for (const row of mapped) {
    const sido = String(row.addr || row.region_text || "").split(" ")[0] || "(미상)"
    byRegion.set(sido, (byRegion.get(sido) || 0) + 1)
  }
  console.log("\n[coverage] 시도별 적재 건수:")
  for (const [sido, count] of [...byRegion.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${sido}: ${count}`)
  }
}

export async function upsertCatalog(supabase, mappedInput, source) {
  // 원본 데이터에 같은 관리번호가 중복 등록된 행이 있어 배치 내 id 충돌이 난다
  // ("ON CONFLICT cannot affect row a second time") — 같은 id는 마지막 행만 남긴다.
  const byId = new Map()
  for (const row of mappedInput) byId.set(row.id, row)
  const mapped = [...byId.values()]
  if (mapped.length !== mappedInput.length) {
    console.log(`[dedupe] 원본 중복 id ${mappedInput.length - mapped.length}건 제거`)
  }

  let done = 0
  for (let i = 0; i < mapped.length; i += 500) {
    const chunk = mapped.slice(i, i + 500)
    const { error } = await supabase.from("explore_catalog").upsert(chunk, { onConflict: "id" })
    if (error) throw new Error(`upsert 실패 (${source}, ${i}~): ${error.message}`)
    done += chunk.length
    process.stdout.write(`\r[upsert] ${done}/${mapped.length}건`)
  }
  process.stdout.write("\n")
  // 이번 적재에 없는 같은 source 의 과거 행 정리 (재실행 = 전체 동기화)
  const ids = mapped.map((row) => row.id)
  if (ids.length > 0) {
    const { data: existing, error } = await supabase
      .from("explore_catalog").select("id").eq("source", source)
    if (!error && existing) {
      const keep = new Set(ids)
      const stale = existing.map((row) => row.id).filter((id) => !keep.has(id))
      for (let i = 0; i < stale.length; i += 500) {
        await supabase.from("explore_catalog").delete().in("id", stale.slice(i, i + 500))
      }
      if (stale.length) console.log(`[cleanup] 지난 레코드 ${stale.length}건 제거 (${source})`)
    }
  }
}
