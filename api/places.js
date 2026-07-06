// 탐색 "기록할만한 공간" 큐레이션 — KTO TourAPI 중심.
// 자연풍경 / 역사 명소 / 전시·문화 / 공원·휴양 4분류를 관광공사 카테고리 코드로 정밀 조회.
// 공식 사진(firstimage) 우선 가점, 사진 없는 곳만 카카오 이미지 검색으로 보강.
// 2026-07 탐색 큐레이션 개편 — isAppRequest 가드 (오픈 프록시 차단)

import { isAppRequest } from "./_lib/appRequest.js"

const TOUR_BASE_URL = "https://apis.data.go.kr/B551011/KorService2"
const KAKAO_IMAGE_URL = "https://dapi.kakao.com/v2/search/image"
const IMAGE_ENRICH_LIMIT = 36 // 사진 없는 장소에 카카오 이미지 검색 보강 상한 (쿼터 보호)

// 관광공사 분류코드 — cat1=A01 자연 / cat2=A0201 역사관광지 / A0202 휴양(공원·수목원·휴양림) / A0206 문화시설(박물관·미술관·전시관)
const TOUR_QUERIES = [
  { kind: "nature", label: "자연", contentTypeId: 12, cat1: "A01" },
  { kind: "history", label: "역사", contentTypeId: 12, cat2: "A0201" },
  { kind: "park", label: "공원", contentTypeId: 12, cat2: "A0202" },
  { kind: "exhibit", label: "전시", contentTypeId: 14, cat2: "A0206" },
]

const PLACE_LIMIT = 60
const KIND_CAP = 15 // 종류별 상한 — 한 종류가 목록을 독점하지 않게 (내부 다양성용, UI 칩 없음)
const TOUR_ROWS_PER_PAGE = 60
const TOUR_PAGE_COUNT = 2
const DEFAULT_LOCATION_RADIUS_M = 10000 // 10km 안 가볼만한 곳
const MIN_LOCATION_RADIUS_M = 1000
const MAX_LOCATION_RADIUS_M = 20000
const SPARSE_THRESHOLD = 10 // 10km 결과가 이보다 적으면 20km로 자동 확장

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

function scoreItem(item) {
  // 추천순 — 거리는 부차적(반경 안이면 어디든 가볼만함), 사진·정보 충실도가 우선
  const distanceScore = Number.isFinite(item.distKm) ? Math.max(0, 10 - item.distKm) : 4
  const imageScore = item.image ? 40 : 0
  const infoScore = (item.addr ? 4 : 0) + (item.phone ? 3 : 0)
  return Math.round(30 + distanceScore + imageScore + infoScore)
}

function normalizeTourPlace(raw, query, location) {
  const lat = toNumber(raw.mapy)
  const lng = toNumber(raw.mapx)
  const tourDistKm = raw.dist ? Math.round((Number(raw.dist) / 1000) * 10) / 10 : null
  const item = {
    id: `tour-${raw.contentid}`,
    source: "tourapi",
    sourceLabel: "TourAPI",
    providerId: raw.contentid || "",
    contentTypeId: Number(raw.contenttypeid || query.contentTypeId),
    kind: query.kind,
    group: "place",
    category: query.label,
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

function kakaoRestKey() {
  return (process.env.KAKAO_REST_API_KEY || process.env.KAKAO_REST_KEY || "").trim()
}

// 주소에서 동네 단어(구/군 단위) 추출 — 이미지 검색 정확도용
function districtWord(addr) {
  const parts = String(addr || "").split(" ").filter(Boolean)
  return parts[1] || parts[0] || ""
}

// 사진 없는 장소를 카카오 이미지 검색("이름 + 동네")으로 보강.
// 같은 KAKAO_REST_KEY 사용 — 실패해도 조용히 넘어가고 카드에는 폴백 아이콘이 뜬다.
async function enrichImages(items) {
  const apiKey = kakaoRestKey()
  if (!apiKey) return items

  const targets = items.filter((item) => !item.image).slice(0, IMAGE_ENRICH_LIMIT)
  await Promise.allSettled(targets.map(async (item) => {
    const query = `${item.title} ${districtWord(item.addr)}`.trim()
    const params = new URLSearchParams({ query, size: "3", sort: "accuracy" })
    const resp = await fetch(`${KAKAO_IMAGE_URL}?${params.toString()}`, {
      headers: { Authorization: `KakaoAK ${apiKey}` },
    })
    if (!resp.ok) return
    const data = await resp.json().catch(() => ({}))
    const doc = (Array.isArray(data.documents) ? data.documents : []).find((d) => d.thumbnail_url)
    if (doc) {
      // http 썸네일은 https로 승격 (혼합 콘텐츠 차단 회피)
      item.image = String(doc.thumbnail_url).replace(/^http:/, "https:")
      item.imageSource = "kakao-image"
    }
  }))
  return items
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
  const requests = TOUR_QUERIES.flatMap((query) => pages.map(async (pageNo) => {
    const catParams = {}
    if (query.cat1) catParams.cat1 = query.cat1
    if (query.cat2) {
      catParams.cat1 = query.cat2.slice(0, 3)
      catParams.cat2 = query.cat2
    }
    const params = location
      ? {
        mapX: String(location.lng),
        mapY: String(location.lat),
        radius: String(radius),
        arrange: "E",
        contentTypeId: String(query.contentTypeId),
        numOfRows: String(TOUR_ROWS_PER_PAGE),
        pageNo: String(pageNo),
        ...catParams,
      }
      : {
        areaCode: "1",
        arrange: "O",
        contentTypeId: String(query.contentTypeId),
        numOfRows: String(TOUR_ROWS_PER_PAGE),
        pageNo: String(pageNo),
        ...catParams,
      }
    const endpoint = location ? "locationBasedList2" : "areaBasedList2"
    const rows = await fetchTour(endpoint, params)
    return rows.map((item) => normalizeTourPlace(item, query, location || SEOUL_CENTER))
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
    let tourItems = await fetchTourPlaces({ location, radius })
    // 주변이 한산하면(10km 결과 부족) 20km로 자동 확장 — "아예 없음"을 피한다
    if (location && tourItems.length < SPARSE_THRESHOLD && radius < MAX_LOCATION_RADIUS_M) {
      tourItems = await fetchTourPlaces({ location, radius: MAX_LOCATION_RADIUS_M })
    }
    const ranked = dedupePlaces(tourItems)
      .filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lng))
      .sort((a, b) => (b.score || 0) - (a.score || 0))
    const items = await enrichImages(capPerKind(ranked, KIND_CAP).slice(0, PLACE_LIMIT))

    return res.status(200).json({
      items,
      radiusKm: Math.round(radius / 1000),
      sources: { tourapi: tourItems.length },
    })
  } catch (error) {
    return res.status(502).json({ items: [], error: `${error.name}: ${error.message}` })
  }
}
