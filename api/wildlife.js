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
const RESULT_LIMIT = 30

// iconic taxon → 한국어 분류군 라벨 + 이모지(사진 없을 때 폴백)
const TAXON_META = {
  Aves: { label: "새", emoji: "🐦" },
  Insecta: { label: "곤충", emoji: "🐛" },
  Plantae: { label: "식물", emoji: "🌿" },
  Mammalia: { label: "포유류", emoji: "🦔" },
  Amphibia: { label: "양서류", emoji: "🐸" },
  Reptilia: { label: "파충류", emoji: "🦎" },
  Actinopterygii: { label: "물고기", emoji: "🐟" },
  Mollusca: { label: "연체동물", emoji: "🐌" },
  Arachnida: { label: "거미", emoji: "🕷️" },
  Fungi: { label: "버섯", emoji: "🍄" },
  Animalia: { label: "동물", emoji: "🐾" },
  Chromista: { label: "기타", emoji: "🦠" },
  Protozoa: { label: "기타", emoji: "🦠" },
}

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
  const photo = obs.photos && obs.photos[0] ? obs.photos[0] : null
  const meta = TAXON_META[taxon.iconic_taxon_name] || { label: "생물", emoji: "✨" }
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
    per_page: "100",
    photos: "true",
    locale: "ko",
    order_by: "observed_on",
    order: "desc",
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

  const lat = toNumber(req.query.lat)
  const lng = toNumber(req.query.lng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return res.status(400).json({ items: [], error: "lat/lng required" })
  }
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
