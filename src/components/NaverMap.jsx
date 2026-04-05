import { useEffect, useRef, useState, useImperativeHandle, forwardRef } from "react"
import { getPinIcon, emojiToCategory } from "../data/pinIcons"

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

export const NaverMap = forwardRef(function NaverMap({ features, selectedFeatureId, draftPoints, draftMode, focusPoint, fitTrigger, onMapTap, onFeatureTap, showLabels = true, myLocation = null, characterStyle = "m3", levelEmoji = "🥚", checkedInIds = null }, ref) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const layersRef = useRef([])
  const lastFitTriggerRef = useRef(0)
  const onMapTapRef = useRef(onMapTap)
  const ignoreMapTapUntilRef = useRef(0)
  const lastFeatureTapRef = useRef({ featureId: null, at: 0 })
  const [mapReady, setMapReady] = useState(false)
  const [zoomLevel, setZoomLevel] = useState(3) // 1=far, 2=mid, 3=close

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
          containerRef.current?.setAttribute("data-zoom", zoom < 12 ? "far" : "near")
          // 3단계 줌 레벨
          const newLevel = zoom < 13 ? 1 : zoom < 16 ? 2 : 3
          if (!cancelled) setZoomLevel(newLevel)
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

      // ─── 클러스터링 (줌아웃/중간 줌에서만) ───
      const pins = features.filter((f) => f.type === "pin" && f.lat && f.lng && !(f.lat === 0 && f.lng === 0))
      const nonPins = features.filter((f) => f.type !== "pin")
      const clusterDist = [40, 30, 0][zoomLevel - 1] // px 단위 거리

      let clusteredPins = []
      let clusters = []

      if (clusterDist > 0 && pins.length > 1) {
        // 좌표 → 화면 픽셀 변환
        const projection = map.getProjection()
        const pxPins = pins.map((p) => {
          const pt = projection.fromCoordToOffset(toLatLng(p.lat, p.lng))
          return { feature: p, x: pt.x, y: pt.y, clustered: false }
        })

        for (let i = 0; i < pxPins.length; i++) {
          if (pxPins[i].clustered) continue
          const group = [pxPins[i]]
          pxPins[i].clustered = true
          for (let j = i + 1; j < pxPins.length; j++) {
            if (pxPins[j].clustered) continue
            const dx = pxPins[i].x - pxPins[j].x
            const dy = pxPins[i].y - pxPins[j].y
            if (Math.sqrt(dx * dx + dy * dy) < clusterDist) {
              group.push(pxPins[j])
              pxPins[j].clustered = true
            }
          }
          if (group.length === 1) {
            clusteredPins.push(group[0].feature)
          } else {
            const avgLat = group.reduce((s, p) => s + p.feature.lat, 0) / group.length
            const avgLng = group.reduce((s, p) => s + p.feature.lng, 0) / group.length
            clusters.push({ lat: avgLat, lng: avgLng, count: group.length, features: group.map((g) => g.feature) })
          }
        }
      } else {
        clusteredPins = pins
      }

      // 클러스터 마커 렌더링
      clusters.forEach((cluster) => {
        const size = cluster.count <= 5 ? 26 : cluster.count <= 15 ? 30 : cluster.count <= 50 ? 34 : 38
        const fontSize = cluster.count <= 5 ? 10 : cluster.count <= 15 ? 11 : cluster.count <= 50 ? 12 : 13
        const marker = new naverMaps.Marker({
          position: toLatLng(cluster.lat, cluster.lng),
          map,
          icon: {
            content: `<div class="loca-cluster" style="width:${size}px;height:${size}px;font-size:${fontSize}px">${cluster.count}</div>`,
            size: new naverMaps.Size(size, size),
            anchor: new naverMaps.Point(size / 2, size / 2),
          },
        })
        naverMaps.Event.addListener(marker, "click", () => {
          // 클러스터 탭 → 줌인
          const bounds = new naverMaps.LatLngBounds()
          cluster.features.forEach((f) => bounds.extend(toLatLng(f.lat, f.lng)))
          map.fitBounds(bounds, { top: 40, right: 40, bottom: 40, left: 40 })
        })
        layersRef.current.push(marker)
      })

      // 개별 핀 + 비핀 피처 렌더링
      const renderFeatures = [...clusteredPins, ...nonPins]
      renderFeatures.forEach((feature) => {
        if (feature.type === "pin") {
          if (feature.lat === 0 && feature.lng === 0) return
          const isSelected = feature.id === selectedFeatureId
          const isChecked = checkedInIds && checkedInIds.has(feature.id)
          const checkBadge = isChecked ? `<div class="loca-pin-check">✓</div>` : ""
          const catId = feature.category || emojiToCategory(feature.emoji)
          const iconData = getPinIcon(catId)

          // 줌 레벨별 핀 구성
          const dotSizes = [8, 10, 14]
          const dotBorders = [1.5, 2, 2.5]
          const dotSize = dotSizes[zoomLevel - 1]
          const dotBorder = dotBorders[zoomLevel - 1]
          const showBadge = zoomLevel >= 2
          const showPinLabel = zoomLevel === 3 && showLabels

          const badgeHtml = showBadge
            ? `<div class="loca-pin-badge" style="background:${iconData.bg}"><img src="/icons/pins/${catId}.svg" width="12" height="12" alt=""/></div>`
            : ""
          const dotStyle = `width:${dotSize}px;height:${dotSize}px;border-width:${dotBorder}px;${isSelected ? "border-color:#2D4A3E" : ""}`
          const labelHtml = showPinLabel
            ? `<div class="loca-pin-label">${escapeHtml(feature.title)}</div>`
            : ""
          const markerSize = zoomLevel === 1 ? 20 : zoomLevel === 2 ? 30 : 40
          const anchorY = zoomLevel === 1 ? 10 : zoomLevel === 2 ? 20 : 48

          const marker = new naverMaps.Marker({
            position: toLatLng(feature.lat, feature.lng),
            map,
            icon: {
              content: `<div class="loca-pin-marker">${checkBadge}${badgeHtml}<div class="loca-pin-dot${isSelected ? " is-selected" : ""}" style="${dotStyle}"></div>${labelHtml}</div>`,
              size: new naverMaps.Size(markerSize, markerSize + 30),
              anchor: new naverMaps.Point(markerSize / 2, anchorY),
            },
          })
          bindFeatureSelection(marker, feature.id)
          layersRef.current.push(marker)
        } else if (feature.type === "route") {
          const polyline = new naverMaps.Polyline({
            path: pointsToPath(feature.points),
            strokeColor: feature.id === selectedFeatureId ? "#2D4A3E" : "#0F6E56",
            strokeWeight: feature.id === selectedFeatureId ? 4.5 : 3.5,
            strokeOpacity: 0.5,
            strokeLineCap: "round",
            strokeLineJoin: "round",
            clickable: true,
            map,
          })
          bindFeatureSelection(polyline, feature.id)
          layersRef.current.push(polyline)
          const hitArea = new naverMaps.Polyline({
            path: pointsToPath(feature.points),
            strokeColor: "#0F6E56",
            strokeWeight: 24,
            strokeOpacity: 0.05,
            clickable: true,
            map,
          })
          bindFeatureSelection(hitArea, feature.id)
          layersRef.current.push(hitArea)

          // 방향 화살표 (중간 지점마다)
          if (feature.points.length >= 2) {
            const step = Math.max(1, Math.floor(feature.points.length / 4))
            for (let pi = step; pi < feature.points.length; pi += step) {
              const [lng1, lat1] = feature.points[pi - 1]
              const [lng2, lat2] = feature.points[pi]
              const angle = Math.atan2(lat2 - lat1, lng2 - lng1) * (180 / Math.PI) - 90
              const arrowMarker = new naverMaps.Marker({
                position: toLatLng(lat2, lng2),
                map,
                icon: {
                  content: `<div class="loca-route-arrow" style="transform:rotate(${angle}deg)"><svg width="10" height="10" viewBox="0 0 10 10" fill="#0F6E56" opacity="0.45"><polygon points="5,0 10,10 0,10"/></svg></div>`,
                  size: new naverMaps.Size(10, 10),
                  anchor: new naverMaps.Point(5, 5),
                },
              })
              layersRef.current.push(arrowMarker)
            }
          }

          // 경로 라벨
          const midpoint = feature.points[Math.floor(feature.points.length / 2)]
          if (showLabels && midpoint) {
            const routeLabel = new naverMaps.Marker({
              position: toLatLng(midpoint[1], midpoint[0]),
              map,
              icon: {
                content: `<div class="loca-route-label"><svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#0F6E56" stroke-width="2" stroke-linecap="round"><path d="M4 19L10 7L16 14L20 5"/></svg><span>${escapeHtml(feature.title)}</span></div>`,
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
            strokeColor: feature.id === selectedFeatureId ? "#2D4A3E" : "#854F0B",
            strokeWeight: feature.id === selectedFeatureId ? 3.5 : 2.5,
            strokeOpacity: feature.id === selectedFeatureId ? 0.8 : 0.45,
            strokeStyle: "shortdash",
            fillColor: "#854F0B",
            fillOpacity: feature.id === selectedFeatureId ? 0.15 : 0.08,
            map,
          })
          bindFeatureSelection(polygon, feature.id)
          layersRef.current.push(polygon)
          // 거의 보이지 않는 넓은 히트 영역 (외곽선 클릭 감도 개선)
          const hitArea = new naverMaps.Polyline({
            path: [...pointsToPath(feature.points), pointsToPath(feature.points)[0]],
            strokeColor: "#854F0B",
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
          // 구역 라벨 — 상단 중앙 배치
          const getTopCenter = (pts) => {
            let minLat = Infinity, sumLng = 0
            for (const [lng, lat] of pts) {
              if (lat < minLat) minLat = lat
              sumLng += lng
            }
            // 가장 위(남쪽이 작은 값) → 상단
            let maxLat = -Infinity
            for (const [, lat] of pts) { if (lat > maxLat) maxLat = lat }
            return new naverMaps.LatLng(maxLat, sumLng / pts.length)
          }
          const topPoint = getTopCenter(feature.points)
          if (showLabels && topPoint) {
            const areaLabel = new naverMaps.Marker({
              position: topPoint,
              map,
              icon: {
                content: `<div class="loca-area-label"><svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#854F0B" stroke-width="2" stroke-linecap="round" stroke-dasharray="3 2"><rect x="4" y="4" width="16" height="16" rx="3"/></svg><span>${escapeHtml(feature.title)}</span></div>`,
                anchor: new naverMaps.Point(40, 24),
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
        const person = `<div class="loca-my-location">`
          + `<div class="loca-pulse"></div>`
          + `<div class="loca-direction" style="transform:rotate(${h}deg)">`
          + `<div class="loca-dir-arrow"></div>`
          + `</div>`
          + (levelEmoji.startsWith("/")
            ? `<div class="loca-level-emoji"><img src="${levelEmoji}" alt="" style="width:36px;height:36px;object-fit:contain"/></div>`
            : `<div class="loca-level-emoji"><span>${escapeHtml(levelEmoji)}</span></div>`)
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
  }, [characterStyle, checkedInIds, draftMode, draftPoints, features, levelEmoji, mapReady, myLocation, onFeatureTap, selectedFeatureId, showLabels, zoomLevel])

  // Focus
  useEffect(() => {
    const map = mapRef.current
    const naverMaps = getNaverMaps()
    if (!map || !focusPoint || !naverMaps) return
    try {
      map.setCenter(new naverMaps.LatLng(focusPoint.lat, focusPoint.lng))
      map.setZoom(focusPoint.zoom || 15)
    } catch (e) {
      console.warn("네이버 지도 포커스 실패:", e)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusPoint?.lat, focusPoint?.lng])

  // fitBounds - focus on densest cluster
  useEffect(() => {
    const map = mapRef.current
    const naverMaps = getNaverMaps()
    if (!map || !naverMaps || !mapReady) return
    if (lastFitTriggerRef.current === fitTrigger) return
    lastFitTriggerRef.current = fitTrigger
    // focusPoint가 있으면 fitBounds 대신 focusPoint 사용
    if (focusPoint) {
      try {
        map.setCenter(new naverMaps.LatLng(focusPoint.lat, focusPoint.lng))
        map.setZoom(focusPoint.zoom || 15)
      } catch { /* ignore */ }
      return
    }
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
