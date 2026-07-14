// 내 주변 생물 — iNaturalist 관측(observation) 프록시.
// "요즘 이 근처에서 발견된 동식물"을 종(taxon)별로 dedup해 좌표·사진과 함께 내려준다.
// * 서식지가 아니라 "관측 기록"이다 (누군가 그날 거기서 촬영). UI 문구도 그렇게.
// * 사진은 유저 기여물(CC-BY-NC) — attribution 을 함께 내려보내 표시용으로만 쓴다.
// 무료·키 불필요. isAppRequest 가드 + 엣지 캐시로 남용/쿼터 보호.

import { isAppRequest } from "./_lib/appRequest.js"

const INAT_URL = "https://api.inaturalist.org/v1/observations"
const DEFAULT_RADIUS_KM = 5
const MIN_RADIUS_KM = 1
const MAX_RADIUS_KM = 15
const SPARSE_THRESHOLD = 8
const RESULT_LIMIT = 60
const GRID_DEG = 0.01 // ~1.1km — 좌표 그리드 스냅 단위 (같은 동네 = 같은 쿼리 = 캐시 공유)

// 명시적 CC 라이선스가 있는 사진만 — CC0/CC-BY 계열 + CC-BY-NC(비상업).
// 저작권 전보류(license_code=null "all rights reserved")는 여전히 제외한다.
// * NC(비상업)는 상업 서비스에선 회색지대지만, iNat 관측 사진은 사실상 전부 CC-BY-NC라
//   NC를 버리면 사진이 거의 안 뜬다 → attribution(사진 출처)을 함께 노출하는 조건으로 허용.
//   저작권 전보류만 버리고 픽셀 스프라이트로 대체한다.
const PHOTO_LICENSE_OK = new Set(["cc0", "cc-by", "cc-by-sa", "cc-by-nd", "cc-by-nc", "cc-by-nc-sa", "cc-by-nc-nd"])
function pickLicensedPhoto(photos) {
  if (!Array.isArray(photos)) return null
  for (const p of photos) {
    if (p && PHOTO_LICENSE_OK.has(String(p.license_code || "").toLowerCase())) return p
  }
  return null
}
const snapCoord = (v) => Number((Math.round(Number(v) / GRID_DEG) * GRID_DEG).toFixed(2))

// 노출할 분류군만 — 새/동물(포유·양서·파충·어류)/식물. 곤충·거미·연체·버섯 제외.
const TAXON_META = {
  Aves: { label: "새", emoji: "🐦" },
  Plantae: { label: "식물", emoji: "🌿" },
  Mammalia: { label: "포유류", emoji: "🦔" },
  Amphibia: { label: "양서류", emoji: "🐸" },
  Reptilia: { label: "파충류", emoji: "🦎" },
  Actinopterygii: { label: "물고기", emoji: "🐟" },
}
// iNaturalist iconic_taxa 파라미터로 소스에서 필터 (곤충 등 제외)
const ALLOWED_TAXA = Object.keys(TAXON_META)

function toNumber(value) {
  const next = Number(value)
  return Number.isFinite(next) ? next : null
}

