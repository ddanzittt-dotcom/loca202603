import { BottomSheet, MapPreview } from "../ui"

export function SharePlaceSheet({ pendingSharePlace, maps, features, onSaveToMap, onClose }) {
  return (
    <BottomSheet
      open={Boolean(pendingSharePlace)}
      title="장소 저장"
      subtitle={pendingSharePlace ? `${pendingSharePlace.title || "공유된 장소"}를 저장할 지도를 선택하세요.` : undefined}
      onClose={onClose}
    >
      {pendingSharePlace ? (
        <div className="form-stack">
          {maps.length === 0 ? (
            <article className="empty-card">
              <strong>저장된 지도가 없어요.</strong>
              <p>먼저 지도를 만들어주세요.</p>
            </article>
          ) : (
            <div className="card-list">
              {maps.map((mapItem) => {
                const mapPins = features.filter((f) => f.mapId === mapItem.id && f.type === "pin")
                return (
                  <button
                    className="map-publish-row map-publish-row--select"
                    key={mapItem.id}
                    type="button"
                    onClick={() => onSaveToMap(mapItem.id)}
                  >
                    <MapPreview title={mapItem.title} emojis={mapPins.map((f) => f.emoji)} placeCount={mapPins.length} theme={mapItem.theme} variant="grid" compact />
                    <div className="map-publish-row__body">
                      <strong>{mapItem.title}</strong>
                      <span>{mapItem.description || "설명이 아직 없어요."}</span>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
          <div className="sheet-actions">
            <button className="button button--ghost" type="button" onClick={onClose}>
              취소
            </button>
          </div>
        </div>
      ) : null}
    </BottomSheet>
  )
}
