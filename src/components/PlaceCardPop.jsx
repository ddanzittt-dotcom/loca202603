import { useEffect } from "react"
import { MapPin, X } from "lucide-react"
import { FeatureEmoji } from "./FeatureEmoji"

const TYPE_LABELS = { pin: "장소", route: "길", area: "영역" }

/**
 * PlaceCardPop — 장소 목록에서 장소를 누르면 뿅 하고 뜨는 장소 카드.
 * 지도로 이동하지 않고 카드 한 장으로 먼저 보여준다. (지도 이동은 카드 안 버튼)
 */
export function PlaceCardPop({ feature, mapTitle, onClose, onOpenOnMap }) {
  useEffect(() => {
    const handleKey = (event) => {
      if (event.key === "Escape") onClose?.()
    }
    window.addEventListener("keydown", handleKey)
    return () => window.removeEventListener("keydown", handleKey)
  }, [onClose])

  if (!feature) return null

  const title = (feature.title || "").trim() || "이름 없는 장소"
  const typeLabel = TYPE_LABELS[feature.type] || "장소"
  const tags = Array.isArray(feature.tags) ? feature.tags.filter(Boolean).slice(0, 4) : []
  const note = (feature.note || "").trim()
  const savedDate = feature.updatedAt ? new Date(feature.updatedAt) : null
  const savedLabel = savedDate && !Number.isNaN(savedDate.getTime())
    ? `${savedDate.getFullYear()}.${String(savedDate.getMonth() + 1).padStart(2, "0")}.${String(savedDate.getDate()).padStart(2, "0")}`
    : null

  return (
    <div className="pcp-backdrop" onClick={onClose} role="presentation">
      <article
        className="pcp-card"
        role="dialog"
        aria-modal="true"
        aria-label={`${title} 장소 카드`}
        onClick={(event) => event.stopPropagation()}
      >
        <button type="button" className="pcp-close" onClick={onClose} aria-label="닫기">
          <X size={16} strokeWidth={2.2} />
        </button>

        <div className="pcp-card__stage">
          <FeatureEmoji feature={feature} size={72} unicodeFontSize={44} ariaLabel={title} />
        </div>

        <div className="pcp-card__meta">
          <span className="pcp-card__type">{typeLabel}</span>
          {savedLabel ? <span className="pcp-card__date">{savedLabel}</span> : null}
        </div>

        <h2 className="pcp-card__title">{title}</h2>

        {tags.length ? (
          <div className="pcp-card__tags">
            {tags.map((tag) => <span key={tag}>#{tag}</span>)}
          </div>
        ) : null}

        {note ? <p className="pcp-card__note">{note}</p> : null}

        <footer className="pcp-card__foot">
          {mapTitle ? (
            <span className="pcp-card__mapname">
              <MapPin size={13} strokeWidth={2.2} aria-hidden="true" />
              {mapTitle}
            </span>
          ) : <span />}
          <button type="button" className="pcp-card__open" onClick={onOpenOnMap}>
            지도에서 보기
          </button>
        </footer>
      </article>
    </div>
  )
}
