import { BottomSheet } from "../ui"
import { Check } from "lucide-react"
import { getProfilePlacementState } from "../../lib/mapPlacement"

// "지도 올리기" 시트
// - 미발행 지도: 발행 후 프로필에 올리기 제안.
// - 이미 발행됐지만 프로필 미노출 지도: 바로 프로필에 올리기.
// - 행사 지도: 대시보드에서 이미 발행된 경우만 후보로 노출. 발행은 불가.
//
// props
//   publishSheet     { selectedMapId, caption, justPublishedMapId? } | null
//   setPublishSheet  setter
//   candidates       후보 지도 목록 (미발행 non-event + 발행됨/프로필 미노출)
//   features
//   onPublish        () => Promise<string|null>  — 발행 후 mapId 리턴
//   onAddToProfile   (mapId) => void  — 이미 발행된 지도를 바로 프로필에 올리는 진입점
//   onOfferAddToProfile?  (mapId) => void  — 발행 성공 후 "프로필에 올리기" 진입점
//   onClose
//   publishing       boolean
export function PublishSheet({
  publishSheet,
  setPublishSheet,
  candidates = [],
  features,
  onPublish,
  onAddToProfile,
  onOfferAddToProfile,
  onClose,
  publishing = false,
}) {
  const justPublishedMapId = publishSheet?.justPublishedMapId || null
  const justPublishedMap = justPublishedMapId
    ? candidates.find((mapItem) => mapItem.id === justPublishedMapId) || null
    : null

  const selectedMap = candidates.find((mapItem) => mapItem.id === publishSheet?.selectedMapId) || null
  const selectedPlacement = selectedMap ? getProfilePlacementState(selectedMap, null) : null
  const selectedMapFeatures = selectedMap ? features.filter((f) => f.mapId === selectedMap.id) : []
  const selectedNeedsPublish = Boolean(selectedPlacement?.canPublish)
  const selectedAddsDirectly = Boolean(selectedPlacement?.isPublished)
  const canSubmit = Boolean(selectedMap) && selectedMapFeatures.length > 0 && !publishing

  const handleSubmit = async () => {
    if (!selectedMap) return
    if (selectedNeedsPublish) {
      const publishedMapId = await onPublish()
      if (publishedMapId) {
        // 발행 성공 — 다음 단계로 "프로필에 올리기 제안" 화면으로 전환.
        setPublishSheet({ selectedMapId: null, caption: "", justPublishedMapId: publishedMapId })
      }
      return
    }
    if (selectedAddsDirectly) {
      // 이미 발행된 지도: 공통 confirm 으로 바로 전환.
      onAddToProfile?.(selectedMap.id)
    }
  }

  const primaryLabel = publishing
    ? (selectedNeedsPublish ? "발행 중..." : "올리는 중...")
    : (selectedNeedsPublish ? "발행하기" : "프로필에 올리기")

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

  // ── 후보 선택 뷰 ──
  return (
    <BottomSheet
      open={Boolean(publishSheet)}
      title="프로필에 어떤 지도를 올릴까요?"
      subtitle="발행 안 한 지도는 발행 후 올라가요"
      onClose={onClose}
    >
      {candidates.length === 0 ? (
        <article className="empty-card">
          <strong>지금 올릴 지도가 없어요.</strong>
          <p>새 지도를 만들거나, 프로필에서 내린 지도를 다시 올릴 수 있어요.</p>
        </article>
      ) : (
        <div className="form-stack">
          <article className="empty-card" style={{ padding: "14px 16px", marginBottom: 10 }}>
            <strong>발행과 프로필 올리기는 달라요.</strong>
            <p>발행은 공개 링크를 만드는 것, 프로필에 올리기는 내 갤러리에 보여주는 것이에요.</p>
          </article>

          <div className="card-list">
            {candidates.map((mapItem) => {
              const mapFeatures = features.filter((f) => f.mapId === mapItem.id)
              const pinCount = mapFeatures.filter((f) => f.type === "pin").length
              const isActive = publishSheet?.selectedMapId === mapItem.id
              const isEmpty = mapFeatures.length === 0
              const placement = getProfilePlacementState(mapItem, null)
              const statusLabel = placement.isPublished ? "발행됨" : "저장용"
              const statusBg = placement.isPublished ? "#E1F5EE" : "#FAEEDA"
              const statusColor = placement.isPublished ? "#085041" : "#633806"
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
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                      <p className="pub-card__title" style={{ margin: 0 }}>{mapItem.title}</p>
                      <span style={{
                        fontSize: 9, fontWeight: 500,
                        padding: "1px 6px", borderRadius: 8,
                        background: statusBg, color: statusColor,
                      }}>{statusLabel}</span>
                    </div>
                    <p className="pub-card__desc" style={{ margin: 0 }}>
                      {isEmpty ? "장소를 먼저 추가해주세요." : (mapItem.description || "설명이 아직 없어요.")}
                    </p>
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
              onClick={handleSubmit}
            >
              {primaryLabel}
            </button>
          </div>
        </div>
      )}
    </BottomSheet>
  )
}
