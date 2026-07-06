// Record-worthy place recommendations for Explore.
// Sources: Kakao Local (optional) + KTO TourAPI.
// 2026-07 탐색 큐레이션 개편으로 복원 — isAppRequest 가드 추가 (오픈 프록시 차단)

import { isAppRequest } from "./_lib/appRequest.js"

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

const PLACE_LIMIT = 72
const KIND_CAP = 18 // 종류별 상한 — 한 종류(예: 카페)가 목록을 독점하지 않게
const KAKAO_PAGE_SIZE = 15
const KAKAO_PAGE_COUNT = 3
const TOUR_ROWS_PER_PAGE = 80
const TOUR_PAGE_COUNT = 3
const DEFAULT_LOCATION_RADIUS_M = 20000
const MIN_LOCATION_RADIUS_M = 1000
const MAX_LOCATION_RADIUS_M = 20000

const SEOUL_CENTER = { lat: 37.5665, lng: 126.9780 }

// "기록할만한 공간" 큐레이션에서 제외할 대형 프랜차이즈 — 어디에나 있는 곳은 추천 가치가 낮다
const FRANCHISE_PATTERN = /(스타벅스|투썸|이디야|메가\s?(MGC)?\s?커피|컴포즈\s?커피|빽다방|할리스|커피빈|파스쿠찌|엔제리너스|폴바셋|공차|배스킨라빈스|던킨|크리스피크림|파리바게뜨|뚜레쥬르|성심당\s?DX|CGV|롯데시네마|메가박스|다이소|올리브영|스타필드|이마트|홈플러스|롯데마트)/i

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
  // 카카오 정확도(인기) 순위 보너스 — 상위 결과일수록 "기록할만한" 곳
  const rankScore = Number.isFinite(item.accuracyRank) ? Math.max(0, 24 - item.accuracyRank * 1.5) : 0
  return Math.round(30 + distanceScore + imageScore + sourceScore + rankScore)
}

function normalizeKakaoPlace(raw, category, location, accuracyRank = null) {
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
    accuracyRank,
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

function isFranchisePlace(item) {
  return FRANCHISE_PATTERN.test(String(item?.title || ""))
}

// 점수순을 유지하면서 종류(kind)별 개수를 상한으로 잘라 균형을 맞춘다
function capPerKind(items, cap) {
  const counts = new Map()
  const result = []
  for (const item of items) {
    const count = counts.get(item.kind) || 0
    if (count >= cap) continue
    counts.set(item.kind, count + 1)
    result.push(item)
  }
  return result
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
      sort: "accuracy", // 카카오 정확도(인기/품질) 랭킹 — 거리순보다 "기록할만한" 곳이 위로
      size: String(KAKAO_PAGE_SIZE),
      page: String(page),
    })
    const resp = await fetch(`${KAKAO_CATEGORY_URL}?${params.toString()}`, {
      headers: { Authorization: `KakaoAK ${apiKey}` },
    })
    if (!resp.ok) return []
    const data = await resp.json().catch(() => ({}))
    return (Array.isArray(data.documents) ? data.documents : [])
      .map((item, index) => normalizeKakaoPlace(item, category, location, (page - 1) * KAKAO_PAGE_SIZE + index))
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
  // 남용 방지: 우리 앱(loca.im/프리뷰/로컬)에서 온 요청만 허용 (place-match.js와 동일 패턴)
  if (!isAppRequest(req)) {
    return res.status(403).json({ items: [], error: "forbidden" })
  }

  const lat = toNumber(req.query.lat)
  const lng = toNumber(req.query.lng)
  const location = Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null
  const requestedRadius = Number(req.query.radius || DEFAULT_LOCATION_RADIUS_M)
  const radius = Math.min(Math.max(requestedRadius, MIN_LOCATION_RADIUS_M), MAX_LOCATION_RADIUS_M)
  // 클라이언트가 좌표를 격자(소수 2자리 ≈ 1km)로 반올림해 보내므로 엣지 캐시 공유 가능
  res.setHeader("Cache-Control", "s-maxage=1800, stale-while-revalidate=3600")

  try {
    const [kakaoItems, tourItems] = await Promise.all([
      fetchKakaoPlaces({ location, radius }),
      fetchTourPlaces({ location, radius }),
    ])
    const ranked = dedupePlaces([...kakaoItems, ...tourItems])
      .filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lng))
      .filter((item) => !isFoodPlace(item))
      .filter((item) => !isFranchisePlace(item))
      .sort((a, b) => (b.score || 0) - (a.score || 0))
    const items = capPerKind(ranked, KIND_CAP).slice(0, PLACE_LIMIT)

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
