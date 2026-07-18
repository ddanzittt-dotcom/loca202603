// 내 주변 생물 — iNaturalist 관측(observation) 프록시 + GBIF 보충 (스펙 v3.3 D5 하이브리드).
// "이 동네에서 관찰된 적 있는 동식물"을 종(taxon)별로 dedup해 좌표·사진과 함께 내려준다.
// * iNat = 주력 (한글 종명 locale=ko + 사진 + 실시간성), GBIF = 보충 (iNat 제외 국내 기관 관측
//   — 국립생물자원관 등. 누적 관측이라 도심 "0" 민감성을 완화한다).
// * 서식지가 아니라 "관측 기록"이다 (누군가 그날 거기서 촬영). UI 문구도 그렇게.
// * 사진은 기여물(CC 계열) — attribution 을 함께 내려보내 표시용으로만 쓴다.
// 무료·키 불필요. isAppRequest 가드 + 엣지 캐시로 남용/쿼터 보호.

import { isAppRequest } from "./_lib/appRequest.js"
import { fetchGbifSupplement } from "./_lib/gbif.js"

const INAT_URL = "https://api.inaturalist.org/v1/observations"
const DEFAULT_RADIUS_KM = 5
const MIN_RADIUS_KM = 1
const MAX_RADIUS_KM = 15
const SPARSE_THRESHOLD = 8
const RESULT_LIMIT = 80
const PAGE_SIZE = 200          // iNat per_page (최대치)
const MAX_PAGES = 2            // 종 수가 상한 미만이고 더 있으면 최대 2페이지까지만 확장
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
// 식물이 관측을 압도하므로 동물을 전용으로 따로 확보해 목표 비율(50:50)로 섞는다.
const PLANT_TAXA = ["Plantae"]
const ANIMAL_TAXA = ALLOWED_TAXA.filter((t) => t !== "Plantae")
const ANIMAL_TARGET = 40 // RESULT_LIMIT 의 절반 — 동물에 우선 배정할 슬롯

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

