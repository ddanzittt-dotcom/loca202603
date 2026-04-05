// 한국관광공사 TourAPI — 행사 상세 조회
// detailCommon2 (기본정보) + detailIntro2 (소개정보) 병합

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=7200")

  const apiKey = (process.env.TOUR_API_KEY || "").trim()
  if (!apiKey) {
    return res.status(200).json({ detail: null, error: "TOUR_API_KEY not configured" })
  }

  const { contentId } = req.query
  if (!contentId) {
    return res.status(200).json({ detail: null, error: "contentId is required" })
  }

  try {
    const encodedKey = encodeURIComponent(apiKey)
    const base = `serviceKey=${encodedKey}&MobileOS=ETC&MobileApp=LOCA&_type=json&contentId=${contentId}`

    // 기본정보 + 소개정보 병렬 조회
    const [commonResp, introResp] = await Promise.all([
      fetch(`https://apis.data.go.kr/B551011/KorService2/detailCommon2?${base}&numOfRows=1&pageNo=1`),
      fetch(`https://apis.data.go.kr/B551011/KorService2/detailIntro2?${base}&contentTypeId=15`),
    ])

    const [commonText, introText] = await Promise.all([commonResp.text(), introResp.text()])

    let commonData, introData
    try { commonData = JSON.parse(commonText) } catch { commonData = null }
    try { introData = JSON.parse(introText) } catch { introData = null }

    const common = commonData?.response?.body?.items?.item?.[0] || commonData?.response?.body?.items?.item || {}
    const intro = introData?.response?.body?.items?.item?.[0] || introData?.response?.body?.items?.item || {}

    const detail = {
      id: common.contentid || contentId,
      title: common.title || "",
      overview: (common.overview || "").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]*>/g, "").trim(),
      homepage: (common.homepage || "").replace(/<[^>]*>/g, ""),
      addr: common.addr1 || "",
      addrDetail: common.addr2 || "",
      tel: common.tel || "",
      image: common.firstimage || common.firstimage2 || "",
      // 행사 소개정보 (contentTypeId=15)
      sponsor: intro.sponsor1 || "",
      sponsorTel: intro.sponsor1tel || "",
      eventPlace: intro.eventplace || "",
      playTime: intro.playtime || "",
      useTimeFestival: intro.usetimefestival || "",
      ageLimit: intro.agelimit || "",
      eventStartDate: intro.eventstartdate || "",
      eventEndDate: intro.eventenddate || "",
      program: (intro.program || "").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]*>/g, ""),
    }

    return res.status(200).json({ detail })
  } catch (error) {
    return res.status(200).json({ detail: null, error: error.message || "Failed to fetch detail" })
  }
}
