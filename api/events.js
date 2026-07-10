// 한국관광공사 TourAPI + 문화포털 - 축제/행사 조회 (탐색 탭 큐레이션)
// 환경변수: TOUR_API_KEY (data.go.kr 발급), CULTURE_API_KEY (선택, 없으면 TOUR_API_KEY 재사용)
// 2026-07 탐색 큐레이션 개편으로 복원 — isAppRequest 가드 추가 (오픈 프록시 차단)
// 2026-07 소규모 행사 커버리지 — 정규화/집계는 _lib/eventNormalize 공용 모듈로 추출,
//          문화포털(공연전시 period2)을 소스로 병합. 소스별 어댑터는 정규화된 공통 스키마를 반환.

import { isAppRequest } from "./_lib/appRequest.js"
import {
  dedupeEvents,
  haversine,
  isActiveEvent,
  sortEvents,
  toNumber,
  toYYYYMMDD,
} from "./_lib/eventNormalize.js"
import { fetchCultureEvents } from "./_lib/eventSources/culture.js"

const TOUR_BASE_URL = "https://apis.data.go.kr/B551011/KorService2"
const FESTIVAL_ROWS_PER_PAGE = 200
const FESTIVAL_PAGE_COUNT = 5
const NEARBY_EVENT_ROWS = 36
const NEARBY_EVENT_DETAIL_LIMIT = 24
const NEARBY_EVENT_RADIUS_M = 20000
const EVENT_RADIUS_KM = 100
const EVENT_LIMIT = 80

function readTourItems(data) {
  const rawItems = data?.response?.body?.items?.item || []
  return Array.isArray(rawItems) ? rawItems : [rawItems]
}

function buildTourUrl(apiKey, endpoint, params) {
  const query = new URLSearchParams({
    MobileOS: "ETC",
    MobileApp: "LOCA",
    _type: "json",
    ...params,
  })
  return `${TOUR_BASE_URL}/${endpoint}?serviceKey=${encodeURIComponent(apiKey)}&${query.toString()}`
}

async function fetchTourItems(apiKey, endpoint, params, { required = false } = {}) {
  let resp
  try {
    resp = await fetch(buildTourUrl(apiKey, endpoint, params))
  } catch (error) {
    if (required) throw error
    return []
  }

  const text = await resp.text()

  if (!resp.ok) {
    if (required) throw new Error(`TourAPI ${endpoint} failed: ${resp.status}`)
    return []
  }

  let data
  try {
    data = JSON.parse(text)
  } catch {
    if (required) throw new Error(`Invalid response from TourAPI: ${text.slice(0, 200)}`)
    return []
  }

  const resultCode = data?.response?.header?.resultCode
  if (resultCode && resultCode !== "0000") {
    if (required) {
      const message = data?.response?.header?.resultMsg || `TourAPI ${endpoint} returned ${resultCode}`
      throw new Error(message)
    }
    return []
  }

  return readTourItems(data)
}

// TourAPI 원본 → 공통 정규화 스키마 (eventNormalize 참조)
function normalizeTourItem(item) {
  const lat = toNumber(item.mapy)
  const lng = toNumber(item.mapx)
  return {
    id: String(item.contentid || item.id || ""),
    source: "tourapi",
    title: item.title || "",
    addr: item.addr1 || item.addr2 || item.eventplace || "",
    image: item.firstimage || item.firstimage2 || "",
    lat,
    lng,
    startDate: item.eventstartdate || "",
    endDate: item.eventenddate || "",
    tel: item.tel || "",
    contentTypeId: Number(item.contenttypeid || 15),
  }
}

async function fetchFestivalPages(apiKey, startDateStr) {
  const pages = Array.from({ length: FESTIVAL_PAGE_COUNT }, (_, index) => index + 1)
  const results = await Promise.all(pages.map((pageNo) => fetchTourItems(apiKey, "searchFestival2", {
    numOfRows: String(FESTIVAL_ROWS_PER_PAGE),
    pageNo: String(pageNo),
    eventStartDate: startDateStr,
    arrange: "R",
  }, { required: pageNo === 1 })))

  return results.flat()
}

