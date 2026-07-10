// 행사 소스 어댑터 — KOPIS(공연예술통합전산망) 공연목록.
// 대학로급 소극장 등 소규모 공연까지 커버. 목록에 좌표가 없어 공연장명을 카카오로 지오코딩.
//
// 인증키: KOPIS_API_KEY (kopis.or.kr 오픈API 발급). 미설정 시 조용히 [] (fail-soft).
// 지오코딩: KAKAO_REST_KEY (앱 공용). 지역 좁히기: 좌표→시도(resolveRegion)→KOPIS 지역코드.
//
// 목록: http://www.kopis.or.kr/openApi/restful/pblprfr
//   service · stdate/eddate(YYYYMMDD) · cpage · rows · signgucode(지역) · prfstate
// 응답 XML <dbs><db>: mt20id·prfnm·prfpdfrom/prfpdto(YYYY.MM.DD)·fcltynm·poster·area·genrenm·prfstate

import { normalizeDateStr } from "../eventNormalize.js"
import { geocodePlace } from "../geocode.js"

const KOPIS_LIST_URL = "http://www.kopis.or.kr/openApi/restful/pblprfr"
const KOPIS_VIEW_URL = "https://www.kopis.or.kr/por/db/pblprfr/pblprfrView.do"
const ROWS_PER_PAGE = 50
const PAGE_COUNT = 2
const GEOCODE_CAP = 24 // 좌표 붙일 공연 상한 (카카오 쿼터 보호)
const PAST_DAYS = 14
const FUTURE_DAYS = 120

function kopisApiKey() {
  return (process.env.KOPIS_API_KEY || "").trim()
}

// 시도명 → KOPIS signgucode (행정표준 시도코드). 미매칭 시 "".
function kopisSignguCode(sido) {
  const s = String(sido || "")
  const table = [
    ["서울", "11"], ["부산", "26"], ["대구", "27"], ["인천", "28"],
    ["광주", "29"], ["대전", "30"], ["울산", "31"], ["세종", "36"],
    ["경기", "41"], ["강원", "51"],
    ["충청북", "43"], ["충북", "43"], ["충청남", "44"], ["충남", "44"],
    ["전라북", "45"], ["전북", "45"], ["전라남", "46"], ["전남", "46"],
    ["경상북", "47"], ["경북", "47"], ["경상남", "48"], ["경남", "48"],
    ["제주", "50"],
  ]
  for (const [name, code] of table) if (s.includes(name)) return code
  return ""
}

function ymd(date) {
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`
}

function shiftDate(base, days) {
  const next = new Date(base)
  next.setDate(next.getDate() + days)
  return next
}

function pick(block, tag) {
  const match = block.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "i"))
  if (!match) return ""
  return String(match[1])
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .trim()
}

function extractRows(xml) {
  const blocks = xml.match(/<db>[\s\S]*?<\/db>/gi)
  return blocks || []
}

async function fetchListPage(apiKey, params, pageNo) {
  const query = new URLSearchParams({ ...params, service: apiKey, cpage: String(pageNo), rows: String(ROWS_PER_PAGE) })
  let resp
  try {
    resp = await fetch(`${KOPIS_LIST_URL}?${query.toString()}`)
  } catch {
    return []
  }
  if (!resp.ok) return []
  const text = await resp.text()
  return extractRows(text)
}

// 지역(시도) 안의 공연 목록 → 공연장 지오코딩 → 정규화된 공통 스키마.
// 위치/키/지역코드가 없으면 건너뜀(fail-soft).
export async function fetchKopisEvents(location, region) {
  const apiKey = kopisApiKey()
  const signgucode = kopisSignguCode(region?.sido)
  if (!apiKey || !location || !signgucode) return []

  const today = new Date()
  const params = {
    stdate: ymd(shiftDate(today, -PAST_DAYS)),
    eddate: ymd(shiftDate(today, FUTURE_DAYS)),
    signgucode,
  }

  const pages = Array.from({ length: PAGE_COUNT }, (_, index) => index + 1)
  const settled = await Promise.allSettled(pages.map((pageNo) => fetchListPage(apiKey, params, pageNo)))
  const rows = settled.flatMap((result) => (result.status === "fulfilled" ? result.value : []))

  // 완료 공연 제외 + 상한
  const candidates = rows
    .map((block) => ({
      mt20id: pick(block, "mt20id"),
      title: pick(block, "prfnm"),
      startDate: normalizeDateStr(pick(block, "prfpdfrom")),
      endDate: normalizeDateStr(pick(block, "prfpdto")),
      place: pick(block, "fcltynm"),
      image: pick(block, "poster"),
      area: pick(block, "area"),
      genre: pick(block, "genrenm"),
      state: pick(block, "prfstate"),
    }))
    .filter((item) => item.title && item.place && item.state !== "공연완료")
    .slice(0, GEOCODE_CAP)

  // 공연장명을 사용자 위치 근처 기준으로 지오코딩 (병렬, 실패 시 해당 공연 제외)
  const geocoded = await Promise.allSettled(candidates.map(async (item) => {
    const coords = await geocodePlace(item.place, location)
    if (!coords) return null
    return {
      id: `kopis-${item.mt20id}`,
      source: "kopis",
      title: item.title,
      addr: [item.area, item.place].filter(Boolean).join(" "),
      image: item.image ? item.image.replace(/^http:/, "https:") : "",
      lat: coords.lat,
      lng: coords.lng,
      startDate: item.startDate,
      endDate: item.endDate,
      tel: "",
      contentTypeId: 15,
      category: item.genre,
      eventPlace: item.place,
      sourceUrl: item.mt20id ? `${KOPIS_VIEW_URL}?mt20Id=${item.mt20id}` : "",
    }
  }))

  return geocoded.flatMap((result) => (result.status === "fulfilled" && result.value ? [result.value] : []))
}
