import { useEffect, useRef, forwardRef, useImperativeHandle, useState } from "react"
import { FEATURE_LINE_STYLE_SOLID, getDefaultFeatureStyle, getFeatureStyleColor, getFeatureStyleLineStyle, getGoogleDashIcons } from "../lib/featureStyle"
import { triggerSelectionFeedback } from "../lib/haptics"
import { findPixelArt, pixelArtToSvgString } from "../lib/pixelEmojiCatalog"
import { getDefaultMarkerEmojiForFeature, resolvePlaceMarkerEmoji } from "./FeatureEmoji"

const GOOGLE_MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY || ""
const PLACE_LABEL_MIN_ZOOM = 15
const PLACE_MARKER_EMOJI_SIZE = 28

const PIN_MODE_CURSOR = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Cpath fill='%23FF6B35' d='M12 2C8.13 2 5 5.13 5 9c0 5.2 6.2 11.7 6.5 12a.7.7 0 0 0 1 0C12.8 20.7 19 14.2 19 9c0-3.87-3.13-7-7-7z'/%3E%3Ccircle cx='12' cy='9' r='2.5' fill='%23FFF4EB'/%3E%3C/svg%3E\") 12 22, crosshair"
const DRAW_MODE_CURSOR = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 16 16'%3E%3Ccircle cx='8' cy='8' r='3' fill='%230A5A46' stroke='%23FFFFFF' stroke-width='1'/%3E%3C/svg%3E\") 8 8, crosshair"
const DEFAULT_ROUTE_DRAW_COLOR = getDefaultFeatureStyle("route").color
const DEFAULT_AREA_DRAW_COLOR = getDefaultFeatureStyle("area").color

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

