// 한국관광공사 TourAPI - 축제/행사 조회
// 환경변수: TOUR_API_KEY (data.go.kr 발급)

const TOUR_BASE_URL = "https://apis.data.go.kr/B551011/KorService2"
const FESTIVAL_ROWS_PER_PAGE = 200
const FESTIVAL_PAGE_COUNT = 5
const NEARBY_EVENT_ROWS = 36
const NEARBY_EVENT_DETAIL_LIMIT = 24
const NEARBY_EVENT_RADIUS_M = 20000
const EVENT_RADIUS_KM = 100
const EVENT_LIMIT = 80

function toYYYYMMDD(date) {
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`
}

function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371
  const toRad = (deg) => deg * Math.PI / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function toNumber(value) {
  const next = Number(value)
  return Number.isFinite(next) ? next : null
}

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

function normalizeItem(item) {
  const lat = toNumber(item.mapy)
  const lng = toNumber(item.mapx)
  return {
    id: String(item.contentid || item.id || ""),
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

function isActiveEvent(item, todayStr) {
  if (item.eventenddate) return item.eventenddate >= todayStr
  if (item.eventstartdate) return item.eventstartdate >= todayStr
  return false
}

function eventQualityScore(item) {
  return [
    item.firstimage || item.firstimage2,
    item.eventstartdate,
    item.eventenddate,
    item.addr1 || item.addr2 || item.eventplace,
    item.tel,
  ].filter(Boolean).length
}

function dedupeEvents(items) {
  const byKey = new Map()

  for (const item of items) {
    if (!item?.title) continue
    const id = item.contentid ? `id:${item.contentid}` : ""
    const fallback = `${item.title.replace(/\s+/g, "").toLowerCase()}|${String(item.addr1 || item.addr2 || item.eventplace || "").slice(0, 20)}`
    const key = id || fallback
    const prev = byKey.get(key)

    if (!prev || eventQualityScore(item) > eventQualityScore(prev)) {
      byKey.set(key, item)
    }
  }

  return [...byKey.values()]
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

function sortEvents(items, location = null) {
  return [...items].sort((a, b) => {
    if (location) return (a.distKm ?? Infinity) - (b.distKm ?? Infinity)
    const aStart = a.startDate || "99999999"
    const bStart = b.startDate || "99999999"
    return aStart.localeCompare(bStart) || a.title.localeCompare(b.title)
  })
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*")
  const hasLocation = req.query.lat && req.query.lng
  res.setHeader("Cache-Control", hasLocation ? "no-cache, no-store" : "s-maxage=3600, stale-while-revalidate=7200")

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
    const [festivalItems, nearbyCandidates] = await Promise.all([
      fetchFestivalPages(apiKey, startDateStr),
      fetchNearbyEventCandidates(apiKey, location),
    ])

    const active = dedupeEvents([...festivalItems, ...nearbyCandidates])
      .filter((item) => item.title && isActiveEvent(item, todayStr))
      .map(normalizeItem)
      .filter((item) => item.id && Number.isFinite(item.lat) && Number.isFinite(item.lng))

    if (location) {
      const nearby = active
        .map((item) => ({ ...item, distKm: Math.round(haversine(location.lat, location.lng, item.lat, item.lng) * 10) / 10 }))
        .filter((item) => item.distKm <= EVENT_RADIUS_KM)

      return res.status(200).json({
        items: sortEvents(nearby, location).slice(0, EVENT_LIMIT),
        radiusKm: EVENT_RADIUS_KM,
        sources: {
          festival: festivalItems.length,
          nearby: nearbyCandidates.length,
        },
      })
    }

    return res.status(200).json({
      items: sortEvents(active).slice(0, EVENT_LIMIT),
      sources: {
        festival: festivalItems.length,
        nearby: 0,
      },
    })
  } catch (error) {
    return res.status(502).json({ items: [], error: `${error.name}: ${error.message}` })
  }
}
