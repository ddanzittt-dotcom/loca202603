import { useEffect, useRef, useState, useImperativeHandle, forwardRef } from "react"

const getNaverMaps = () => window.naver?.maps ?? null

const escapeHtml = (str) => {
  if (!str) return ""
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

const BASE_ZOOM = 14
const zoomScale = (zoom) => {
  const s = Math.pow(1.12, zoom - BASE_ZOOM)
  return Math.max(0.3, Math.min(s, 1.4))
}

export const NaverMap = forwardRef(function NaverMap({ features, selectedFeatureId, draftPoints, draftMode, focusPoint, fitTrigger, onMapTap, onFeatureTap, showLabels = true, myLocation = null, characterStyle = "m3" }, ref) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const layersRef = useRef([])
  const lastFitTriggerRef = useRef(0)
  const onMapTapRef = useRef(onMapTap)
  const ignoreMapTapUntilRef = useRef(0)
  const lastFeatureTapRef = useRef({ featureId: null, at: 0 })
  const [mapReady, setMapReady] = useState(false)

  useImperativeHandle(ref, () => ({
    async capture() {
      const container = containerRef.current
      if (!container) return null

      // Try to find the internal canvas elements rendered by Naver Maps
      const canvasList = container.querySelectorAll("canvas")
      if (canvasList.length > 0) {
        const rect = container.getBoundingClientRect()
        const output = document.createElement("canvas")
        output.width = rect.width * 2
        output.height = rect.height * 2
        const ctx = output.getContext("2d")
        ctx.scale(2, 2)

        // Draw each internal canvas at its position
        for (const src of canvasList) {
          try {
            const srcRect = src.getBoundingClientRect()
            ctx.drawImage(
              src,
              srcRect.left - rect.left,
              srcRect.top - rect.top,
              srcRect.width,
              srcRect.height,
            )
          } catch {
            // skip tainted canvases
          }
        }

        // Draw overlay markers/labels (HTML elements) via html2canvas
        try {
          const html2canvas = (await import("html2canvas")).default
          const overlayCanvas = await html2canvas(container, {
            useCORS: true,
            allowTaint: true,
            scale: 2,
            backgroundColor: null,
            ignoreElements: (el) => el.tagName === "CANVAS",
          })
          ctx.setTransform(1, 0, 0, 1, 0, 0)
          ctx.drawImage(overlayCanvas, 0, 0, output.width, output.height)
        } catch {
          // overlays optional
        }

        return output
      }

      // Fallback: html2canvas only
      const html2canvas = (await import("html2canvas")).default
      return html2canvas(container, { useCORS: true, allowTaint: true, scale: 2 })
    },
  }), [])

  useEffect(() => {
    onMapTapRef.current = onMapTap
  }, [onMapTap])

  // Load SDK + init map (once on mount)
  useEffect(() => {
    let cancelled = false

    const initMap = () => {
      const naverMaps = getNaverMaps()
      if (cancelled || !containerRef.current) return
      if (!naverMaps || typeof naverMaps.Map !== "function") {
        window.__naverMapReady = false
        return
      }
      try {
        const map = new naverMaps.Map(containerRef.current, {
          center: new naverMaps.LatLng(37.544, 127.056),
          zoom: 14,
          zoomControl: false,
          scaleControl: false,
          logoControl: true,
          logoControlOptions: { position: naverMaps.Position.BOTTOM_LEFT },
          mapDataControl: false,
        })
        naverMaps.Event.addListener(map, "click", (e) => {
          if (Date.now() < ignoreMapTapUntilRef.current) return
          onMapTapRef.current?.({ lat: e.coord.lat(), lng: e.coord.lng() })
        })
        const applyZoomScale = () => {
          const zoom = map.getZoom()
          const s = zoomScale(zoom)
          containerRef.current?.style.setProperty("--map-scale", s)
          containerRef.current?.setAttribute("data-zoom", zoom < 15 ? "far" : "near")
        }
        naverMaps.Event.addListener(map, "zoom_changed", applyZoomScale)
        applyZoomScale()
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
        try {
          layer.setMap(null)
        } catch (error) {
          console.warn("네이버 지도 레이어 정리 실패:", error)
        }
      })
      layersRef.current = []
      if (mapRef.current) {
        try {
          mapRef.current.destroy()
        } catch (error) {
          console.warn("네이버 지도 인스턴스 정리 실패:", error)
        }
        mapRef.current = null
      }
    }
  }, [])

  // Render features
  useEffect(() => {
    const map = mapRef.current
    const naverMaps = getNaverMaps()
    if (!map || !naverMaps) return
    try {
      layersRef.current.forEach((layer) => layer.setMap(null))
      layersRef.current = []

      const toLatLng = (lat, lng) => new naverMaps.LatLng(lat, lng)
      const pointsToPath = (points) => points.map(([lng, lat]) => toLatLng(lat, lng))
      const bindFeatureSelection = (target, featureId) => {
        const handleSelect = () => {
          const now = Date.now()
          const lastTap = lastFeatureTapRef.current
          if (lastTap.featureId === featureId && now - lastTap.at < 250) return
          lastFeatureTapRef.current = { featureId, at: now }
          ignoreMapTapUntilRef.current = now + 300
          onFeatureTap?.(featureId)
        }
        naverMaps.Event.addListener(target, "tap", handleSelect)
        naverMaps.Event.addListener(target, "click", handleSelect)
      }

      features.forEach((feature) => {
        if (feature.type === "pin") {
          // 미설정 핀(0,0) 스킵 — 템플릿에서 생성 후 위치 미지정 상태
          if (feature.lat === 0 && feature.lng === 0) return
          const labelHtml = showLabels
            ? `<div class="loca-pin-label">${escapeHtml(feature.title)}</div>`
            : ""
          const marker = new naverMaps.Marker({
            position: toLatLng(feature.lat, feature.lng),
            map,
            icon: {
              content: `<div class="loca-pin-marker"><div class="loca-pin-emoji"><span>${escapeHtml(feature.emoji || "📍")}</span></div>${labelHtml}</div>`,
              size: new naverMaps.Size(40, 56),
              anchor: new naverMaps.Point(20, 20),
            },
          })
          bindFeatureSelection(marker, feature.id)
          layersRef.current.push(marker)
        } else if (feature.type === "route") {
          const polyline = new naverMaps.Polyline({
            path: pointsToPath(feature.points),
            strokeColor: feature.id === selectedFeatureId ? "#635BFF" : "#0EA5E9",
            strokeWeight: feature.id === selectedFeatureId ? 6 : 4,
            strokeOpacity: 1,
            clickable: true,
            map,
          })
          bindFeatureSelection(polyline, feature.id)
          layersRef.current.push(polyline)
          // 거의 보이지 않는 넓은 히트 영역 (위에 렌더링해야 클릭 감지됨)
          const hitArea = new naverMaps.Polyline({
            path: pointsToPath(feature.points),
            strokeColor: "#0EA5E9",
            strokeWeight: 24,
            strokeOpacity: 0.05,
            clickable: true,
            map,
          })
          bindFeatureSelection(hitArea, feature.id)
          layersRef.current.push(hitArea)

          const midpoint = feature.points[Math.floor(feature.points.length / 2)]
          if (showLabels && midpoint) {
            const routeLabel = new naverMaps.Marker({
              position: toLatLng(midpoint[1], midpoint[0]),
              map,
              icon: {
                content: `<div class="loca-map-route-label"><span>${escapeHtml(feature.emoji)} ${escapeHtml(feature.title)}</span></div>`,
                anchor: new naverMaps.Point(0, 14),
              },
              clickable: true,
            })
            bindFeatureSelection(routeLabel, feature.id)
            layersRef.current.push(routeLabel)
          }
        } else if (feature.type === "area") {
          const polygon = new naverMaps.Polygon({
            paths: [pointsToPath(feature.points)],
            strokeColor: feature.id === selectedFeatureId ? "#635BFF" : "#16A34A",
            strokeWeight: feature.id === selectedFeatureId ? 4 : 3,
            strokeOpacity: 1,
            fillColor: feature.id === selectedFeatureId ? "#8B5CF6" : "#22C55E",
            fillOpacity: feature.id === selectedFeatureId ? 0.26 : 0.18,
            map,
          })
          bindFeatureSelection(polygon, feature.id)
          layersRef.current.push(polygon)
          // 거의 보이지 않는 넓은 히트 영역 (외곽선 클릭 감도 개선)
          const hitArea = new naverMaps.Polyline({
            path: [...pointsToPath(feature.points), pointsToPath(feature.points)[0]],
            strokeColor: "#16A34A",
            strokeWeight: 24,
            strokeOpacity: 0.05,
            clickable: true,
            map,
          })
          bindFeatureSelection(hitArea, feature.id)
          layersRef.current.push(hitArea)

          const getCenterPoint = (pts) => {
            const total = pts.reduce(
              (acc, [lng, lat]) => ({ lat: acc.lat + lat, lng: acc.lng + lng }),
              { lat: 0, lng: 0 },
            )
            return new naverMaps.LatLng(total.lat / pts.length, total.lng / pts.length)
          }
          const centerPoint = getCenterPoint(feature.points)
          if (showLabels && centerPoint) {
            const areaLabel = new naverMaps.Marker({
              position: centerPoint,
              map,
              icon: {
                content: `<div class="loca-map-route-label"><span>${escapeHtml(feature.emoji)} ${escapeHtml(feature.title)}</span></div>`,
                anchor: new naverMaps.Point(0, 14),
              },
              clickable: true,
            })
            bindFeatureSelection(areaLabel, feature.id)
            layersRef.current.push(areaLabel)
          }
        }
      })

      if (draftPoints.length > 1) {
        if (draftMode === "area" && draftPoints.length > 2) {
          const draft = new naverMaps.Polygon({
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
          const draft = new naverMaps.Polyline({
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
      if (myLocation) {
        const h = myLocation.heading ?? 0
        const charClass = characterStyle === "w1" ? "loca-char-w1" : "loca-char-m3"
        const person = `<div class="loca-my-location ${charClass}">`
          + `<div class="loca-pulse"></div>`
          + `<div class="loca-direction" style="transform:rotate(${h}deg)">`
          + `<div class="loca-dir-arrow"></div>`
          + `</div>`
          + `<div class="loca-person">`
          + `<div class="loca-person__head"></div>`
          + `<div class="loca-person__body"></div>`
          + `<div class="loca-person__arm-l"></div>`
          + `<div class="loca-person__arm-r"></div>`
          + `<div class="loca-person__leg-l"></div>`
          + `<div class="loca-person__leg-r"></div>`
          + `</div>`
          + `</div>`
        const locMarker = new naverMaps.Marker({
          position: toLatLng(myLocation.lat, myLocation.lng),
          map,
          icon: {
            content: person,
            size: new naverMaps.Size(56, 56),
            anchor: new naverMaps.Point(28, 28),
          },
          zIndex: 9999,
        })
        layersRef.current.push(locMarker)
      }
    } catch (e) {
      console.warn("네이버 지도 레이어 업데이트 실패:", e)
    }
  }, [characterStyle, draftMode, draftPoints, features, mapReady, myLocation, onFeatureTap, selectedFeatureId, showLabels])

  // Focus
  useEffect(() => {
    const map = mapRef.current
    const naverMaps = getNaverMaps()
    if (!map || !focusPoint || !naverMaps) return
    try {
      map.setCenter(new naverMaps.LatLng(focusPoint.lat, focusPoint.lng))
      map.setZoom(focusPoint.zoom || 16)
    } catch (e) {
      console.warn("네이버 지도 포커스 실패:", e)
    }
  }, [focusPoint])

  // fitBounds - focus on densest cluster
  useEffect(() => {
    const map = mapRef.current
    const naverMaps = getNaverMaps()
    if (!map || !naverMaps || !mapReady) return
    if (lastFitTriggerRef.current === fitTrigger) return
    lastFitTriggerRef.current = fitTrigger
    try {
      // Collect all coordinates (미설정 0,0 핀 제외)
      const coords = []
      features.forEach((feature) => {
        if (feature.type === "pin") {
          if (feature.lat === 0 && feature.lng === 0) return
          coords.push({ lat: feature.lat, lng: feature.lng })
        } else if (feature.points?.length) {
          const total = feature.points.reduce(
            (acc, [fLng, fLat]) => ({ lat: acc.lat + fLat, lng: acc.lng + fLng }),
            { lat: 0, lng: 0 },
          )
          coords.push({ lat: total.lat / feature.points.length, lng: total.lng / feature.points.length })
        }
      })
      draftPoints.forEach(([dLng, dLat]) => coords.push({ lat: dLat, lng: dLng }))

      if (coords.length === 0) return

      if (coords.length <= 5) {
        // Few points: fit all
        const bounds = new naverMaps.LatLngBounds()
        coords.forEach((c) => bounds.extend(new naverMaps.LatLng(c.lat, c.lng)))
        map.fitBounds(bounds, { top: 28, right: 28, bottom: 28, left: 28 })
      } else {
        // Find densest cluster: for each point, count neighbors within ~0.03 deg (~3km)
        const radius = 0.03
        let bestIdx = 0, bestCount = 0
        coords.forEach((c, i) => {
          let count = 0
          coords.forEach((d) => {
            if (Math.abs(c.lat - d.lat) < radius && Math.abs(c.lng - d.lng) < radius) count++
          })
          if (count > bestCount) { bestCount = count; bestIdx = i }
        })
        // Fit bounds to the densest cluster
        const center = coords[bestIdx]
        const bounds = new naverMaps.LatLngBounds()
        coords.forEach((c) => {
          if (Math.abs(c.lat - center.lat) < radius && Math.abs(c.lng - center.lng) < radius) {
            bounds.extend(new naverMaps.LatLng(c.lat, c.lng))
          }
        })
        map.fitBounds(bounds, { top: 28, right: 28, bottom: 28, left: 28 })
      }
    } catch (e) {
      console.warn("네이버 지도 fitBounds 실패:", e)
    }
  }, [draftPoints, features, fitTrigger, mapReady])

  // fit on first ready
  useEffect(() => {
    if (!mapReady) return
    lastFitTriggerRef.current = 0
  }, [mapReady])

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
})
