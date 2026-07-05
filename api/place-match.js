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
    let documents = []

    if (query) {
      documents = await kakaoSearch("keyword.json", {
        query,
        x: lng.toFixed(6),
        y: lat.toFixed(6),
        radius: "300",
        sort: "distance",
        size: "10",
      }, key)
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
      documents = results.flat()
    }

    const seen = new Set()
    const candidates = documents
      .map(normalizeDocument)
      .filter((item) => {
        const dedupeKey = `${item.name}|${item.lat}|${item.lng}`
        if (seen.has(dedupeKey)) return false
        seen.add(dedupeKey)
        return true
      })
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 8)

    res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400")
    res.status(200).json({ candidates })
  } catch (error) {
    console.error("place-match failed:", error?.message)
    fail(502, "kakao-error")
  }
}
