// 발견 판정용 카카오 로컬 API 프록시
// - ?lat&lng          → 좌표 주변 등록 상호 후보 (카테고리 병렬 조회, 반경 60m)
// - ?lat&lng&q=검색어 → 키워드 장소 검색 (반경 300m, 거리순)
// 응답: { candidates: [{ name, category, categoryName, address, lat, lng, distance, kakaoUrl }] }
// 후보가 비어 있으면 = 등록된 곳 없음 → "새로 발견(NEW FIND)"
//
// 필요한 Vercel 환경변수: KAKAO_REST_KEY (카카오 developers REST API 키)

import { isAppRequest } from "./_lib/appRequest.js"

const KAKAO_LOCAL_BASE = "https://dapi.kakao.com/v2/local/search"

// 카테고리 그룹 코드 → 우리 도감 카테고리
const CATEGORY_GROUPS = [
  { code: "FD6", id: "food", label: "음식" },
  { code: "CE7", id: "cafe", label: "카페" },
  { code: "AT4", id: "nature", label: "명소" },
  { code: "CT1", id: "culture", label: "문화" },
]

function mapCategory(code) {
  const matched = CATEGORY_GROUPS.find((group) => group.code === code)
  if (matched) return { id: matched.id, label: matched.label }
  return { id: "etc", label: "그 외" }
}

function normalizeDocument(doc) {
  return {
    name: doc.place_name,
    category: mapCategory(doc.category_group_code).id,
    categoryName: doc.category_name?.split(">").pop()?.trim() || mapCategory(doc.category_group_code).label,
    address: doc.road_address_name || doc.address_name || "",
    lat: Number(doc.y),
    lng: Number(doc.x),
    distance: Number(doc.distance) || 0,
    kakaoUrl: doc.place_url || null,
  }
}

// 주소 검색(address.json) 결과 정규화 — 상호가 아니라 도로명/지번 주소를 카드로.
function normalizeAddressDocument(doc, bias) {
  const road = doc.road_address
  const addressName = road?.address_name || doc.address_name || ""
  const name = road?.building_name?.trim() || addressName
  const lat = Number(doc.y)
  const lng = Number(doc.x)
  return {
    name,
    category: "etc",
    categoryName: "주소",
    address: addressName,
    lat,
    lng,
    distance: bias ? haversineMeters(bias.lat, bias.lng, lat, lng) : 0,
    kakaoUrl: null,
  }
}

function haversineMeters(lat1, lng1, lat2, lng2) {
  if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) return 0
  const toRad = (deg) => (deg * Math.PI) / 180
  const R = 6371000
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return Math.round(2 * R * Math.asin(Math.sqrt(a)))
}

async function kakaoSearch(path, params, key) {
  const search = new URLSearchParams(params)
  const response = await fetch(`${KAKAO_LOCAL_BASE}/${path}?${search.toString()}`, {
    headers: { Authorization: `KakaoAK ${key}` },
  })
  if (!response.ok) {
    const body = await response.text().catch(() => "")
    throw new Error(`kakao ${path} ${response.status}: ${body.slice(0, 200)}`)
  }
  const data = await response.json()
  return Array.isArray(data.documents) ? data.documents : []
}

export default async function handler(req, res) {
  const fail = (status, reason) => {
    res.setHeader("x-match-reason", reason)
    res.status(status).json({ candidates: [], error: reason })
  }

  // 남용 방지: 우리 앱(loca.im/프리뷰/로컬)에서 온 요청만 허용 (익명 스크립트 차단)
  if (!isAppRequest(req)) {
    fail(403, "forbidden")
    return
  }

  const key = process.env.KAKAO_REST_KEY
  if (!key) {
    fail(503, "no-key")
    return
  }

  const lat = Number(req.query.lat)
  const lng = Number(req.query.lng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    fail(400, "bad-coords")
    return
  }
  if (lat < 32 || lat > 40 || lng < 123 || lng > 133) {
    fail(400, "out-of-range")
    return
  }

  const query = (req.query.q || "").toString().trim().slice(0, 60)

  try {
    let matched = []

    if (query) {
      // 검색은 상호(keyword)와 주소(address)를 병행한다 — 사용자가 "성수 카페" 든 "성정로 75" 든 다 잡히게.
      // 반경(radius)은 걸지 않는다 — x/y 는 거리 정렬 기준으로만 쓰고 전국에서 찾는다.
      //   (반경을 20km 로 걸면 서울 기준점에서 천안 '쌍용역'·'왕천파닭' 같은 상호가 잘려 검색이 안 됨)
      const [keywordDocs, addressDocs] = await Promise.all([
        kakaoSearch("keyword.json", {
          query,
          x: lng.toFixed(6),
          y: lat.toFixed(6),
          sort: "distance",
          size: "15",
        }, key).catch(() => []),
        kakaoSearch("address.json", { query, size: "5" }, key).catch(() => []),
      ])
      const bias = { lat, lng }
      const keywordCandidates = keywordDocs
        .map(normalizeDocument)
        .sort((a, b) => a.distance - b.distance)
      const addressCandidates = addressDocs
        .map((doc) => normalizeAddressDocument(doc, bias))
        .filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lng))
      // 상호 결과를 먼저(더 구체적), 주소 결과를 뒤에 붙인다.
      matched = [...keywordCandidates, ...addressCandidates]
    } else {
      const results = await Promise.all(CATEGORY_GROUPS.map((group) =>
        kakaoSearch("category.json", {
          category_group_code: group.code,
          x: lng.toFixed(6),
          y: lat.toFixed(6),
          radius: "60",
          sort: "distance",
          size: "5",
        }, key).catch(() => []),
      ))
      matched = results
        .flat()
        .map(normalizeDocument)
        .sort((a, b) => a.distance - b.distance)
    }

    const seen = new Set()
    const candidates = matched
      .filter((item) => {
        const dedupeKey = `${item.name}|${item.lat}|${item.lng}`
        if (seen.has(dedupeKey)) return false
        seen.add(dedupeKey)
        return true
      })
      .slice(0, 8)

    res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400")
    res.status(200).json({ candidates })
  } catch (error) {
    console.error("place-match failed:", error?.message)
    fail(502, "kakao-error")
  }
}
