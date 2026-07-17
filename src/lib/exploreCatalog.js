// 탐색탭 사전 적재 카탈로그 조회 — Supabase explore_catalog 직접 읽기 (스펙 v3.3 §3.5).
// 서버리스 프록시를 거치지 않아 dev 서버(`npm run dev`)에서도 동작하고,
// fallback 반경 확장이 쿼리 조건 변경으로 끝난다. 실패는 전부 빈 목록(fail-soft) —
// 테이블 미적용(migration 074 이전)·Supabase 미설정 환경에서도 앱이 깨지지 않는다.

import { hasSupabaseEnv, supabase } from "./supabase"
import { isMarketDayToday } from "./marketDays"
import { isApplyClosing, isApplyOpen } from "./learnFilter"

// 단계식 반경 3→10→20km (fallback 확장 = 취지의 코드화 §1, 상한 20km는 D8 기존 기준).
// bbox 쿼리는 무순서라 넓은 반경에서 limit 에 걸리면 가까운 행이 잘린다(서울 10km bbox > 800행 실측)
// — 좁게 시작해 밀집 지역은 1단계에서 정확하게, 한산한 곳은 자동 확장으로 채운다.
const RADIUS_TIERS_KM = [3, 10, 20]
const SPARSE_THRESHOLD = 12 // 이 개수 미만이면 다음 반경으로 확장
const PER_SOURCE_CAP = 40 // 한 소스(공원 등)가 목록을 독점하지 않게
const ROW_LIMIT = 800
const CACHE_PREFIX = "loca.explore.catalog4." // v4: 박물관 반경 예외 추가로 이전 캐시 무효화

// "나들이형 목적지" 소스는 시작점·시설이 도심에서 10~20km 떨어진 게 정상 — 밀집 지역에서
// 반경 티어가 좁게 멈추거나(폴백) 거리순 상위 행에 밀려(RPC p_limit) 구조적으로 안 보인다.
// 항상 최대 반경으로 별도 조회해 병합한다 (성정동 실측: 걷기길·박물관이 20km 안에서 전부 누락).
// 걷기(walk)=길, 배우기(learn)=박물관·미술관.
const FAR_SOURCES_BY_TAB = {
  walk: ["trail", "durunubi"],
  learn: ["museum"],
}
const FAR_SOURCES = new Set(Object.values(FAR_SOURCES_BY_TAB).flat())
const CACHE_TTL_MS = 30 * 60 * 1000

// 목록 조회 컬럼 — route 폴리라인(points)·detail(부가정보)은 제외
// (points 는 등록 시점, detail 은 상세 시트에서 fetchCatalogDetail 로 지연 조회)
const LIST_COLUMNS = [
  "id", "source", "tab", "title", "category", "addr", "lat", "lng", "region_text", "phone",
  "start_date", "end_date", "apply_start", "apply_end", "market_cycle", "market_days",
  "route_distance_km", "route_duration_min", "route_level",
  "summary", "image", "source_url", "source_ref",
].join(",")

const SOURCE_LABELS = {
  citypark: "공공데이터",
  market: "공공데이터",
  festival: "공공데이터",
  lifelong: "공공데이터",
  library: "공공데이터",
  farmvillage: "공공데이터",
  trail: "공공데이터",
  heritage: "국가유산청",
  durunubi: "두루누비",
}

// 카탈로그 source → 기존 탐색 공간의 kind 키 (스프라이트·채집 카테고리 매핑 재사용)
const SOURCE_KINDS = {
  citypark: "park",
  market: "market",
  durunubi: "route",
  lifelong: "lifelong",
  library: "library",
  farmvillage: "farmvillage",
  trail: "trail",
  heritage: "history", // 역사 스프라이트·culture 채집 카테고리 재사용
}

