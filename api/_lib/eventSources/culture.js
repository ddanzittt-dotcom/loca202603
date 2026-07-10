// 행사 소스 어댑터 — 문화포털(한국문화정보원) 공연전시정보 period2.
// 소규모 지역 공연·전시까지 커버. 좌표(gpsX/gpsY) 자체 포함 → 지오코딩 불필요.
// 응답이 XML 이므로 의존성 없이 평면 레코드만 뽑아 정규화한다.
//
// 인증키: CULTURE_API_KEY (data.go.kr, 없으면 TOUR_API_KEY 재사용 시도).
// 실패는 전부 조용히 [] 반환(fail-soft) — 이 소스가 죽어도 TourAPI 결과는 유지.
//
// 엔드포인트: B553457(한국문화정보원) — 가이드 개정으로 신/구 URL이 혼재해 순서대로 시도.
//   from,to(YYYYMMDD) · gpsxfrom/gpsyfrom/gpsxto/gpsyto(경도/위도 사각형) · rows · cPage · serviceKey
// 인증키 신청: data.go.kr "한국문화정보원_한눈에보는문화정보조회서비스" (자동승인)

import { normalizeDateStr, toNumber } from "../eventNormalize.js"

// End Point: data.go.kr 15138937(한눈에보는문화정보조회서비스) 상세 = /B553457/cultureinfo
// 기간+GPS 조회 오퍼레이션은 period2.
const CULTURE_ENDPOINTS = [
  "https://apis.data.go.kr/B553457/cultureinfo/period2",
]
const BBOX_DELTA_DEG = 0.7 // 위치 기준 약 ±60~70km 사각형 (하류 거리필터가 최종 반경 컷)
const ROWS_PER_PAGE = 100
const PAGE_COUNT = 2
const PAST_DAYS = 90 // 이미 시작한 진행중 행사도 잡히게 과거로 넉넉히
const FUTURE_DAYS = 180

function cultureApiKey() {
  return (process.env.CULTURE_API_KEY || process.env.TOUR_API_KEY || "").trim()
}

function shiftDate(base, days) {
  const next = new Date(base)
  next.setDate(next.getDate() + days)
  return next
}

