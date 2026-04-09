import { useEffect, useRef, forwardRef, useImperativeHandle } from "react"

const GOOGLE_MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY || ""

let loadPromise = null
function loadGoogleMaps() {
  if (window.google?.maps) return Promise.resolve()
  if (loadPromise) return loadPromise
  loadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script")
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_KEY}&libraries=places`
    script.async = true
    script.onload = resolve
    script.onerror = reject
    document.head.appendChild(script)
  })
  return loadPromise
}

export const GoogleMap = forwardRef(function GoogleMap({
  features,
  selectedFeatureId,
  draftPoints,
  draftMode,
  focusPoint,
  fitTrigger,
  onMapTap,
  onFeatureTap,
  showLabels = true,
  myLocation = null,
}, ref) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const markersRef = useRef([])
  const polylinesRef = useRef([])
  const polygonsRef = useRef([])
  const myLocMarkerRef = useRef(null)
  const lastFitTriggerRef = useRef(0)
  const onMapTapRef = useRef(onMapTap)

  useEffect(() => { onMapTapRef.current = onMapTap }, [onMapTap])

  // 초기화
  useEffect(() => {
    if (!containerRef.current || !GOOGLE_MAPS_KEY) return
    let cancelled = false

    loadGoogleMaps().then(() => {
      if (cancelled || !containerRef.current) return
      const center = focusPoint || myLocation || { lat: 37.56, lng: 126.98 }
      const map = new window.google.maps.Map(containerRef.current, {
        center,
        zoom: 14,
        disableDefaultUI: true,
        zoomControl: true,
        gestureHandling: "greedy",
        styles: [
          { featureType: "poi", stylers: [{ visibility: "off" }] },
          { featureType: "transit", stylers: [{ visibility: "off" }] },
        ],
      })
      mapRef.current = map

      map.addListener("click", (e) => {
        if (onMapTapRef.current) {
          onMapTapRef.current({ lat: e.latLng.lat(), lng: e.latLng.lng() })
        }
      })
    })

    return () => { cancelled = true }
  }, [focusPoint, myLocation])

  // 피처 렌더링
  useEffect(() => {
    const map = mapRef.current
    if (!map || !window.google?.maps) return

    // 기존 마커/라인/폴리곤 제거
    markersRef.current.forEach((m) => m.setMap(null))
    polylinesRef.current.forEach((p) => p.setMap(null))
    polygonsRef.current.forEach((p) => p.setMap(null))
    markersRef.current = []
    polylinesRef.current = []
    polygonsRef.current = []

    const pins = features.filter((f) => f.type === "pin" && f.lat && f.lng)
    const routes = features.filter((f) => f.type === "route" && f.points?.length >= 2)
    const areas = features.filter((f) => f.type === "area" && f.points?.length >= 3)

    // 핀 마커
    pins.forEach((pin) => {
      const isSelected = pin.id === selectedFeatureId
      const marker = new window.google.maps.Marker({
        position: { lat: pin.lat, lng: pin.lng },
        map,
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: isSelected ? 8 : 6,
          fillColor: "#FF6B35",
          fillOpacity: 1,
          strokeColor: isSelected ? "#2D4A3E" : "#fff",
          strokeWeight: 2,
        },
        label: showLabels ? {
          text: pin.title || "",
          fontSize: "9px",
          fontWeight: "500",
          color: "#1A1A1A",
          className: "gmap-label",
        } : undefined,
        zIndex: isSelected ? 10 : 1,
      })
      marker.addListener("click", () => onFeatureTap?.(pin.id))
      markersRef.current.push(marker)
    })

    // 경로 폴리라인
    routes.forEach((route) => {
      const path = route.points.map(([lng, lat]) => ({ lat, lng }))
      const isSelected = route.id === selectedFeatureId
      const polyline = new window.google.maps.Polyline({
        path,
        map,
        strokeColor: isSelected ? "#2D4A3E" : "#0F6E56",
        strokeOpacity: 0.8,
        strokeWeight: isSelected ? 4 : 3,
      })
      polyline.addListener("click", () => onFeatureTap?.(route.id))
      polylinesRef.current.push(polyline)
    })

    // 구역 폴리곤
    areas.forEach((area) => {
      const path = area.points.map(([lng, lat]) => ({ lat, lng }))
      const isSelected = area.id === selectedFeatureId
      const polygon = new window.google.maps.Polygon({
        paths: path,
        map,
        strokeColor: isSelected ? "#2D4A3E" : "#854F0B",
        strokeOpacity: 0.7,
        strokeWeight: 2,
        fillColor: "#854F0B",
        fillOpacity: isSelected ? 0.25 : 0.1,
      })
      polygon.addListener("click", () => onFeatureTap?.(area.id))
      polygonsRef.current.push(polygon)
    })
  }, [features, selectedFeatureId, showLabels, onFeatureTap])

  // 드래프트 포인트 (경로/구역 그리기)
  useEffect(() => {
    const map = mapRef.current
    if (!map || !window.google?.maps || !draftPoints?.length) return

    const path = draftPoints.map(([lng, lat]) => ({ lat, lng }))
    const color = draftMode === "area" ? "#854F0B" : "#0F6E56"

    const line = new window.google.maps.Polyline({
      path,
      map,
      strokeColor: color,
      strokeOpacity: 0.6,
      strokeWeight: 2,
      strokeDashArray: [4, 4],
    })

    return () => line.setMap(null)
  }, [draftPoints, draftMode])

  // 포커스 포인트 이동
  useEffect(() => {
    const map = mapRef.current
    if (!map || !focusPoint) return
    map.panTo({ lat: focusPoint.lat, lng: focusPoint.lng })
    if (focusPoint.zoom) map.setZoom(focusPoint.zoom)
  }, [focusPoint])

  // fitBounds
  useEffect(() => {
    const map = mapRef.current
    if (!map || !window.google?.maps || fitTrigger === lastFitTriggerRef.current) return
    lastFitTriggerRef.current = fitTrigger

    const bounds = new window.google.maps.LatLngBounds()
    let hasPoints = false
    features.forEach((f) => {
      if (f.type === "pin" && f.lat && f.lng) {
        bounds.extend({ lat: f.lat, lng: f.lng })
        hasPoints = true
      }
      if (f.points?.length) {
        f.points.forEach(([lng, lat]) => { bounds.extend({ lat, lng }); hasPoints = true })
      }
    })
    if (myLocation) {
      bounds.extend({ lat: myLocation.lat, lng: myLocation.lng })
      hasPoints = true
    }
    if (hasPoints) map.fitBounds(bounds, 40)
  }, [fitTrigger, features, myLocation])

  // 내 위치 마커
  useEffect(() => {
    const map = mapRef.current
    if (!map || !window.google?.maps) return
    if (myLocMarkerRef.current) myLocMarkerRef.current.setMap(null)
    if (!myLocation) return

    myLocMarkerRef.current = new window.google.maps.Marker({
      position: { lat: myLocation.lat, lng: myLocation.lng },
      map,
      icon: {
        path: window.google.maps.SymbolPath.CIRCLE,
        scale: 7,
        fillColor: "#4285F4",
        fillOpacity: 1,
        strokeColor: "#fff",
        strokeWeight: 2,
      },
      zIndex: 100,
    })
  }, [myLocation])

  // capture (스크린샷용)
  useImperativeHandle(ref, () => ({
    capture: () => null, // Google Maps는 캡처 제한
  }))

  if (!GOOGLE_MAPS_KEY) {
    return (
      <div className="map-canvas" style={{ display: "flex", alignItems: "center", justifyContent: "center", background: "#f5f0e8", color: "#aaa", fontSize: 12 }}>
        Google Maps API 키가 설정되지 않았어요
      </div>
    )
  }

  return <div ref={containerRef} className="map-canvas" />
})
