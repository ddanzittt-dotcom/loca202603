import { useEffect, useRef, useState, useImperativeHandle, forwardRef } from "react"
import { getDefaultFeatureStyle, getFeatureStyleColor, getFeatureStyleLineStyle } from "../lib/featureStyle"
import { triggerSelectionFeedback } from "../lib/haptics"
import { findPixelArt, pixelArtToSvgString } from "../lib/pixelEmojiCatalog"
import { getPublicMarkerDescriptor } from "../utils/publicMapMarkers"
import {
  createBadgePlaceMarkerContent,
  createFeatureTagContent,
  createRouteEndpointContent,
} from "./mapMarkerContent"

// ============================================================
// KakaoMap — NaverMap 의 카카오맵 SDK 이식본.
// props/동작은 NaverMap 과 동일하게 유지(드롭인 교체 목적).
// 좌표계 차이: 카카오는 zoom 대신 level(1~14, 낮을수록 확대)을 쓴다.
//   내부 임계값 로직은 기존 naver-zoom 기준을 그대로 쓰기 위해
//   level ↔ pseudo-zoom 변환(levelToZoom/zoomToLevel)으로 브리지한다.
// 마커: 카카오 Marker 는 HTML 을 못 받으므로 전부 CustomOverlay 로.
// ⚠️ 앵커/줌 임계값은 카카오 키 세팅 후 시각 테스트에서 미세조정 필요.
// ============================================================

const getKakaoMaps = () => window.kakao?.maps ?? null

// level(1~14) ↔ pseudo naver-zoom(~5~18) 브리지. 기존 임계값(BASE_ZOOM 등) 재사용용.
const levelToZoom = (level) => 19 - level
const zoomToLevel = (zoom) => Math.max(1, Math.min(14, Math.round(19 - zoom)))

const escapeHtml = (str) => {
  if (!str) return ""
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

const BASE_ZOOM = 15.5
const PLACE_LABEL_MIN_ZOOM = 15
const PUBLIC_CLUSTER_ONLY_MAX_ZOOM = 13
// 개인 지도: 이 줌 미만에서만 공격적 클러스터(뭉침). 낮출수록 더 멀리 줌아웃해야 통합됨.
const PERSONAL_CLUSTER_ONLY_MAX_ZOOM = 11
const VIEWPORT_CULL_FEATURE_THRESHOLD = 180
const zoomScale = (zoom) => {
  const s = Math.pow(1.17, zoom - BASE_ZOOM)
  return Math.max(0.34, Math.min(s, 1.04))
}

const createPublicPixelMarkerContent = ({ feature, isSelected, shouldShowLabel, showRouteBadge }) => {
  const descriptor = getPublicMarkerDescriptor(feature)
  const title = escapeHtml(feature.title || descriptor.label || "장소")
  const fallback = escapeHtml(descriptor.fallback || "•")
  const pixelArt = descriptor.pixelId ? findPixelArt(descriptor.pixelId) : null
  const pixelSvg = pixelArt ? pixelArtToSvgString(pixelArt, 24) : ""
  const icon = pixelSvg
    ? `<span class="loca-public-pixel-marker__pixel">${pixelSvg}</span>`
    : descriptor.assetSrc
    ? `<img class="loca-public-pixel-marker__image" src="${escapeHtml(descriptor.assetSrc)}" alt=""/>`
    : `<span class="loca-public-pixel-marker__fallback">${fallback}</span>`
  const classNames = [
    "loca-public-pixel-marker",
    `loca-public-pixel-marker--${descriptor.kind}`,
    `loca-public-pixel-marker--${descriptor.iconKey}`,
    isSelected ? "loca-public-pixel-marker--selected" : "",
    shouldShowLabel ? "" : "loca-public-pixel-marker--label-hidden",
  ].filter(Boolean).join(" ")
  const routeBadge = descriptor.kind === "route" && showRouteBadge
    ? `<span class="loca-public-pixel-marker__route-badge" aria-hidden="true">〰️</span>`
    : ""

  return (
    `<div class="${classNames}" role="button" aria-label="${title}" data-marker-key="${escapeHtml(descriptor.iconKey)}">`
      + `<div class="loca-public-pixel-marker__sprite" aria-hidden="true">${icon}${routeBadge}</div>`
      + `<div class="loca-public-pixel-marker__label"><span>${title}</span></div>`
    + `</div>`
  )
}

const createClusterMarkerContent = ({ count, publicStyle = false }) => {
  const size = publicStyle
    ? count <= 1 ? 30 : count <= 5 ? 32 : count <= 15 ? 36 : count <= 50 ? 40 : 46
    : count <= 5 ? 26 : count <= 15 ? 30 : count <= 50 ? 34 : 38
  const fontSize = publicStyle
    ? count <= 1 ? 11 : count <= 15 ? 12 : count <= 50 ? 13 : 14
    : count <= 5 ? 10 : count <= 15 ? 11 : count <= 50 ? 12 : 13
  const classNames = [
    "loca-cluster",
    publicStyle ? "loca-public-cluster" : "",
    publicStyle && count <= 1 ? "loca-public-cluster--solo" : "",
  ].filter(Boolean).join(" ")

  return {
    content: `<div class="${classNames}" style="width:${size}px;height:${size}px;font-size:${fontSize}px"><span>${count}</span></div>`,
    size,
  }
}

const createPlaceMarkerContent = ({ feature, isSelected, shouldShowLabel, markerStyle, showRouteBadge }) => {
  if (markerStyle === "pixel") {
    return createPublicPixelMarkerContent({ feature, isSelected, shouldShowLabel, showRouteBadge })
  }
  return createBadgePlaceMarkerContent({ feature, isSelected, shouldShowLabel })
}

const PIN_MODE_CURSOR = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Cpath fill='%23FF6B35' d='M12 2C8.13 2 5 5.13 5 9c0 5.2 6.2 11.7 6.5 12a.7.7 0 0 0 1 0C12.8 20.7 19 14.2 19 9c0-3.87-3.13-7-7-7z'/%3E%3Ccircle cx='12' cy='9' r='2.5' fill='%23FFF4EB'/%3E%3C/svg%3E\") 12 22, crosshair"
const DRAW_MODE_CURSOR = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 16 16'%3E%3Ccircle cx='8' cy='8' r='3' fill='%239C7BC8' stroke='%23FFFFFF' stroke-width='1'/%3E%3C/svg%3E\") 8 8, crosshair"
const DEFAULT_ROUTE_DRAW_COLOR = getDefaultFeatureStyle("route").color
const DEFAULT_AREA_DRAW_COLOR = getDefaultFeatureStyle("area").color

// 길 라벨 거리 병기용 — [[lng,lat], ...] haversine 합산
const routePointsLengthKm = (points) => {
  if (!Array.isArray(points) || points.length < 2) return null
  const R = 6371
  const toRad = (deg) => (deg * Math.PI) / 180
  let km = 0
  for (let i = 1; i < points.length; i += 1) {
    const [lng1, lat1] = points[i - 1]
    const [lng2, lat2] = points[i]
    if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) continue
    const dLat = toRad(lat2 - lat1)
    const dLng = toRad(lng2 - lng1)
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
    km += 2 * R * Math.asin(Math.min(1, Math.sqrt(s)))
  }
  return km > 0 ? km : null
}

