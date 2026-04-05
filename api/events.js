// 한국관광공사 TourAPI — 축제/행사 조회
// 환경변수: TOUR_API_KEY (data.go.kr 발급, Encoding 키 사용)

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*")
  const hasLocation = req.query.lat && req.query.lng
  res.setHeader("Cache-Control", hasLocation ? "no-cache, no-store" : "s-maxage=3600, stale-while-revalidate=7200")

  const apiKey = (process.env.TOUR_API_KEY || "").trim()
  if (!apiKey) {
    return res.status(200).json({ items: [], error: "TOUR_API_KEY not configured" })
  }

  const { lat, lng } = req.query

  const today = new Date()
  const yyyymmdd = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}`

  try {
    const encodedKey = encodeURIComponent(apiKey)
    const monthAgo = new Date(today)
    monthAgo.setMonth(monthAgo.getMonth() - 1)
    const monthAgoStr = `${monthAgo.getFullYear()}${String(monthAgo.getMonth() + 1).padStart(2, "0")}${String(monthAgo.getDate()).padStart(2, "0")}`

    // 넉넉히 가져와서 서버 필터링
    const common = `serviceKey=${encodedKey}&numOfRows=100&pageNo=1&MobileOS=ETC&MobileApp=LOCA&_type=json`
    const qs = `${common}&eventStartDate=${monthAgoStr}&arrange=R`
    const url = `https://apis.data.go.kr/B551011/KorService2/searchFestival2?${qs}`

    const resp = await fetch(url)
    const text = await resp.text()

    let data
    try {
      data = JSON.parse(text)
    } catch {
      return res.status(200).json({ items: [], error: `Invalid response from TourAPI: ${text.slice(0, 200)}` })
    }

    const rawItems = data?.response?.body?.items?.item || []
    const allItems = Array.isArray(rawItems) ? rawItems : [rawItems]

    // 종료일이 오늘 이전인 행사 제외
    const filtered = allItems.filter((item) => {
      if (!item.title) return false
      const endDate = item.eventenddate || ""
      if (!endDate || endDate < yyyymmdd) return false
      return true
    })

    // 위치 기반: 30km → 50km → 100km 단계 확장
    if (lat && lng) {
      const userLat = parseFloat(lat)
      const userLng = parseFloat(lng)
      const toRad = (deg) => deg * Math.PI / 180
      const haversine = (lat1, lng1, lat2, lng2) => {
        const R = 6371
        const dLat = toRad(lat2 - lat1)
        const dLng = toRad(lng2 - lng1)
        const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
      }

      const withDist = filtered
        .map((item) => ({
          ...item,
          _distKm: haversine(userLat, userLng, parseFloat(item.mapy) || 0, parseFloat(item.mapx) || 0),
        }))
        .sort((a, b) => a._distKm - b._distKm)

      // 단계별 반경 확장
      let usedRadius = 30
      let nearby = withDist.filter((item) => item._distKm <= 30)
      if (nearby.length === 0) {
        usedRadius = 50
        nearby = withDist.filter((item) => item._distKm <= 50)
      }
      if (nearby.length === 0) {
        usedRadius = 100
        nearby = withDist.filter((item) => item._distKm <= 100)
      }

      const result = nearby.slice(0, 30).map((item) => ({
        id: item.contentid,
        title: item.title,
        addr: item.addr1 || "",
        image: item.firstimage || item.firstimage2 || "",
        lat: parseFloat(item.mapy) || null,
        lng: parseFloat(item.mapx) || null,
        startDate: item.eventstartdate || "",
        endDate: item.eventenddate || "",
        tel: item.tel || "",
        distKm: Math.round(item._distKm),
      }))

      return res.status(200).json({ items: result, radiusKm: usedRadius })
    }

    // 위치 없음: 전국 최신순 30개
    const result = filtered.slice(0, 30).map((item) => ({
      id: item.contentid,
      title: item.title,
      addr: item.addr1 || "",
      image: item.firstimage || item.firstimage2 || "",
      lat: parseFloat(item.mapy) || null,
      lng: parseFloat(item.mapx) || null,
      startDate: item.eventstartdate || "",
      endDate: item.eventenddate || "",
      tel: item.tel || "",
    }))

    return res.status(200).json({ items: result })
  } catch (error) {
    return res.status(200).json({ items: [], error: `${error.name}: ${error.message}` })
  }
}
