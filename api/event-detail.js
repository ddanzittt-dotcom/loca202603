// 한국관광공사 TourAPI — 행사/체험/관광지 상세 조회
// detailCommon2 (기본정보) + detailIntro2 (소개정보) 병합
// contentTypeId를 동적으로 받아 축제(15)/체험(28)/관광지(12) 각각 올바르게 조회

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=7200")

  const apiKey = (process.env.TOUR_API_KEY || "").trim()
  if (!apiKey) {
    return res.status(500).json({ detail: null, error: "TOUR_API_KEY not configured" })
  }

  const { contentId, contentTypeId: rawTypeId } = req.query
  if (!contentId) {
    return res.status(400).json({ detail: null, error: "contentId is required" })
  }

  const contentTypeId = parseInt(rawTypeId, 10) || 15

  try {
    const encodedKey = encodeURIComponent(apiKey)
    const base = `serviceKey=${encodedKey}&MobileOS=ETC&MobileApp=LOCA&_type=json&contentId=${contentId}`

    // 기본정보 + 소개정보 병렬 조회
    const [commonResp, introResp] = await Promise.all([
      fetch(`https://apis.data.go.kr/B551011/KorService2/detailCommon2?${base}&numOfRows=1&pageNo=1`),
      fetch(`https://apis.data.go.kr/B551011/KorService2/detailIntro2?${base}&contentTypeId=${contentTypeId}`),
    ])

    const [commonText, introText] = await Promise.all([commonResp.text(), introResp.text()])

    let commonData, introData
    try { commonData = JSON.parse(commonText) } catch { commonData = null }
    try { introData = JSON.parse(introText) } catch { introData = null }

    const common = commonData?.response?.body?.items?.item?.[0] || commonData?.response?.body?.items?.item || {}
    const intro = introData?.response?.body?.items?.item?.[0] || introData?.response?.body?.items?.item || {}

    // 공통 필드
    const detail = {
      id: common.contentid || contentId,
      contentTypeId,
      title: common.title || "",
      overview: (common.overview || "").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]*>/g, "").trim(),
      homepage: (common.homepage || "").replace(/<[^>]*>/g, ""),
      addr: common.addr1 || "",
      addrDetail: common.addr2 || "",
      tel: common.tel || "",
      image: common.firstimage || common.firstimage2 || "",
      lat: parseFloat(common.mapy) || null,
      lng: parseFloat(common.mapx) || null,
    }

    // 축제/행사 (contentTypeId=15) 전용 필드
    if (contentTypeId === 15) {
      detail.sponsor = intro.sponsor1 || ""
      detail.sponsorTel = intro.sponsor1tel || ""
      detail.eventPlace = intro.eventplace || ""
      detail.playTime = intro.playtime || ""
      detail.useTimeFestival = intro.usetimefestival || ""
      detail.ageLimit = intro.agelimit || ""
      detail.eventStartDate = intro.eventstartdate || ""
      detail.eventEndDate = intro.eventenddate || ""
      detail.program = (intro.program || "").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]*>/g, "")
    }

    // 체험/레포츠 (contentTypeId=28) 전용 필드
    if (contentTypeId === 28) {
      detail.openPeriod = intro.openperiod || ""
      detail.useTime = intro.usetimeleports || ""
      detail.useFee = intro.usefeeleports || ""
      detail.parking = intro.parkingleports || ""
      detail.reservation = intro.reservation || ""
      detail.infoCenterLeports = intro.infocenterleports || ""
      detail.expAgeRange = intro.expagerangeleports || ""
      detail.scale = intro.scaleleports || ""
    }

    // 관광지 (contentTypeId=12) 전용 필드
    if (contentTypeId === 12) {
      detail.useTime = intro.usetime || ""
      detail.restDate = intro.restdate || ""
      detail.parking = intro.parking || ""
      detail.infoCenterCulture = intro.infocenter || ""
      detail.heritage = intro.heritage1 ? "Y" : ""
    }

    return res.status(200).json({ detail })
  } catch (error) {
    return res.status(502).json({ detail: null, error: error.message || "Failed to fetch detail" })
  }
}
