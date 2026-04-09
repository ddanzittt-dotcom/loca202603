export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "GET")
  if (req.method === "OPTIONS") return res.status(200).end()

  const { start, goal } = req.query
  if (!start || !goal) {
    return res.status(400).json({ error: "start, goal 파라미터 필요 (lng,lat)" })
  }

  // 사용 가능한 인증 정보를 모두 시도
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
    return res.status(500).json({ error: "API 인증 정보가 설정되지 않았어요 (NCP_CLIENT_ID/SECRET)" })
  }

  const endpoints = [
    `https://naveropenapi.apigw.ntruss.com/map-direction/v1/walking?start=${start}&goal=${goal}`,
    `https://naveropenapi.apigw.ntruss.com/map-direction-15/v1/walking?start=${start}&goal=${goal}`,
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
          res.setHeader("Cache-Control", "public, max-age=300")
          return res.status(200).json({
            distance: route.summary.distance,
            duration: route.summary.duration,
            path: route.path,
          })
        }

        errors.push({
          url: url.split("?")[0],
          credId: creds.id.slice(0, 4) + "...",
          status: response.status,
          code: data.code,
          message: data.message || data.error?.message,
        })
      } catch (e) {
        errors.push({
          url: url.split("?")[0],
          credId: creds.id.slice(0, 4) + "...",
          error: e.message,
        })
      }
    }
  }

  return res.status(502).json({
    error: "경로를 찾을 수 없어요. NCP Directions API 구독을 확인해주세요.",
    attempts: errors,
  })
}
