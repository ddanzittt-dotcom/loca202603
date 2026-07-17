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
// TourAPI 외 소스(카카오/문화포털 등)는 TourAPI 상세가 없으므로 조회하지 않고
// sourceUrl 링크로 폴백한다.
export function curationContentRef(item) {
  if (!item) return null
  if (item.source && item.source !== "tourapi") return null
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

// 상태 배지 임계값 — 종료 7일 안이면 "마감 임박", 관측 30일 안이면 "최근 관측" (스펙 v3.3 §5)
const CLOSING_SOON_DAYS = 7
const RECENT_OBSERVATION_DAYS = 30

// 행사 상태 배지: 마감 임박(종료 임박) / 진행중 / D-N(시작 전) / null(판정 불가)
export function eventDdayBadge(event) {
  const today = startOfToday()
  const start = parseYYYYMMDD(event?.startDate)
  const end = parseYYYYMMDD(event?.endDate)

  if (start && start > today) {
    const days = Math.round((start - today) / 86400000)
    return { kind: "upcoming", label: days === 0 ? "오늘 시작" : `D-${days}` }
  }
  if (end && end >= today) {
    const remain = Math.round((end - today) / 86400000)
    if (remain <= CLOSING_SOON_DAYS) return { kind: "closing", label: "마감 임박" }
    return { kind: "ongoing", label: "진행중" }
  }
  if (!end && start) {
    return { kind: "ongoing", label: "진행중" }
  }
  return null
}

// ① 즐기기 시간순 정렬 키 — "다음 관련 날짜까지 남은 일수".
// 진행중이면 종료일(마감 임박 먼저), 시작 전이면 시작일(곧 시작 먼저), 날짜 미상은 맨 뒤.
export function eventTimeKey(event) {
  const today = startOfToday()
  const start = parseYYYYMMDD(event?.startDate)
  const end = parseYYYYMMDD(event?.endDate)
  if (start && start > today) return Math.round((start - today) / 86400000)
  if (end && end >= today) return Math.round((end - today) / 86400000)
  if (start) return 365 // 진행중인데 종료일 미상 — 상시 행사 취급
  return Infinity
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

// ④ 관측 경과일 — observedOn("YYYY-MM-DD") 기준. 파싱 불가면 null.
function observedDaysAgo(item) {
  const raw = String(item?.observedOn || "")
  if (!raw) return null
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) return null
  return Math.max(0, Math.round((startOfToday() - date) / 86400000))
}

// ④ 관측 시점 라벨 — 30일 이내면 최근 관측 강조(recent), 오래됐으면 날짜로.
export function formatObservedAgo(item) {
  const days = observedDaysAgo(item)
  if (days == null) return null
  if (days === 0) return { recent: true, label: "오늘 관측" }
  if (days <= RECENT_OBSERVATION_DAYS) return { recent: true, label: `${days}일 전 관측` }
  const date = new Date(item.observedOn)
  if (days > 365) return { recent: false, label: `${date.getFullYear()}년 관측` }
  return { recent: false, label: `${date.getMonth() + 1}.${date.getDate()} 관측` }
}

// ④ 정렬 키 — 거리 우선 + 최근 관측 가중 (60일당 +1km, 최대 +6km 상당 페널티)
export function wildlifeSortKey(item) {
  const dist = Number.isFinite(item?.distKm) ? item.distKm : 30
  const days = observedDaysAgo(item)
  const agePenalty = days == null ? 6 : Math.min(days, 365) / 60
  return dist + agePenalty
}

// 카드 소스 배지 라벨 — 카드에는 출처+상태 배지만 단다 (스펙 v3.3 §5)
const EVENT_SOURCE_LABELS = { tourapi: "관광공사", culture: "문화포털", kopis: "KOPIS", festival: "공공데이터" }

export function curationSourceLabel(type, item) {
  if (type === "wildlife") return item?.source === "gbif" ? "GBIF" : "iNaturalist"
  return EVENT_SOURCE_LABELS[item?.source] || item?.sourceLabel || ""
}

// TourAPI overview(긴 소개 문단) → 한줄 설명 후보로 압축.
// 첫 문장(마침표/물음표/느낌표/줄바꿈 기준) 우선, 없으면 통짜 텍스트를 60자로 자른다.
// CollectSheet 의 한줄 설명 칸(maxLength 60)에 그대로 넣을 수 있게 60자 이내로 보장.
export function summarizeOverview(text) {
  const clean = String(text || "").replace(/\s+/g, " ").trim()
  if (!clean) return ""
  const breakAt = clean.search(/[.!?。\n]/)
  let first = breakAt > -1 ? clean.slice(0, breakAt + 1).trim() : clean
  if (first.length > 60) first = `${first.slice(0, 59).trim()}…`
  return first
}

// 행사 → CollectSheet 프리필 (SPOT 후보 형태)
// contentRef: TourAPI 상세(설명)를 CollectSheet 가 조회해 "설명 붙여넣기" 버튼을 띄우는 데 쓴다.
export function eventToPrefill(event) {
  return {
    name: event.title,
    category: "culture",
    categoryName: "행사·축제",
    tagLabel: "행사",
    address: event.addr || "",
    lat: event.lat,
    lng: event.lng,
    contentRef: curationContentRef(event),
  }
}

// 공간 kind(api/places.js TOUR_QUERIES + 카탈로그 소스) → 도감 카테고리 id (placeCategories.js)
const PLACE_KIND_TO_CATEGORY = {
  nature: "nature",
  history: "culture",
  park: "nature",
  exhibit: "culture",
  market: "shop",
  route: "route",
  lifelong: "culture",
  library: "culture",
  farmvillage: "nature",
  trail: "route",
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
    contentRef: curationContentRef(place),
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

// 둘레길 코스 → route 피처 프리필 (스펙 v3.3 V4 — 채집하면 길 전체가 카드로).
// 폴리라인은 목록에 싣지 않고 routeCatalogId 로 등록 시점에 지연 조회한다.
export function routeToPrefill(item) {
  return {
    name: item.title,
    category: "route",
    categoryName: item.category || "둘레길",
    tagLabel: "둘레길",
    address: item.addr || "",
    lat: item.lat, // 시작점 — 위치 표시·region 태깅 기준
    lng: item.lng,
    routeCatalogId: item.catalogId || item.id,
    routeMeta: formatRouteMeta(item),
  }
}

// 둘레길 카드 메타 문구 — "16km · 5시간 30분 · 보통"
export function formatRouteMeta(item) {
  const parts = []
  if (Number.isFinite(item?.routeDistanceKm)) parts.push(`${item.routeDistanceKm}km`)
  if (Number.isFinite(item?.routeDurationMin) && item.routeDurationMin > 0) {
    const hours = Math.floor(item.routeDurationMin / 60)
    const minutes = item.routeDurationMin % 60
    parts.push([hours ? `${hours}시간` : "", minutes ? `${minutes}분` : ""].filter(Boolean).join(" "))
  }
  if (item?.routeLevel) parts.push(item.routeLevel)
  return parts.join(" · ")
}

// ③ 걷기·머물기 병합 중복 제거 — TourAPI 공간과 카탈로그(공원 등)가 같은 장소를 들고 올 때
// 제목(공백 제거·소문자) 일치 + 근접(500m)이면 하나로 본다. 이미지가 있는 쪽(주로 TourAPI)을 남긴다.
export function dedupeWalkItems(items) {
  const normalize = (title) => String(title || "").replace(/\s+/g, "").toLowerCase()
  const byTitle = new Map()
  const result = []
  for (const item of items) {
    const key = normalize(item.title)
    if (!key) continue
    const candidates = byTitle.get(key) || []
    const nearDup = candidates.find((prev) => {
      const dLat = Math.abs(Number(prev.lat) - Number(item.lat)) * 110.574
      const dLng = Math.abs(Number(prev.lng) - Number(item.lng)) * 88 // 한국 위도권 근사
      return Math.hypot(dLat, dLng) < 0.5
    })
    if (nearDup) {
      // 이미지 있는 쪽을 대표로 (표준데이터엔 이미지가 없어 보통 TourAPI 가 남는다)
      if (!nearDup.image && item.image) {
        result[result.indexOf(nearDup)] = item
        candidates[candidates.indexOf(nearDup)] = item
      }
      continue
    }
    candidates.push(item)
    byTitle.set(key, candidates)
    result.push(item)
  }
  return result
}
