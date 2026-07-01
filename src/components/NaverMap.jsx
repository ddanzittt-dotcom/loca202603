import { useEffect, useRef, useState, useImperativeHandle, forwardRef } from "react"
import { getDefaultFeatureStyle, getFeatureStyleColor, getFeatureStyleLineStyle, FEATURE_LINE_STYLE_SHORT_DASH, FEATURE_LINE_STYLE_SHORT_DOT } from "../lib/featureStyle"
import { triggerSelectionFeedback } from "../lib/haptics"
import { findPixelArt, pixelArtToSvgString } from "../lib/pixelEmojiCatalog"
import { getPublicMarkerDescriptor } from "../utils/publicMapMarkers"
import { getDefaultMarkerEmojiForFeature, resolvePlaceMarkerEmoji } from "./FeatureEmoji"

const getNaverMaps = () => window.naver?.maps ?? null

const escapeHtml = (str) => {
  if (!str) return ""
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

const isEmojiCodePoint = (codePoint) => (
  (codePoint >= 0x1F000 && codePoint <= 0x1FAFF) ||
  (codePoint >= 0x2600 && codePoint <= 0x27BF)
)

const stripEmojiFromLabel = (value, fallback = "이름 없음") => {
  let stripped = ""
  for (const char of String(value || "")) {
    const codePoint = char.codePointAt(0)
    if (codePoint === 0x200D || codePoint === 0xFE0E || codePoint === 0xFE0F) continue
    if (isEmojiCodePoint(codePoint)) continue
    stripped += char
  }
  const text = stripped
    .replace(/\s+/g, " ")
    .trim()
  return text || fallback
}

const getLineDashArrayAttr = (lineStyle) => {
  if (lineStyle === FEATURE_LINE_STYLE_SHORT_DOT) return "2 3"
  if (lineStyle === FEATURE_LINE_STYLE_SHORT_DASH) return "4 3"
  return null
}

const BASE_ZOOM = 15.5
const PLACE_LABEL_MIN_ZOOM = 15
const PLACE_MARKER_EMOJI_SIZE = 28
const PUBLIC_CLUSTER_ONLY_MAX_ZOOM = 13
const PERSONAL_CLUSTER_ONLY_MAX_ZOOM = PLACE_LABEL_MIN_ZOOM
const VIEWPORT_CULL_FEATURE_THRESHOLD = 180
const zoomScale = (zoom) => {
  const s = Math.pow(1.17, zoom - BASE_ZOOM)
  return Math.max(0.34, Math.min(s, 1.04))
}

const getPixelArtHtml = (pixelId, fallbackEmoji) => {
  const art = findPixelArt(pixelId)
  return art
    ? `<span class="loca-place-marker__pixel">${pixelArtToSvgString(art, PLACE_MARKER_EMOJI_SIZE)}</span>`
    : `<span class="loca-place-marker__unicode">${escapeHtml(fallbackEmoji || getDefaultMarkerEmojiForFeature())}</span>`
}

const getPlaceMarkerEmojiHtml = (feature) => {
  const descriptor = resolvePlaceMarkerEmoji(feature)
  if (descriptor.kind === "pixel") {
    return getPixelArtHtml(descriptor.value, getDefaultMarkerEmojiForFeature(feature))
  }
  if (descriptor.kind === "photo") {
    const safeUrl = escapeHtml(descriptor.value || "")
    return safeUrl
      ? `<img class="loca-place-marker__photo" src="${safeUrl}" width="${PLACE_MARKER_EMOJI_SIZE}" height="${PLACE_MARKER_EMOJI_SIZE}" alt=""/>`
      : `<span class="loca-place-marker__unicode">${escapeHtml(getDefaultMarkerEmojiForFeature(feature))}</span>`
  }

  return `<span class="loca-place-marker__unicode">${escapeHtml(descriptor.value || getDefaultMarkerEmojiForFeature(feature))}</span>`
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

const createRouteLabelContent = ({ feature, color, isSelected = false }) => (
  `<div class="loca-map-label-anchor">`
    + `<div class="loca-route-label ${isSelected ? "is-selected" : ""}">`
      + `<span style="color:${color}">${escapeHtml(stripEmojiFromLabel(feature.title, "길"))}</span>`
    + `</div>`
  + `</div>`
)

const createAreaLabelContent = ({ feature, color, dashArray, isSelected = false }) => {
  void dashArray
  return (
    `<div class="loca-map-label-anchor">`
      + `<div class="loca-area-label ${isSelected ? "is-selected" : ""}">`
        + `<span style="color:${color}">${escapeHtml(stripEmojiFromLabel(feature.title, "영역"))}</span>`
      + `</div>`
    + `</div>`
  )
}

const createPlaceMarkerContent = ({ feature, isSelected, shouldShowLabel, markerStyle, showRouteBadge }) => {
  if (markerStyle === "pixel") {
    return createPublicPixelMarkerContent({ feature, isSelected, shouldShowLabel, showRouteBadge })
  }
  const classNames = [
    "loca-place-marker",
    isSelected ? "loca-place-marker--selected" : "",
    shouldShowLabel ? "" : "loca-place-marker--label-hidden",
  ].filter(Boolean).join(" ")
  const title = escapeHtml(feature.title || "장소")

  return (
    `<div class="loca-place-marker-anchor">`
      + `<div class="${classNames}" role="button" aria-label="${title}">`
        + `<div class="loca-place-marker__emoji" aria-hidden="true">${getPlaceMarkerEmojiHtml(feature)}</div>`
        + `<div class="loca-place-marker__label">${title}</div>`
      + `</div>`
    + `</div>`
  )
}

const PIN_MODE_CURSOR = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Cpath fill='%23FF6B35' d='M12 2C8.13 2 5 5.13 5 9c0 5.2 6.2 11.7 6.5 12a.7.7 0 0 0 1 0C12.8 20.7 19 14.2 19 9c0-3.87-3.13-7-7-7z'/%3E%3Ccircle cx='12' cy='9' r='2.5' fill='%23FFF4EB'/%3E%3C/svg%3E\") 12 22, crosshair"
const DRAW_MODE_CURSOR = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 16 16'%3E%3Ccircle cx='8' cy='8' r='3' fill='%230A5A46' stroke='%23FFFFFF' stroke-width='1'/%3E%3C/svg%3E\") 8 8, crosshair"
const DEFAULT_ROUTE_DRAW_COLOR = getDefaultFeatureStyle("route").color
const DEFAULT_AREA_DRAW_COLOR = getDefaultFeatureStyle("area").color

// 레벨/XP 시스템 제거 (2026-05). 내 위치 마커는 단순 펄스 + 방향 화살표만 표시 (캐릭터 이모지 제거).
// characterStyle / levelEmoji prop 은 호출부 호환을 위해 props 로 받지만 무시.
export const NaverMap = forwardRef(function NaverMap(props, ref) {
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
    onViewportChangeRef.current = onViewportChange
  }, [onViewportChange])

  const emitViewportChange = () => {
    const map = mapRef.current
    if (!map || typeof onViewportChangeRef.current !== "function") return
    const center = map.getCenter?.()
    const lat = typeof center?.lat === "function" ? center.lat() : Number(center?.lat)
    const lng = typeof center?.lng === "function" ? center.lng() : Number(center?.lng)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return
    onViewportChangeRef.current({
      center: { lat, lng },
      zoom: typeof map.getZoom === "function" ? map.getZoom() : undefined,
    })
  }

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
          const newLevel = zoom < 13 ? 1 : zoom < 15 ? 2 : 3
          if (!cancelled) {
            setZoomLevel(newLevel)
            setMapZoom(zoom)
          }
        }
        naverMaps.Event.addListener(map, "zoom_changed", () => {
          applyZoomScale()
          requestViewportRender()
        })
        naverMaps.Event.addListener(map, "idle", requestViewportRender)
        naverMaps.Event.addListener(map, "dragend", requestViewportRender)
        applyZoomScale()
        mapRef.current = map
        if (!cancelled) setMapReady(true)
        requestViewportRender()
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
      if (viewportFrame) window.cancelAnimationFrame(viewportFrame)
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

  useEffect(() => {
    if (!mapReady) return undefined
    const root = containerRef.current
    const map = mapRef.current
    const naverMaps = getNaverMaps()
    if (!root || !map || !naverMaps?.Event) return undefined

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
          naverMaps.Event.trigger(map, "resize")
          if (center && typeof map.setCenter === "function") map.setCenter(center)
        } catch {
          // Best-effort refresh for responsive shared-map containers.
        }
      })
    }

    const observer = typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(refreshMapSize)
      : null
    observer?.observe(root)
    refreshMapSize()
    timer = window.setTimeout(refreshMapSize, 250)

    return () => {
      observer?.disconnect()
      if (frame) window.cancelAnimationFrame(frame)
      if (timer) window.clearTimeout(timer)
    }
  }, [mapReady])

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
        let minLat = Infinity
        let maxLat = -Infinity
        let minLng = Infinity
        let maxLng = -Infinity
        points.forEach(([lng, lat]) => {
          minLat = Math.min(minLat, lat)
          maxLat = Math.max(maxLat, lat)
          minLng = Math.min(minLng, lng)
          maxLng = Math.max(maxLng, lng)
        })
        return new naverMaps.LatLng((minLat + maxLat) / 2, (minLng + maxLng) / 2)
      }
      const getFeatureClusterPoint = (feature) => {
        if (feature.type === "pin") {
          if (!feature.lat || !feature.lng || (feature.lat === 0 && feature.lng === 0)) return null
          return { lat: feature.lat, lng: feature.lng }
        }
        const representative = getRepresentativePoint(feature)
        if (representative) return representative
        if (!Array.isArray(feature.points) || feature.points.length === 0) return null
        let minLat = Infinity
        let maxLat = -Infinity
        let minLng = Infinity
        let maxLng = -Infinity
        feature.points.forEach(([lng, lat]) => {
          minLat = Math.min(minLat, lat)
          maxLat = Math.max(maxLat, lat)
          minLng = Math.min(minLng, lng)
          maxLng = Math.max(maxLng, lng)
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
        if (representative) {
          bounds.extend(toLatLng(representative.lat, representative.lng))
          return
        }
        if (Array.isArray(feature.points) && feature.points.length > 0) {
          feature.points.forEach(([lng, lat]) => {
            if (Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))) {
              bounds.extend(toLatLng(lat, lng))
            }
          })
          return
        }
        const center = getFeatureClusterPoint(feature)
        if (center) bounds.extend(toLatLng(center.lat, center.lng))
      }
      const bindFeatureSelection = (target, featureId) => {
        const handleSelect = () => {
          const now = Date.now()
          const lastTap = lastFeatureTapRef.current
          if (lastTap.featureId === featureId && now - lastTap.at < 250) return
          lastFeatureTapRef.current = { featureId, at: now }
          ignoreMapTapUntilRef.current = now + 300
          triggerSelectionFeedback()
          onFeatureTap?.(featureId)
        }
        naverMaps.Event.addListener(target, "tap", handleSelect)
        naverMaps.Event.addListener(target, "click", handleSelect)
      }

      const isPublicPixelMap = markerStyle === "pixel"
      const projection = map.getProjection()
      const container = containerRef.current
      const viewportWidth = container?.clientWidth || 0
      const viewportHeight = container?.clientHeight || 0
      const shouldCullToViewport = features.length > VIEWPORT_CULL_FEATURE_THRESHOLD
        && projection
        && viewportWidth > 0
        && viewportHeight > 0
      const viewportPadding = isPublicPixelMap ? 180 : 140
      const toProjectedFeature = (feature) => {
        const center = getFeatureClusterPoint(feature)
        if (!center) return null
        if (!shouldCullToViewport) return { feature, center }
        try {
          const point = projection.fromCoordToOffset(toLatLng(center.lat, center.lng))
          const inViewport = (
            point.x >= -viewportPadding
            && point.x <= viewportWidth + viewportPadding
            && point.y >= -viewportPadding
            && point.y <= viewportHeight + viewportPadding
          )
          if (!inViewport && feature.id !== selectedFeatureId) return null
          return { feature, center, x: point.x, y: point.y }
        } catch {
          return { feature, center }
        }
      }

      // 줌아웃 클러스터링: 장소뿐 아니라 길/영역도 대표 중심점으로 함께 묶는다.
      const clusterableFeatures = features
        .map(toProjectedFeature)
        .filter(Boolean)
      const shouldClusterOnly = isPublicPixelMap
        ? mapZoom <= PUBLIC_CLUSTER_ONLY_MAX_ZOOM
        : mapZoom < PERSONAL_CLUSTER_ONLY_MAX_ZOOM
      const clusterDist = shouldClusterOnly
        ? (isPublicPixelMap ? 110 : 96)
        : [48, 34, 0][zoomLevel - 1]

      let unclusteredFeatures = []
      let clusters = []

      if (clusterDist > 0 && clusterableFeatures.length > 0 && projection) {
        // 좌표를 화면 픽셀로 변환
        const pxFeatures = clusterableFeatures.map(({ feature, center, x, y }) => {
          if (Number.isFinite(x) && Number.isFinite(y)) {
            return { feature, center, x, y, clustered: false }
          }
          const point = projection.fromCoordToOffset(toLatLng(center.lat, center.lng))
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
              clusters.push({
                lat: group[0].center.lat,
                lng: group[0].center.lng,
                count: 1,
                features: [group[0].feature],
              })
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

      // 클러스터 마커 렌더링
      clusters.forEach((cluster) => {
        const clusterMarker = createClusterMarkerContent({
          count: cluster.count,
          publicStyle: isPublicPixelMap,
        })
        const marker = new naverMaps.Marker({
          position: toLatLng(cluster.lat, cluster.lng),
          map,
          icon: {
            content: clusterMarker.content,
            size: new naverMaps.Size(clusterMarker.size, clusterMarker.size),
            anchor: new naverMaps.Point(clusterMarker.size / 2, clusterMarker.size / 2),
          },
        })
        if (cluster.features.length === 1) {
          bindFeatureSelection(marker, cluster.features[0].id)
        } else {
          naverMaps.Event.addListener(marker, "click", () => {
            // ?대윭?ㅽ꽣 ????以뚯씤
            const bounds = new naverMaps.LatLngBounds()
            cluster.features.forEach((f) => extendFeatureBounds(bounds, f))
            map.fitBounds(bounds, { top: 40, right: 40, bottom: 40, left: 40 })
          })
        }
        layersRef.current.push(marker)
      })

      // 클러스터에 묶이지 않은 피처만 개별 렌더링한다.
      const renderFeatures = unclusteredFeatures
      renderFeatures.forEach((feature) => {
        if (feature.type === "pin") {
          if (feature.lat === 0 && feature.lng === 0) return
          const isSelected = feature.id === selectedFeatureId
          const shouldShowPlaceLabel = isSelected || (showLabels && mapZoom >= PLACE_LABEL_MIN_ZOOM)
          const markerContent = createPlaceMarkerContent({
            feature,
            isSelected,
            shouldShowLabel: shouldShowPlaceLabel,
            markerStyle,
            showRouteBadge,
          })

          const marker = new naverMaps.Marker({
            position: toLatLng(feature.lat, feature.lng),
            map,
            icon: {
              content: markerContent,
              size: new naverMaps.Size(1, 1),
              anchor: new naverMaps.Point(0, 0),
            },
            zIndex: isSelected ? 300 : 40,
          })
          bindFeatureSelection(marker, feature.id)
          layersRef.current.push(marker)
        } else if (feature.type === "route") {
          const routeColor = getFeatureStyleColor(feature, "route")
          const routeLineStyle = getFeatureStyleLineStyle(feature, "route")
          const routePoints = Array.isArray(feature.points) ? feature.points : []
          const routeRepresentative = getRepresentativePoint(feature)
          if (routePoints.length < 2 && routeRepresentative) {
            const isSelected = feature.id === selectedFeatureId
            const routeMarkerContent = createRouteLabelContent({
              feature,
              color: routeColor,
              isSelected,
            })
            const marker = new naverMaps.Marker({
              position: toLatLng(routeRepresentative.lat, routeRepresentative.lng),
              map,
              icon: {
                content: routeMarkerContent,
                size: new naverMaps.Size(118, 24),
                anchor: new naverMaps.Point(59, -18),
              },
              clickable: true,
              zIndex: isSelected ? 260 : 60,
            })
            bindFeatureSelection(marker, feature.id)
            layersRef.current.push(marker)
            return
          }
          const polyline = new naverMaps.Polyline({
            path: pointsToPath(routePoints),
            strokeColor: routeColor,
            strokeWeight: feature.id === selectedFeatureId ? 4.5 : 3.5,
            strokeOpacity: feature.id === selectedFeatureId ? 0.78 : 0.66,
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
          if (routePoints.length >= 2) {
            const step = Math.max(1, Math.floor(routePoints.length / 4))
            for (let pi = step; pi < routePoints.length; pi += step) {
              const [lng1, lat1] = routePoints[pi - 1]
              const [lng2, lat2] = routePoints[pi]
              const angle = Math.atan2(lat2 - lat1, lng2 - lng1) * (180 / Math.PI) - 90
              const arrowMarker = new naverMaps.Marker({
                position: toLatLng(lat2, lng2),
                map,
                icon: {
                  content: `<div class="loca-route-arrow" style="transform:rotate(${angle}deg)"><svg width="10" height="10" viewBox="0 0 10 10" fill="${routeColor}" opacity="0.62"><polygon points="5,0 10,10 0,10"/></svg></div>`,
                  size: new naverMaps.Size(10, 10),
                  anchor: new naverMaps.Point(5, 5),
                },
              })
              layersRef.current.push(arrowMarker)
            }
          }

          const routeLabelPoint = getPointsCenter(routePoints)
          if (showLabels && routeLabelPoint) {
            const isSelected = feature.id === selectedFeatureId
            const routeLabelContent = createRouteLabelContent({
              feature,
              color: routeColor,
              isSelected,
            })
            const routeLabel = new naverMaps.Marker({
              position: routeLabelPoint,
              map,
              icon: {
                content: routeLabelContent,
                size: new naverMaps.Size(118, 24),
                anchor: new naverMaps.Point(59, -18),
              },
              clickable: true,
              zIndex: isSelected ? 250 : 55,
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
            strokeOpacity: feature.id === selectedFeatureId ? 0.86 : 0.62,
            strokeStyle: areaLineStyle,
            fillColor: areaColor,
            fillOpacity: feature.id === selectedFeatureId ? 0.24 : 0.14,
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

          const areaLabelPoint = getPointsCenter(feature.points)
          if (showLabels && areaLabelPoint) {
            const isSelected = feature.id === selectedFeatureId
            const areaLabel = new naverMaps.Marker({
              position: areaLabelPoint,
              map,
              icon: {
                content: createAreaLabelContent({
                  feature,
                  color: areaColor,
                  dashArray: areaDashArray,
                  isSelected,
                }),
                size: new naverMaps.Size(118, 24),
                anchor: new naverMaps.Point(59, -18),
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
            strokeColor: DEFAULT_AREA_DRAW_COLOR,
            strokeWeight: 4,
            strokeStyle: "shortdash",
            strokeOpacity: 1,
            fillColor: DEFAULT_AREA_DRAW_COLOR,
            fillOpacity: 0.22,
            map,
          })
          layersRef.current.push(draft)
        } else {
          const draft = new naverMaps.Polyline({
            path: pointsToPath(draftPoints),
            strokeColor: DEFAULT_ROUTE_DRAW_COLOR,
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
          + `<div class="loca-my-location__dot"></div>`
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
  }, [draftMode, draftPoints, features, mapReady, mapZoom, markerStyle, myLocation, onFeatureTap, selectedFeatureId, showLabels, showRouteBadge, viewportRenderVersion, zoomLevel])

  // Focus
  useEffect(() => {
    const map = mapRef.current
    const naverMaps = getNaverMaps()
    if (!map || !focusPoint || !naverMaps) return
    try {
      map.setCenter(new naverMaps.LatLng(focusPoint.lat, focusPoint.lng))
      map.setZoom(focusPoint.zoom || 15)
      emitViewportChange()
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


