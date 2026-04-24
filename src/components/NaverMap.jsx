import { useEffect, useRef, useState, useImperativeHandle, forwardRef } from "react"
import { getPinIcon, emojiToCategory, isMappedPinEmoji } from "../data/pinIcons"
import { getFeatureStyleColor, getFeatureStyleLineStyle, FEATURE_LINE_STYLE_SHORT_DASH, FEATURE_LINE_STYLE_SHORT_DOT } from "../lib/featureStyle"

const getNaverMaps = () => window.naver?.maps ?? null

const escapeHtml = (str) => {
  if (!str) return ""
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

const getLineDashArrayAttr = (lineStyle) => {
  if (lineStyle === FEATURE_LINE_STYLE_SHORT_DOT) return "2 3"
  if (lineStyle === FEATURE_LINE_STYLE_SHORT_DASH) return "4 3"
  return null
}

const BASE_ZOOM = 14
const zoomScale = (zoom) => {
  const s = Math.pow(1.12, zoom - BASE_ZOOM)
  return Math.max(0.3, Math.min(s, 1.4))
}

const PIN_MODE_CURSOR = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Cpath fill='%23FF6B35' d='M12 2C8.13 2 5 5.13 5 9c0 5.2 6.2 11.7 6.5 12a.7.7 0 0 0 1 0C12.8 20.7 19 14.2 19 9c0-3.87-3.13-7-7-7z'/%3E%3Ccircle cx='12' cy='9' r='2.5' fill='%23FFF4EB'/%3E%3C/svg%3E\") 12 22, crosshair"
const DRAW_MODE_CURSOR = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 16 16'%3E%3Ccircle cx='8' cy='8' r='3' fill='%230F6E56' stroke='%23FFFFFF' stroke-width='1'/%3E%3C/svg%3E\") 8 8, crosshair"

const LOCA_DARK_STYLE_ID = "90019b0b-7cdc-4f96-baa6-438d871a37d5"

export const NaverMap = forwardRef(function NaverMap({ features, selectedFeatureId, draftPoints, draftMode, focusPoint, fitTrigger, onMapTap, onFeatureTap, showLabels = true, myLocation = null, characterStyle = "m3", levelEmoji = "?쪡", checkedInIds = null, isEventMap = false }, ref) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const layersRef = useRef([])
  const lastFitTriggerRef = useRef(0)
  const onMapTapRef = useRef(onMapTap)
  const ignoreMapTapUntilRef = useRef(0)
  const lastFeatureTapRef = useRef({ featureId: null, at: 0 })
  const isEventMapRef = useRef(isEventMap)
  isEventMapRef.current = isEventMap
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

  useEffect(() => {
    const root = containerRef.current
    if (!root) return undefined

    const hiddenNodes = new Set()
    const isEditorMode = typeof onMapTap === "function"
    if (!isEditorMode) return undefined

    const CONTROL_CLASS_RE = /(btn_|zoom|mylct|flick|control|draw|tool|compass|locate|location|map_btn|ctl)/i

    const hideNativeControls = () => {
      const rootRect = root.getBoundingClientRect()
      const candidates = root.querySelectorAll("[class], button, a, div")
      candidates.forEach((node) => {
        const el = node instanceof HTMLElement ? node : null
        if (!el) return
        const className = typeof el.className === "string" ? el.className : (el.getAttribute("class") || "")
        if (!className || className.includes("loca-")) return
        if (!CONTROL_CLASS_RE.test(className)) return

        const style = window.getComputedStyle(el)
        if (style.position !== "absolute" && style.position !== "fixed") return

        const rect = el.getBoundingClientRect()
        if (rect.width <= 0 || rect.height <= 0) return
        const onRightRail = rect.left >= (rootRect.right - 140)
        const withinMap = rect.top >= (rootRect.top - 6) && rect.bottom <= (rootRect.bottom + 6)
        const compactControl = rect.width <= 120 && rect.height <= 420
        if (!onRightRail || !withinMap || !compactControl) return

        el.style.setProperty("display", "none", "important")
        el.setAttribute("data-loca-hidden-native-control", "1")
        hiddenNodes.add(el)
      })
    }

    hideNativeControls()
    const observer = new MutationObserver(() => hideNativeControls())
    observer.observe(root, { childList: true, subtree: true })
    const timerId = window.setInterval(hideNativeControls, 800)

    return () => {
      observer.disconnect()
      window.clearInterval(timerId)
      hiddenNodes.forEach((el) => {
        if (el.getAttribute("data-loca-hidden-native-control") === "1") {
          el.style.removeProperty("display")
          el.removeAttribute("data-loca-hidden-native-control")
        }
      })
      hiddenNodes.clear()
    }
  }, [onMapTap, mapReady])

  useEffect(() => {
    const root = containerRef.current
    if (!root) return undefined

    const nextCursor = draftMode === "pin"
      ? PIN_MODE_CURSOR
      : (draftMode === "route" || draftMode === "area")
        ? DRAW_MODE_CURSOR
        : null

    const applyCursor = (eventTarget = null) => {
      const targets = eventTarget
        ? [root, eventTarget]
        : [root, ...root.querySelectorAll("canvas, div, svg, path, span, img")]
      if (!nextCursor) {
        targets.forEach((el) => {
          if (el.getAttribute("data-loca-draft-cursor") === "1") {
            el.style.removeProperty("cursor")
            el.removeAttribute("data-loca-draft-cursor")
          }
        })
        return
      }
      targets.forEach((el) => {
        el.style.setProperty("cursor", nextCursor, "important")
        el.setAttribute("data-loca-draft-cursor", "1")
      })
    }

    applyCursor()
    const observer = new MutationObserver(() => applyCursor())
    observer.observe(root, { childList: true, subtree: true })
    const handleMouseMove = (event) => {
      const target = event.target instanceof HTMLElement ? event.target : null
      if (target) applyCursor(target)
    }
    root.addEventListener("mousemove", handleMouseMove, true)

    return () => {
      observer.disconnect()
      root.removeEventListener("mousemove", handleMouseMove, true)
      const targets = [root, ...root.querySelectorAll("canvas, div, svg, path, span, img")]
      targets.forEach((el) => {
        if (el.getAttribute("data-loca-draft-cursor") === "1") {
          el.style.removeProperty("cursor")
          el.removeAttribute("data-loca-draft-cursor")
        }
      })
    }
  }, [draftMode])

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
        const mapOptions = {
          center: new naverMaps.LatLng(37.544, 127.056),
          zoom: 14,
          zoomControl: false,
          scaleControl: false,
          logoControl: true,
          logoControlOptions: { position: naverMaps.Position.BOTTOM_LEFT },
          mapDataControl: false,
        }
        if (isEventMapRef.current) {
          mapOptions.gl = true
          mapOptions.customStyleId = LOCA_DARK_STYLE_ID
        }
        const map = new naverMaps.Map(containerRef.current, mapOptions)
        naverMaps.Event.addListener(map, "click", (e) => {
          if (Date.now() < ignoreMapTapUntilRef.current) return
          onMapTapRef.current?.({ lat: e.coord.lat(), lng: e.coord.lng() })
        })
        const applyZoomScale = () => {
          const zoom = map.getZoom()
          const s = zoomScale(zoom)
          containerRef.current?.style.setProperty("--map-scale", s)
          containerRef.current?.setAttribute("data-zoom", zoom < 12 ? "far" : "near")
          // 3?④퀎 以??덈꺼
          const newLevel = zoom < 13 ? 1 : zoom < 16 ? 2 : 3
          if (!cancelled) setZoomLevel(newLevel)
        }
        naverMaps.Event.addListener(map, "zoom_changed", applyZoomScale)
        applyZoomScale()
        mapRef.current = map
        if (!cancelled) setMapReady(true)
      } catch (e) {
        console.warn("?ㅼ씠踰?吏??珥덇린???ㅽ뙣:", e)
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
          console.warn("?ㅼ씠踰?吏???덉씠???뺣━ ?ㅽ뙣:", error)
        }
      })
      layersRef.current = []
      if (mapRef.current) {
        try {
          mapRef.current.destroy()
        } catch (error) {
          console.warn("?ㅼ씠踰?吏???몄뒪?댁뒪 ?뺣━ ?ㅽ뙣:", error)
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

      // ??? ?대윭?ㅽ꽣留?(以뚯븘??以묎컙 以뚯뿉?쒕쭔) ???
      const pins = features.filter((f) => f.type === "pin" && f.lat && f.lng && !(f.lat === 0 && f.lng === 0))
      const nonPins = features.filter((f) => f.type !== "pin")
      const clusterDist = [40, 30, 0][zoomLevel - 1] // px ?⑥쐞 嫄곕━

      let clusteredPins = []
      let clusters = []

      if (clusterDist > 0 && pins.length > 1) {
        // 좌표를 화면 픽셀로 변환
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
          // ?대윭?ㅽ꽣 ????以뚯씤
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
          const pinColor = getFeatureStyleColor(feature, "pin")
          const isChecked = checkedInIds && checkedInIds.has(feature.id)
          const checkBadge = isChecked ? `<div class="loca-pin-check">??/div>` : ""
          const emoji = typeof feature.emoji === "string" ? feature.emoji.trim() : ""
          const explicitCategory = typeof feature.category === "string" ? feature.category.trim() : ""
          const mappedCategory = isMappedPinEmoji(emoji) ? emojiToCategory(emoji) : ""
          const catId = explicitCategory || mappedCategory || emojiToCategory(feature.emoji)
          const iconData = getPinIcon(catId)
          const hasCustomEmoji = !explicitCategory
            && !mappedCategory
            && emoji
            && emoji.length <= 4
            && !emoji.includes("/")

          // ????????? ???
          const dotSizes = [8, 10, 14]
          const dotBorders = [1.5, 2, 2.5]
          const dotSize = dotSizes[zoomLevel - 1]
          const dotBorder = dotBorders[zoomLevel - 1]
          const showBadge = zoomLevel >= 2
          const baseLabelZoomThreshold = isEventMap ? 2 : 3
          const expandedLabelZoomThreshold = Math.max(1, baseLabelZoomThreshold - 2)
          const showPinLabel = showLabels && zoomLevel >= expandedLabelZoomThreshold

          const badgeInnerHtml = hasCustomEmoji
            ? `<span class="loca-pin-badge__emoji">${escapeHtml(emoji)}</span>`
            : `<img src="/icons/pins/${catId}.svg" width="12" height="12" alt=""/>`
          const badgeHtml = showBadge
            ? `<div class="loca-pin-badge" style="background:${iconData.bg}">${badgeInnerHtml}</div>`
            : ""
          const dotStyle = `width:${dotSize}px;height:${dotSize}px;border-width:${dotBorder}px;background:${pinColor};${isSelected ? "border-color:#2D4A3E" : ""}`
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
          const routeColor = getFeatureStyleColor(feature, "route")
          const routeLineStyle = getFeatureStyleLineStyle(feature, "route")
          const polyline = new naverMaps.Polyline({
            path: pointsToPath(feature.points),
            strokeColor: routeColor,
            strokeWeight: feature.id === selectedFeatureId ? 4.5 : 3.5,
            strokeOpacity: 0.5,
            strokeStyle: routeLineStyle,
            strokeLineCap: "round",
            strokeLineJoin: "round",
            clickable: true,
            map,
          })
          bindFeatureSelection(polyline, feature.id)
          layersRef.current.push(polyline)
          const hitArea = new naverMaps.Polyline({
            path: pointsToPath(feature.points),
            strokeColor: routeColor,
            strokeWeight: 24,
            strokeOpacity: 0.05,
            clickable: true,
            map,
          })
          bindFeatureSelection(hitArea, feature.id)
          layersRef.current.push(hitArea)

          // 諛⑺뼢 ?붿궡??(以묎컙 吏?먮쭏??
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
                  content: `<div class="loca-route-arrow" style="transform:rotate(${angle}deg)"><svg width="10" height="10" viewBox="0 0 10 10" fill="${routeColor}" opacity="0.45"><polygon points="5,0 10,10 0,10"/></svg></div>`,
                  size: new naverMaps.Size(10, 10),
                  anchor: new naverMaps.Point(5, 5),
                },
              })
              layersRef.current.push(arrowMarker)
            }
          }

          // 寃쎈줈 ?쇰꺼
          const midpoint = feature.points[Math.floor(feature.points.length / 2)]
          if (showLabels && midpoint) {
            const routeLabel = new naverMaps.Marker({
              position: toLatLng(midpoint[1], midpoint[0]),
              map,
              icon: {
                content: `<div class="loca-route-label"><svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="${routeColor}" stroke-width="2" stroke-linecap="round"><path d="M4 19L10 7L16 14L20 5"/></svg><span style="color:${routeColor}">${escapeHtml(feature.title)}</span></div>`,
                anchor: new naverMaps.Point(0, 14),
              },
              clickable: true,
            })
            bindFeatureSelection(routeLabel, feature.id)
            layersRef.current.push(routeLabel)
          }
        } else if (feature.type === "area") {
          const areaColor = getFeatureStyleColor(feature, "area")
          const areaLineStyle = getFeatureStyleLineStyle(feature, "area")
          const areaDashArray = getLineDashArrayAttr(areaLineStyle)
          const polygon = new naverMaps.Polygon({
            paths: [pointsToPath(feature.points)],
            strokeColor: areaColor,
            strokeWeight: feature.id === selectedFeatureId ? 3.5 : 2.5,
            strokeOpacity: feature.id === selectedFeatureId ? 0.8 : 0.45,
            strokeStyle: areaLineStyle,
            fillColor: areaColor,
            fillOpacity: feature.id === selectedFeatureId ? 0.15 : 0.08,
            map,
          })
          bindFeatureSelection(polygon, feature.id)
          layersRef.current.push(polygon)
          // 嫄곗쓽 蹂댁씠吏 ?딅뒗 ?볦? ?덊듃 ?곸뿭 (?멸낸???대┃ 媛먮룄 媛쒖꽑)
          const hitArea = new naverMaps.Polyline({
            path: [...pointsToPath(feature.points), pointsToPath(feature.points)[0]],
            strokeColor: areaColor,
            strokeWeight: 24,
            strokeOpacity: 0.05,
            clickable: true,
            map,
          })
          bindFeatureSelection(hitArea, feature.id)
          layersRef.current.push(hitArea)

          // 援ъ뿭 ?쇰꺼 ???곷떒 以묒븰 諛곗튂
          const getTopCenter = (pts) => {
            let minLat = Infinity, sumLng = 0
            for (const [lng, lat] of pts) {
              if (lat < minLat) minLat = lat
              sumLng += lng
            }
            // 媛?????⑥そ???묒? 媛? ???곷떒
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
                content: `<div class="loca-area-label"><svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="${areaColor}" stroke-width="2" stroke-linecap="round"${areaDashArray ? ` stroke-dasharray="${areaDashArray}"` : ""}><rect x="4" y="4" width="16" height="16" rx="3"/></svg><span style="color:${areaColor}">${escapeHtml(feature.title)}</span></div>`,
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
      console.warn("?ㅼ씠踰?吏???덉씠???낅뜲?댄듃 ?ㅽ뙣:", e)
    }
  }, [characterStyle, checkedInIds, draftMode, draftPoints, features, levelEmoji, isEventMap, mapReady, myLocation, onFeatureTap, selectedFeatureId, showLabels, zoomLevel])

  // Focus
  useEffect(() => {
    const map = mapRef.current
    const naverMaps = getNaverMaps()
    if (!map || !focusPoint || !naverMaps) return
    try {
      map.setCenter(new naverMaps.LatLng(focusPoint.lat, focusPoint.lng))
      map.setZoom(focusPoint.zoom || 15)
    } catch (e) {
      console.warn("?ㅼ씠踰?吏???ъ빱???ㅽ뙣:", e)
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
    // focusPoint媛 ?덉쑝硫?fitBounds ???focusPoint ?ъ슜
    if (focusPoint) {
      try {
        map.setCenter(new naverMaps.LatLng(focusPoint.lat, focusPoint.lng))
        map.setZoom(focusPoint.zoom || 15)
      } catch { /* ignore */ }
      return
    }
    try {
      // Collect all coordinates (誘몄꽕??0,0 ? ?쒖쇅)
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
      console.warn("?ㅼ씠踰?吏??fitBounds ?ㅽ뙣:", e)
    }
  }, [draftPoints, features, fitTrigger, focusPoint, mapReady])

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


