// Record-worthy place recommendations for Explore.
// Sources: Kakao Local (optional) + KTO TourAPI.

const TOUR_BASE_URL = "https://apis.data.go.kr/B551011/KorService2"
const KAKAO_CATEGORY_URL = "https://dapi.kakao.com/v2/local/search/category.json"

const KAKAO_CATEGORIES = [
  { code: "AT4", kind: "attraction", group: "place", label: "관광명소" },
  { code: "CT1", kind: "culture", group: "place", label: "문화시설" },
  { code: "CE7", kind: "cafe", group: "place", label: "카페" },
]

const TOUR_TYPES = [
  { id: 12, kind: "attraction", group: "place", label: "관광명소" },
  { id: 14, kind: "culture", group: "place", label: "문화시설" },
  { id: 28, kind: "leisure", group: "place", label: "레포츠" },
  { id: 38, kind: "shopping", group: "place", label: "쇼핑" },
]

const PLACE_LIMIT = 220
const KAKAO_PAGE_SIZE = 15
const KAKAO_PAGE_COUNT = 3
const TOUR_ROWS_PER_PAGE = 80
const TOUR_PAGE_COUNT = 3
const DEFAULT_LOCATION_RADIUS_M = 20000
const MIN_LOCATION_RADIUS_M = 1000
const MAX_LOCATION_RADIUS_M = 20000

const SEOUL_CENTER = { lat: 37.5665, lng: 126.9780 }

function toNumber(value) {
  const next = Number(value)
  return Number.isFinite(next) ? next : null
}

function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371
  const toRad = (deg) => deg * Math.PI / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function distanceKmFrom(location, item) {
  if (!location || !Number.isFinite(item.lat) || !Number.isFinite(item.lng)) return null
  return Math.round(haversine(location.lat, location.lng, item.lat, item.lng) * 10) / 10
}

function sourceSearchUrl(title) {
  return `https://korean.visitkorea.or.kr/search/search_list.do?keyword=${encodeURIComponent(title || "")}`
}

function compactCategoryName(name = "") {
  const parts = String(name).split(">").map((part) => part.trim()).filter(Boolean)
  return parts.at(-1) || parts[0] || ""
}

function scoreItem(item) {
  const distanceScore = Number.isFinite(item.distKm) ? Math.max(0, 45 - item.distKm * 4) : 16
  const imageScore = item.image ? 8 : 0
  const sourceScore = item.source === "kakao" ? 8 : 4
  return Math.round(30 + distanceScore + imageScore + sourceScore)
}

function normalizeKakaoPlace(raw, category, location) {
  const lat = toNumber(raw.y)
  const lng = toNumber(raw.x)
  const distKm = raw.distance ? Math.round((Number(raw.distance) / 1000) * 10) / 10 : distanceKmFrom(location, { lat, lng })
  const item = {
    id: `kakao-${raw.id}`,
    source: "kakao",
    sourceLabel: "Kakao",
    providerId: raw.id || "",
    kind: category.kind,
    group: category.group,
    category: compactCategoryName(raw.category_name) || category.label,
    title: raw.place_name || "",
    addr: raw.road_address_name || raw.address_name || "",
    lat,
    lng,
    phone: raw.phone || "",
    image: "",
    sourceUrl: raw.place_url || "",
    distKm,
  }
  return { ...item, score: scoreItem(item) }
}

function normalizeTourPlace(raw, type, location) {
  const lat = toNumber(raw.mapy)
  const lng = toNumber(raw.mapx)
  const tourDistKm = raw.dist ? Math.round((Number(raw.dist) / 1000) * 10) / 10 : null
  const item = {
    id: `tour-${raw.contentid}`,
    source: "tourapi",
    sourceLabel: "TourAPI",
    providerId: raw.contentid || "",
    contentTypeId: Number(raw.contenttypeid || type.id),
    kind: type.kind,
    group: type.group,
    category: type.label,
    title: raw.title || "",
    addr: raw.addr1 || raw.addr2 || "",
    lat,
    lng,
    phone: raw.tel || "",
    image: raw.firstimage || raw.firstimage2 || "",
    sourceUrl: sourceSearchUrl(raw.title),
    distKm: Number.isFinite(tourDistKm) ? tourDistKm : distanceKmFrom(location, { lat, lng }),
  }
  return { ...item, score: scoreItem(item) }
}

function dedupePlaces(items) {
  const byKey = new Map()
  for (const item of items) {
    if (!item?.title) continue
    const key = `${item.title.replace(/\s+/g, "").toLowerCase()}|${String(item.addr || "").slice(0, 18)}`
    const prev = byKey.get(key)
    if (!prev || (item.score || 0) > (prev.score || 0)) byKey.set(key, item)
  }
  return [...byKey.values()]
}

