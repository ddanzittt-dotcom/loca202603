// 좌표 → 동네 이름(법정동) 역지오코딩 프록시.
// 브라우저에서 nominatim 을 직접 호출하면 CORS + 429(요청 과다)로 막히므로,
// 서버(Vercel Function)에서 카카오 REST coord2regioncode 로 대신 조회한다.
// 응답: { regionName: "서울특별시 성동구 성수동", regionCode: "1120010500" } | { regionName: null }
//
// 필요한 Vercel 환경변수: KAKAO_REST_API_KEY (또는 KAKAO_REST_KEY)

import { isAppRequest } from "./_lib/appRequest.js"

const KAKAO_COORD2REGION = "https://dapi.kakao.com/v2/local/geo/coord2regioncode.json"

function kakaoKey() {
  return (process.env.KAKAO_REST_API_KEY || process.env.KAKAO_REST_KEY || "").trim()
}

export default async function handler(req, res) {
  const empty = (status, reason) => {
    if (reason) res.setHeader("x-rg-reason", reason)
    res.status(status).json({ regionName: null })
  }

  // 남용 방지: 우리 앱(loca.im/프리뷰/로컬)에서 온 요청만 허용
  if (!isAppRequest(req)) {
    empty(403, "forbidden")
    return
  }

  const key = kakaoKey()
  if (!key) {
    empty(503, "no-key")
    return
  }

  const lat = Number(req.query.lat)
  const lng = Number(req.query.lng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    empty(400, "bad-coords")
    return
  }
  // 한국 범위 밖은 카카오가 어차피 빈 결과 — 불필요한 호출 차단
  if (lat < 32 || lat > 40 || lng < 123 || lng > 133) {
    empty(200, "out-of-range")
    return
  }

  try {
    const url = `${KAKAO_COORD2REGION}?x=${lng.toFixed(6)}&y=${lat.toFixed(6)}`
    const response = await fetch(url, { headers: { Authorization: `KakaoAK ${key}` } })
    if (!response.ok) {
      empty(502, `kakao-${response.status}`)
      return
    }
    const data = await response.json()
    const docs = Array.isArray(data.documents) ? data.documents : []
    // region_type 'B' = 법정동(우선), 없으면 첫 결과
    const item = docs.find((d) => d.region_type === "B") || docs[0]
    if (!item) {
      empty(200, "no-region")
      return
    }
    const regionName = [item.region_1depth_name, item.region_2depth_name, item.region_3depth_name]
      .filter(Boolean)
      .join(" ")
    // 동일 좌표 반복 조회는 엣지 캐시로 흡수 (하루 캐시 + SWR)
    res.setHeader("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=604800")
    res.status(200).json({ regionName: regionName || null, regionCode: item.code || null })
  } catch (error) {
    console.error("reverse-geocode failed:", error?.message)
    empty(502, "fetch-error")
  }
}