const escapeHtml = (str) => {
  if (!str) return ""
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
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

const createPlaceMarkerContent = ({ feature, isSelected, shouldShowLabel }) => {
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

const createGooglePlaceMarkerOverlay = ({ googleMaps, position, content, map, zIndex, onClick }) => {
  class PlaceMarkerOverlay extends googleMaps.OverlayView {
    constructor() {
      super()
      this.container = null
      this.handleClick = null
      this.setMap(map)
    }

    onAdd() {
      const container = document.createElement("div")
      container.style.position = "absolute"
      container.style.zIndex = String(zIndex)
      container.innerHTML = content
      this.handleClick = (event) => {
        event.preventDefault()
        event.stopPropagation()
        onClick?.()
      }
      container.addEventListener("click", this.handleClick)
      this.container = container
      this.getPanes()?.overlayMouseTarget.appendChild(container)
    }

    draw() {
      const projection = this.getProjection()
      if (!projection || !this.container) return
      const point = projection.fromLatLngToDivPixel(position)
      if (!point) return
      this.container.style.left = `${point.x}px`
      this.container.style.top = `${point.y}px`
    }

    onRemove() {
      if (this.container && this.handleClick) {
        this.container.removeEventListener("click", this.handleClick)
      }
      this.container?.remove()
      this.container = null
      this.handleClick = null
    }
  }

  return new PlaceMarkerOverlay()
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
  onViewportChange,
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
  const onViewportChangeRef = useRef(onViewportChange)
  const initialCenterRef = useRef(focusPoint || myLocation || { lat: 37.56, lng: 126.98 })
  const [mapReady, setMapReady] = useState(false)
  const [mapZoom, setMapZoom] = useState(14)

  useEffect(() => { onMapTapRef.current = onMapTap }, [onMapTap])
  useEffect(() => { onViewportChangeRef.current = onViewportChange }, [onViewportChange])

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

    const nextCursor = draftMode === "pin"
      ? PIN_MODE_CURSOR
      : (draftMode === "route" || draftMode === "area")
        ? DRAW_MODE_CURSOR
        : null

    const applyCursor = () => {
      const targets = [root, ...root.querySelectorAll("canvas, div")]
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

    return () => {
      observer.disconnect()
      const targets = [root, ...root.querySelectorAll("canvas, div")]
      targets.forEach((el) => {
        if (el.getAttribute("data-loca-draft-cursor") === "1") {
          el.style.removeProperty("cursor")
          el.removeAttribute("data-loca-draft-cursor")
        }
      })
    }
  }, [draftMode])

  // 초기화
  useEffect(() => {
    if (!containerRef.current || !GOOGLE_MAPS_KEY) return
    let cancelled = false
    const listeners = []

    loadGoogleMaps().then(() => {
      if (cancelled || !containerRef.current) return
      const map = new window.google.maps.Map(containerRef.current, {
        center: initialCenterRef.current,
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
      const emit = () => emitViewportChange()

      map.addListener("click", (e) => {
        if (onMapTapRef.current) {
          onMapTapRef.current({ lat: e.latLng.lat(), lng: e.latLng.lng() })
        }
      })
      setMapZoom(map.getZoom() || 14)
      listeners.push(map.addListener("zoom_changed", () => {
        setMapZoom(map.getZoom() || 14)
        emit()
      }))
      listeners.push(map.addListener("idle", emit))
      listeners.push(map.addListener("dragend", emit))
      setMapReady(true)
      emit()
    })

    return () => {
      cancelled = true
      listeners.forEach((listener) => window.google?.maps?.event?.removeListener(listener))
    }
  }, [])

  // 전체 렌더링
  useEffect(() => {
    const map = mapRef.current
    if (!mapReady || !map || !window.google?.maps) return

    // 湲곗〈 留덉빱/?쇱씤/?대━怨??쒓굅
    markersRef.current.forEach((m) => m.setMap(null))
    polylinesRef.current.forEach((p) => p.setMap(null))
    polygonsRef.current.forEach((p) => p.setMap(null))
    markersRef.current = []
    polylinesRef.current = []
    polygonsRef.current = []

    const pins = features.filter((f) => f.type === "pin" && f.lat && f.lng)
    const routes = features.filter((f) => f.type === "route" && f.points?.length >= 2)
    const areas = features.filter((f) => f.type === "area" && f.points?.length >= 3)
    const handleFeatureTap = (featureId) => {
      triggerSelectionFeedback()
      onFeatureTap?.(featureId)
    }

    // ? 留덉빱
    pins.forEach((pin) => {
      const isSelected = pin.id === selectedFeatureId
      const shouldShowPlaceLabel = isSelected || (showLabels && mapZoom >= PLACE_LABEL_MIN_ZOOM)
      const marker = createGooglePlaceMarkerOverlay({
        googleMaps: window.google.maps,
        position: { lat: pin.lat, lng: pin.lng },
        content: createPlaceMarkerContent({
          feature: pin,
          isSelected,
          shouldShowLabel: shouldShowPlaceLabel,
        }),
        map,
        zIndex: isSelected ? 300 : 40,
        onClick: () => handleFeatureTap(pin.id),
      })
      markersRef.current.push(marker)
    })

    // 寃쎈줈 ?대━?쇱씤
    routes.forEach((route) => {
      const path = route.points.map(([lng, lat]) => ({ lat, lng }))
      const isSelected = route.id === selectedFeatureId
      const routeColor = getFeatureStyleColor(route, "route")
      const routeLineStyle = getFeatureStyleLineStyle(route, "route")
      const routeDashIcons = getGoogleDashIcons(routeLineStyle, routeColor)
      const polyline = new window.google.maps.Polyline({
        path,
        map,
        strokeColor: routeColor,
        strokeOpacity: routeDashIcons ? 0 : (isSelected ? 0.98 : 0.88),
        strokeWeight: isSelected ? 4 : 3,
        icons: routeDashIcons || undefined,
      })
      polyline.addListener("click", () => handleFeatureTap(route.id))
      polylinesRef.current.push(polyline)
    })

    // 영역 폴리곤
    areas.forEach((area) => {
      const path = area.points.map(([lng, lat]) => ({ lat, lng }))
      const closedPath = path.length > 0 ? [...path, path[0]] : path
      const isSelected = area.id === selectedFeatureId
      const areaColor = getFeatureStyleColor(area, "area")
      const areaLineStyle = getFeatureStyleLineStyle(area, "area")
      const areaDashIcons = getGoogleDashIcons(areaLineStyle, areaColor)
      const polygon = new window.google.maps.Polygon({
        paths: path,
        map,
        strokeColor: areaColor,
        strokeOpacity: areaLineStyle === FEATURE_LINE_STYLE_SOLID ? (isSelected ? 0.94 : 0.78) : 0,
        strokeWeight: 2,
        fillColor: areaColor,
        fillOpacity: isSelected ? 0.3 : 0.16,
      })
      polygon.addListener("click", () => handleFeatureTap(area.id))
      polygonsRef.current.push(polygon)

      if (areaLineStyle !== FEATURE_LINE_STYLE_SOLID && closedPath.length >= 2) {
        const borderLine = new window.google.maps.Polyline({
          path: closedPath,
          map,
          strokeColor: areaColor,
          strokeOpacity: 0,
          strokeWeight: 2,
          icons: areaDashIcons || undefined,
        })
        borderLine.addListener("click", () => handleFeatureTap(area.id))
        polylinesRef.current.push(borderLine)
      }
    })
  }, [features, mapReady, mapZoom, selectedFeatureId, showLabels, onFeatureTap])

  // ?쒕옒?꾪듃 ?ъ씤??(寃쎈줈/援ъ뿭 洹몃━湲?
  useEffect(() => {
    const map = mapRef.current
    if (!map || !window.google?.maps || !draftPoints?.length) return

    const path = draftPoints.map(([lng, lat]) => ({ lat, lng }))
    const color = draftMode === "area" ? DEFAULT_AREA_DRAW_COLOR : DEFAULT_ROUTE_DRAW_COLOR

    const line = new window.google.maps.Polyline({
      path,
      map,
      strokeColor: color,
      strokeOpacity: 0.78,
      strokeWeight: 3,
      strokeDashArray: [4, 4],
    })

    return () => line.setMap(null)
  }, [draftPoints, draftMode])

  // ?ъ빱???ъ씤???대룞
  useEffect(() => {
    const map = mapRef.current
    if (!map || !focusPoint) return
    map.panTo({ lat: focusPoint.lat, lng: focusPoint.lng })
    if (focusPoint.zoom) map.setZoom(focusPoint.zoom)
    emitViewportChange()
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

  // ???꾩튂 留덉빱
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

  // capture (?ㅽ겕由곗꺑??
  useImperativeHandle(ref, () => ({
    capture: () => null, // Google Maps??罹≪쿂 ?쒗븳
  }))

  if (!GOOGLE_MAPS_KEY) {
    return (
      <div
        className={`map-canvas map-canvas--${draftMode || "browse"}`}
        style={{ display: "flex", alignItems: "center", justifyContent: "center", background: "#f5f0e8", color: "#aaa", fontSize: 12 }}
      >
        Google Maps API ?ㅺ? ?ㅼ젙?섏? ?딆븯?댁슂
      </div>
    )
  }

  return <div ref={containerRef} className={`map-canvas map-canvas--${draftMode || "browse"}`} />
})