function isFoodPlace(item) {
  return item?.kind === "food"
    || item?.contentTypeId === 39
    || String(item?.category || "").includes("음식점")
}

async function fetchKakaoPlaces({ location, radius }) {
  const apiKey = (process.env.KAKAO_REST_API_KEY || process.env.KAKAO_REST_KEY || "").trim()
  if (!apiKey || !location) return []

  const pages = Array.from({ length: KAKAO_PAGE_COUNT }, (_, index) => index + 1)
  const requests = KAKAO_CATEGORIES.flatMap((category) => pages.map(async (page) => {
    const params = new URLSearchParams({
      category_group_code: category.code,
      x: String(location.lng),
      y: String(location.lat),
      radius: String(radius),
      sort: "distance",
      size: String(KAKAO_PAGE_SIZE),
      page: String(page),
    })
    const resp = await fetch(`${KAKAO_CATEGORY_URL}?${params.toString()}`, {
      headers: { Authorization: `KakaoAK ${apiKey}` },
    })
    if (!resp.ok) return []
    const data = await resp.json().catch(() => ({}))
    return (Array.isArray(data.documents) ? data.documents : [])
      .map((item) => normalizeKakaoPlace(item, category, location))
  }))

  const settled = await Promise.allSettled(requests)
  return settled.flatMap((result) => (result.status === "fulfilled" ? result.value : []))
}

async function fetchTour(endpoint, params) {
  const apiKey = (process.env.TOUR_API_KEY || "").trim()
  if (!apiKey) return []
  const query = new URLSearchParams({
    serviceKey: apiKey,
    MobileOS: "ETC",
    MobileApp: "LOCA",
    _type: "json",
    ...params,
  })
  let resp
  try {
    resp = await fetch(`${TOUR_BASE_URL}/${endpoint}?${query.toString()}`)
  } catch {
    return []
  }
  if (!resp.ok) return []
  const text = await resp.text()
  let data
  try {
    data = JSON.parse(text)
  } catch {
    return []
  }
  const resultCode = data?.response?.header?.resultCode
  if (resultCode && resultCode !== "0000") return []
  const rawItems = data?.response?.body?.items?.item || []
  return Array.isArray(rawItems) ? rawItems : [rawItems]
}

async function fetchTourPlaces({ location, radius }) {
  const pages = Array.from({ length: TOUR_PAGE_COUNT }, (_, index) => index + 1)
  const requests = TOUR_TYPES.flatMap((type) => pages.map(async (pageNo) => {
    const params = location
      ? {
        mapX: String(location.lng),
        mapY: String(location.lat),
        radius: String(radius),
        arrange: "E",
        contentTypeId: String(type.id),
        numOfRows: String(TOUR_ROWS_PER_PAGE),
        pageNo: String(pageNo),
      }
      : {
        areaCode: "1",
        arrange: "O",
        contentTypeId: String(type.id),
        numOfRows: String(TOUR_ROWS_PER_PAGE),
        pageNo: String(pageNo),
      }
    const endpoint = location ? "locationBasedList2" : "areaBasedList2"
    const rows = await fetchTour(endpoint, params)
    return rows.map((item) => normalizeTourPlace(item, type, location || SEOUL_CENTER))
  }))

  const settled = await Promise.allSettled(requests)
  return settled.flatMap((result) => (result.status === "fulfilled" ? result.value : []))
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*")

  const lat = toNumber(req.query.lat)
  const lng = toNumber(req.query.lng)
  const location = Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null
  const requestedRadius = Number(req.query.radius || DEFAULT_LOCATION_RADIUS_M)
  const radius = Math.min(Math.max(requestedRadius, MIN_LOCATION_RADIUS_M), MAX_LOCATION_RADIUS_M)
  res.setHeader("Cache-Control", location ? "no-cache, no-store" : "s-maxage=1800, stale-while-revalidate=3600")

  try {
    const [kakaoItems, tourItems] = await Promise.all([
      fetchKakaoPlaces({ location, radius }),
      fetchTourPlaces({ location, radius }),
    ])
    const items = dedupePlaces([...kakaoItems, ...tourItems])
      .filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lng))
      .filter((item) => !isFoodPlace(item))
      .sort((a, b) => (b.score || 0) - (a.score || 0))
      .slice(0, PLACE_LIMIT)

    return res.status(200).json({
      items,
      radiusKm: Math.round(radius / 1000),
      sources: {
        kakao: kakaoItems.length,
        tourapi: tourItems.length,
      },
    })
  } catch (error) {
    return res.status(502).json({ items: [], error: `${error.name}: ${error.message}` })
  }
}
