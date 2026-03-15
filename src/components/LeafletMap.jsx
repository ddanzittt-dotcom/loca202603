import { useEffect, useRef } from "react"
import L from "leaflet"

delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
})

const getCenterPoint = (points) => {
  if (!points?.length) return null
  const total = points.reduce(
    (acc, [lng, lat]) => ({ lat: acc.lat + lat, lng: acc.lng + lng }),
    { lat: 0, lng: 0 },
  )
  return [total.lat / points.length, total.lng / points.length]
}

export function LeafletMap({ features, selectedFeatureId, draftPoints, draftMode, focusPoint, fitTrigger, onMapTap, onFeatureTap, showLabels = true }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const layersRef = useRef([])
  const lastFitTriggerRef = useRef(fitTrigger)
  const onMapTapRef = useRef(onMapTap)

  useEffect(() => {
    onMapTapRef.current = onMapTap
  }, [onMapTap])

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    const map = L.map(containerRef.current, { zoomControl: false, center: [37.544, 127.056], zoom: 14 })
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "&copy; OpenStreetMap" }).addTo(map)
    map.on("click", (event) => onMapTapRef.current?.({ lat: event.latlng.lat, lng: event.latlng.lng }))
    mapRef.current = map
    return () => {
      layersRef.current = []
      map.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    layersRef.current.forEach((layer) => map.removeLayer(layer))
    layersRef.current = []

    features.forEach((feature) => {
      if (feature.type === "pin") {
        const emojiIcon = L.divIcon({
          className: "loca-emoji-marker",
          html: `<span>${feature.emoji || "📍"}</span>`,
          iconSize: [32, 32],
          iconAnchor: [16, 16],
        })
        const marker = L.marker([feature.lat, feature.lng], { icon: emojiIcon }).addTo(map)
        if (showLabels) {
          marker.bindTooltip(`${feature.emoji} ${feature.title}`, {
            permanent: true,
            direction: "top",
            offset: [0, -12],
            className: "loca-map-label",
          })
        }
        marker.on("click", () => onFeatureTap?.(feature.id))
        layersRef.current.push(marker)
      } else if (feature.type === "route") {
        const polyline = L.polyline(feature.points.map(([lng, lat]) => [lat, lng]), {
          color: feature.id === selectedFeatureId ? "#635BFF" : "#0EA5E9",
          weight: feature.id === selectedFeatureId ? 6 : 4,
        }).addTo(map)
        polyline.on("click", () => onFeatureTap?.(feature.id))
        layersRef.current.push(polyline)

        const midpoint = feature.points[Math.floor(feature.points.length / 2)]
        if (showLabels && midpoint) {
          const routeLabel = L.marker([midpoint[1], midpoint[0]], {
            interactive: false,
            icon: L.divIcon({
              className: "loca-map-route-label",
              html: `<span>${feature.emoji} ${feature.title}</span>`,
            }),
          }).addTo(map)
          layersRef.current.push(routeLabel)
        }
      } else if (feature.type === "area") {
        const polygon = L.polygon(feature.points.map(([lng, lat]) => [lat, lng]), {
          color: feature.id === selectedFeatureId ? "#635BFF" : "#16A34A",
          fillColor: feature.id === selectedFeatureId ? "#8B5CF6" : "#22C55E",
          fillOpacity: feature.id === selectedFeatureId ? 0.26 : 0.18,
          weight: feature.id === selectedFeatureId ? 4 : 3,
        }).addTo(map)
        polygon.on("click", () => onFeatureTap?.(feature.id))
        layersRef.current.push(polygon)

        const centerPoint = getCenterPoint(feature.points)
        if (showLabels && centerPoint) {
          const areaLabel = L.marker(centerPoint, {
            interactive: false,
            icon: L.divIcon({
              className: "loca-map-route-label",
              html: `<span>${feature.emoji} ${feature.title}</span>`,
            }),
          }).addTo(map)
          layersRef.current.push(areaLabel)
        }
      }
    })

    if (draftPoints.length > 1) {
      const draft =
        draftMode === "area" && draftPoints.length > 2
          ? L.polygon(draftPoints.map(([lng, lat]) => [lat, lng]), {
              color: "#F97316",
              fillColor: "#FB923C",
              fillOpacity: 0.18,
              weight: 4,
              dashArray: "6 8",
            }).addTo(map)
          : L.polyline(draftPoints.map(([lng, lat]) => [lat, lng]), {
              color: "#F97316",
              weight: 4,
              dashArray: "6 8",
            }).addTo(map)
      layersRef.current.push(draft)
    }
  }, [draftMode, draftPoints, features, onFeatureTap, selectedFeatureId, showLabels])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !focusPoint) return
    map.setView([focusPoint.lat, focusPoint.lng], focusPoint.zoom || 16)
  }, [focusPoint])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (lastFitTriggerRef.current === fitTrigger) return
    lastFitTriggerRef.current = fitTrigger
    const bounds = []
    features.forEach((feature) => {
      if (feature.type === "pin") bounds.push([feature.lat, feature.lng])
      else feature.points.forEach(([lng, lat]) => bounds.push([lat, lng]))
    })
    draftPoints.forEach(([lng, lat]) => bounds.push([lat, lng]))
    if (bounds.length > 0) map.fitBounds(bounds, { padding: [28, 28] })
  }, [draftPoints, features, fitTrigger])

  return <div className={`map-canvas map-canvas--${draftMode || "browse"}`} ref={containerRef} />
}
