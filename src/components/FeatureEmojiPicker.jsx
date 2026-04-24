import { useMemo, useRef, useState } from "react"
import { X as XIcon, Search as SearchIcon } from "lucide-react"
import {
  EMOJI_CATALOG,
  EMOJI_TABS,
  loadRecentEmojis,
  pushRecentEmoji,
} from "../lib/emojiCatalog"

/**
 * 장소 카드 전용 이모지 피커 바텀시트.
 * 시안: design/2.loca_place_card_proposal_v5.html (section 03)
 *
 * 형태별 탭 7개 (🕘 최근 / 😊 표정 / 🍰 음식 / 🌿 식물 / 🐰 동물 / ✨ 심볼 / 🏠 오브젝트).
 * 용도별 카테고리(카페·음식점 등)는 의도적으로 제공하지 않는다.
 *
 * 부모에서 조건부 렌더링(`{open ? <FeatureEmojiPicker .../> : null}`)하는 것을 전제로 한다 —
 * 최근 사용 · 초기 탭 선택은 useState 초기값으로 처리해 useEffect 의존을 최소화.
 */
export function FeatureEmojiPicker({ selectedEmoji, onSelect, onClose }) {
  const initialRecent = useMemo(() => loadRecentEmojis(), [])
  const [tab, setTab] = useState(initialRecent.length > 0 ? "recent" : "face")
  const [query, setQuery] = useState("")
  const [recent] = useState(initialRecent)
  const bodyRef = useRef(null)

  const visible = useMemo(() => {
    const q = query.trim()
    if (q) {
      return EMOJI_CATALOG.filter((item) => item.n.includes(q) || item.e === q)
    }
    if (tab === "recent") {
      if (recent.length === 0) return []
      return recent.map((e) => EMOJI_CATALOG.find((item) => item.e === e) || { e, n: "", g: "recent" })
    }
    return EMOJI_CATALOG.filter((item) => item.g === tab)
  }, [query, tab, recent])

  const pick = (emoji) => {
    if (!emoji) return
    pushRecentEmoji(emoji)
    onSelect?.(emoji)
  }

  const handleTabChange = (nextTab) => {
    setTab(nextTab)
    if (bodyRef.current) bodyRef.current.scrollTop = 0
  }

  const handleQueryChange = (value) => {
    setQuery(value)
    if (bodyRef.current) bodyRef.current.scrollTop = 0
  }

  return (
    <>
      <div className="fes-picker-backdrop" onClick={onClose} />
      <section className="fes-picker" role="dialog" aria-modal="true" aria-label="이모지 선택">
        <div className="fes-handle" />
        <div className="fes-picker-head">
          <span className="fes-picker-title">이모지 선택</span>
          <button className="fes-close" type="button" onClick={onClose} aria-label="닫기">
            <XIcon size={12} />
          </button>
        </div>

        <div className="fes-picker-search">
          <SearchIcon size={14} />
          <input
            type="text"
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            placeholder="이모지 검색 (예: 꽃, 커피)"
            aria-label="이모지 검색"
          />
        </div>

        {query.trim() ? null : (
          <div className="fes-picker-tabs" role="tablist">
            {EMOJI_TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-label={t.aria}
                aria-selected={tab === t.id}
                className={`fes-picker-tab${tab === t.id ? " is-active" : ""}`}
                onClick={() => handleTabChange(t.id)}
              >
                <span>{t.label}</span>
              </button>
            ))}
          </div>
        )}

        <div className="fes-picker-body" ref={bodyRef}>
          {visible.length === 0 ? (
            <div className="fes-picker-empty">
              {query.trim()
                ? `"${query.trim()}"에 맞는 이모지가 없어요.`
                : "최근 사용한 이모지가 없어요. 다른 탭에서 골라보세요."}
            </div>
          ) : (
            <div className="fes-picker-grid">
              {visible.map((item, idx) => {
                const isSel = item.e === selectedEmoji
                return (
                  <button
                    key={`${item.e}-${idx}`}
                    type="button"
                    className={`fes-picker-cell${isSel ? " is-selected" : ""}`}
                    onClick={() => pick(item.e)}
                    aria-label={item.n ? `${item.n} ${item.e}` : item.e}
                    title={item.n}
                  >
                    <span>{item.e}</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </section>
    </>
  )
}
