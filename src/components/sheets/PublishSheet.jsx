import { BottomSheet, MapPreview } from "../ui"

export function PublishSheet({ publishSheet, setPublishSheet, unpublishedMaps, features, onPublish, onClose }) {
  return (
    <BottomSheet
      open={Boolean(publishSheet)}
      title="프로필에 지도 올리기"
      subtitle="내가 만든 지도 중 프로필에 올릴 지도를 고르세요."
      onClose={onClose}
    >
      {unpublishedMaps.length === 0 ? (
        <article className="empty-card">
          <strong>추가로 올릴 지도가 없어요.</strong>
          <p>새 지도를 만들거나 기존 게시물을 공유 해제해보세요.</p>
        </article>
      ) : (
        <div className="form-stack">
          <div className="card-list">
            {unpublishedMaps.map((mapItem) => {
              const mapPins = features.filter((feature) => feature.mapId === mapItem.id && feature.type === "pin")
              const isActive = publishSheet?.selectedMapId === mapItem.id
              return (
                <button
                  className={`map-publish-row map-publish-row--select${isActive ? " is-active" : ""}`}
                  key={mapItem.id}
                  type="button"
                  onClick={() => setPublishSheet((current) => ({ ...(current || {}), selectedMapId: mapItem.id }))}
                >
                  <MapPreview title={mapItem.title} emojis={mapPins.map((feature) => feature.emoji)} placeCount={mapPins.length} theme={mapItem.theme} variant="grid" compact />
                  <div className="map-publish-row__body">
                    <strong>{mapItem.title}</strong>
                    <span>{mapItem.description || "설명이 아직 없어요."}</span>
                  </div>
                  <span className={`map-publish-row__badge${isActive ? " is-active" : ""}`}>
                    {isActive ? "선택됨" : "선택"}
                  </span>
                </button>
              )
            })}
          </div>

          <label className="field">
            <span>한마디</span>
            <textarea
              rows="3"
              value={publishSheet?.caption || ""}
              onChange={(event) => setPublishSheet((current) => ({ ...(current || {}), caption: event.target.value }))}
              placeholder="이 지도에 대한 짧은 소개를 남겨보세요."
            />
          </label>

          <div className="sheet-actions">
            <button className="button button--ghost" type="button" onClick={onClose}>
              닫기
            </button>
            <button className="button button--primary" type="button" onClick={onPublish}>
              프로필에 올리기
            </button>
          </div>
        </div>
      )}
    </BottomSheet>
  )
}
