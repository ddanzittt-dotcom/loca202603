import { BottomSheet } from "../ui"
import { Check } from "lucide-react"

// 발행 시트 = "공개 링크를 만드는 시트"
// - 발행은 자동으로 프로필에 올리지 않는다. 프로필 노출은 별도 액션이다.
// - 행사지도 발행은 대시보드 전용이므로 후보에서 제외한다.
//
// props
//   publishSheet     { selectedMapId, caption, justPublishedMapId? } | null
//   setPublishSheet  setter
//   publishableMaps  발행 가능한 지도 목록 (non-event + !isPublished)
//   features
//   onPublish        () => Promise<string|null>  — 발행 후 mapId 리턴
//   onOfferAddToProfile?  (mapId) => void  — 발행 성공 후 "프로필에 올리기" 진입점
//   onClose
//   publishing       boolean
export function PublishSheet({
  publishSheet,
  setPublishSheet,
  publishableMaps,
  features,
  onPublish,
  onOfferAddToProfile,
  onClose,
  publishing = false,
}) {
  const justPublishedMapId = publishSheet?.justPublishedMapId || null
  const justPublishedMap = justPublishedMapId
    ? publishableMaps.find((mapItem) => mapItem.id === justPublishedMapId) || null
    : null

  const selectedMap = publishableMaps.find((mapItem) => mapItem.id === publishSheet?.selectedMapId) || null
  const selectedMapFeatures = selectedMap ? features.filter((f) => f.mapId === selectedMap.id) : []
  const canSubmit = Boolean(selectedMap) && selectedMapFeatures.length > 0 && !publishing

  const handlePublish = async () => {
    const publishedMapId = await onPublish()
    if (publishedMapId) {
      // 발행 성공 — 다음 단계로 "프로필에 올리기 제안" 화면으로 전환한다.
      setPublishSheet({ selectedMapId: null, caption: "", justPublishedMapId: publishedMapId })
    }
  }

  // ── 발행 성공 후속: 프로필에 올리기 제안 뷰 ──
  if (justPublishedMapId) {
    return (
      <BottomSheet
        open={Boolean(publishSheet)}
        title="발행이 완료됐어요"
        subtitle="보여주고 싶은 지도만 프로필에 올릴 수 있어요"
        onClose={onClose}
      >
        <div className="form-stack">
          <article className="empty-card" style={{ padding: "14px 16px", marginBottom: 10 }}>
            <strong>{justPublishedMap?.title || "지도"}</strong>
            <p>이제 공개 링크로 누구나 볼 수 있어요. 프로필에 올리면 내 갤러리에도 나타나요.</p>
          </article>

          <div className="pds__actions">
            <button className="pds__btn pds__btn--secondary" type="button" onClick={onClose}>
              나중에 하기
            </button>
            <button
              className="pds__btn pds__btn--primary"
              type="button"
              onClick={() => onOfferAddToProfile?.(justPublishedMapId)}
            >
              프로필에 올리기
            </button>
          </div>
        </div>
      </BottomSheet>
    )
  }

  // ── 발행 후보 선택 뷰 ──
  return (
    <BottomSheet
      open={Boolean(publishSheet)}
      title="이 지도를 발행할까요?"
      subtitle="발행하면 링크로 볼 수 있어요"
      onClose={onClose}
    >
      {publishableMaps.length === 0 ? (
        <article className="empty-card">
          <strong>지금 발행할 지도가 없어요.</strong>
          <p>새 지도를 만들거나 이미 발행된 지도를 확인해 보세요.</p>
        </article>
      ) : (
        <div className="form-stack">
          <article className="empty-card" style={{ padding: "14px 16px", marginBottom: 10 }}>
            <strong>발행은 공개 링크를 만드는 액션이에요.</strong>
            <p>보여주고 싶은 지도만 프로필에 올릴 수 있어요. 발행만으로 자동 노출되지 않아요.</p>
          </article>

          <div className="card-list">
            {publishableMaps.map((mapItem) => {
              const mapFeatures = features.filter((f) => f.mapId === mapItem.id)
              const pinCount = mapFeatures.filter((f) => f.type === "pin").length
              const isActive = publishSheet?.selectedMapId === mapItem.id
              const isEmpty = mapFeatures.length === 0
              return (
                <button
                  className={`pub-card${isActive ? " pub-card--active" : ""}`}
                  key={mapItem.id}
                  type="button"
                  onClick={() => setPublishSheet((current) => ({ ...(current || {}), selectedMapId: mapItem.id }))}
                >
                  <div className="pub-card__thumb">
                    <div className="pub-card__blob" style={{ left: -6, bottom: -6, width: 40, height: 28, background: "rgba(100,148,120,.3)" }} />
                    <div className="pub-card__blob" style={{ right: -5, top: -4, width: 32, height: 22, background: "rgba(156,200,172,.4)" }} />
                    <div className="pub-card__thumb-footer">
                      <svg width="6" height="6" viewBox="0 0 24 24" fill="#fff" stroke="none"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/></svg>
                      <span>{pinCount}</span>
                    </div>
                  </div>

                  <div className="pub-card__body">
                    <p className="pub-card__title">{mapItem.title}</p>
                    <p className="pub-card__desc">{isEmpty ? "장소를 먼저 추가해주세요." : (mapItem.description || "설명이 아직 없어요.")}</p>
                  </div>

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

          <div className="pds__actions">
            <button className="pds__btn pds__btn--secondary" type="button" onClick={onClose}>
              닫기
            </button>
            <button
              className="pds__btn pds__btn--primary"
              type="button"
              disabled={!canSubmit}
              onClick={handlePublish}
            >
              {publishing ? "발행 중..." : "발행하기"}
            </button>
          </div>
        </div>
      )}
    </BottomSheet>
  )
}
