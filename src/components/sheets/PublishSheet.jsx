import { BottomSheet } from "../ui"
import { Check } from "lucide-react"

export function PublishSheet({ publishSheet, setPublishSheet, unpublishedMaps, features, onPublish, onClose }) {
  return (
    <BottomSheet
      open={Boolean(publishSheet)}
      title="지도 올리기"
      subtitle="프로필에 공유할 지도를 선택하세요"
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
              const mapFeatures = features.filter((f) => f.mapId === mapItem.id)
              const pinCount = mapFeatures.filter((f) => f.type === "pin").length
              const isActive = publishSheet?.selectedMapId === mapItem.id
              const isEmpty = mapFeatures.length === 0
              const isEvent = mapItem.category === "event"
              return (
                <button
                  className={`pub-card${isActive ? " pub-card--active" : ""}`}
                  key={mapItem.id}
                  type="button"
                  onClick={() => setPublishSheet((current) => ({ ...(current || {}), selectedMapId: mapItem.id }))}
                >
                  {/* blob 썸네일 */}
                  <div className="pub-card__thumb">
                    <div className="pub-card__blob" style={{ left: -6, bottom: -6, width: 40, height: 28, background: "rgba(100,148,120,.3)" }} />
                    <div className="pub-card__blob" style={{ right: -5, top: -4, width: 32, height: 22, background: "rgba(156,200,172,.4)" }} />
                    <span className="pub-card__badge" style={{ background: isEvent ? "#FF6B35" : "#2D4A3E", color: isEvent ? "#fff" : "#E1F5EE" }}>
                      {isEvent ? "Event" : "Editor"}
                    </span>
                    <div className="pub-card__thumb-footer">
                      <svg width="6" height="6" viewBox="0 0 24 24" fill="#fff" stroke="none"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/></svg>
                      <span>{pinCount}</span>
                    </div>
                  </div>

                  {/* 텍스트 */}
                  <div className="pub-card__body">
                    <p className="pub-card__title">{mapItem.title}</p>
                    <p className="pub-card__desc">{isEmpty ? "장소를 먼저 추가해주세요." : (mapItem.description || "설명이 아직 없어요.")}</p>
                  </div>

                  {/* 선택 상태 */}
                  {isActive ? (
                    <div className="pub-card__check">
                      <div className="pub-card__check-icon">
                        <Check size={12} strokeWidth={3} color="#fff" />
                      </div>
                      <span>선택됨</span>
                    </div>
                  ) : (
                    <span className="pub-card__select-btn">선택</span>
                  )}
                </button>
              )
            })}
          </div>

          <div className="pub-caption">
            <p className="pub-caption__label">한마디</p>
            <div className="pub-caption__input">
              <textarea
                rows="3"
                value={publishSheet?.caption || ""}
                onChange={(e) => setPublishSheet((current) => ({ ...(current || {}), caption: e.target.value }))}
                placeholder="이 지도에 대한 짧은 소개를 남겨보세요."
              />
            </div>
          </div>

          <div className="pds__actions">
            <button className="pds__btn pds__btn--secondary" type="button" onClick={onClose}>
              닫기
            </button>
            <button className="pds__btn pds__btn--primary" type="button" onClick={onPublish}>
              프로필에 올리기
            </button>
          </div>
        </div>
      )}
    </BottomSheet>
  )
}