// GBIF 원시 레코드(_lib/gbif.js) → iNat 정규화와 동일한 아이템 형태
function normalizeGbif(record, location) {
  const meta = TAXON_META[record.taxonGroup] || { label: "동물", emoji: "🐾" }
  return {
    id: `gbif-${record.key}`,
    type: "wildlife",
    source: "gbif",
    taxonId: record.speciesKey,
    title: record.vernacular || record.scientific, // 한글명 보강 실패 시 학명 표기
    scientific: record.scientific,
    taxonGroup: record.taxonGroup,
    category: meta.label,
    emoji: meta.emoji,
    photo: record.photoUrl,
    photoLarge: record.photoUrl,
    attribution: record.rightsHolder ? `ⓒ ${record.rightsHolder}` : "",
    photoLicense: record.photoLicense,
    place: record.datasetName || "",
    observedOn: record.observedOn,
    qualityGrade: "",
    uri: record.key ? `https://www.gbif.org/occurrence/${record.key}` : "",
    lat: record.lat,
    lng: record.lng,
    distKm: location && Number.isFinite(record.lat) && Number.isFinite(record.lng)
      ? Math.round(haversine(location.lat, location.lng, record.lat, record.lng) * 10) / 10
      : null,
  }
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
    source: "inat",
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

async function fetchObservations(location, radiusKm, page = 1, taxa = ALLOWED_TAXA) {
  const params = new URLSearchParams({
    lat: String(location.lat),
    lng: String(location.lng),
    radius: String(radiusKm),
    per_page: String(PAGE_SIZE),
    page: String(page),
    photos: "true",
    locale: "ko",
    order_by: "observed_on",
    order: "desc",
    iconic_taxa: taxa.join(","), // 새/동물/식물만 — 곤충·거미·버섯 제외 (동물/식물 분리 조회에도 사용)
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

// 정렬 규칙 — 클라이언트 src/lib/exploreCuration.js 의 wildlifeSortKey 와 동일한 2단계.
//   ① 관측 6개월(WILDLIFE_RECENT_DAYS) 이내 = 거리순(최근 그룹)  ② 그 이후/미상 = 최신순
// 이 순서로 정렬한 뒤 상위 RESULT_LIMIT 만 남겨, 근처의 최근 종이 컷에서 안 잘리게 한다.
const WILDLIFE_RECENT_DAYS = 180
function wildlifeDaysAgo(observedOn) {
  const t = Date.parse(String(observedOn || ""))
  if (Number.isNaN(t)) return null
  return Math.max(0, Math.round((Date.now() - t) / 86400000))
}
function wildlifeSortKey(item) {
  const dist = Number.isFinite(item?.distKm) ? item.distKm : 30
  const days = wildlifeDaysAgo(item?.observedOn)
  if (days != null && days <= WILDLIFE_RECENT_DAYS) return dist
  return 1e5 + (days == null ? 1e6 : days)
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

// "죽음"으로 명시된 관측 제외 — iNat "Alive or Dead" 어노테이션(속성 17)의 Dead(값 19).
// 어노테이션이 드물어(관측의 ~8%대) 명시된 것만 걸러진다(로드킬 등 미표시는 못 거름).
// 반대표로 뒤집힌(vote_score<0) 건은 실제 죽음이 아닐 수 있어 유지한다.
const ANNO_ALIVE_DEAD = 17
const ANNO_VALUE_DEAD = 19
function isDeadObservation(obs) {
  const annos = Array.isArray(obs?.annotations) ? obs.annotations : []
  return annos.some((a) =>
    a?.controlled_attribute_id === ANNO_ALIVE_DEAD
    && a?.controlled_value_id === ANNO_VALUE_DEAD
    && (a?.vote_score == null || a.vote_score >= 0),
  )
}

// 한 분류군(동물 또는 식물)을 종 dedup 해 확보 — 한산하면 반경 확장, 목표 미만이면 부족할 때만 2페이지.
async function fetchGroup(location, radiusKm, taxa, targetCount) {
  const toItems = (r) => dedupeByTaxon(r.filter((o) => !isDeadObservation(o)).map((obs) => normalize(obs, location)))
  let effRadius = radiusKm
  let raw = await fetchObservations(location, effRadius, 1, taxa)
  let items = toItems(raw)
  if (items.length < SPARSE_THRESHOLD && effRadius < MAX_RADIUS_KM) {
    effRadius = MAX_RADIUS_KM
    raw = await fetchObservations(location, effRadius, 1, taxa)
    items = toItems(raw)
  }
  for (let page = 2; page <= MAX_PAGES && items.length < targetCount && raw.length >= PAGE_SIZE * (page - 1); page += 1) {
    const more = await fetchObservations(location, effRadius, page, taxa)
    if (!more.length) break
    raw = [...raw, ...more]
    items = toItems(raw)
  }
  return items
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
    // GBIF 보충은 iNat 와 병렬로 — 누적 관측이라 처음부터 최대 반경으로 (fail-soft [])
    const gbifPromise = fetchGbifSupplement(location, MAX_RADIUS_KM).catch(() => [])

    // 동물·식물을 각각 전용으로 확보(목표 50:50) — 식물이 관측을 압도해 동물이 파묻히는 걸 막는다.
    // 동물은 목표(ANIMAL_TARGET)까지, 식물은 상한까지 채울 만큼 종을 모은다.
    const animals = await fetchGroup(location, radiusKm, ANIMAL_TAXA, ANIMAL_TARGET)
    const plants = await fetchGroup(location, radiusKm, PLANT_TAXA, RESULT_LIMIT)

    // GBIF 보충 — iNat 에 없는 종만 동물/식물 풀에 각각 합류 (종당 1건)
    const gbifRaw = await gbifPromise
    const seenSpecies = new Set([...animals, ...plants].map((item) => (item.scientific || "").toLowerCase()).filter(Boolean))
    for (const record of gbifRaw) {
      const speciesKey = (record.scientific || "").toLowerCase()
      if (!speciesKey || seenSpecies.has(speciesKey)) continue
      seenSpecies.add(speciesKey)
      const item = normalizeGbif(record, location)
      if (PLANT_TAXA.includes(item.taxonGroup)) plants.push(item)
      else if (ANIMAL_TAXA.includes(item.taxonGroup)) animals.push(item)
    }

    // 목표 50:50 — 동물 최대 ANIMAL_TARGET, 나머지를 식물로. 한쪽이 모자라면 다른 쪽으로 상한까지 채움.
    animals.sort((a, b) => wildlifeSortKey(a) - wildlifeSortKey(b))
    plants.sort((a, b) => wildlifeSortKey(a) - wildlifeSortKey(b))
    let animalsTake = Math.min(ANIMAL_TARGET, animals.length)
    let plantsTake = Math.min(RESULT_LIMIT - animalsTake, plants.length)
    if (animalsTake + plantsTake < RESULT_LIMIT) {
      // 식물이 모자라면(드묾) 동물로 상한까지 보충
      animalsTake = Math.min(animals.length, RESULT_LIMIT - plantsTake)
    }
    const merged = [...animals.slice(0, animalsTake), ...plants.slice(0, plantsTake)]
      .sort((a, b) => wildlifeSortKey(a) - wildlifeSortKey(b))
    return res.status(200).json({
      items: merged,
      sources: { animals: animals.length, plants: plants.length, shown: { animals: animalsTake, plants: plantsTake } },
    })
  } catch (error) {
    return res.status(502).json({ items: [], error: `${error.name}: ${error.message}` })
  }
}
