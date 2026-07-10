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
// period2=기간+GPS 사각형, area2=지역(시도)별. 둘 다 <item>에 gpsX/gpsY 포함.
const CULTURE_BASE = "https://apis.data.go.kr/B553457/cultureinfo"
const BBOX_DELTA_DEG = 0.7 // 위치 기준 약 ±60~70km 사각형 (하류 거리필터가 최종 반경 컷)
const ROWS_PER_PAGE = 100
const PAGE_COUNT = 3
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

// period2 <item> 실제 필드: seq·title·startDate/endDate(YYYYMMDD)·place·realmName·
//   area·sigungu·thumbnail·gpsX(경도)·gpsY(위도). url/phone/전체주소 필드는 없음.
function normalizeCulture(block) {
  const lng = toNumber(pick(block, ["gpsX"]))
  const lat = toNumber(pick(block, ["gpsY"]))
  const title = pick(block, ["title"])
  const place = pick(block, ["place"])
  const image = pick(block, ["thumbnail", "imgUrl"])
  // 주소 필드가 없어 지역(시·도 + 시군구) + 장소명을 합쳐 위치 정보를 만든다
  const addr = [pick(block, ["area"]), pick(block, ["sigungu"]), place].filter(Boolean).join(" ")
  return {
    id: `culture-${pick(block, ["seq"]) || title}`,
    source: "culture",
    title,
    addr,
    image: image ? image.replace(/^http:/, "https:") : "",
    lat,
    lng,
    startDate: normalizeDateStr(pick(block, ["startDate"])),
    endDate: normalizeDateStr(pick(block, ["endDate"])),
    tel: "",
    contentTypeId: 15,
    category: pick(block, ["realmName"]), // 분야(연극/전시/뮤지컬 등)
    eventPlace: place,
    sourceUrl: "",
  }
}

async function fetchPage(operation, apiKey, params, pageNo) {
  const query = new URLSearchParams({ ...params, cPage: String(pageNo), rows: String(ROWS_PER_PAGE) })
  const url = `${CULTURE_BASE}/${operation}?serviceKey=${encodeURIComponent(apiKey)}&${query.toString()}`
  let resp
  try {
    resp = await fetch(url)
  } catch {
    return []
  }
  if (!resp.ok) return []
  const text = await resp.text()
  // data.go.kr 공통 에러(인증/트래픽)는 레코드가 없으므로 []로 흡수
  return extractRecords(text).map(normalizeCulture)
}

async function fetchOperation(operation, apiKey, params) {
  const pages = Array.from({ length: PAGE_COUNT }, (_, index) => index + 1)
  const settled = await Promise.allSettled(pages.map((pageNo) => fetchPage(operation, apiKey, params, pageNo)))
  return settled.flatMap((result) => (result.status === "fulfilled" ? result.value : []))
}

// 위치 주변 문화행사(정규화 완료)를 반환. 위치가 없으면 소규모 지역행사 취지상 건너뜀.
// period2(GPS 사각형)에 더해, 시도를 알면 area2(지역별)로 커버리지를 넓힌다.
// 두 오퍼레이션 결과는 events.js 의 dedupeEvents(제목+주소)로 병합·중복제거된다.
export async function fetchCultureEvents(location, region) {
  const apiKey = cultureApiKey()
  if (!apiKey || !location) return []

  const today = new Date()
  const dateRange = {
    from: ymd(shiftDate(today, -PAST_DAYS)),
    to: ymd(shiftDate(today, FUTURE_DAYS)),
    sortStdr: "1",
  }
  const periodParams = {
    ...dateRange,
    gpsxfrom: String(location.lng - BBOX_DELTA_DEG),
    gpsxto: String(location.lng + BBOX_DELTA_DEG),
    gpsyfrom: String(location.lat - BBOX_DELTA_DEG),
    gpsyto: String(location.lat + BBOX_DELTA_DEG),
  }

  const jobs = [fetchOperation("period2", apiKey, periodParams)]
  if (region?.sido) {
    jobs.push(fetchOperation("area2", apiKey, { ...dateRange, sido: region.sido }))
  }
  const settled = await Promise.allSettled(jobs)
  return settled.flatMap((result) => (result.status === "fulfilled" ? result.value : []))
}
