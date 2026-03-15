import { useEffect, useRef, useState } from "react"

export function NaverMap({ features, selectedFeatureId, draftPoints, draftMode, focusPoint, fitTrigger, onMapTap, onFeatureTap, showLabels = true }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const layersRef = useRef([])
  const lastFitTriggerRef = useRef(fitTrigger)
  const onMapTapRef = useRef(onMapTap)
  const [mapReady, setMapReady] = useState(false)

  useEffect(() => {
    onMapTapRef.current = onMapTap
  }, [onMapTap])

  // Load SDK + init map (once on mount)
  useEffect(() => {
    let cancelled = false

    const initMap = () => {
      if (cancelled || !containerRef.current) return
      if (typeof naver === 'undefined' || naver.maps == null || typeof naver.maps.Map !== 'function') {
        window.__naverMapReady = false
        return
      }
      try {
        const map = new naver.maps.Map(containerRef.current, {
          center: new naver.maps.LatLng(37.544, 127.056),
          zoom: 14,
          zoomControl: false,
          scaleControl: false,
          logoControl: true,
          logoControlOptions: { position: naver.maps.Position.BOTTOM_LEFT },
          mapDataControl: false,
        })
        naver.maps.Event.addListener(map, "click", (e) => {
          onMapTapRef.current?.({ lat: e.coord.lat(), lng: e.coord.lng() })
        })
        mapRef.current = map
        if (!cancelled) setMapReady(true)
      } catch (e) {
        console.warn("네이버 지도 초기화 실패:", e)
        window.__naverMapReady = false
      }
    }

    window.loadNaverMap?.((ok) => {
      if (ok) initMap()
    })

    return () => {
      cancelled = true
      layersRef.current.forEach((layer) => {
        try { layer.setMap(null) } catch {}
      })
      layersRef.current = []
      if (mapRef.current) {
        try { mapRef.current.destroy() } catch {}
        mapRef.current = null
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Render features
  useEffect(() => {
    const map = mapRef.current
    if (!map || typeof naver === 'undefined' || naver.maps == null) return
    try {
      layersRef.current.forEach((layer) => layer.setMap(null))
      layersRef.current = []

      const toLatLng = (lat, lng) => new naver.maps.LatLng(lat, lng)
      const pointsToPath = (points) => points.map(([lng, lat]) => toLatLng(lat, lng))

      features.forEach((feature) => {
        if (feature.type === "pin") {
          const marker = new naver.maps.Marker({
            position: toLatLng(feature.lat, feature.lng),
            map,
            icon: {
              content: `<div class="loca-emoji-marker"><span>${feature.emoji || "📍"}</span></div>`,
              size: new naver.maps.Size(32, 32),
              anchor: new naver.maps.Point(16, 16),
            },
          })
          naver.maps.Event.addListener(marker, "click", () => onFeatureTap?.(feature.id))
          layersRef.current.push(marker)

          if (showLabels) {
            const label = new naver.maps.Marker({
              position: toLatLng(feature.lat, feature.lng),
              map,
              icon: {
                content: `<div class="loca-map-label">${feature.emoji} ${feature.title}</div>`,
                anchor: new naver.maps.Point(0, 42),
              },
              clickable: false,
            })
            layersRef.current.push(label)
          }
        } else if (feature.type === "route") {
          const polyline = new naver.maps.Polyline({
            path: pointsToPath(feature.points),
            strokeColor: feature.id === selectedFeatureId ? "#635BFF" : "#0EA5E9",
            strokeWeight: feature.id === selectedFeatureId ? 6 : 4,
            strokeOpacity: 1,
            clickable: false,
            map,
          })
          layersRef.current.push(polyline)
          // 거의 보이지 않는 넓은 히트 영역 (위에 렌더링해야 클릭 감지됨)
          const hitArea = new naver.maps.Polyline({
            path: pointsToPath(feature.points),
            strokeColor: "#0EA5E9",
            strokeWeight: 24,
            strokeOpacity: 0.01,
            map,
          })
          naver.maps.Event.addListener(hitArea, "click", () => onFeatureTap?.(feature.id))
          layersRef.current.push(hitArea)

          const midpoint = feature.points[Math.floor(feature.points.length / 2)]
          if (showLabels && midpoint) {
            const routeLabel = new naver.maps.Marker({
              position: toLatLng(midpoint[1], midpoint[0]),
              map,
              icon: {
                content: `<div class="loca-map-route-label"><span>${feature.emoji} ${feature.title}</span></div>`,
                anchor: new naver.maps.Point(0, 14),
              },
              clickable: true,
            })
            naver.maps.Event.addListener(routeLabel, "click", () => onFeatureTap?.(feature.id))
            layersRef.current.push(routeLabel)
          }
        } else if (feature.type === "area") {
          const polygon = new naver.maps.Polygon({
            paths: [pointsToPath(feature.points)],
            strokeColor: feature.id === selectedFeatureId ? "#635BFF" : "#16A34A",
            strokeWeight: feature.id === selectedFeatureId ? 4 : 3,
            strokeOpacity: 1,
            fillColor: feature.id === selectedFeatureId ? "#8B5CF6" : "#22C55E",
            fillOpacity: feature.id === selectedFeatureId ? 0.26 : 0.18,
            map,
          })
          naver.maps.Event.addListener(polygon, "click", () => onFeatureTap?.(feature.id))
          layersRef.current.push(polygon)
          // 거의 보이지 않는 넓은 히트 영역 (외곽선 클릭 감도 개선)
          const hitArea = new naver.maps.Polyline({
            path: [...pointsToPath(feature.points), pointsToPath(feature.points)[0]],
            strokeColor: "#16A34A",
            strokeWeight: 24,
            strokeOpacity: 0.01,
            map,
          })
          naver.maps.Event.addListener(hitArea, "click", () => onFeatureTap?.(feature.id))
          layersRef.current.push(hitArea)

          const getCenterPoint = (pts) => {
            const total = pts.reduce(
              (acc, [lng, lat]) => ({ lat: acc.lat + lat, lng: acc.lng + lng }),
              { lat: 0, lng: 0 },
            )
            return new naver.maps.LatLng(total.lat / pts.length, total.lng / pts.length)
          }
          const centerPoint = getCenterPoint(feature.points)
          if (showLabels && centerPoint) {
            const areaLabel = new naver.maps.Marker({
              position: centerPoint,
              map,
              icon: {
                content: `<div class="loca-map-route-label"><span>${feature.emoji} ${feature.title}</span></div>`,
                anchor: new naver.maps.Point(0, 14),
              },
              clickable: true,
            })
            naver.maps.Event.addListener(areaLabel, "click", () => onFeatureTap?.(feature.id))
            layersRef.current.push(areaLabel)
          }
        }
      })

      if (draftPoints.length > 1) {
        if (draftMode === "area" && draftPoints.length > 2) {
          const draft = new naver.maps.Polygon({
            paths: [pointsToPath(draftPoints)],
            strokeColor: "#F97316",
            strokeWeight: 4,
            strokeStyle: "shortdash",
            strokeOpacity: 1,
            fillColor: "#FB923C",
            fillOpacity: 0.18,
            map,
          })
          layersRef.current.push(draft)
        } else {
          const draft = new naver.maps.Polyline({
            path: pointsToPath(draftPoints),
            strokeColor: "#F97316",
            strokeWeight: 4,
            strokeStyle: "shortdash",
            strokeOpacity: 1,
            map,
          })
          layersRef.current.push(draft)
        }
      }
    } catch (e) {
      console.warn("네이버 지도 레이어 업데이트 실패:", e)
    }
  }, [draftMode, draftPoints, features, mapReady, onFeatureTap, selectedFeatureId, showLabels])

  // Focus
  useEffect(() => {
    const map = mapRef.current
    if (!map || !focusPoint || typeof naver === 'undefined' || naver.maps == null) return
    try {
      map.setCenter(new naver.maps.LatLng(focusPoint.lat, focusPoint.lng))
      map.setZoom(focusPoint.zoom || 16)
    } catch (e) {
      console.warn("네이버 지도 포커스 실패:", e)
    }
  }, [focusPoint])

  // fitBounds
  useEffect(() => {
    const map = mapRef.current
    if (!map || typeof naver === 'undefined' || naver.maps == null) return
    if (lastFitTriggerRef.current === fitTrigger) return
    lastFitTriggerRef.current = fitTrigger
    try {
      const bounds = new naver.maps.LatLngBounds()
      let hasPoints = false
      features.forEach((feature) => {
        if (feature.type === "pin") {
          bounds.extend(new naver.maps.LatLng(feature.lat, feature.lng))
          hasPoints = true
        } else {
          feature.points.forEach(([lng, lat]) => {
            bounds.extend(new naver.maps.LatLng(lat, lng))
            hasPoints = true
          })
        }
      })
      draftPoints.forEach(([lng, lat]) => {
        bounds.extend(new naver.maps.LatLng(lat, lng))
        hasPoints = true
      })
      if (hasPoints) map.fitBounds(bounds, { top: 28, right: 28, bottom: 28, left: 28 })
    } catch (e) {
      console.warn("네이버 지도 fitBounds 실패:", e)
    }
  }, [draftPoints, features, fitTrigger])

  return (
    <div className={`map-canvas map-canvas--${draftMode || "browse"}`} style={{ position: "relative" }}>
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
      {!mapReady ? (
        <div className="map-canvas__fallback">
          <span className="map-canvas__fallback-icon">🗺️</span>
          <span className="map-canvas__fallback-text">지도를 불러오는 중...</span>
        </div>
      ) : null}
    </div>
  )
}
