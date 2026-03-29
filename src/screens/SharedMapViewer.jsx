import { useState } from "react"
import { MapErrorBoundary } from "../components/MapErrorBoundary"
import { NaverMap } from "../components/NaverMap"

const featureTypeLabel = (type) => {
  if (type === "route") return "경로"
  if (type === "area") return "범위"
  return "장소"
}

export function SharedMapViewer({ map, features, onSaveToApp }) {
  const [selectedId, setSelectedId] = useState(null)
  const [fitTrigger] = useState(1)
  const [focusPoint, setFocusPoint] = useState(null)
  const [listOpen, setListOpen] = useState(false)

  const pins = features.filter((f) => f.type === "pin")
  const routes = features.filter((f) => f.type === "route")
  const areas = features.filter((f) => f.type === "area")
  const selectedFeature = selectedId ? features.find((f) => f.id === selectedId) : null

  const getFeatureCenter = (feature) => {
    if (feature.type === "pin") return { lat: feature.lat, lng: feature.lng, zoom: 16 }
    if (!feature.points?.length) return null
    const total = feature.points.reduce(
      (acc, [lng, lat]) => ({ lat: acc.lat + lat, lng: acc.lng + lng }),
      { lat: 0, lng: 0 },
    )
    return { lat: total.lat / feature.points.length, lng: total.lng / feature.points.length, zoom: 15 }
  }

  const handleFeatureListTap = (feature) => {
    setSelectedId(feature.id)
    setFocusPoint(getFeatureCenter(feature))
    setListOpen(false)
  }

  return (
    <div className="shared-viewer">
      <header className="shared-viewer__header">
        <div className="shared-viewer__title-area">
          <strong className="shared-viewer__title">{map.title}</strong>
          {map.description ? <p className="shared-viewer__desc">{map.description}</p> : null}
        </div>
      </header>

      <div className="shared-viewer__map">
        <MapErrorBoundary>
          <NaverMap
            features={features}
            selectedFeatureId={selectedId}
            draftPoints={[]}
            draftMode="browse"
            focusPoint={focusPoint}
            fitTrigger={fitTrigger}
            onFeatureTap={(id) => setSelectedId(id)}
            showLabels
          />
        </MapErrorBoundary>

        <div className="shared-viewer__map-count">
          <span>📍 {pins.length}</span>
          {routes.length > 0 ? <span>🔀 {routes.length}</span> : null}
          {areas.length > 0 ? <span>⬡ {areas.length}</span> : null}
        </div>
      </div>

      {selectedFeature ? (
        <div className="shared-viewer__selected">
          <div className="shared-viewer__selected-head">
            <strong>{selectedFeature.emoji} {selectedFeature.title}</strong>
            <button className="shared-viewer__close-btn" type="button" onClick={() => setSelectedId(null)}>✕</button>
          </div>
          <span className="shared-viewer__selected-type">{featureTypeLabel(selectedFeature.type)}</span>
          {selectedFeature.note ? <p className="shared-viewer__selected-note">{selectedFeature.note}</p> : null}
          {selectedFeature.tags?.length ? (
            <div className="shared-viewer__selected-tags">
              {selectedFeature.tags.map((tag) => (
                <span key={tag} className="chip chip--small">#{tag}</span>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <button
        className="shared-viewer__list-toggle"
        type="button"
        onClick={() => setListOpen(!listOpen)}
      >
        목록 {listOpen ? "닫기" : "보기"} ({features.length})
      </button>

      {listOpen ? (
        <div className="shared-viewer__list">
          {features.length === 0 ? (
            <p className="shared-viewer__list-empty">등록된 장소가 없어요.</p>
          ) : null}
          {features.map((feature) => (
            <button
              key={feature.id}
              className={`shared-viewer__list-item${selectedId === feature.id ? " is-active" : ""}`}
              type="button"
              onClick={() => handleFeatureListTap(feature)}
            >
              <span className="shared-viewer__list-emoji">{feature.emoji}</span>
              <div className="shared-viewer__list-info">
                <strong>{feature.title}</strong>
                <span>{featureTypeLabel(feature.type)}{feature.tags?.length ? ` · ${feature.tags.slice(0, 2).join(", ")}` : ""}</span>
              </div>
            </button>
          ))}
        </div>
      ) : null}

      <div className="shared-viewer__cta">
        <button className="shared-viewer__cta-btn" type="button" onClick={onSaveToApp}>
          LOCA 앱으로 저장하기
        </button>
        <p className="shared-viewer__cta-hint">앱에서 지도를 편집하고 나만의 장소를 추가해보세요.</p>
      </div>
    </div>
  )
}
