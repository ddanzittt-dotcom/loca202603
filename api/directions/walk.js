const TMAP_PEDESTRIAN_URL = "https://apis.openapi.sk.com/tmap/routes/pedestrian?version=1"

function parseLngLat(value) {
  const [lngRaw, latRaw] = String(value || "").split(",")
  const lng = Number(lngRaw)
  const lat = Number(latRaw)
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null
  return { lng, lat }
}

function mask(value) {
  const text = String(value || "")
  if (text.length <= 6) return "***"
  return `${text.slice(0, 4)}...${text.slice(-2)}`
}

function getTmapSummary(features) {
  const featureList = Array.isArray(features) ? features : []
  for (const feature of featureList) {
    const props = feature?.properties || {}
    const distance = Number(props.totalDistance)
    const durationSec = Number(props.totalTime)
    if (Number.isFinite(distance) && Number.isFinite(durationSec)) {
      return { distance, duration: Math.round(durationSec * 1000) }
    }
  }
  return null
}

function getTmapPath(features) {
  const featureList = Array.isArray(features) ? features : []
  const path = []
  for (const feature of featureList) {
    const geometry = feature?.geometry
    if (geometry?.type !== "LineString" || !Array.isArray(geometry.coordinates)) continue
    for (const point of geometry.coordinates) {
      if (!Array.isArray(point) || point.length < 2) continue
      const lng = Number(point[0])
      const lat = Number(point[1])
      if (Number.isFinite(lng) && Number.isFinite(lat)) {
        path.push([lng, lat])
      }
    }
  }
  return path
}

async function tryTmap({ start, goal }) {
  const tmapKeys = [
    process.env.TMAP_APP_KEY,
    process.env.TMAP_API_KEY,
    process.env.SK_OPEN_API_KEY,
  ].filter(Boolean)

  if (tmapKeys.length === 0) {
    return {
      ok: false,
      errors: [{ provider: "tmap", error: "TMAP_APP_KEY 미설정" }],
    }
  }

  const payload = {
    startX: start.lng,
    startY: start.lat,
    endX: goal.lng,
    endY: goal.lat,
    reqCoordType: "WGS84GEO",
    resCoordType: "WGS84GEO",
    searchOption: "0",
    sort: "index",
    startName: "출발지",
    endName: "도착지",
    angle: 0,
    speed: 0,
  }

  const errors = []

  for (const key of tmapKeys) {
    try {
      const response = await fetch(TMAP_PEDESTRIAN_URL, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          appKey: key,
        },
        body: JSON.stringify(payload),
      })

      const rawText = await response.text()
      let data = null
      try {
        data = rawText ? JSON.parse(rawText) : null
      } catch {
        data = null
      }

      const features = Array.isArray(data?.features) ? data.features : []
      const summary = getTmapSummary(features)
      const path = getTmapPath(features)

      if (response.ok && summary && path.length > 1) {
        return {
          ok: true,
          provider: "tmap",
          distance: summary.distance,
          duration: summary.duration,
          path,
        }
      }

      errors.push({
        provider: "tmap",
        key: mask(key),
        status: response.status,
        message: data?.error?.message || data?.message || rawText?.slice?.(0, 200) || "unknown_error",
      })
    } catch (error) {
      errors.push({
        provider: "tmap",
        key: mask(key),
        error: error?.message || "network_error",
      })
    }
  }

  return { ok: false, errors }
}

async function tryNaver({ startRaw, goalRaw }) {
  const credentialSets = [
    {
      id: process.env.NCP_CLIENT_ID,
      secret: process.env.NCP_CLIENT_SECRET,
    },
    {
      id: process.env.NAVER_CLIENT_ID,
      secret: process.env.NAVER_CLIENT_SECRET,
    },
  ].filter((c) => c.id && c.secret)

  if (credentialSets.length === 0) {
    return {
      ok: false,
      errors: [{ provider: "naver", error: "NCP_CLIENT_ID/NCP_CLIENT_SECRET 미설정" }],
    }
  }

  const endpoints = [
    `https://naveropenapi.apigw.ntruss.com/map-direction/v1/walking?start=${startRaw}&goal=${goalRaw}`,
    `https://naveropenapi.apigw.ntruss.com/map-direction-15/v1/walking?start=${startRaw}&goal=${goalRaw}`,
  ]

  const errors = []

  for (const creds of credentialSets) {
    for (const url of endpoints) {
      try {
        const response = await fetch(url, {
          headers: {
            "X-NCP-APIGW-API-KEY-ID": creds.id,
            "X-NCP-APIGW-API-KEY": creds.secret,
          },
        })

        const data = await response.json()
        const route = data?.route && typeof data.route === "object"
          ? Object.values(data.route).flatMap((value) => (Array.isArray(value) ? value : []))[0]
          : null

        if (data.code === 0 && route?.summary && Array.isArray(route.path)) {
          return {
            ok: true,
            provider: "naver",
            distance: route.summary.distance,
            duration: route.summary.duration,
            path: route.path,
          }
        }

        errors.push({
          provider: "naver",
          url: url.split("?")[0],
          credId: mask(creds.id),
          status: response.status,
          code: data?.code,
          message: data?.message || data?.error?.message || "unknown_error",
        })
      } catch (error) {
        errors.push({
          provider: "naver",
          url: url.split("?")[0],
          credId: mask(creds.id),
          error: error?.message || "network_error",
        })
      }
    }
  }

  return { ok: false, errors }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "GET")
  if (req.method === "OPTIONS") return res.status(200).end()

  const { start: startRaw, goal: goalRaw } = req.query
  if (!startRaw || !goalRaw) {
    return res.status(400).json({ error: "start, goal 파라미터 필요 (lng,lat)" })
  }

  const start = parseLngLat(startRaw)
  const goal = parseLngLat(goalRaw)
  if (!start || !goal) {
    return res.status(400).json({ error: "좌표 형식이 올바르지 않아요. (lng,lat)" })
  }

  const tmapResult = await tryTmap({ start, goal })
  if (tmapResult.ok) {
    res.setHeader("Cache-Control", "public, max-age=300")
    return res.status(200).json({
      provider: tmapResult.provider,
      distance: tmapResult.distance,
      duration: tmapResult.duration,
      path: tmapResult.path,
    })
  }

  // TMAP 장애 대비: 기존 Naver 보행 API를 백업 fallback으로 유지
  const naverResult = await tryNaver({ startRaw, goalRaw })
  if (naverResult.ok) {
    res.setHeader("Cache-Control", "public, max-age=300")
    return res.status(200).json({
      provider: naverResult.provider,
      distance: naverResult.distance,
      duration: naverResult.duration,
      path: naverResult.path,
    })
  }

  return res.status(502).json({
    error: "도보 경로를 찾을 수 없어요. TMAP_APP_KEY 설정을 먼저 확인해주세요.",
    attempts: [...(tmapResult.errors || []), ...(naverResult.errors || [])],
  })
}
