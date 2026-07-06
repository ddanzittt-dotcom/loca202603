// 탐색 큐레이션 — 내 위치 주변 행사/축제 조회 + 날짜 헬퍼.
// 서버(api/events.js, TourAPI 프록시)를 좌표 격자(소수 2자리 ≈ 1km) 단위로 호출해
// 엣지 캐시를 공유하고, 클라이언트 sessionStorage 캐시(30분)로 재방문 요청을 줄인다.

const EVENTS_CACHE_PREFIX = "loca.explore.events."
const PLACES_CACHE_PREFIX = "loca.explore.places2." // v2: TourAPI 추천순 단일 리스트 (이전 캐시 무효화)
const WILDLIFE_CACHE_PREFIX = "loca.explore.wildlife."
const EVENTS_CACHE_TTL_MS = 30 * 60 * 1000

export const EXPLORE_LOCATION_KEY = "loca.explore.location"
export const DEFAULT_EXPLORE_LOCATION = { lat: 37.5665, lng: 126.978, label: "서울 시청 기준" }

// 좌표 격자 반올림 — 같은 동네 사용자끼리 캐시 키를 공유한다
function gridCoord(value) {
  return (Math.round(Number(value) * 100) / 100).toFixed(2)
}

function readCache(key) {
  try {
    const raw = sessionStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || Date.now() - parsed.at > EVENTS_CACHE_TTL_MS) return null
    return Array.isArray(parsed.items) ? parsed.items : null
  } catch {
    return null
  }
}

function writeCache(key, items) {
  try {
    sessionStorage.setItem(key, JSON.stringify({ at: Date.now(), items }))
  } catch {
    // 저장 실패는 무시 (시크릿 모드 등)
  }
}

async function fetchCurationItems(endpoint, cachePrefix, location) {
  const lat = gridCoord(location?.lat ?? DEFAULT_EXPLORE_LOCATION.lat)
  const lng = gridCoord(location?.lng ?? DEFAULT_EXPLORE_LOCATION.lng)
  const cacheKey = `${cachePrefix}${lat},${lng}`

  const cached = readCache(cacheKey)
  if (cached) return cached

  const response = await fetch(`/api/${endpoint}?lat=${lat}&lng=${lng}`)
  if (!response.ok) throw new Error(`${endpoint} ${response.status}`)
  const data = await response.json()
  if (data?.error) throw new Error(data.error)
  const items = Array.isArray(data.items) ? data.items : []
  writeCache(cacheKey, items)
  return items
}

export function fetchNearbyEvents(location) {
  return fetchCurationItems("events", EVENTS_CACHE_PREFIX, location)
}

export function fetchNearbyPlaces(location) {
  return fetchCurationItems("places", PLACES_CACHE_PREFIX, location)
}

export function fetchNearbyWildlife(location) {
  return fetchCurationItems("wildlife", WILDLIFE_CACHE_PREFIX, location)
}

// TourAPI 상세 (행사 + tour 소스 공간) — contentId 단위 sessionStorage 캐시
const DETAIL_CACHE_PREFIX = "loca.explore.detail."

export async function fetchCurationDetail({ contentId, contentTypeId }) {
  if (!contentId) return null
  const cacheKey = `${DETAIL_CACHE_PREFIX}${contentId}`
  try {
    const raw = sessionStorage.getItem(cacheKey)
    if (raw) return JSON.parse(raw)
  } catch { /* 무시 */ }

  const params = new URLSearchParams({ contentId: String(contentId) })
  if (contentTypeId) params.set("contentTypeId", String(contentTypeId))
  const response = await fetch(`/api/event-detail?${params.toString()}`)
  if (!response.ok) throw new Error(`detail ${response.status}`)
  const data = await response.json()
  const detail = data?.detail || null
  if (detail) {
    try { sessionStorage.setItem(cacheKey, JSON.stringify(detail)) } catch { /* 무시 */ }
  }
  return detail
}

// 큐레이션 아이템에서 TourAPI contentId 추출 (행사=원본 id, 공간=`tour-<id>`)
export function curationContentRef(item) {
  if (!item) return null
  if (item.source === "kakao") return null
  const providerId = item.providerId || (String(item.id || "").startsWith("tour-") ? String(item.id).slice(5) : item.id)
  if (!providerId) return null
  return { contentId: providerId, contentTypeId: item.contentTypeId || 15 }
}

// ── 날짜 헬퍼 (TourAPI YYYYMMDD 문자열) ──

function parseYYYYMMDD(value) {
  const str = String(value || "")
  if (!/^\d{8}$/.test(str)) return null
  const date = new Date(Number(str.slice(0, 4)), Number(str.slice(4, 6)) - 1, Number(str.slice(6, 8)))
  return Number.isNaN(date.getTime()) ? null : date
}

function startOfToday() {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

// 행사 상태 배지: 진행중 / D-N(시작 전) / null(판정 불가)
export function eventDdayBadge(event) {
  const today = startOfToday()
  const start = parseYYYYMMDD(event?.startDate)
  const end = parseYYYYMMDD(event?.endDate)

  if (start && start > today) {
    const days = Math.round((start - today) / 86400000)
    return { kind: "upcoming", label: days === 0 ? "오늘 시작" : `D-${days}` }
  }
  if ((!end && start) || (end && end >= today)) {
    return { kind: "ongoing", label: "진행중" }
  }
  return null
}

export function formatEventPeriod(event) {
  const format = (value) => {
    const date = parseYYYYMMDD(value)
    return date ? `${date.getMonth() + 1}.${date.getDate()}` : null
  }
  const start = format(event?.startDate)
  const end = format(event?.endDate)
  if (start && end) return start === end ? start : `${start} ~ ${end}`
  return start || end || ""
}

export function formatDistanceKm(distKm) {
  const value = Number(distKm)
  if (!Number.isFinite(value)) return null
  if (value < 1) return `${Math.round(value * 1000)}m`
  return `${value < 10 ? value.toFixed(1) : Math.round(value)}km`
}

// 행사 → CollectSheet 프리필 (SPOT 후보 형태)
export function eventToPrefill(event) {
  return {
    name: event.title,
    category: "culture",
    categoryName: "행사·축제",
    tagLabel: "행사",
    address: event.addr || "",
    lat: event.lat,
    lng: event.lng,
  }
}

// 공간 kind(api/places.js TOUR_QUERIES) → 도감 카테고리 id (placeCategories.js)
const PLACE_KIND_TO_CATEGORY = {
  nature: "nature",
  history: "culture",
  park: "nature",
  exhibit: "culture",
}

export function placeToPrefill(place) {
  return {
    name: place.title,
    category: PLACE_KIND_TO_CATEGORY[place.kind] || "etc",
    categoryName: place.category || "",
    tagLabel: null,
    address: place.addr || "",
    lat: place.lat,
    lng: place.lng,
  }
}

// 생물 관측 → 바인더 "새발견" 카드 프리필 (사진은 복사하지 않음 — 저작권/사용자 촬영 유도)
export function wildlifeToPrefill(item) {
  return {
    name: item.title,
    category: "nature",
    tagLabel: item.category || "생물",
    address: item.place || "",
    lat: item.lat,
    lng: item.lng,
    asNewFind: true,
  }
}
