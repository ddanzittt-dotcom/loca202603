import { createClient } from "@supabase/supabase-js"

// 지도 카드 표지용 실제 지도 썸네일 프록시 (Naver Static Map API)
// - NCP 키를 서버에만 두고, 결과 이미지는 엣지 캐시로 오래 캐싱해 호출량을 줄인다
// - 공개(public)·링크(unlisted) 지도만 렌더 (anon RLS 기준). 실패 시 404 → 클라이언트는 SVG 폴백
//
// 필요한 Vercel 환경변수:
//   NCP_MAPS_KEY_ID (없으면 VITE_NAVER_MAP_KEY 사용) — NCP Maps API Key ID
//   NCP_MAPS_KEY — NCP Maps API Key (secret)

const STATIC_MAP_ENDPOINT = process.env.NCP_MAPS_STATIC_ENDPOINT
  || "https://maps.apigw.ntruss.com/map-static/v2/raster"

const IMG_WIDTH = 400
const IMG_HEIGHT = 276
const MAX_MARKERS = 20

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

// 웹 메르카토르 기준 bounds가 들어가는 줌 레벨 계산
function computeZoom(minLat, maxLat, minLng, maxLng, width, height) {
  const latFraction = (lat) => {
    const sin = Math.sin((lat * Math.PI) / 180)
    return Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)
  }
  const latFrac = Math.abs(latFraction(maxLat) - latFraction(minLat))
  const lngFrac = Math.abs(maxLng - minLng) / 360
  const zoomW = Math.log2(width / 256 / Math.max(lngFrac, 1e-9))
  const zoomH = Math.log2(height / 256 / Math.max(latFrac, 1e-9))
  return clamp(Math.floor(Math.min(zoomW, zoomH)) - 1, 6, 16)
}

export default async function handler(req, res) {
  const notFound = (reason) => {
    res.setHeader("x-thumb-reason", reason)
    res.status(404).end()
  }

  const mapId = req.query.id || req.query.mapId
  if (!mapId || !/^[0-9a-fA-F-]{16,64}$/u.test(mapId)) {
    notFound("bad-id")
    return
  }

  // Key ID는 클라이언트(index.html)에도 노출되는 공개 값 — index.html의 폴백과 동일하게 유지
  const keyId = process.env.NCP_MAPS_KEY_ID || process.env.VITE_NAVER_MAP_KEY || "x5bkbkzlrw"
  const key = process.env.NCP_MAPS_KEY
  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY

  if (!keyId || !key || !supabaseUrl || !supabaseKey) {
    notFound(`env:${keyId ? "" : "keyId "}${key ? "" : "key "}${supabaseUrl ? "" : "sburl "}${supabaseKey ? "" : "sbkey"}`.trim())
    return
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseKey)

    const { data: mapRow } = await supabase
      .from("maps")
      .select("id, visibility")
      .eq("id", mapId)
      .maybeSingle()

    if (!mapRow || !["public", "unlisted"].includes(mapRow.visibility)) {
      notFound(mapRow ? "not-public" : "no-map")
      return
    }

    const { data: featureRows } = await supabase
      .from("map_features")
      .select("type, lat, lng")
      .eq("map_id", mapId)
      .limit(80)

    const pins = (featureRows || []).filter((row) => (
      row.type === "pin"
      && Number.isFinite(Number(row.lat))
      && Number.isFinite(Number(row.lng))
    )).map((row) => ({ lat: Number(row.lat), lng: Number(row.lng) }))

    if (!pins.length) {
      notFound("no-pins")
      return
    }

    const minLat = Math.min(...pins.map((p) => p.lat))
    const maxLat = Math.max(...pins.map((p) => p.lat))
    const minLng = Math.min(...pins.map((p) => p.lng))
    const maxLng = Math.max(...pins.map((p) => p.lng))
    const centerLat = (minLat + maxLat) / 2
    const centerLng = (minLng + maxLng) / 2

    const zoom = pins.length === 1
      ? 15
      : computeZoom(minLat, maxLat, minLng, maxLng, IMG_WIDTH, IMG_HEIGHT)

    const markerPos = pins.slice(0, MAX_MARKERS)
      .map((p) => `pos:${p.lng.toFixed(6)} ${p.lat.toFixed(6)}`)
      .join("|")
    const markers = `size:small|color:0xFF6B35|${markerPos}`

    const params = new URLSearchParams({
      w: String(IMG_WIDTH),
      h: String(IMG_HEIGHT),
      scale: "2",
      center: `${centerLng.toFixed(6)},${centerLat.toFixed(6)}`,
      level: String(zoom),
      format: "png",
      markers,
    })

    const upstream = await fetch(`${STATIC_MAP_ENDPOINT}?${params.toString()}`, {
      headers: {
        "x-ncp-apigw-api-key-id": keyId,
        "x-ncp-apigw-api-key": key,
      },
    })

    if (!upstream.ok) {
      console.error("Static map upstream failed:", upstream.status, await upstream.text().catch(() => ""))
      notFound(`upstream-${upstream.status}`)
      return
    }

    const buffer = Buffer.from(await upstream.arrayBuffer())
    res.setHeader("Content-Type", upstream.headers.get("content-type") || "image/png")
    res.setHeader("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=604800")
    res.status(200).send(buffer)
  } catch (error) {
    console.error("map-thumb failed:", error?.message)
    notFound("exception")
  }
}