async function fetchEventIntro(apiKey, contentId) {
  const rows = await fetchTourItems(apiKey, "detailIntro2", {
    contentId: String(contentId),
    contentTypeId: "15",
    numOfRows: "1",
    pageNo: "1",
  })
  return rows[0] || {}
}

async function fetchNearbyEventCandidates(apiKey, location) {
  if (!location) return []

  const rows = await fetchTourItems(apiKey, "locationBasedList2", {
    mapX: String(location.lng),
    mapY: String(location.lat),
    radius: String(NEARBY_EVENT_RADIUS_M),
    arrange: "E",
    contentTypeId: "15",
    numOfRows: String(NEARBY_EVENT_ROWS),
    pageNo: "1",
  })

  const candidates = rows.slice(0, NEARBY_EVENT_DETAIL_LIMIT)
  const settled = await Promise.allSettled(candidates.map(async (item) => {
    if (!item.contentid) return item
    const intro = await fetchEventIntro(apiKey, item.contentid)
    return { ...item, ...intro }
  }))

  return settled.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []))
}

export default async function handler(req, res) {
  // 남용 방지: 우리 앱(loca.im/프리뷰/로컬)에서 온 요청만 허용 (place-match.js와 동일 패턴)
  if (!isAppRequest(req)) {
    return res.status(403).json({ items: [], error: "forbidden" })
  }

  // 클라이언트가 좌표를 격자(소수 2자리 ≈ 1km)로 반올림해 보내므로
  // 같은 동네 사용자끼리 엣지 캐시를 공유한다 → API 일일 쿼터 보호
  res.setHeader("Cache-Control", "s-maxage=1800, stale-while-revalidate=3600")

  const apiKey = (process.env.TOUR_API_KEY || "").trim()
  if (!apiKey) {
    return res.status(500).json({ items: [], error: "TOUR_API_KEY not configured" })
  }

  const userLat = toNumber(req.query.lat)
  const userLng = toNumber(req.query.lng)
  const location = Number.isFinite(userLat) && Number.isFinite(userLng) ? { lat: userLat, lng: userLng } : null
  const today = new Date()
  const todayStr = toYYYYMMDD(today)
  const threeMonthsAgo = new Date(today)
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3)
  const startDateStr = toYYYYMMDD(threeMonthsAgo)

  try {
    // 소스별 어댑터는 각자 정규화된 공통 스키마를 돌려준다.
    // 문화포털은 fail-soft(키 없음/에러 시 [])라 프로덕션(키 미설정)에서도 기존 동작 유지.
    const [festivalRaw, nearbyRaw, cultureItems] = await Promise.all([
      fetchFestivalPages(apiKey, startDateStr),
      fetchNearbyEventCandidates(apiKey, location),
      fetchCultureEvents(location),
    ])

    const tourItems = [...festivalRaw, ...nearbyRaw]
      .filter((item) => item?.title)
      .map(normalizeTourItem)

    const active = dedupeEvents([...tourItems, ...cultureItems])
      .filter((item) => isActiveEvent(item, todayStr))
      .filter((item) => item.id && Number.isFinite(item.lat) && Number.isFinite(item.lng))

    const sources = {
      festival: festivalRaw.length,
      nearby: nearbyRaw.length,
      culture: cultureItems.length,
    }

    if (location) {
      const nearby = active
        .map((item) => ({ ...item, distKm: Math.round(haversine(location.lat, location.lng, item.lat, item.lng) * 10) / 10 }))
        .filter((item) => item.distKm <= EVENT_RADIUS_KM)

      return res.status(200).json({
        items: sortEvents(nearby, location).slice(0, EVENT_LIMIT),
        radiusKm: EVENT_RADIUS_KM,
        sources,
      })
    }

    return res.status(200).json({
      items: sortEvents(active).slice(0, EVENT_LIMIT),
      sources,
    })
  } catch (error) {
    return res.status(502).json({ items: [], error: `${error.name}: ${error.message}` })
  }
}
