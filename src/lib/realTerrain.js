// 실제 지형 데이터 — OpenStreetMap Overpass API (무료, 키 불필요)
// 내 위치 반경의 실제 도로/하천/수면/공원 좌표를 받아 탐색 오버월드 지도에 그린다.
// 실패/오프라인이면 null → 레이더는 절차 생성 필드로 폴백.

const CACHE_PREFIX = "loca.terrain."
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000 // 7일
const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
]
const MAJOR_HIGHWAY = /^(motorway|trunk|primary|secondary)$/

// 좌표 배열 데시메이션 — localStorage/렌더 부담 축소 (긴 도로도 ~40점이면 충분)
function decimate(coords, maxPoints = 40) {
  if (!Array.isArray(coords) || coords.length <= maxPoints) return coords
  const step = (coords.length - 1) / (maxPoints - 1)
  const out = []
  for (let i = 0; i < maxPoints; i += 1) out.push(coords[Math.round(i * step)])
  return out
}

function geomToPairs(geometry) {
  return (geometry || []).map((g) => [Number(g.lat.toFixed(5)), Number(g.lon.toFixed(5))])
}

function parseElements(elements) {
  const roads = []
  const streams = []
  const waters = []
  const parks = []
  for (const el of elements || []) {
    if (el.type === "way" && el.geometry) {
      const pts = decimate(geomToPairs(el.geometry))
      if (pts.length < 2) continue
      const tags = el.tags || {}
      if (tags.highway) roads.push({ c: pts, major: MAJOR_HIGHWAY.test(tags.highway) })
      else if (tags.waterway) streams.push(pts)
      else if (tags.natural === "water") waters.push(pts)
      else if (tags.leisure) parks.push(pts)
    } else if (el.type === "relation" && Array.isArray(el.members)) {
      // 멀티폴리곤 수면(큰 강·호수) — outer 링만
      for (const m of el.members) {
        if (m.role === "outer" && m.geometry) {
          const pts = decimate(geomToPairs(m.geometry), 60)
          if (pts.length >= 3) waters.push(pts)
        }
      }
    }
  }
  // 도로는 주요 도로 우선으로 상한 (렌더 부담)
  roads.sort((a, b) => Number(b.major) - Number(a.major))
  return { roads: roads.slice(0, 260), streams: streams.slice(0, 40), waters: waters.slice(0, 40), parks: parks.slice(0, 60) }
}

/**
 * 내 위치 주변 실제 지형 fetch (+ 위치 그리드 캐시).
 * @returns {{ roads, streams, waters, parks, key } | null}
 */
export async function fetchRealTerrain(lat, lng, radiusM = 2500) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  const key = `${lat.toFixed(2)},${lng.toFixed(2)}` // ~1.1km 그리드 — 같은 동네 재사용
  try {
    const raw = window.localStorage?.getItem(CACHE_PREFIX + key)
    if (raw) {
      const cached = JSON.parse(raw)
      if (Date.now() - cached.t < CACHE_TTL && cached.d) return { ...cached.d, key }
    }
  } catch { /* 캐시 실패는 무시 */ }

  // 타입별로 out 상한을 분리 — 도로가 상한을 독식해 물·공원이 잘리는 것 방지
  const around = `(around:${radiusM},${lat},${lng})`
  const query = `[out:json][timeout:12];
way["highway"~"^(motorway|trunk|primary|secondary|tertiary)$"]${around};out geom 160;
way["highway"~"^(residential|unclassified|pedestrian)$"]${around};out geom 130;
way["waterway"~"^(river|stream|canal)$"]${around};out geom 40;
(way["natural"="water"]${around};relation["natural"="water"]${around};);out geom 40;
way["leisure"~"^(park|garden)$"]${around};out geom 60;`

  for (const endpoint of ENDPOINTS) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `data=${encodeURIComponent(query)}`,
      })
      if (!res.ok) continue
      const json = await res.json()
      // Overpass 는 타임아웃 시에도 200 + 부분 결과 + remark 를 준다 — 부분 응답은 캐시하지 않고 다음 엔드포인트
      if (json.remark) continue
      const data = parseElements(json.elements)
      if (data.roads.length + data.waters.length + data.parks.length === 0) return null
      try {
        window.localStorage?.setItem(CACHE_PREFIX + key, JSON.stringify({ t: Date.now(), d: data }))
      } catch { /* 저장 공간 부족 시 캐시 생략 */ }
      return { ...data, key }
    } catch {
      // 다음 엔드포인트 시도
    }
  }
  return null
}