// "3.21~5.23" — 강좌 교육기간 카드 표기
function shortPeriod(startDate, endDate) {
  const fmt = (value) => {
    const text = String(value || "").slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null
    return `${Number(text.slice(5, 7))}.${Number(text.slice(8, 10))}`
  }
  const start = fmt(startDate)
  const end = fmt(endDate)
  if (start && end) return start === end ? start : `${start}~${end}`
  return start || end || ""
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371
  const toRad = (deg) => (deg * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// DB row → 탐색 아이템 (ListRow/MiniCard/CurationDetailSheet 의 "place" 계열과 호환)
export function normalizeCatalogItem(row, location) {
  const lat = Number(row.lat)
  const lng = Number(row.lng)
  const distKm = location && Number.isFinite(lat) && Number.isFinite(lng)
    ? Math.round(haversineKm(location.lat, location.lng, lat, lng) * 10) / 10
    : null
  const isRoute = row.source === "durunubi"
  return {
    id: row.id,
    catalogId: row.id,
    source: row.source,
    sourceLabel: SOURCE_LABELS[row.source] || "공공데이터",
    group: isRoute ? "route" : "place",
    kind: SOURCE_KINDS[row.source] || row.source,
    category: row.category || (isRoute ? "둘레길" : "공간"),
    title: row.title || "",
    addr: row.addr || row.region_text || "",
    lat,
    lng,
    phone: row.phone || "",
    image: row.image || "", // 농어촌마을 등 소스 제공 사진 — 없으면 카드 폴백 아이콘
    summary: row.summary || "",
    sourceUrl: row.source_url || "",
    distKm,
    // 오일장 — "오늘 장" 상태 배지 (스펙 §5)
    marketCycle: row.market_cycle || "",
    marketToday: isMarketDayToday(row.market_days),
    // ② 배우기 — 접수중 배지 + 교육기간 표기 (강좌)
    applyOpen: isApplyOpen(row.apply_start, row.apply_end),
    applyClosing: isApplyClosing(row.apply_start, row.apply_end), // 접수 종료 D-3 이내 (빨강 승격)
    applyStart: row.apply_start || "",
    applyEnd: row.apply_end || "",
    coursePeriod: row.source === "lifelong" ? shortPeriod(row.start_date, row.end_date) : "",
    // 둘레길 route 메타 — 카드 표기 + 채집 시 route 피처 생성에 사용
    routeDistanceKm: Number.isFinite(Number(row.route_distance_km)) ? Number(row.route_distance_km) : null,
    routeDurationMin: Number.isFinite(Number(row.route_duration_min)) ? Number(row.route_duration_min) : null,
    routeLevel: row.route_level || "",
  }
}

// 상세 시트용 단건 조회 — 목록에서 뺀 detail(jsonb 부가정보)까지 가져온다
export async function fetchCatalogDetail(catalogId) {
  if (!hasSupabaseEnv || !supabase || !catalogId) return null
  try {
    const { data, error } = await supabase
      .from("explore_catalog")
      .select("detail")
      .eq("id", catalogId)
      .maybeSingle()
    if (error) return null
    return data?.detail || null
  } catch {
    return null
  }
}

function cacheKey(tab, location) {
  const grid = (value) => (Math.round(Number(value) * 100) / 100).toFixed(2)
  return `${CACHE_PREFIX}${tab}.${grid(location.lat)},${grid(location.lng)}`
}

function readCache(key) {
  try {
    const raw = sessionStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || Date.now() - parsed.at > CACHE_TTL_MS) return null
    // payload = { rows, radiusKm } — 확장 반경까지 함께 저장해 재조회 없이 동일 결과 재구성
    return Array.isArray(parsed.payload?.rows) ? parsed.payload : null
  } catch {
    return null
  }
}

function writeCache(key, payload) {
  try {
    sessionStorage.setItem(key, JSON.stringify({ at: Date.now(), payload }))
  } catch { /* 시크릿 모드 등 — 무시 */ }
}

// 소스별 상한을 지키며 거리순 병합
function capPerSource(items, cap) {
  const counts = new Map()
  const result = []
  for (const item of items) {
    const count = counts.get(item.source) || 0
    if (count >= cap) continue
    counts.set(item.source, count + 1)
    result.push(item)
  }
  return result
}

async function queryBbox(tab, lat, lng, radiusKm) {
  const dLat = radiusKm / 110.574
  const dLng = radiusKm / (111.32 * Math.max(0.2, Math.cos((lat * Math.PI) / 180)))
  const { data, error } = await supabase
    .from("explore_catalog")
    .select(LIST_COLUMNS)
    .eq("tab", tab)
    .gte("lat", lat - dLat).lte("lat", lat + dLat)
    .gte("lng", lng - dLng).lte("lng", lng + dLng)
    .limit(ROW_LIMIT)
  if (error) return null // 테이블 미적용(074 이전)·RLS 문제 — 호출부에서 빈 목록 처리
  return data || []
}

function toSortedItems(rows, lat, lng, radiusKm) {
  return rows
    .map((row) => normalizeCatalogItem(row, { lat, lng }))
    .filter((item) => item.title && Number.isFinite(item.lat) && Number.isFinite(item.lng))
    // 나들이형 소스(길·박물관)는 좁은 폴백 반경에도 잘리지 않게 최대 반경 기준으로 예외
    .filter((item) => item.distKm == null || item.distKm <= radiusKm
      || (FAR_SOURCES.has(item.source) && item.distKm <= RADIUS_TIERS_KM[RADIUS_TIERS_KM.length - 1]))
    .sort((a, b) => (a.distKm ?? Infinity) - (b.distKm ?? Infinity))
}

// 나들이형 소스 전용 최대 반경 조회 — 전국 route 1,500·박물관 1,000 규모라 bbox 로도 가볍다
async function queryFarRows(tab, sources, lat, lng, radiusKm) {
  const dLat = radiusKm / 110.574
  const dLng = radiusKm / (111.32 * Math.max(0.2, Math.cos((lat * Math.PI) / 180)))
  const { data, error } = await supabase
    .from("explore_catalog")
    .select(LIST_COLUMNS)
    .eq("tab", tab)
    .in("source", sources)
    .gte("lat", lat - dLat).lte("lat", lat + dLat)
    .gte("lng", lng - dLng).lte("lng", lng + dLng)
    .limit(200)
  if (error) return []
  return data || []
}

// 1순위: 거리순 RPC(075 explore_catalog_nearby) — 밀집 지역에서도 가까운 순 보장.
// 실패(미적용 등) 시 null → bbox 단계 폴백.
async function queryNearbyRpc(tab, lat, lng) {
  const { data, error } = await supabase.rpc("explore_catalog_nearby", {
    p_tab: tab,
    p_lat: lat,
    p_lng: lng,
    p_radius_km: RADIUS_TIERS_KM[RADIUS_TIERS_KM.length - 1],
    p_limit: 300,
  })
  if (error || !Array.isArray(data)) return null
  return data
}

// 탭별 카탈로그 조회 — RPC(거리순) 우선, 폴백은 반경 단계 확장.
// 폴백은 단계 행을 "누적 병합"한다 — 넓은 단계가 limit 에 잘려도 좁은 단계에서 확보한
// 가까운 행은 잃지 않는다 (서울 10km bbox > 800행 실측 대응).
export async function fetchCatalogItems(tab, location) {
  if (!hasSupabaseEnv || !supabase) return []
  const lat = Number(location?.lat)
  const lng = Number(location?.lng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return []

  const key = cacheKey(tab, { lat, lng })
  const cached = readCache(key)
  if (cached) {
    return capPerSource(toSortedItems(cached.rows, lat, lng, cached.radiusKm), PER_SOURCE_CAP)
  }

  try {
    const maxRadius = RADIUS_TIERS_KM[RADIUS_TIERS_KM.length - 1]
    // 탭별 나들이형 소스(걷기=길, 배우기=박물관)를 항상 최대 반경으로 함께 병합 (RPC limit·폴백 티어와 무관)
    const farSources = FAR_SOURCES_BY_TAB[tab] || []
    const farRows = farSources.length ? await queryFarRows(tab, farSources, lat, lng, maxRadius) : []
    const mergeFar = (rows) => {
      if (!farRows.length) return rows
      const byId = new Map(rows.map((row) => [row.id, row]))
      for (const row of farRows) byId.set(row.id, row)
      return [...byId.values()]
    }

    const rpcRows = await queryNearbyRpc(tab, lat, lng)
    if (rpcRows) {
      const rows = mergeFar(rpcRows)
      writeCache(key, { rows, radiusKm: maxRadius })
      return capPerSource(toSortedItems(rows, lat, lng, maxRadius), PER_SOURCE_CAP)
    }

    const byId = new Map()
    let best = { rows: [], radiusKm: RADIUS_TIERS_KM[0] }
    for (const radiusKm of RADIUS_TIERS_KM) {
      const rows = await queryBbox(tab, lat, lng, radiusKm)
      if (rows == null) return [] // 테이블 미적용 등 — fail-soft
      for (const row of rows) byId.set(row.id, row)
      best = { rows: [...byId.values()], radiusKm }
      if (toSortedItems(best.rows, lat, lng, radiusKm).length >= SPARSE_THRESHOLD) break
    }
    best.rows = mergeFar(best.rows)
    writeCache(key, best)
    return capPerSource(toSortedItems(best.rows, lat, lng, best.radiusKm), PER_SOURCE_CAP)
  } catch {
    return []
  }
}

// route 폴리라인 지연 조회 — 채집(카드 등록) 시점에만 부른다.
// 반환: [[lng, lat], ...] (map_features.points / 로컬 피처와 동일한 표준형)
export async function fetchCatalogRoutePoints(catalogId) {
  if (!hasSupabaseEnv || !supabase || !catalogId) return null
  try {
    const { data, error } = await supabase
      .from("explore_catalog")
      .select("points")
      .eq("id", catalogId)
      .maybeSingle()
    if (error || !Array.isArray(data?.points)) return null
    const points = data.points
      .map((pair) => [Number(pair?.[0]), Number(pair?.[1])])
      .filter((pair) => Number.isFinite(pair[0]) && Number.isFinite(pair[1]))
    return points.length >= 2 ? points : null
  } catch {
    return null
  }
}
