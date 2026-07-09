// 지도 렌더러(국내 카카오 ↔ 국외 구글) 전환용 지역 판정 헬퍼.
// 순수 함수만 모아 두어 컴포넌트 파일의 fast-refresh 를 깨지 않는다.

// 한국 좌표 범위 (제주~독도 인근 포함)
export function isKorea(lat, lng) {
  return lat >= 33 && lat <= 39 && lng >= 124 && lng <= 132
}

export function regionOf(lat, lng) {
  return isKorea(lat, lng) ? "kr" : "global"
}

// features, focusPoint, myLocation에서 대표 좌표로 초기 렌더러 결정
export function detectRegion(features, focusPoint, myLocation) {
  // focusPoint 우선
  if (focusPoint?.lat && focusPoint?.lng) {
    return regionOf(focusPoint.lat, focusPoint.lng)
  }
  // myLocation
  if (myLocation?.lat && myLocation?.lng) {
    return regionOf(myLocation.lat, myLocation.lng)
  }
  // features에서 첫 좌표
  for (const f of features || []) {
    if (f.lat && f.lng) return regionOf(f.lat, f.lng)
    if (f.points?.length) {
      const [lng, lat] = f.points[0]
      return regionOf(lat, lng)
    }
  }
  return "kr" // 기본값: 한국
}
