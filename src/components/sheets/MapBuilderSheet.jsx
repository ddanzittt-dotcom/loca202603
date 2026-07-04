import { useMemo, useState } from "react"
import { Check, MapPlus, Sparkles, X } from "lucide-react"
import { FeatureEmoji } from "../FeatureEmoji"
import { getPlaceCategory } from "../../lib/placeCategories"
import { featureSort } from "../../lib/appUtils"

// 지도 만들기 = 채집한 도감 카드를 골라 묶는다 (채집-우선 구조 C단계).
// 후보: 아직 어떤 지도에도 안 담긴 채집 카드(mapless).
// 고른 카드들로 새 지도를 만들고 한 번에 담는다.

export function MapBuilderSheet({
  open,
  features = [],
  busy = false,
  onClose,
  onCreate,
  onStartBlank,
}) {
  // 열 때마다 부모가 key 로 리마운트하므로 상태는 자연히 초기화된다
  const [title, setTitle] = useState("")
  const [selected, setSelected] = useState(() => new Set())

  // 도감 순번(N.###)은 오래된 채집부터 고정 — 내 장소 도감과 같은 규칙
  const cards = useMemo(() => {
    const ordered = [...features].sort((a, b) => featureSort(b, a))
    return ordered.map((feature, index) => ({
      feature,
      key: feature.id || feature.feature_id,
      dexNo: String(index + 1).padStart(3, "0"),
    }))
  }, [features])

  if (!open) return null

  const toggle = (key) => {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const count = selected.size
  const canCreate = count > 0 && title.trim().length > 0 && !busy

  const handleCreate = () => {
    if (!canCreate) return
    onCreate?.(title.trim(), Array.from(selected))
  }

  return (
    <div className="mbld-backdrop" onClick={onClose} role="presentation">
      <section
        className="mbld-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="지도 만들기"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="mbld-head">
          <div>
            <span className="mbld-eyebrow">NEW MAP</span>
            <strong>담을 카드를 골라요</strong>
          </div>
          <button type="button" className="mbld-close" onClick={onClose} aria-label="닫기">
            <X size={15} strokeWidth={2.4} />
          </button>
        </header>

        <label className="mbld-name">
          <span>지도 이름</span>
          <input
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="예: 성수동 카페 산책"
            maxLength={40}
          />
        </label>

        {cards.length > 0 ? (
          <>
            <div className="mbld-grid" role="group" aria-label="채집한 카드">
              {cards.map(({ feature, key, dexNo }) => {
                const category = getPlaceCategory(feature)
                const isOn = selected.has(key)
                return (
                  <button
                    key={key}
                    type="button"
                    className={`mbld-card${isOn ? " is-on" : ""}`}
                    style={{ "--cat-color": category?.color }}
                    onClick={() => toggle(key)}
                    aria-pressed={isOn}
                  >
                    <span className="mbld-card__no">N.{dexNo}</span>
                    <span className="mbld-card__stage" aria-hidden="true">
                      <FeatureEmoji feature={feature} size={34} unicodeFontSize={22} />
                    </span>
                    <span className="mbld-card__name">{(feature.title || "이름 없는 장소").trim()}</span>
                    {isOn ? (
                      <span className="mbld-card__check" aria-hidden="true">
                        <Check size={13} strokeWidth={3} />
                      </span>
                    ) : null}
                  </button>
                )
              })}
            </div>

            <div className="mbld-actions">
              <button type="button" className="mbld-ghost" onClick={onStartBlank}>
                빈 지도로 시작
              </button>
              <button type="button" className="mbld-primary" disabled={!canCreate} onClick={handleCreate}>
                <MapPlus size={15} strokeWidth={2.2} aria-hidden="true" />
                {busy ? "만드는 중…" : count > 0 ? `${count}장으로 지도 만들기` : "카드를 골라주세요"}
              </button>
            </div>
          </>
        ) : (
          <div className="mbld-empty">
            <Sparkles size={26} strokeWidth={1.8} aria-hidden="true" />
            <strong>아직 담을 카드가 없어요</strong>
            <p>먼저 장소를 채집하면 여기서 골라 지도로 묶을 수 있어요.</p>
            <button type="button" className="mbld-ghost" onClick={onStartBlank}>
              빈 지도로 시작
            </button>
          </div>
        )}
      </section>
    </div>
  )
}
