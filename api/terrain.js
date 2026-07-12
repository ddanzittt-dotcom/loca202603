// 내 동네 지형 — OpenStreetMap Overpass 프록시 (산책 모드 게임 + 탐색 레이더 공용).
// 실제 도로/하천/수면/공원 좌표를 받아 오버월드 지도로 그린다.
//
// 비용/부하 설계:
// * 좌표를 ~1.1km 그리드로 스냅 → 같은 동네 유저 전원이 같은 쿼리를 공유 (Overpass 원본 호출 격감).
// * 엣지 캐시(Cache-Control s-maxage) → 스냅된 URL 단위로 CDN 이 응답 재사용.
// * isAppRequest 가드 → 익명 스크립트의 공용 Overpass 남용/우리 도메인 사칭 차단.
// * 다중 엔드포인트 + 엔드포인트별 타임아웃 → 공용 서버 혼잡(504) 시 폴백.
//
// 클라이언트도 같은 그리드로 스냅해 호출해야 엣지 캐시가 실제로 적중한다 (src/lib/realTerrain.js).

import { isAppRequest } from "./_lib/appRequest.js"

const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
]
const GRID_DEG = 0.01 // ~1.1km — 그리드 스냅 단위 (realTerrain.js 캐시 키와 동일)
const RADIUS_M = 2500
const ENDPOINT_TIMEOUT_MS = 12000
const MAJOR_HIGHWAY = /^(motorway|trunk|primary|secondary)$/

function snap(v) {
  return Math.round(Number(v) / GRID_DEG) * GRID_DEG
}

// 좌표 배열 데시메이션 — 렌더/전송 부담 축소 (긴 도로도 ~40점이면 충분)
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
  roads.sort((a, b) => Number(b.major) - Number(a.major))
  return {
    roads: roads.slice(0, 260),
    streams: streams.slice(0, 40),
    waters: waters.slice(0, 40),
    parks: parks.slice(0, 60),
  }
}

function buildQuery(lat, lng) {
  const around = `(around:${RADIUS_M},${lat},${lng})`
  return `[out:json][timeout:20];
way["highway"~"^(motorway|trunk|primary|secondary|tertiary)$"]${around};out geom 160;
way["highway"~"^(residential|unclassified|pedestrian)$"]${around};out geom 130;
way["waterway"~"^(river|stream|canal)$"]${around};out geom 40;
(way["natural"="water"]${around};relation["natural"="water"]${around};);out geom 40;
way["leisure"~"^(park|garden)$"]${around};out geom 60;`
}

async function fetchOverpass(query) {
  for (const endpoint of ENDPOINTS) {
    let controller
    let timer
    try {
      controller = new AbortController()
      timer = setTimeout(() => controller.abort(), ENDPOINT_TIMEOUT_MS)
      const res = await fetch(endpoint, {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "LOCA/1.0 (loca.im)" },
        body: `data=${encodeURIComponent(query)}`,
      })
      clearTimeout(timer)
      if (!res.ok) continue
      const json = await res.json()
      // Overpass 는 타임아웃 시에도 200 + 부분 결과 + remark 를 준다 — 부분 응답은 버리고 다음 엔드포인트
      if (json.remark) continue
      return json
    } catch {
      if (timer) clearTimeout(timer)
      // 다음 엔드포인트 시도
    }
  }
  return null
}

export default async function handler(req, res) {
  if (!isAppRequest(req)) {
    return res.status(403).json({ error: "forbidden" })
  }

  const rawLat = Number(req.query.lat)
  const rawLng = Number(req.query.lng)
  if (!Number.isFinite(rawLat) || !Number.isFinite(rawLng)) {
    return res.status(400).json({ error: "lat/lng required" })
  }
  // 그리드 스냅 — 같은 동네 = 같은 쿼리 = 캐시 공유
  const lat = Number(snap(rawLat).toFixed(2))
  const lng = Number(snap(rawLng).toFixed(2))

  try {
    const json = await fetchOverpass(buildQuery(lat, lng))
    if (!json) {
      // 프록시 전체 실패 — 클라이언트는 절차 생성 폴백. 짧게만 캐시.
      res.setHeader("Cache-Control", "s-maxage=60")
      return res.status(502).json({ error: "overpass unavailable", roads: [], streams: [], waters: [], parks: [] })
    }
    const data = parseElements(json.elements)
    if (data.roads.length + data.waters.length + data.parks.length === 0) {
      res.setHeader("Cache-Control", "s-maxage=86400")
      return res.status(200).json({ empty: true, grid: { lat, lng }, ...data })
    }
    // 지형은 안정적 → 길게 캐시 (7일) + stale-while-revalidate
    res.setHeader("Cache-Control", "s-maxage=604800, stale-while-revalidate=86400")
    return res.status(200).json({ grid: { lat, lng }, source: "overpass", ...data })
  } catch (error) {
    return res.status(502).json({ error: `${error.name}: ${error.message}`, roads: [], streams: [], waters: [], parks: [] })
  }
}
