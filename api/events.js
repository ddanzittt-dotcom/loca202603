// 한국관광공사 TourAPI — 축제/행사 조회 (100km 이내, 가까운 순 최�� 30개)
// 환경변수: TOUR_API_KEY (data.go.kr 발급, Encoding 키 사용)

function toYYYYMMDD(date) {
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`
}

function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371
  const toRad = (deg) => deg * Math.PI / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function normalizeItem(item) {
  return {
    id: item.contentid,
    title: item.title || "",
    addr: item.addr1 || "",
    image: item.firstimage || item.firstimage2 || "",
    lat: parseFloat(item.mapy) || null,
    lng: parseFloat(item.mapx) || null,
    startDate: item.eventstartdate || "",
    endDate: item.eventenddate || "",
    tel: item.tel || "",
    contentTypeId: 15,
  }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*")
  const hasLocation = req.query.lat && req.query.lng
  res.setHeader("Cache-Control", hasLocation ? "no-cache, no-store" : "s-maxage=3600, stale-while-revalidate=7200")

  const apiKey = (process.env.TOUR_API_KEY || "").trim()
  if (!apiKey) {
    return res.status(500).json({ items: [], error: "TOUR_API_KEY not configured" })
  }

  const { lat, lng } = req.query
  const today = new Date()
  const yyyymmdd = toYYYYMMDD(today)
  const threeMonthsAgo = new Date(today)
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3)
  const startDateStr = toYYYYMMDD(threeMonthsAgo)

  try {
    const encodedKey = encodeURIComponent(apiKey)
    const qs = `serviceKey=${encodedKey}&numOfRows=200&pageNo=1&MobileOS=ETC&MobileApp=LOCA&_type=json&eventStartDate=${startDateStr}&arrange=R`
    const url = `https://apis.data.go.kr/B551011/KorService2/searchFestival2?${qs}`

    const resp = await fetch(url)
    const text = await resp.text()

    let data
    try { data = JSON.parse(text) } catch {
      return res.status(502).json({ items: [], error: `Invalid response from TourAPI: ${text.slice(0, 200)}` })
    }

    const rawItems = data?.response?.body?.items?.item || []
    const allItems = Array.isArray(rawItems) ? rawItems : [rawItems]

    // 종료일이 오늘 이전인 행사 제외
    const active = allItems
      .filter((item) => item.title && (!item.eventenddate || item.eventenddate >= yyyymmdd))
      .map(normalizeItem)

    // 위치 기반: 100km 이내, 가까운 순 최대 30개
    if (lat && lng) {
      const userLat = parseFloat(lat)
      const userLng = parseFloat(lng)

      const nearby = active
        .filter((item) => item.lat && item.lng)
        .map((item) => ({ ...item, distKm: Math.round(haversine(userLat, userLng, item.lat, item.lng)) }))
        .filter((item) => item.distKm <= 100)
        .sort((a, b) => a.distKm - b.distKm)
        .slice(0, 30)

      return res.status(200).json({ items: nearby, radiusKm: 100 })
    }

    // 위치 없음: 최신순 30개
    return res.status(200).json({ items: active.slice(0, 30) })
  } catch (error) {
    return res.status(502).json({ items: [], error: `${error.name}: ${error.message}` })
  }
}
