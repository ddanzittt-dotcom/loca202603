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

// 표지 일관성: 지도 카드는 모두 동일 축척(고정 줌), 핀들의 중심을 기준으로 렌더
const MAP_COVER_LEVEL = 14
// 장소 카드: 해당 위치가 중앙에 오는 근접 줌
const PLACE_LEVEL = 16

async function sendStaticMap(res, notFound, keyId, key, { centerLng, centerLat, level, markers }) {
  const params = new URLSearchParams({
    w: String(IMG_WIDTH),
    h: String(IMG_HEIGHT),
    scale: "2",
    center: `${centerLng.toFixed(5)},${centerLat.toFixed(5)}`,
    level: String(level),
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
}

export default async function handler(req, res) {
  const notFound = (reason) => {
    res.setHeader("x-thumb-reason", reason)
    res.status(404).end()
  }

  // Key ID는 클라이언트(index.html)에도 노출되는 공개 값 — index.html의 폴백과 동일하게 유지
  const keyId = process.env.NCP_MAPS_KEY_ID || process.env.VITE_NAVER_MAP_KEY || "x5bkbkzlrw"
  const key = process.env.NCP_MAPS_KEY
  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY

  if (!keyId || !key || !supabaseUrl || !supabaseKey) {
    // 어떤 키가 비었는지는 서버 로그로만 — 클라이언트엔 일반 사유
    console.error("map-thumb env missing:", { keyId: !!keyId, key: !!key, supabaseUrl: !!supabaseUrl, supabaseKey: !!supabaseKey })
    notFound("env")
    return
  }

  // ── 장소 모드: ?lat=&lng= — 좌표가 중앙에 오는 근접 지도 (장소 카드용) ──
  const latParam = Number(req.query.lat)
  const lngParam = Number(req.query.lng)
  if (Number.isFinite(latParam) && Number.isFinite(lngParam)) {
    // 남용 방지: 서비스 대상 범위(한국 근방) 밖 좌표는 거절
    if (latParam < 32 || latParam > 40 || lngParam < 123 || lngParam > 133) {
      notFound("out-of-range")
      return
    }
    try {
      await sendStaticMap(res, notFound, keyId, key, {
        centerLat: latParam,
        centerLng: lngParam,
        level: PLACE_LEVEL,
        markers: `size:small|color:0xFF6B35|pos:${lngParam.toFixed(5)} ${latParam.toFixed(5)}`,
      })
    } catch (error) {
      console.error("place-thumb failed:", error?.message)
      notFound("exception")
    }
    return
  }

  const mapId = req.query.id || req.query.mapId
  if (!mapId || !/^[0-9a-fA-F-]{16,64}$/u.test(mapId)) {
    notFound("bad-id")
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

    const markerPos = pins.slice(0, MAX_MARKERS)
      .map((p) => `pos:${p.lng.toFixed(6)} ${p.lat.toFixed(6)}`)
      .join("|")
    const markers = `size:small|color:0xFF6B35|${markerPos}`

    await sendStaticMap(res, notFound, keyId, key, {
      centerLat,
      centerLng,
      level: MAP_COVER_LEVEL,
      markers,
    })
  } catch (error) {
    console.error("map-thumb failed:", error?.message)
    notFound("exception")
  }
}