function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371
  const toRad = (deg) => (deg * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function upgradePhoto(url, size) {
  // iNat photos[].url 은 기본 square. small(240)/medium(500) 로 승격 + https 보정
  return String(url || "").replace(/square\.(jpe?g|png)/i, `${size}.$1`).replace(/^http:/, "https:")
}

function normalize(obs, location) {
  const taxon = obs.taxon || {}
  const coords = obs.geojson && Array.isArray(obs.geojson.coordinates) ? obs.geojson.coordinates : null
  const lng = coords ? toNumber(coords[0]) : toNumber(obs.longitude)
  const lat = coords ? toNumber(coords[1]) : toNumber(obs.latitude)
  const photo = pickLicensedPhoto(obs.photos) // 라이선스 허용 사진만 (없으면 스프라이트 대체)
  const meta = TAXON_META[taxon.iconic_taxon_name] || { label: "동물", emoji: "🐾" }
  return {
    id: `inat-${obs.id}`,
    type: "wildlife",
    taxonId: taxon.id || null,
    title: taxon.preferred_common_name || taxon.name || "이름 미상",
    scientific: taxon.name || "",
    taxonGroup: taxon.iconic_taxon_name || "",
    category: meta.label,
    emoji: meta.emoji,
    photo: photo ? upgradePhoto(photo.url, "small") : "",
    photoLarge: photo ? upgradePhoto(photo.url, "medium") : "",
    attribution: photo ? (photo.attribution || "") : "",
    photoLicense: photo ? (photo.license_code || "") : "",
    place: obs.place_guess || "",
    observedOn: (obs.observed_on_details && obs.observed_on_details.date) || obs.observed_on || "",
    qualityGrade: obs.quality_grade || "",
    uri: obs.uri || (obs.id ? `https://www.inaturalist.org/observations/${obs.id}` : ""),
    lat,
    lng,
    distKm: location && Number.isFinite(lat) && Number.isFinite(lng)
      ? Math.round(haversine(location.lat, location.lng, lat, lng) * 10) / 10
      : null,
  }
}

async function fetchObservations(location, radiusKm) {
  const params = new URLSearchParams({
    lat: String(location.lat),
    lng: String(location.lng),
    radius: String(radiusKm),
    per_page: "200",
    photos: "true",
    locale: "ko",
    order_by: "observed_on",
    order: "desc",
    iconic_taxa: ALLOWED_TAXA.join(","), // 새/동물/식물만 — 곤충·거미·버섯 제외
  })
  let resp
  try {
    resp = await fetch(`${INAT_URL}?${params.toString()}`, { headers: { "User-Agent": "LOCA/1.0 (loca.im)" } })
  } catch {
    return []
  }
  if (!resp.ok) return []
  const data = await resp.json().catch(() => ({}))
  return Array.isArray(data.results) ? data.results : []
}

// 종(taxon)별로 하나만 — 사진 있는 최신 관측 우선, 없으면 첫 관측
function dedupeByTaxon(items) {
  const byTaxon = new Map()
  for (const item of items) {
    if (!Number.isFinite(item.lat) || !Number.isFinite(item.lng)) continue
    if (!TAXON_META[item.taxonGroup]) continue // 허용 분류군(새/동물/식물)만
    const key = item.taxonId || item.title
    const prev = byTaxon.get(key)
    if (!prev) { byTaxon.set(key, item); continue }
    if (!prev.photo && item.photo) byTaxon.set(key, item)
  }
  return [...byTaxon.values()]
}

export default async function handler(req, res) {
  if (!isAppRequest(req)) {
    return res.status(403).json({ items: [], error: "forbidden" })
  }

  const rawLat = toNumber(req.query.lat)
  const rawLng = toNumber(req.query.lng)
  if (!Number.isFinite(rawLat) || !Number.isFinite(rawLng)) {
    return res.status(400).json({ items: [], error: "lat/lng required" })
  }
  // 그리드 스냅 — 같은 동네 유저가 같은 쿼리를 공유 (upstream 호출·엣지 캐시 절약).
  // distKm 도 스냅 중심 기준이라 셀 전체에서 응답이 동일하다.
  const lat = snapCoord(rawLat)
  const lng = snapCoord(rawLng)
  const location = { lat, lng }
  const requested = Number(req.query.radius || DEFAULT_RADIUS_KM)
  const radiusKm = Math.min(Math.max(requested, MIN_RADIUS_KM), MAX_RADIUS_KM)
  res.setHeader("Cache-Control", "s-maxage=1800, stale-while-revalidate=3600")

  try {
    let raw = await fetchObservations(location, radiusKm)
    let items = dedupeByTaxon(raw.map((obs) => normalize(obs, location)))
    // 주변이 한산하면 반경 확장
    if (items.length < SPARSE_THRESHOLD && radiusKm < MAX_RADIUS_KM) {
      raw = await fetchObservations(location, MAX_RADIUS_KM)
      items = dedupeByTaxon(raw.map((obs) => normalize(obs, location)))
    }
    items = items
      .sort((a, b) => (b.observedOn || "").localeCompare(a.observedOn || ""))
      .slice(0, RESULT_LIMIT)
    return res.status(200).json({ items, source: "inaturalist" })
  } catch (error) {
    return res.status(502).json({ items: [], error: `${error.name}: ${error.message}` })
  }
}
