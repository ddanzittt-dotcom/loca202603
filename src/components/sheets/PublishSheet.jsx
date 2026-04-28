import { BottomSheet } from "../ui"
import { Check } from "lucide-react"
import { getProfilePlacementState } from "../../lib/mapPlacement"

// "지도 공개" 시트
// - 링크 공유가 꺼진 지도: 링크 공유 후 프로필 공개 제안.
// - 링크 공유 중이지만 프로필 미노출 지도: 바로 프로필 공개.
// - 행사 지도: 외부 관리 화면에서 이미 링크 공유 중인 경우만 후보로 노출.
//
// props
//   publishSheet     { selectedMapId, caption, justPublishedMapId? } | null
//   setPublishSheet  setter
//   candidates       후보 지도 목록 (나만 보기 non-event + 링크 공유 중/프로필 미노출)
//   features
//   onPublish        () => Promise<string|null>  — 링크 공유 후 mapId 리턴
//   onAddToProfile   (mapId) => void  — 이미 링크 공유 중인 지도를 바로 프로필 공개하는 진입점
//   onOfferAddToProfile?  (mapId) => void  — 링크 공유 성공 후 "내 프로필에 공개" 진입점
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
        // 링크 공유 성공 — 다음 단계로 "프로필 공개 제안" 화면으로 전환.
        setPublishSheet({ selectedMapId: null, caption: "", justPublishedMapId: publishedMapId })
      }
      return
    }
    if (selectedAddsDirectly) {
      // 이미 링크 공유 중인 지도: 공통 confirm 으로 바로 전환.
      onAddToProfile?.(selectedMap.id)
    }
  }

  const primaryLabel = publishing
    ? (selectedNeedsPublish ? "링크 공유 켜는 중..." : "공개하는 중...")
    : (selectedNeedsPublish ? "링크 공유 켜기" : "내 프로필에 공개")

  // ── 링크 공유 성공 후속: 프로필 공개 제안 뷰 ──
  if (justPublishedMapId) {
    return (
      <BottomSheet
        open={Boolean(publishSheet)}
        title="링크 공유가 켜졌어요"
        subtitle="보여주고 싶은 지도만 프로필에 공개할 수 있어요"
        onClose={onClose}
      >
        <div className="form-stack">
          <article className="empty-card" style={{ padding: "14px 16px", marginBottom: 10 }}>
            <strong>{justPublishedMap?.title || "지도"}</strong>
            <p>이제 링크를 아는 사람이 볼 수 있어요. 프로필에 공개하면 내 갤러리에도 나타나요.</p>
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
              내 프로필에 공개
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
      title="프로필에 어떤 지도를 공개할까요?"
      subtitle="나만 보기 지도는 링크 공유를 먼저 켜요"
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
            <strong>링크 공유와 프로필 공개는 달라요.</strong>
            <p>링크 공유는 볼 수 있는 링크를 만드는 것, 프로필 공개는 내 갤러리에 보여주는 것이에요.</p>
          </article>

          <div className="card-list">
            {candidates.map((mapItem) => {
              const mapFeatures = features.filter((f) => f.mapId === mapItem.id)
              const pinCount = mapFeatures.filter((f) => f.type === "pin").length
              const isActive = publishSheet?.selectedMapId === mapItem.id
              const isEmpty = mapFeatures.length === 0
              const placement = getProfilePlacementState(mapItem, null)
              const statusLabel = placement.isPublished ? "링크 공유 중" : "나만 보기"
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
