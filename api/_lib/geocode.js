// 서버리스 공용 — 카카오 로컬 기반 지오코딩 헬퍼.
// reverse-geocode.js / place-match.js 와 같은 KAKAO_REST_KEY 를 재사용한다.
// 좌표 없는 소스(KOPIS 등)에 좌표를 붙이거나, 좌표→시도(행정구역)를 얻을 때 사용.
// 전부 fail-soft(실패 시 null) — 호출 소스가 죽어도 앱은 유지.

const KAKAO_COORD2REGION = "https://dapi.kakao.com/v2/local/geo/coord2regioncode.json"
const KAKAO_KEYWORD = "https://dapi.kakao.com/v2/local/search/keyword.json"

function kakaoKey() {
  return (process.env.KAKAO_REST_API_KEY || process.env.KAKAO_REST_KEY || "").trim()
}

// 좌표 → { sido, gugun } (예: "서울특별시", "종로구"). 실패 시 null.
export async function resolveRegion(location) {
  const key = kakaoKey()
  if (!key || !location) return null
  try {
    const url = `${KAKAO_COORD2REGION}?x=${Number(location.lng).toFixed(6)}&y=${Number(location.lat).toFixed(6)}`
    const resp = await fetch(url, { headers: { Authorization: `KakaoAK ${key}` } })
    if (!resp.ok) return null
    const data = await resp.json()
    const docs = Array.isArray(data.documents) ? data.documents : []
    const item = docs.find((d) => d.region_type === "B") || docs[0]
    if (!item) return null
    return { sido: item.region_1depth_name || "", gugun: item.region_2depth_name || "" }
  } catch {
    return null
  }
}

// 장소명 → { lat, lng } (bias 있으면 가까운 순 1건). 실패 시 null.
export async function geocodePlace(query, bias) {
  const key = kakaoKey()
  const q = String(query || "").trim()
  if (!key || !q) return null
  try {
    const params = new URLSearchParams({ query: q, size: "1" })
    if (bias) {
      params.set("x", Number(bias.lng).toFixed(6))
      params.set("y", Number(bias.lat).toFixed(6))
      params.set("sort", "distance")
    }
    const resp = await fetch(`${KAKAO_KEYWORD}?${params.toString()}`, { headers: { Authorization: `KakaoAK ${key}` } })
    if (!resp.ok) return null
    const data = await resp.json()
    const doc = (Array.isArray(data.documents) ? data.documents : [])[0]
    if (!doc) return null
    const lat = Number(doc.y)
    const lng = Number(doc.x)
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null
  } catch {
    return null
  }
}
