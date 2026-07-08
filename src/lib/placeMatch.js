// 장소 검색(상호·주소) 공용 헬퍼 — 카카오 로컬 프록시(/api/place-match) 호출.
// 내 장소 등록(CollectSheet)과 지도 편집 검색(MapEditorScreen)이 같은 매커니즘을 쓴다.
// 응답 후보: { name, category, categoryName, address, lat, lng, distance, kakaoUrl }

// 카카오 로컬은 국내 좌표만 받는다(위 32~40, 경 123~133). 벗어나면 서울 도심으로 보정.
const KOREA_FALLBACK = { lat: 37.5665, lng: 126.978 }

function biasInKorea(bias) {
  const lat = Number(bias?.lat)
  const lng = Number(bias?.lng)
  if (Number.isFinite(lat) && Number.isFinite(lng) && lat >= 32 && lat <= 40 && lng >= 123 && lng <= 133) {
    return { lat, lng }
  }
  return KOREA_FALLBACK
}

// bias(현재 위치/지도 중심) 기준으로 키워드/주소를 검색한다. q 없으면 주변 등록 상호.
export async function fetchPlaceMatch({ lat, lng, q } = {}) {
  const bias = biasInKorea({ lat, lng })
  const params = new URLSearchParams({ lat: bias.lat.toFixed(5), lng: bias.lng.toFixed(5) })
  if (q) params.set("q", q)
  const response = await fetch(`/api/place-match?${params.toString()}`)
  if (!response.ok) throw new Error("place-match failed")
  const data = await response.json()
  return Array.isArray(data.candidates) ? data.candidates : []
}
