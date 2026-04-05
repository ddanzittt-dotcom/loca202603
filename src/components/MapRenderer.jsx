import { forwardRef, useMemo } from "react"
import { NaverMap } from "./NaverMap"
import { GoogleMap } from "./GoogleMap"

// 한국 좌표 범위
function isKorea(lat, lng) {
  return lat >= 33 && lat <= 39 && lng >= 124 && lng <= 132
}

// features, focusPoint, myLocation에서 대표 좌표 추출
function detectRegion(features, focusPoint, myLocation) {
  // focusPoint 우선
  if (focusPoint?.lat && focusPoint?.lng) {
    return isKorea(focusPoint.lat, focusPoint.lng) ? "kr" : "global"
  }
  // myLocation
  if (myLocation?.lat && myLocation?.lng) {
    return isKorea(myLocation.lat, myLocation.lng) ? "kr" : "global"
  }
  // features에서 첫 좌표
  for (const f of features || []) {
    if (f.lat && f.lng) return isKorea(f.lat, f.lng) ? "kr" : "global"
    if (f.points?.length) {
      const [lng, lat] = f.points[0]
      return isKorea(lat, lng) ? "kr" : "global"
    }
  }
  return "kr" // 기본값: 한국
}

export const MapRenderer = forwardRef(function MapRenderer(props, ref) {
  const region = useMemo(
    () => detectRegion(props.features, props.focusPoint, props.myLocation),
    [props.features, props.focusPoint, props.myLocation],
  )

  if (region === "global") {
    return <GoogleMap ref={ref} {...props} />
  }
  return <NaverMap ref={ref} {...props} />
})
