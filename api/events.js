// 한국관광공사 TourAPI — 축제/행사 조회
// 환경변수: TOUR_API_KEY (data.go.kr 발급)

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=7200")

  const apiKey = process.env.TOUR_API_KEY
  if (!apiKey) {
    return res.status(200).json({ items: [], error: "API key not configured" })
  }

  const { lat, lng, radius = "20000" } = req.query

  // 오늘 날짜 (YYYYMMDD)
  const today = new Date()
  const yyyymmdd = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}`

  try {
    let items = []

    if (lat && lng) {
      // 위치 기반 축제 검색
      const url = new URL("https://apis.data.go.kr/B551011/KorService2/locationBasedList1")
      url.searchParams.set("serviceKey", apiKey)
      url.searchParams.set("numOfRows", "10")
      url.searchParams.set("pageNo", "1")
      url.searchParams.set("MobileOS", "ETC")
      url.searchParams.set("MobileApp", "LOCA")
      url.searchParams.set("_type", "json")
      url.searchParams.set("mapX", lng)
      url.searchParams.set("mapY", lat)
      url.searchParams.set("radius", radius)
      url.searchParams.set("contentTypeId", "15") // 축제/행사
      url.searchParams.set("arrange", "E") // 거리순

      const resp = await fetch(url.toString())
      const data = await resp.json()
      const rawItems = data?.response?.body?.items?.item || []
      items = Array.isArray(rawItems) ? rawItems : [rawItems]
    } else {
      // 위치 없으면 현재 진행 중인 축제 검색
      const url = new URL("https://apis.data.go.kr/B551011/KorService2/searchFestival1")
      url.searchParams.set("serviceKey", apiKey)
      url.searchParams.set("numOfRows", "10")
      url.searchParams.set("pageNo", "1")
      url.searchParams.set("MobileOS", "ETC")
      url.searchParams.set("MobileApp", "LOCA")
      url.searchParams.set("_type", "json")
      url.searchParams.set("eventStartDate", yyyymmdd)
      url.searchParams.set("arrange", "R") // 최신순

      const resp = await fetch(url.toString())
      const data = await resp.json()
      const rawItems = data?.response?.body?.items?.item || []
      items = Array.isArray(rawItems) ? rawItems : [rawItems]
    }

    // 필요한 필드만 정리
    const result = items
      .filter((item) => item.title)
      .map((item) => ({
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
    console.error("TourAPI error:", error)
    return res.status(200).json({ items: [], error: "Failed to fetch events" })
  }
}
