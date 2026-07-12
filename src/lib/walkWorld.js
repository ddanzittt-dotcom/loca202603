// 산책 모드 데이터 계층 — 지형/생물을 서버리스 프록시 경유로만 받는다.
// 브라우저가 Overpass/iNaturalist 를 직접 호출하지 않는다(비용/남용/프라이버시 방어).
// 클라이언트도 서버와 같은 0.01°(~1.1km) 그리드로 스냅해 호출해야 엣지 캐시가 적중한다.
//
// dev(vanilla vite)에는 /api 서버리스가 없어 SPA fallback HTML 이 온다 → content-type 확인 후 폴백.
// 프록시 실패/폴백이면 지형은 절차 생성, 생물은 빈 배열(호출측이 데모 시드로 대체).

const GRID_DEG = 0.01
export const snapCoord = (v) => Number((Math.round(Number(v) / GRID_DEG) * GRID_DEG).toFixed(2))

async function fetchJson(url) {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const ct = res.headers.get("content-type") || ""
    if (!ct.includes("application/json")) return null // dev: SPA fallback HTML
    return await res.json()
  } catch {
    return null
  }
}

/**
 * 내 위치 그리드의 실제 지형 (프록시). 실패면 null → 호출측이 절차 생성으로 대체.
 * @returns {{ roads, streams, waters, parks } | null}
 */
export async function fetchWalkTerrain(lat, lng) {
  const d = await fetchJson(`/api/terrain?lat=${snapCoord(lat)}&lng=${snapCoord(lng)}`)
  if (!d) return null
  const total = (d.roads?.length || 0) + (d.waters?.length || 0) + (d.parks?.length || 0)
  if (!total) return null
  return { roads: d.roads || [], streams: d.streams || [], waters: d.waters || [], parks: d.parks || [] }
}

/**
 * 내 위치 그리드의 생물 관측 (프록시). 실패면 빈 배열.
 * @returns {Array} normalize 된 관측 items (api/wildlife.js 형태)
 */
export async function fetchWalkWildlife(lat, lng, radiusKm = 2) {
  const d = await fetchJson(`/api/wildlife?lat=${snapCoord(lat)}&lng=${snapCoord(lng)}&radius=${radiusKm}`)
  return d && Array.isArray(d.items) ? d.items : []
}

// 절차 생성 동네 — 프록시 실패/오프라인 폴백. 중심(lat,lng) 기준 격자 흙길 + 연못 + 공원.
// 반환 형태는 프록시와 동일: roads/streams/waters/parks 각 [lat,lng] 배열.
export function proceduralTerrain(lat, lng, worldR = 2200) {
  const mPerLat = 110540
  const mPerLng = 111320 * Math.cos((lat * Math.PI) / 180)
  const mToLatLng = (pt) => [lat + pt[1] / mPerLat, lng + pt[0] / mPerLng]
  let s = 7
  const rand = () => { s = (s * 16807 + 11) % 2147483647; return s / 2147483647 }
  const roads = []
  for (let i = -2; i <= 2; i += 1) {
    const off = i * (620 + rand() * 240)
    roads.push({ c: [[-worldR, off], [worldR, off]].map(mToLatLng), major: i === 0 })
    roads.push({ c: [[off, -worldR], [off, worldR]].map(mToLatLng), major: false })
  }
  const pond = []
  for (let a = 0; a < Math.PI * 2; a += 0.5) pond.push([620 + Math.cos(a) * (150 + rand() * 40), -540 + Math.sin(a) * (110 + rand() * 30)])
  const park = []
  for (let a = 0; a < Math.PI * 2; a += 0.6) park.push([-700 + Math.cos(a) * (220 + rand() * 60), 480 + Math.sin(a) * (180 + rand() * 50)])
  return { roads, streams: [], waters: [pond.map(mToLatLng)], parks: [park.map(mToLatLng)] }
}

// 프록시 생물이 비었을 때 데모 시드 (dev/오프라인). 좌표는 호출측에서 중심 기준 배치.
const SEED_SPECIES = [
  ["물총새", "Alcedo atthis", "Aves"], ["왜가리", "Ardea cinerea", "Aves"], ["청설모", "Sciurus vulgaris", "Mammalia"],
  ["참개구리", "Pelophylax nigromaculatus", "Amphibia"], ["은행나무", "Ginkgo biloba", "Plantae"], ["맥문동", "Liriope muscari", "Plantae"],
  ["누룩뱀", "Elaphe dione", "Reptilia"], ["잉어", "Cyprinus carpio", "Actinopterygii"], ["직박구리", "Hypsipetes amaurotis", "Aves"], ["민들레", "Taraxacum", "Plantae"],
]
const TAXON_LABEL = { Aves: "새", Plantae: "식물", Mammalia: "포유류", Amphibia: "양서류", Reptilia: "파충류", Actinopterygii: "물고기" }

export function seedWildlife() {
  return SEED_SPECIES.map(([title, scientific, group], i) => ({
    id: `seed-${i}`,
    type: "wildlife",
    taxonId: null,
    title,
    scientific,
    taxonGroup: group,
    category: TAXON_LABEL[group],
    photo: "",
    photoLarge: "",
    attribution: "",
    photoLicense: "",
    place: "데모 동네",
    observedOn: "",
    demo: true,
    _seedIndex: i,
  }))
}