const formatRouteLengthLabel = (km) => {
  if (!Number.isFinite(km) || km <= 0) return ""
  return km < 1 ? `${Math.round(km * 1000)}m` : `${km.toFixed(1)}km`
}

// HTML 문자열 → CustomOverlay content 엘리먼트 (+선택 클릭 바인딩)
const makeOverlayElement = (html, onClick) => {
  const wrap = document.createElement("div")
  wrap.innerHTML = html
  const el = wrap.firstElementChild || wrap
  if (onClick) {
    el.addEventListener("click", (event) => {
      event.stopPropagation()
      onClick()
    })
  }
  return el
}

export const KakaoMap = forwardRef(function KakaoMap(props, ref) {
  const {
    features, selectedFeatureId, draftPoints, draftMode, focusPoint, fitTrigger,
    onMapTap, onFeatureTap, showLabels = true, myLocation = null,
    markerStyle = "default", showRouteBadge = false,
    onViewportChange,
  } = props
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const layersRef = useRef([])
  const lastFitTriggerRef = useRef(0)
  const onMapTapRef = useRef(onMapTap)
  const onViewportChangeRef = useRef(onViewportChange)
  const ignoreMapTapUntilRef = useRef(0)
  const lastFeatureTapRef = useRef({ featureId: null, at: 0 })
  const [mapReady, setMapReady] = useState(false)
  const [zoomLevel, setZoomLevel] = useState(3) // 1=far, 2=mid, 3=close
  const [mapZoom, setMapZoom] = useState(14)
  const [viewportRenderVersion, setViewportRenderVersion] = useState(0)

  useImperativeHandle(ref, () => ({
    async capture() {
      const container = containerRef.current
      if (!container) return null
      // 카카오는 타일을 <img>로 렌더 → html2canvas 로 캡처
      const html2canvas = (await import("html2canvas")).default
      return html2canvas(container, { useCORS: true, allowTaint: true, scale: 2 })
    },
    zoomIn() {
      const map = mapRef.current
      if (map) map.setLevel(Math.max(1, map.getLevel() - 1), { animate: true })
    },
    zoomOut() {
      const map = mapRef.current
      if (map) map.setLevel(Math.min(14, map.getLevel() + 1), { animate: true })
    },
    // 조준점(리티클) 방식 그리기 — 현재 지도 중심 좌표
    getCenter() {
      const map = mapRef.current
      const c = map?.getCenter?.()
      if (!c) return null
      return { lat: c.getLat(), lng: c.getLng() }
    },
  }), [])

  useEffect(() => { onMapTapRef.current = onMapTap }, [onMapTap])
  useEffect(() => { onViewportChangeRef.current = onViewportChange }, [onViewportChange])

  const emitViewportChange = () => {
    const map = mapRef.current
    if (!map || typeof onViewportChangeRef.current !== "function") return
    const center = map.getCenter?.()
    const lat = typeof center?.getLat === "function" ? center.getLat() : Number(center?.lat)
    const lng = typeof center?.getLng === "function" ? center.getLng() : Number(center?.lng)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return
    onViewportChangeRef.current({
      center: { lat, lng },
      zoom: typeof map.getLevel === "function" ? levelToZoom(map.getLevel()) : undefined,
    })
  }

  // 드래프트 커서 (그리기 모드)
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

  // 마지막 점 → 고무줄 가이드선.
  // 마우스가 있으면 커서를 따라(주식 차트 선긋기), 터치 기기는 지도 중앙 기준 폴백.
  useEffect(() => {
    const map = mapRef.current
    const kakaoMaps = getKakaoMaps()
    if (!map || !kakaoMaps || !mapReady) return undefined
    const drawing = (draftMode === "route" || draftMode === "area") && draftPoints.length >= 1
    if (!drawing) return undefined

    const color = draftMode === "area" ? DEFAULT_AREA_DRAW_COLOR : DEFAULT_ROUTE_DRAW_COLOR
    const last = draftPoints[draftPoints.length - 1]
    const lastLatLng = new kakaoMaps.LatLng(last[1], last[0])
    const first = draftPoints[0]
    const firstLatLng = new kakaoMaps.LatLng(first[1], first[0])

    const guide = new kakaoMaps.Polyline({
      path: [lastLatLng, map.getCenter()],
      strokeColor: color, strokeWeight: 3, strokeStyle: "dot", strokeOpacity: 0.95,
    })
    guide.setMap(map)
    // 영역: 커서/중앙 → 첫 점(닫히는 변) 옅게 미리보기
    let closeGuide = null
    if (draftMode === "area" && draftPoints.length >= 2) {
      closeGuide = new kakaoMaps.Polyline({
        path: [map.getCenter(), firstLatLng],
        strokeColor: color, strokeWeight: 2, strokeStyle: "dot", strokeOpacity: 0.4,
      })
      closeGuide.setMap(map)
    }

    const updateTo = (target) => {
      guide.setPath([lastLatLng, target])
      if (closeGuide) closeGuide.setPath([target, firstLatLng])
    }
    // 마우스가 한 번이라도 움직이면 커서 추적으로 전환 (터치 기기는 발화 안 함)
    let usePointer = false
    const onMouseMove = (mouseEvent) => {
      if (!mouseEvent?.latLng) return
      usePointer = true
      updateTo(mouseEvent.latLng)
    }
    const onCenterChanged = () => {
      if (!usePointer) updateTo(map.getCenter())
    }
    kakaoMaps.event.addListener(map, "mousemove", onMouseMove)
    kakaoMaps.event.addListener(map, "center_changed", onCenterChanged)
    return () => {
      kakaoMaps.event.removeListener(map, "mousemove", onMouseMove)
      kakaoMaps.event.removeListener(map, "center_changed", onCenterChanged)
      guide.setMap(null)
      if (closeGuide) closeGuide.setMap(null)
    }
  }, [draftMode, draftPoints, mapReady])

  // SDK 로드 + 지도 init (마운트 시 1회)
  useEffect(() => {
    let cancelled = false
    let viewportFrame = 0
    const requestViewportRender = () => {
      if (cancelled) return
      if (viewportFrame) window.cancelAnimationFrame(viewportFrame)
      viewportFrame = window.requestAnimationFrame(() => {
        viewportFrame = 0
        if (!cancelled) {
          setViewportRenderVersion((value) => value + 1)
          emitViewportChange()
        }
      })
    }

    const initMap = () => {
      const kakaoMaps = getKakaoMaps()
      if (cancelled || !containerRef.current) return
      if (!kakaoMaps || typeof kakaoMaps.Map !== "function") {
        window.__kakaoMapReady = false
        return
      }
      try {
        const map = new kakaoMaps.Map(containerRef.current, {
          center: new kakaoMaps.LatLng(37.544, 127.056),
          level: zoomToLevel(14),
        })
        kakaoMaps.event.addListener(map, "click", (mouseEvent) => {
          if (Date.now() < ignoreMapTapUntilRef.current) return
          const ll = mouseEvent.latLng
          onMapTapRef.current?.({ lat: ll.getLat(), lng: ll.getLng() })
        })
        const applyZoomScale = () => {
          const zoom = levelToZoom(map.getLevel())
          const s = zoomScale(zoom)
          containerRef.current?.style.setProperty("--map-scale", s)
          containerRef.current?.setAttribute("data-zoom", zoom < 12 ? "far" : "near")
          const newLevel = zoom < 13 ? 1 : zoom < 15 ? 2 : 3
          if (!cancelled) {
            setZoomLevel(newLevel)
            setMapZoom(zoom)
          }
        }
        kakaoMaps.event.addListener(map, "zoom_changed", () => {
          applyZoomScale()
          requestViewportRender()
        })
        kakaoMaps.event.addListener(map, "idle", requestViewportRender)
        kakaoMaps.event.addListener(map, "dragend", requestViewportRender)
        applyZoomScale()
        mapRef.current = map
        if (!cancelled) setMapReady(true)
        requestViewportRender()
      } catch (e) {
        console.warn("카카오 지도 초기화 실패:", e)
        window.__kakaoMapReady = false
      }
    }

    window.loadKakaoMap?.((ok) => {
      if (ok) initMap()
    })

    return () => {
      cancelled = true
      if (viewportFrame) window.cancelAnimationFrame(viewportFrame)
      layersRef.current.forEach((layer) => {
        try { layer.setMap(null) } catch { /* ignore */ }
      })
      layersRef.current = []
      mapRef.current = null
    }
  }, [])

  // 컨테이너 리사이즈 대응
  useEffect(() => {
    if (!mapReady) return undefined
    const root = containerRef.current
    const map = mapRef.current
    if (!root || !map) return undefined

    let frame = 0
    let timer = 0
    const refreshMapSize = () => {
      if (frame) window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(() => {
        frame = 0
        const rect = root.getBoundingClientRect()
        if (rect.width < 1 || rect.height < 1) return
        const center = map.getCenter?.()
        try {
          map.relayout()
          if (center && typeof map.setCenter === "function") map.setCenter(center)
        } catch { /* best-effort */ }
      })
    }

    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(refreshMapSize) : null
    observer?.observe(root)
    refreshMapSize()
    timer = window.setTimeout(refreshMapSize, 250)

    return () => {
      observer?.disconnect()
      if (frame) window.cancelAnimationFrame(frame)
      if (timer) window.clearTimeout(timer)
    }
  }, [mapReady])

  // 피처 렌더링
  useEffect(() => {
    const map = mapRef.current
    const kakaoMaps = getKakaoMaps()
    if (!map || !kakaoMaps) return
    try {
      layersRef.current.forEach((layer) => layer.setMap(null))
      layersRef.current = []

      const toLatLng = (lat, lng) => new kakaoMaps.LatLng(lat, lng)
      const pointsToPath = (points) => points.map(([lng, lat]) => toLatLng(lat, lng))

      const pushOverlay = ({ lat, lng, html, onClick, xAnchor = 0.5, yAnchor = 0.5, zIndex }) => {
        const element = makeOverlayElement(html, onClick)
        const overlay = new kakaoMaps.CustomOverlay({
          position: toLatLng(lat, lng),
          content: element,
          xAnchor,
          yAnchor,
          zIndex,
          clickable: Boolean(onClick),
        })
        overlay.setMap(map)
        layersRef.current.push(overlay)
        return overlay
      }

      const getRepresentativePoint = (feature) => {
        if (feature?.representativeLocation?.lat && feature?.representativeLocation?.lng) {
          return { lat: feature.representativeLocation.lat, lng: feature.representativeLocation.lng }
        }
        if (feature?.lat && feature?.lng && !(feature.lat === 0 && feature.lng === 0)) {
          return { lat: feature.lat, lng: feature.lng }
        }
        return null
      }
      const getPointsCenter = (points) => {
        if (!points?.length) return null
        let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity
        points.forEach(([lng, lat]) => {
          minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat)
          minLng = Math.min(minLng, lng); maxLng = Math.max(maxLng, lng)
        })
        return { lat: (minLat + maxLat) / 2, lng: (minLng + maxLng) / 2 }
      }
      const getFeatureClusterPoint = (feature) => {
        if (feature.type === "pin") {
          if (!feature.lat || !feature.lng || (feature.lat === 0 && feature.lng === 0)) return null
          return { lat: feature.lat, lng: feature.lng }
        }
        const representative = getRepresentativePoint(feature)
        if (representative) return representative
        if (!Array.isArray(feature.points) || feature.points.length === 0) return null
        let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity
        feature.points.forEach(([lng, lat]) => {
          minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat)
          minLng = Math.min(minLng, lng); maxLng = Math.max(maxLng, lng)
        })
        if (![minLat, maxLat, minLng, maxLng].every(Number.isFinite)) return null
        return { lat: (minLat + maxLat) / 2, lng: (minLng + maxLng) / 2 }
      }
      const extendFeatureBounds = (bounds, feature) => {
        if (feature.type === "pin") {
          if (feature.lat && feature.lng && !(feature.lat === 0 && feature.lng === 0)) {
            bounds.extend(toLatLng(feature.lat, feature.lng))
          }
          return
        }
        const representative = getRepresentativePoint(feature)
        if (representative) { bounds.extend(toLatLng(representative.lat, representative.lng)); return }
        if (Array.isArray(feature.points) && feature.points.length > 0) {
          feature.points.forEach(([lng, lat]) => {
            if (Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))) bounds.extend(toLatLng(lat, lng))
          })
          return
        }
        const center = getFeatureClusterPoint(feature)
        if (center) bounds.extend(toLatLng(center.lat, center.lng))
      }
      const makeSelectHandler = (featureId) => () => {
        const now = Date.now()
        const lastTap = lastFeatureTapRef.current
        if (lastTap.featureId === featureId && now - lastTap.at < 250) return
        lastFeatureTapRef.current = { featureId, at: now }
        ignoreMapTapUntilRef.current = now + 300
        triggerSelectionFeedback()
        onFeatureTap?.(featureId)
      }
      const bindShapeSelection = (shape, featureId) => {
        kakaoMaps.event.addListener(shape, "click", makeSelectHandler(featureId))
      }

      const isPublicPixelMap = markerStyle === "pixel"
      const projection = map.getProjection?.()
      const container = containerRef.current
      const viewportWidth = container?.clientWidth || 0
      const viewportHeight = container?.clientHeight || 0
      const toContainerPoint = (lat, lng) => {
        if (!projection) return null
        try {
          const pt = projection.containerPointFromCoords(toLatLng(lat, lng))
          return { x: pt.x, y: pt.y }
        } catch {
          return null
        }
      }
      const shouldCullToViewport = features.length > VIEWPORT_CULL_FEATURE_THRESHOLD
        && projection && viewportWidth > 0 && viewportHeight > 0
      const viewportPadding = isPublicPixelMap ? 180 : 140
      const toProjectedFeature = (feature) => {
        const center = getFeatureClusterPoint(feature)
        if (!center) return null
        if (!shouldCullToViewport) return { feature, center }
        const point = toContainerPoint(center.lat, center.lng)
        if (!point) return { feature, center }
        const inViewport = (
          point.x >= -viewportPadding && point.x <= viewportWidth + viewportPadding
          && point.y >= -viewportPadding && point.y <= viewportHeight + viewportPadding
        )
        if (!inViewport && feature.id !== selectedFeatureId) return null
        return { feature, center, x: point.x, y: point.y }
      }

      const clusterableFeatures = features.map(toProjectedFeature).filter(Boolean)
      const shouldClusterOnly = isPublicPixelMap
        ? mapZoom <= PUBLIC_CLUSTER_ONLY_MAX_ZOOM
        : mapZoom < PERSONAL_CLUSTER_ONLY_MAX_ZOOM
      const clusterDist = shouldClusterOnly
        ? (isPublicPixelMap ? 110 : 96)
        : [40, 26, 0][zoomLevel - 1]

      let unclusteredFeatures = []
      let clusters = []

      if (clusterDist > 0 && clusterableFeatures.length > 0 && projection) {
        const pxFeatures = clusterableFeatures.map(({ feature, center, x, y }) => {
          if (Number.isFinite(x) && Number.isFinite(y)) return { feature, center, x, y, clustered: false }
          const point = toContainerPoint(center.lat, center.lng) || { x: 0, y: 0 }
          return { feature, center, x: point.x, y: point.y, clustered: false }
        })

        for (let i = 0; i < pxFeatures.length; i++) {
          if (pxFeatures[i].clustered) continue
          const group = [pxFeatures[i]]
          pxFeatures[i].clustered = true
          for (let j = i + 1; j < pxFeatures.length; j++) {
            if (pxFeatures[j].clustered) continue
            const dx = pxFeatures[i].x - pxFeatures[j].x
            const dy = pxFeatures[i].y - pxFeatures[j].y
            if (Math.sqrt(dx * dx + dy * dy) < clusterDist) {
              group.push(pxFeatures[j])
              pxFeatures[j].clustered = true
            }
          }
          if (group.length === 1) {
            if (shouldClusterOnly) {
              clusters.push({ lat: group[0].center.lat, lng: group[0].center.lng, count: 1, features: [group[0].feature] })
            } else {
              unclusteredFeatures.push(group[0].feature)
            }
          } else {
            const avgLat = group.reduce((s, p) => s + p.center.lat, 0) / group.length
            const avgLng = group.reduce((s, p) => s + p.center.lng, 0) / group.length
            clusters.push({ lat: avgLat, lng: avgLng, count: group.length, features: group.map((g) => g.feature) })
          }
        }
      } else {
        unclusteredFeatures = clusterableFeatures.map((item) => item.feature)
      }

      // 클러스터 마커
      clusters.forEach((cluster) => {
        const clusterMarker = createClusterMarkerContent({ count: cluster.count, publicStyle: isPublicPixelMap })
        const onClick = cluster.features.length === 1
          ? makeSelectHandler(cluster.features[0].id)
          : () => {
            const bounds = new kakaoMaps.LatLngBounds()
            cluster.features.forEach((f) => extendFeatureBounds(bounds, f))
            map.setBounds(bounds, 40, 40, 40, 40)
          }
        pushOverlay({
          lat: cluster.lat, lng: cluster.lng,
          html: clusterMarker.content, onClick,
          xAnchor: 0.5, yAnchor: 0.5,
        })
      })

      // 개별 피처
      unclusteredFeatures.forEach((feature) => {
        if (feature.type === "pin") {
          if (feature.lat === 0 && feature.lng === 0) return
          const isSelected = feature.id === selectedFeatureId
          const shouldShowPlaceLabel = isSelected || (showLabels && mapZoom >= PLACE_LABEL_MIN_ZOOM)
          const markerContent = createPlaceMarkerContent({
            feature, isSelected, shouldShowLabel: shouldShowPlaceLabel, markerStyle, showRouteBadge,
          })
          pushOverlay({
            lat: feature.lat, lng: feature.lng,
            html: markerContent, onClick: makeSelectHandler(feature.id),
            // 배지 핀은 꼬리표 없이 좌표 중심 앵커, 픽셀 마커는 기존 하단 앵커 유지
            xAnchor: 0.5, yAnchor: isPublicPixelMap ? 1 : 0.5, zIndex: isSelected ? 300 : 40,
          })
        } else if (feature.type === "route") {
          const routeColor = getFeatureStyleColor(feature, "route")
          const routeLineStyle = getFeatureStyleLineStyle(feature, "route")
          const routePoints = Array.isArray(feature.points) ? feature.points : []
          const routeRepresentative = getRepresentativePoint(feature)
          if (routePoints.length < 2 && routeRepresentative) {
            const isSelected = feature.id === selectedFeatureId
            pushOverlay({
              lat: routeRepresentative.lat, lng: routeRepresentative.lng,
              html: createFeatureTagContent({ feature, type: "route", color: routeColor, isSelected }),
              onClick: makeSelectHandler(feature.id),
              xAnchor: 0.5, yAnchor: 1, zIndex: isSelected ? 260 : 60,
            })
            return
          }
          const isRouteSelected = feature.id === selectedFeatureId
          // 흰 케이싱을 먼저 깔아 지도 도로와 구분되는 "그려진 선"으로 만든다
          const routeCasing = new kakaoMaps.Polyline({
            path: pointsToPath(routePoints),
            strokeColor: "#FFFFFF",
            strokeWeight: isRouteSelected ? 10 : 9,
            strokeOpacity: 0.85,
            strokeStyle: "solid",
          })
          routeCasing.setMap(map)
          bindShapeSelection(routeCasing, feature.id)
          layersRef.current.push(routeCasing)
          const polyline = new kakaoMaps.Polyline({
            path: pointsToPath(routePoints),
            strokeColor: routeColor,
            strokeWeight: isRouteSelected ? 6 : 5,
            strokeOpacity: isRouteSelected ? 0.98 : 0.92,
            strokeStyle: routeLineStyle,
          })
          polyline.setMap(map)
          bindShapeSelection(polyline, feature.id)
          layersRef.current.push(polyline)
          // 시작점(흰 채움)·끝점(색 채움) 마커 — DESIGN.md §0.5
          const [startLng, startLat] = routePoints[0]
          const [endLng, endLat] = routePoints[routePoints.length - 1]
          pushOverlay({
            lat: startLat, lng: startLng,
            html: createRouteEndpointContent({ color: routeColor, kind: "start" }),
            xAnchor: 0.5, yAnchor: 0.5, zIndex: 45,
          })
          pushOverlay({
            lat: endLat, lng: endLng,
            html: createRouteEndpointContent({ color: routeColor, kind: "end" }),
            xAnchor: 0.5, yAnchor: 0.5, zIndex: 45,
          })
          const hitArea = new kakaoMaps.Polyline({
            path: pointsToPath(feature.points),
            strokeColor: routeColor, strokeWeight: 24, strokeOpacity: 0.05,
          })
          hitArea.setMap(map)
          bindShapeSelection(hitArea, feature.id)
          layersRef.current.push(hitArea)

          // 방향 화살표 (중간 지점마다)
          if (routePoints.length >= 2) {
            const step = Math.max(1, Math.floor(routePoints.length / 4))
            for (let pi = step; pi < routePoints.length; pi += step) {
              const [lng1, lat1] = routePoints[pi - 1]
              const [lng2, lat2] = routePoints[pi]
              const angle = Math.atan2(lat2 - lat1, lng2 - lng1) * (180 / Math.PI) - 90
              pushOverlay({
                lat: lat2, lng: lng2,
                html: `<div class="loca-route-arrow" style="transform:rotate(${angle}deg)"><svg width="12" height="12" viewBox="0 0 10 10" fill="${routeColor}" opacity="0.85"><polygon points="5,0 10,10 0,10" stroke="#FFFFFF" stroke-width="1"/></svg></div>`,
                xAnchor: 0.5, yAnchor: 0.5,
              })
            }
          }

          const routeLabelPoint = getPointsCenter(routePoints)
          if (showLabels && routeLabelPoint) {
            pushOverlay({
              lat: routeLabelPoint.lat, lng: routeLabelPoint.lng,
              html: createFeatureTagContent({
                feature, type: "route", color: routeColor, isSelected: isRouteSelected,
                metaText: formatRouteLengthLabel(routePointsLengthKm(routePoints)),
              }),
              onClick: makeSelectHandler(feature.id),
              xAnchor: 0.5, yAnchor: 1, zIndex: isRouteSelected ? 250 : 55,
            })
          }
        } else if (feature.type === "area") {
          const areaColor = getFeatureStyleColor(feature, "area")
          const areaLineStyle = getFeatureStyleLineStyle(feature, "area")
          const isAreaSelected = feature.id === selectedFeatureId
          // 흰 케이싱 폴리곤을 먼저 깔고 그 위에 본 테두리를 그린다
          const areaCasing = new kakaoMaps.Polygon({
            path: pointsToPath(feature.points),
            strokeColor: "#FFFFFF",
            strokeWeight: 5.5,
            strokeOpacity: 0.85,
            strokeStyle: "solid",
            fillColor: areaColor,
            fillOpacity: 0,
          })
          areaCasing.setMap(map)
          bindShapeSelection(areaCasing, feature.id)
          layersRef.current.push(areaCasing)
          const polygon = new kakaoMaps.Polygon({
            path: pointsToPath(feature.points),
            strokeColor: areaColor,
            strokeWeight: isAreaSelected ? 3.5 : 2.5,
            strokeOpacity: isAreaSelected ? 1 : 0.9,
            strokeStyle: areaLineStyle,
            fillColor: areaColor,
            fillOpacity: isAreaSelected ? 0.28 : 0.18,
          })
          polygon.setMap(map)
          bindShapeSelection(polygon, feature.id)
          layersRef.current.push(polygon)
          const hitArea = new kakaoMaps.Polyline({
            path: [...pointsToPath(feature.points), pointsToPath(feature.points)[0]],
            strokeColor: areaColor, strokeWeight: 24, strokeOpacity: 0.05,
          })
          hitArea.setMap(map)
          bindShapeSelection(hitArea, feature.id)
          layersRef.current.push(hitArea)

          const areaLabelPoint = getPointsCenter(feature.points)
          if (showLabels && areaLabelPoint) {
            pushOverlay({
              lat: areaLabelPoint.lat, lng: areaLabelPoint.lng,
              html: createFeatureTagContent({ feature, type: "area", color: areaColor, isSelected: isAreaSelected }),
              onClick: makeSelectHandler(feature.id),
              xAnchor: 0.5, yAnchor: 1, zIndex: isAreaSelected ? 250 : 50,
            })
          }
        }
      })

      // 드래프트(그리는 중) 경로/영역
      if (draftPoints.length > 1) {
        if (draftMode === "area" && draftPoints.length > 2) {
          const draft = new kakaoMaps.Polygon({
            path: pointsToPath(draftPoints),
            strokeColor: DEFAULT_AREA_DRAW_COLOR, strokeWeight: 4, strokeStyle: "shortdash",
            strokeOpacity: 1, fillColor: DEFAULT_AREA_DRAW_COLOR, fillOpacity: 0.22,
          })
          draft.setMap(map)
          layersRef.current.push(draft)
        } else {
          const draft = new kakaoMaps.Polyline({
            path: pointsToPath(draftPoints),
            strokeColor: DEFAULT_ROUTE_DRAW_COLOR, strokeWeight: 4, strokeStyle: "shortdash", strokeOpacity: 1,
          })
          draft.setMap(map)
          layersRef.current.push(draft)
        }
      }

      // 드래프트 꼭짓점 점 — 탭한(찍은) 자리 표시, 첫 점은 강조(영역 닫기 기준점)
      if ((draftMode === "route" || draftMode === "area") && draftPoints.length > 0) {
        const dotColor = draftMode === "area" ? DEFAULT_AREA_DRAW_COLOR : DEFAULT_ROUTE_DRAW_COLOR
        draftPoints.forEach(([dLng, dLat], index) => {
          const isFirst = index === 0
          const html = `<div class="loca-draft-dot${isFirst ? " loca-draft-dot--first" : ""}" style="--draft-dot:${dotColor}">${isFirst ? "<span></span>" : ""}</div>`
          pushOverlay({ lat: dLat, lng: dLng, html, xAnchor: 0.5, yAnchor: 0.5, zIndex: 8000 })
        })
      }

      // 내 위치
      if (myLocation) {
        const h = myLocation.heading ?? 0
        const person = `<div class="loca-my-location">`
          + `<div class="loca-pulse"></div>`
          + `<div class="loca-direction" style="transform:rotate(${h}deg)"><div class="loca-dir-arrow"></div></div>`
          + `<div class="loca-my-location__dot"></div>`
          + `</div>`
        pushOverlay({ lat: myLocation.lat, lng: myLocation.lng, html: person, xAnchor: 0.5, yAnchor: 0.5, zIndex: 9999 })
      }
    } catch (e) {
      console.warn("카카오 지도 레이어 업데이트 실패:", e)
    }
  }, [draftMode, draftPoints, features, mapReady, mapZoom, markerStyle, myLocation, onFeatureTap, selectedFeatureId, showLabels, showRouteBadge, viewportRenderVersion, zoomLevel])

  // 포커스 이동 (offsetX/offsetY: 정보창·시트가 가리지 않는 영역으로 중심 보정 — px)
  useEffect(() => {
    const map = mapRef.current
    const kakaoMaps = getKakaoMaps()
    if (!map || !focusPoint || !kakaoMaps) return
    try {
      map.setCenter(new kakaoMaps.LatLng(focusPoint.lat, focusPoint.lng))
      map.setLevel(zoomToLevel(focusPoint.zoom || 15))
      const offsetX = Number(focusPoint.offsetX) || 0
      const offsetY = Number(focusPoint.offsetY) || 0
      if ((offsetX || offsetY) && typeof map.panBy === "function") map.panBy(offsetX, offsetY)
      emitViewportChange()
    } catch (e) {
      console.warn("카카오 지도 포커스 실패:", e)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusPoint?.lat, focusPoint?.lng, focusPoint?.offsetX, focusPoint?.offsetY])

  // fitBounds — 가장 밀집한 클러스터에 맞춤
  useEffect(() => {
    const map = mapRef.current
    const kakaoMaps = getKakaoMaps()
    if (!map || !kakaoMaps || !mapReady) return
    if (lastFitTriggerRef.current === fitTrigger) return
    lastFitTriggerRef.current = fitTrigger
    if (focusPoint) {
      try {
        map.setCenter(new kakaoMaps.LatLng(focusPoint.lat, focusPoint.lng))
        map.setLevel(zoomToLevel(focusPoint.zoom || 15))
      } catch { /* ignore */ }
      return
    }
    try {
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
        const bounds = new kakaoMaps.LatLngBounds()
        coords.forEach((c) => bounds.extend(new kakaoMaps.LatLng(c.lat, c.lng)))
        map.setBounds(bounds, 28, 28, 28, 28)
      } else {
        const radius = 0.03
        let bestIdx = 0, bestCount = 0
        coords.forEach((c, i) => {
          let count = 0
          coords.forEach((d) => {
            if (Math.abs(c.lat - d.lat) < radius && Math.abs(c.lng - d.lng) < radius) count++
          })
          if (count > bestCount) { bestCount = count; bestIdx = i }
        })
        const center = coords[bestIdx]
        const bounds = new kakaoMaps.LatLngBounds()
        coords.forEach((c) => {
          if (Math.abs(c.lat - center.lat) < radius && Math.abs(c.lng - center.lng) < radius) {
            bounds.extend(new kakaoMaps.LatLng(c.lat, c.lng))
          }
        })
        map.setBounds(bounds, 28, 28, 28, 28)
      }
    } catch (e) {
      console.warn("카카오 지도 fitBounds 실패:", e)
    }
  }, [draftPoints, features, fitTrigger, focusPoint, mapReady])

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