function ymd(date) {
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`
}

function decodeEntities(text) {
  return String(text)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .trim()
}

// 레코드 블록에서 첫 번째로 발견되는 태그 값을 뽑는다(태그명 후보 여러 개 허용).
function pick(block, tags) {
  for (const tag of tags) {
    const match = block.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "i"))
    if (match) {
      const value = decodeEntities(match[1])
      if (value) return value
    }
  }
  return ""
}

// period2 응답에서 개별 행사 레코드 블록 추출. 레코드 컨테이너 태그명이
// 배포/버전에 따라 다를 수 있어 후보를 순서대로 시도.
function extractRecords(xml) {
  for (const tag of ["perforList", "item"]) {
    const blocks = xml.match(new RegExp(`<${tag}>[\\s\\S]*?</${tag}>`, "gi"))
    if (blocks && blocks.length) return blocks
  }
  return []
}

function normalizeCulture(block) {
  const lng = toNumber(pick(block, ["gpsX", "gpsx"]))
  const lat = toNumber(pick(block, ["gpsY", "gpsy"]))
  const title = pick(block, ["title"])
  const place = pick(block, ["place"])
  const image = pick(block, ["thumbnail", "imgUrl", "imageObject"])
  return {
    id: `culture-${pick(block, ["seq", "localId", "id"]) || title}`,
    source: "culture",
    title,
    addr: pick(block, ["placeAddr", "addr", "spatialCoverage"]) || place,
    image: image ? image.replace(/^http:/, "https:") : "",
    lat,
    lng,
    startDate: normalizeDateStr(pick(block, ["startDate", "period"])),
    endDate: normalizeDateStr(pick(block, ["endDate"])),
    tel: pick(block, ["phone", "tel", "contactPoint"]),
    contentTypeId: 15,
    eventPlace: place,
    sourceUrl: pick(block, ["url", "referenceIdentifier"]),
  }
}

async function fetchPage(baseUrl, apiKey, params, pageNo) {
  const query = new URLSearchParams({ ...params, cPage: String(pageNo), rows: String(ROWS_PER_PAGE) })
  const url = `${baseUrl}?serviceKey=${encodeURIComponent(apiKey)}&${query.toString()}`
  let resp
  try {
    resp = await fetch(url)
  } catch {
    return []
  }
  if (!resp.ok) return []
  const text = await resp.text()
  // data.go.kr 공통 에러(인증/트래픽)는 XML/JSON 어느 쪽이든 레코드가 없으므로 []로 흡수
  return extractRecords(text).map(normalizeCulture)
}

// 위치 주변 문화행사(정규화 완료)를 반환. 위치가 없으면 소규모 지역행사 취지상 건너뜀.
export async function fetchCultureEvents(location) {
  const apiKey = cultureApiKey()
  if (!apiKey || !location) return []

  const today = new Date()
  const params = {
    from: ymd(shiftDate(today, -PAST_DAYS)),
    to: ymd(shiftDate(today, FUTURE_DAYS)),
    gpsxfrom: String(location.lng - BBOX_DELTA_DEG),
    gpsxto: String(location.lng + BBOX_DELTA_DEG),
    gpsyfrom: String(location.lat - BBOX_DELTA_DEG),
    gpsyto: String(location.lat + BBOX_DELTA_DEG),
    sortStdr: "1",
  }

  // 신/구 엔드포인트를 순서대로 시도 — 레코드가 나오는 첫 엔드포인트를 사용
  const pages = Array.from({ length: PAGE_COUNT }, (_, index) => index + 1)
  for (const baseUrl of CULTURE_ENDPOINTS) {
    const settled = await Promise.allSettled(pages.map((pageNo) => fetchPage(baseUrl, apiKey, params, pageNo)))
    const items = settled.flatMap((result) => (result.status === "fulfilled" ? result.value : []))
    if (items.length) return items
  }
  return []
}

// ── 임시 진단 (배포 후 원인 파악용, 확인되면 제거) ──
// 키 자체는 노출하지 않고 존재/길이/앞3자만. 각 엔드포인트의 status·본문 앞부분·레코드 수 반환.
export async function diagnoseCulture(location) {
  const apiKey = cultureApiKey()
  const keyInfo = {
    present: Boolean(apiKey),
    length: apiKey.length,
    head: apiKey.slice(0, 3),
    hasPercent: apiKey.includes("%"),
    from: process.env.CULTURE_API_KEY ? "CULTURE_API_KEY" : (process.env.TOUR_API_KEY ? "TOUR_API_KEY(fallback)" : "none"),
  }
  if (!apiKey || !location) return { keyInfo, note: "no key or location" }

  const today = new Date()
  const params = {
    from: ymd(shiftDate(today, -PAST_DAYS)),
    to: ymd(shiftDate(today, FUTURE_DAYS)),
    gpsxfrom: String(location.lng - BBOX_DELTA_DEG),
    gpsxto: String(location.lng + BBOX_DELTA_DEG),
    gpsyfrom: String(location.lat - BBOX_DELTA_DEG),
    gpsyto: String(location.lat + BBOX_DELTA_DEG),
    sortStdr: "1",
  }

  // 살아있는 경로 탐색용 후보 배치 (base = /B553457/cultureinfo)
  const candidates = [
    "https://apis.data.go.kr/B553457/cultureinfo/period2",
    "https://apis.data.go.kr/B553457/cultureinfo/area2",
    "https://apis.data.go.kr/B553457/cultureinfo/realm2",
    "https://apis.data.go.kr/B553457/cultureinfo/detail2",
  ]
  const probes = []
  for (const baseUrl of candidates) {
    const query = new URLSearchParams({ ...params, cPage: "1", rows: "5" })
    const url = `${baseUrl}?serviceKey=${encodeURIComponent(apiKey)}&${query.toString()}`
    try {
      const resp = await fetch(url)
      const text = await resp.text()
      probes.push({
        baseUrl,
        status: resp.status,
        records: extractRecords(text).length,
        bodyHead: text.slice(0, 300),
      })
    } catch (error) {
      probes.push({ baseUrl, error: `${error.name}: ${error.message}` })
    }
  }
  return { keyInfo, probes }
}
