// 좌표 → 도로명/지번 주소 (카카오 지오코더, best-effort).
// services 라이브러리가 안 떠 있거나 실패하면 빈 문자열.
// index.html 에서 kakao SDK 를 libraries=services 로 로드한다.
export function reverseGeocodeAddress(lat, lng) {
  return new Promise((resolve) => {
    const Geocoder = window.kakao?.maps?.services?.Geocoder
    if (!Geocoder || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      resolve("")
      return
    }
    try {
      new Geocoder().coord2Address(lng, lat, (result, status) => {
        if (status !== window.kakao.maps.services.Status.OK || !result?.length) {
          resolve("")
          return
        }
        const item = result[0]
        resolve(item.road_address?.address_name || item.address?.address_name || "")
      })
    } catch {
      resolve("")
    }
  })
}
