import { useEffect, useMemo, useRef, useState } from "react"
import {
  ArrowLeft,
  X,
  MapPin,
  Search as SearchIcon,
  ChevronDown,
  Clock,
  Map as MapGlyph,
  Users as UsersIcon,
} from "lucide-react"
import { hasSupabaseEnv } from "../lib/supabase"
import { useLocalStorageState } from "../hooks/useAppState"
import { PhotoBlock } from "../components/visuals/PhotoBlock"

// ─────────────────────────────────────────────────────────
// 정적 큐레이션 (검색 진입 보조 + B 화면 인기 검색 랭킹)
// 백엔드 trending API 도입 전 정적 fallback. 추후 교체.

const TRENDING_RANKING = [
  { text: "벚꽃 명소", change: { kind: "up", value: 3 } },
  { text: "성수동", change: { kind: "same" } },
  { text: "한옥 카페", change: { kind: "up", value: 1 } },
  { text: "감성카페", change: { kind: "down", value: 2 } },
  { text: "제주 동쪽", change: { kind: "new" } },
  { text: "독립서점", change: { kind: "same" } },
  { text: "야경 스팟", change: { kind: "up", value: 4 } },
  { text: "로컬 빵집", change: { kind: "new" } },
]

// ─────────────────────────────────────────────────────────
// 검색 매칭 유틸

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function highlight(text, query) {
  if (!query) return [{ match: false, text }]
  const normalized = String(text || "")
  const escaped = escapeRegex(query)
  const regex = new RegExp(`(${escaped})`, "ig")
  const parts = normalized.split(regex)
  return parts.filter((part) => part !== "").map((part) => ({
    match: part.toLowerCase() === query.toLowerCase(),
    text: part,
  }))
}

function HighlightedText({ text, query }) {
  const parts = highlight(text, query)
  return (
    <>
      {parts.map((part, idx) => part.match ? <mark key={idx}>{part.text}</mark> : <span key={idx}>{part.text}</span>)}
    </>
  )
}

function toMapSearchText(item) {
  const placeNames = Array.isArray(item.placeNames) ? item.placeNames : []
  const places = Array.isArray(item.places)
    ? item.places.map((place) => (typeof place === "string" ? place : place?.title || place?.name))
    : []
  return [
    item.title,
    item.description,
    item.caption,
    item.creator,
    item.creatorName,
    ...(item.tags || []),
    ...placeNames,
    ...places,
  ].filter(Boolean).join(" ").toLowerCase()
}

function toEditorSearchText(user) {
  return [user.name, user.handle, user.bio].filter(Boolean).join(" ").toLowerCase()
}

// ─────────────────────────────────────────────────────────
// 이벤트 상태 분류 (D-N / 진행중 / 곧 시작)

function getEventStatus(startDate, endDate) {
  if (!startDate || !endDate) return null
  const now = new Date()
  const todayNum = parseInt(`${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`)
  const start = parseInt(startDate)
  const end = parseInt(endDate)
  if (Number.isNaN(start) || Number.isNaN(end)) return null
  if (todayNum >= start && todayNum <= end) return { kind: "live", label: "진행중" }
  if (start > todayNum) {
    const startObj = new Date(parseInt(startDate.slice(0, 4)), parseInt(startDate.slice(4, 6)) - 1, parseInt(startDate.slice(6, 8)))
    const diff = Math.max(1, Math.ceil((startObj - now) / (1000 * 60 * 60 * 24)))
    if (diff <= 7) return { kind: "upcoming", label: "곧 시작" }
    if (diff <= 30) return { kind: "dday", label: `D-${diff}` }
    return { kind: "dday", label: `D-${diff}` }
  }
  return null
}

function formatEventPeriod(startDate, endDate) {
  if (!startDate || !endDate || startDate.length !== 8 || endDate.length !== 8) return ""
  const fmt = (s) => `${parseInt(s.slice(4, 6))}.${parseInt(s.slice(6, 8))}`
  return `${fmt(startDate)} — ${fmt(endDate)}`
}

const EVENT_THUMB_GRADIENTS = [
  "linear-gradient(135deg, #E8BCAD 0%, #D4836B 100%)",
  "linear-gradient(135deg, #C2D6B8 0%, #7A9E6B 100%)",
  "linear-gradient(135deg, #FAEEDA 0%, #D4A06A 100%)",
  "linear-gradient(135deg, #ABC6DC 0%, #5B7EA5 100%)",
  "linear-gradient(135deg, #E6F1FB 0%, #0C447C 100%)",
]
const EVENT_THUMB_EMOJIS = ["🌸", "🎡", "🍞", "🎨", "🎪", "📸", "🍃"]

function pickEventThumb(seed) {
  const code = String(seed || "").split("").reduce((acc, c) => acc + c.charCodeAt(0), 0)
  return {
    gradient: EVENT_THUMB_GRADIENTS[code % EVENT_THUMB_GRADIENTS.length],
    emoji: EVENT_THUMB_EMOJIS[code % EVENT_THUMB_EMOJIS.length],
  }
}

// 미니맵 마커 위치 (정적)
const MINIMAP_PINS = [
  { top: "22%", left: "38%", kind: "primary" },
  { top: "48%", left: "62%", kind: "primary" },
  { top: "62%", left: "30%", kind: "mint" },
  { top: "35%", left: "74%", kind: "primary" },
  { top: "70%", left: "55%", kind: "amber" },
  { top: "58%", left: "42%", kind: "primary" },
  { top: "80%", left: "25%", kind: "primary" },
  { top: "42%", left: "48%", kind: "mint" },
]

// ─────────────────────────────────────────────────────────

export function ExploreScreen({
  recommendedMaps = [],
  onOpenMap,
  onOpenCommunityEditor,
  users = [],
  followed = [],
  onSelectUser,
  embedded = false,
  section = "all",
  searchRequestId = 0,
}) {
  const [searchMode, setSearchMode] = useState("idle")
  const [query, setQuery] = useState("")
  const [recentQueries, setRecentQueries] = useLocalStorageState("loca:explore_recent_queries", [])

  const [editorResults, setEditorResults] = useState([])
  const [editorSearching, setEditorSearching] = useState(false)
  const debounceRef = useRef(null)

  const trimmed = query.trim()
  const normalizedQuery = trimmed.toLowerCase()
  const showAllSections = section === "all"
  const showCommunitySection = section === "all" || section === "community"
  const showEventsSection = section === "all" || section === "events"
  const handledSearchRequestRef = useRef(0)

  useEffect(() => {
    if (!showAllSections || searchRequestId <= handledSearchRequestRef.current) return
    handledSearchRequestRef.current = searchRequestId
    setSearchMode("active")
    setQuery("")
    setEditorResults([])
  }, [searchRequestId, showAllSections])

  const pushRecentQuery = (raw) => {
    const next = String(raw || "").trim()
    if (!next) return
    setRecentQueries((current) => {
      const filtered = (Array.isArray(current) ? current : []).filter((item) => item !== next)
      return [next, ...filtered].slice(0, 6)
    })
  }

  const submitQuery = (text) => {
    const next = String(text || "").trim()
    setQuery(next)
    setSearchMode("active")
    if (next) pushRecentQuery(next)
  }

  const cancelSearch = () => {
    setSearchMode("idle")
    setQuery("")
    setEditorResults([])
  }

  const clearQuery = () => {
    setQuery("")
    setEditorResults([])
  }

  const removeRecent = (text) => {
    setRecentQueries((current) => (Array.isArray(current) ? current : []).filter((item) => item !== text))
  }

  const clearAllRecent = () => {
    setRecentQueries([])
  }

  // 입력 중 → 지도/에디터 검색 (debounce 200ms)
  const filteredMaps = useMemo(() => {
    if (!normalizedQuery) return []
    return recommendedMaps.filter((item) => toMapSearchText(item).includes(normalizedQuery))
  }, [normalizedQuery, recommendedMaps])

  const localEditorMatches = useMemo(() => {
    if (!normalizedQuery) return []
    return users.filter((user) => toEditorSearchText(user).includes(normalizedQuery))
  }, [normalizedQuery, users])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!normalizedQuery) {
      setEditorResults([])
      setEditorSearching(false)
      return
    }
    debounceRef.current = setTimeout(async () => {
      if (!hasSupabaseEnv) {
        setEditorResults(localEditorMatches)
        return
      }
      setEditorSearching(true)
      try {
        const { searchProfiles } = await import("../lib/mapService")
        const results = await searchProfiles(normalizedQuery)
        setEditorResults(results.length > 0 ? results : localEditorMatches)
      } catch {
        setEditorResults(localEditorMatches)
      } finally {
        setEditorSearching(false)
      }
    }, 200)
    return () => debounceRef.current && clearTimeout(debounceRef.current)
  }, [normalizedQuery, localEditorMatches])

  // ── 이벤트 데이터 ──
  const [events, setEvents] = useState([])
  const [eventsLoading, setEventsLoading] = useState(true)
  const [eventsError, setEventsError] = useState("")
  const [showEventList, setShowEventList] = useState(false)
  // 가볼만한 곳 필터 — '전체' | '행사' | '인기'
  const [spotFilter, setSpotFilter] = useState("전체")
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [eventDetail, setEventDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState("")
  const [overviewExpanded, setOverviewExpanded] = useState(false)
  const eventsRequestRef = useRef(0)
  const detailAbortRef = useRef(null)

  const fetchEvents = async () => {
    const url = `/api/events?_t=${Date.now()}`
    const resp = await fetch(url, { cache: "no-store" })
    const data = await resp.json().catch(() => ({}))
    if (!resp.ok) {
      throw new Error(typeof data?.error === "string" ? data.error : "행사를 불러오지 못했어요.")
    }
    return data
  }

  useEffect(() => {
    let cancelled = false
    const requestId = ++eventsRequestRef.current
    fetchEvents()
      .then((data) => {
        if (!cancelled && requestId === eventsRequestRef.current) {
          setEvents(data.items?.length > 0 ? data.items : [])
          setEventsError("")
        }
      })
      .catch((error) => {
        if (!cancelled && requestId === eventsRequestRef.current) {
          setEvents([])
          setEventsError(error?.message || "행사를 불러오지 못했어요.")
        }
      })
      .finally(() => {
        if (!cancelled && requestId === eventsRequestRef.current) setEventsLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  const formatEventDate = (dateStr) => {
    if (!dateStr || dateStr.length !== 8) return ""
    return `${parseInt(dateStr.slice(4, 6))}.${parseInt(dateStr.slice(6, 8))}`
  }

  const openEventDetail = async (event) => {
    detailAbortRef.current?.abort?.()
    const controller = new AbortController()
    detailAbortRef.current = controller
    setSelectedEvent(event)
    setEventDetail(null)
    setDetailLoading(true)
    setDetailError("")
    setOverviewExpanded(false)
    try {
      const typeParam = event.contentTypeId ? `&contentTypeId=${event.contentTypeId}` : ""
      const resp = await fetch(`/api/event-detail?contentId=${event.id}${typeParam}`, { signal: controller.signal })
      const data = await resp.json().catch(() => ({}))
      if (!resp.ok) {
        throw new Error(typeof data?.error === "string" ? data.error : "상세 정보를 불러오지 못했어요.")
      }
      if (detailAbortRef.current !== controller) return
      if (data.detail) setEventDetail(data.detail)
      else setDetailError("상세 정보가 비어 있어 기본 정보만 보여줄게요.")
    } catch (error) {
      if (error?.name === "AbortError") return
      if (detailAbortRef.current === controller) {
        setDetailError(error?.message || "상세 정보를 불러오지 못했어요.")
      }
    } finally {
      if (detailAbortRef.current === controller) {
        setDetailLoading(false)
        detailAbortRef.current = null
      }
    }
  }

  useEffect(() => () => {
    detailAbortRef.current?.abort?.()
  }, [])

  // v2 modifier — Cream & Ember 리톤. 기존 클래스 보존하고 그 위에 추가.
  const sectionClassName = embedded
    ? "explore-screen explore-screen--embedded explore-screen--v2"
    : "screen screen--scroll explore-screen explore-screen--v2"

  // ─────────────────────────────────────
  // 검색 활성 모드 (B/C 화면)
  if (showAllSections && searchMode === "active") {
    return (
      <section className="screen screen--scroll explore-screen explore-screen--v2 explore-screen--search">
        <div className="ex-search-active-bar">
          <div className="ex-search-active-input">
            <SearchIcon size={16} className="ex-search-ico" />
            <input
              autoFocus
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onBlur={() => { if (trimmed) pushRecentQuery(trimmed) }}
              placeholder="지도, 에디터 검색"
            />
            {query.length > 0 ? (
              <button type="button" className="ex-clear-btn" aria-label="지우기" onClick={clearQuery}>
                <X size={9} strokeWidth={3} />
              </button>
            ) : null}
          </div>
          <button type="button" className="ex-cancel-btn" onClick={cancelSearch}>취소</button>
        </div>

        {trimmed.length === 0 ? (
          <>
            {recentQueries.length > 0 ? (
              <div className="ex-recent-block">
                <div className="ex-recent-head">
                  <span className="ex-recent-head-label">최근 검색</span>
                  <button type="button" className="ex-recent-clear-all" onClick={clearAllRecent}>모두 지우기</button>
                </div>
                <div className="ex-recent-list">
                  {recentQueries.map((text) => (
                    <div key={text} className="ex-recent-item">
                      <button
                        type="button"
                        className="ex-recent-item__hit"
                        onClick={() => submitQuery(text)}
                      >
                        <span className="ex-recent-ico"><Clock size={13} strokeWidth={2} /></span>
                        <span className="ex-recent-text">{text}</span>
                      </button>
                      <button
                        type="button"
                        className="ex-recent-remove"
                        aria-label="삭제"
                        onClick={() => removeRecent(text)}
                      >
                        <X size={11} strokeWidth={2.2} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="ex-trending-block">
              <div className="ex-trending-head">
                <span className="ex-trending-title">인기 검색</span>
                <span className="ex-trending-time">방금 업데이트</span>
              </div>
              <div className="ex-trending-grid">
                {TRENDING_RANKING.map((item, idx) => {
                  const rank = idx + 1
                  const isTop = rank <= 3
                  return (
                    <button
                      key={item.text}
                      type="button"
                      className="ex-trending-item"
                      onClick={() => submitQuery(item.text)}
                    >
                      <span className={`ex-trending-rank${isTop ? " is-top" : ""}`}>{rank}</span>
                      <span className="ex-trending-text">{item.text}</span>
                      {item.change?.kind === "up" ? (
                        <span className="ex-trending-change up">▲ {item.change.value}</span>
                      ) : item.change?.kind === "down" ? (
                        <span className="ex-trending-change down">▼ {item.change.value}</span>
                      ) : item.change?.kind === "new" ? (
                        <span className="ex-trending-change new">NEW</span>
                      ) : (
                        <span className="ex-trending-change same">—</span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          </>
        ) : (
          // C 화면: 지도 + 에디터 결과
          <>
            {filteredMaps.length === 0 && editorResults.length === 0 && !editorSearching ? (
              <div className="ex-empty-results">
                <div className="ex-empty-results__icon">
                  <SearchIcon size={20} color="#FF6B35" />
                </div>
                <p className="ex-empty-results__title">{`"${trimmed}"에 대한 결과가 없어요`}</p>
                <p className="ex-empty-results__hint">다른 키워드로 검색해보세요</p>
              </div>
            ) : (
              <>
                {filteredMaps.length > 0 ? (
                  <div className="ex-results-section">
                    <div className="ex-results-head">
                      <span className="ex-results-cat-icon ex-results-cat-icon--maps">
                        <MapGlyph size={13} strokeWidth={1.8} />
                      </span>
                      <span className="ex-results-cat-label">지도</span>
                      <span className="ex-results-cat-count">{filteredMaps.length}개</span>
                    </div>
                    <div className="ex-result-list">
                      {filteredMaps.slice(0, 4).map((item) => {
                        const gradStart = item.gradient?.[0] || "#E8BCAD"
                        const gradEnd = item.gradient?.[1] || "#D4836B"
                        return (
                          <button
                            key={item.id}
                            type="button"
                            className="ex-result-row"
                            onClick={() => {
                              pushRecentQuery(trimmed)
                              onOpenMap?.(item.mapId || item.id)
                            }}
                          >
                            <div
                              className="ex-result-thumb"
                              style={{ background: `linear-gradient(135deg, ${gradStart} 0%, ${gradEnd} 100%)` }}
                            />
                            <div className="ex-result-info">
                              <div className="ex-result-title">
                                <HighlightedText text={item.title || ""} query={trimmed} />
                              </div>
                              <div className="ex-result-meta">
                                {item.creator ? <>@{item.creator}</> : null}
                                {item.creator && (item.placeCount || 0) > 0 ? " · " : null}
                                {(item.placeCount || 0) > 0 ? `장소 ${item.placeCount}` : null}
                              </div>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ) : null}

                {editorResults.length > 0 ? (
                  <div className="ex-results-section">
                    <div className="ex-results-head">
                      <span className="ex-results-cat-icon ex-results-cat-icon--editors">
                        <UsersIcon size={13} strokeWidth={1.8} />
                      </span>
                      <span className="ex-results-cat-label">에디터</span>
                      <span className="ex-results-cat-count">{editorResults.length}명</span>
                    </div>
                    <div className="ex-result-list">
                      {editorResults.slice(0, 4).map((user) => {
                        const avatarText = user.handle || user.name || ""
                        const titleText = user.handle ? `@${user.handle.replace(/^@/, "")}` : user.name
                        return (
                          <button
                            key={user.id}
                            type="button"
                            className="ex-result-row"
                            onClick={() => {
                              pushRecentQuery(trimmed)
                              onSelectUser?.(user)
                            }}
                          >
                            <div className="ex-result-thumb ex-result-thumb--editor">👤</div>
                            <div className="ex-result-info">
                              <div className="ex-result-title">
                                <HighlightedText text={titleText || avatarText || ""} query={trimmed} />
                              </div>
                              <div className="ex-result-meta">
                                {typeof user.followerCount === "number" ? `팔로워 ${user.followerCount}` : (followed.includes(user.id) ? "팔로잉 중" : "팔로우하지 않음")}
                                {typeof user.mapCount === "number" ? ` · 지도 ${user.mapCount}` : null}
                              </div>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ) : null}
              </>
            )}
          </>
        )}
      </section>
    )
  }

  // ─────────────────────────────────────
  // A 화면: 기본 상태
  return (
    <section className={sectionClassName}>
      {showAllSections ? (
        <>
          <div className="ex-h-row">
            <h1 className="ex-h-title">탐색</h1>
          </div>

          {/* Editor's Pick — 큐레이션된 추천 지도 (recommendedMaps[0]) */}
          {recommendedMaps && recommendedMaps.length > 0 ? (
            <EditorsPickCard
              map={recommendedMaps[0]}
              onOpen={onOpenMap}
              onSearch={() => setSearchMode("active")}
            />
          ) : null}
        </>
      ) : null}

      {showCommunitySection ? (
        <>
          <div className="ex-sec-h">
            <div>
              <span className="ex-sec-tag">TOGETHER</span>
              <h2 className="ex-sec-title">모두의 지도</h2>
              <p className="ex-sec-sub">동네 사람들이 함께 만들어가는 지도</p>
            </div>
          </div>

          <div className="ex-together-card">
            <div className="ex-together-blob" aria-hidden="true" />
            <div className="ex-minimap" aria-hidden="true">
              <div className="ex-minimap__streets" />
              <div className="ex-minimap__river" />
              {MINIMAP_PINS.map((pin, idx) => (
                <span
                  key={idx}
                  className={`ex-minimap__pin ex-minimap__pin--${pin.kind}`}
                  style={{ top: pin.top, left: pin.left }}
                />
              ))}
              <div className="ex-minimap__overlay">
                <MapPin size={9} fill="currentColor" stroke="none" />
                <strong>내 동네</strong>
                <span> · 지난 주 새로 기록됨</span>
              </div>
            </div>

            <div className="ex-together-actions">
              <button type="button" className="ex-together-btn" onClick={onOpenCommunityEditor}>
                <MapPin size={13} strokeWidth={2.4} />
                모두의 지도 둘러보기
              </button>
            </div>
          </div>
        </>
      ) : null}

      {showEventsSection ? (
        <SpotsSection
          events={events}
          loading={eventsLoading}
          error={eventsError}
          spotFilter={spotFilter}
          onSpotFilterChange={setSpotFilter}
          onOpenEvent={openEventDetail}
          onSeeMore={() => setShowEventList(true)}
        />
      ) : null}

      <div style={{ height: 18 }} />

      {showEventsSection && showEventList ? (
        <div className="event-list-screen">
          <div className="event-list-screen__header">
            <button className="event-list-screen__back" type="button" onClick={() => setShowEventList(false)} aria-label="뒤로가기"><ArrowLeft size={20} /></button>
            <h2>근처에서 기록해볼 만한 행사</h2>
            <span className="event-list-screen__count">{events.length}건</span>
          </div>
          <div className="event-list-screen__body">
            {events.map((event) => {
              const status = getEventStatus(event.startDate, event.endDate)
              const thumb = pickEventThumb(event.id || event.title)
              const period = formatEventPeriod(event.startDate, event.endDate)
              return (
                <button
                  key={event.id}
                  type="button"
                  className="ex-event-card"
                  onClick={() => { setShowEventList(false); openEventDetail(event) }}
                >
                  <div className="ex-event-thumb" style={{ background: thumb.gradient }}>
                    {event.image ? (
                      <span className="ex-event-thumb__img" style={{ backgroundImage: `url(${event.image})` }} />
                    ) : (
                      <span className="ex-event-thumb__ico">{thumb.emoji}</span>
                    )}
                  </div>
                  <div className="ex-event-info">
                    {period ? <div className="ex-event-period">{period}</div> : null}
                    <div className="ex-event-title">{event.title}</div>
                    {event.addr ? (
                      <div className="ex-event-meta">
                        <span>{event.addr}</span>
                      </div>
                    ) : null}
                  </div>
                  {status ? (
                    <span className={`ex-event-status ex-event-status--${status.kind}`}>{status.label}</span>
                  ) : null}
                </button>
              )
            })}
          </div>
        </div>
      ) : null}

      {showEventsSection && selectedEvent ? (
        <div className="event-detail-overlay" onClick={() => setSelectedEvent(null)}>
          <div className="event-detail-sheet" onClick={(e) => e.stopPropagation()}>
            <button className="event-detail-sheet__close" type="button" onClick={() => setSelectedEvent(null)} aria-label="닫기"><X size={18} /></button>
            {(eventDetail?.image || selectedEvent.image) ? (
              <div className="event-detail-sheet__hero" style={{ backgroundImage: `url(${eventDetail?.image || selectedEvent.image})` }} />
            ) : (
              <div className="event-detail-sheet__hero event-detail-sheet__hero--empty">🎪</div>
            )}

            <div className="event-detail-sheet__body">
              <h2 className="event-detail-sheet__title">{eventDetail?.title || selectedEvent.title}</h2>

              {detailLoading ? (
                <p className="event-detail-sheet__loading">정보를 불러오는 중...</p>
              ) : detailError ? (
                <p className="event-detail-sheet__loading">{detailError}</p>
              ) : eventDetail ? (
                <>
                  <div className="event-detail-sheet__info-grid">
                    {eventDetail.eventStartDate ? (
                      <div className="event-detail-sheet__info-row">
                        <span className="event-detail-sheet__label">📅 기간</span>
                        <span>{formatEventDate(eventDetail.eventStartDate)} ~ {formatEventDate(eventDetail.eventEndDate)}</span>
                      </div>
                    ) : null}
                    {eventDetail.eventPlace ? (
                      <div className="event-detail-sheet__info-row">
                        <span className="event-detail-sheet__label">📍 장소</span>
                        <span>{eventDetail.eventPlace}</span>
                      </div>
                    ) : null}
                    {eventDetail.addr ? (
                      <div className="event-detail-sheet__info-row">
                        <span className="event-detail-sheet__label">🗺 주소</span>
                        <span>{eventDetail.addr} {eventDetail.addrDetail}</span>
                      </div>
                    ) : null}
                    {eventDetail.playTime ? (
                      <div className="event-detail-sheet__info-row">
                        <span className="event-detail-sheet__label">⏰ 시간</span>
                        <span>{eventDetail.playTime}</span>
                      </div>
                    ) : null}
                    {eventDetail.useTimeFestival ? (
                      <div className="event-detail-sheet__info-row">
                        <span className="event-detail-sheet__label">💰 이용요금</span>
                        <span>{eventDetail.useTimeFestival}</span>
                      </div>
                    ) : null}
                    {eventDetail.ageLimit ? (
                      <div className="event-detail-sheet__info-row">
                        <span className="event-detail-sheet__label">👤 이용대상</span>
                        <span>{eventDetail.ageLimit}</span>
                      </div>
                    ) : null}
                    {eventDetail.sponsor ? (
                      <div className="event-detail-sheet__info-row">
                        <span className="event-detail-sheet__label">🏢 주최</span>
                        <span>{eventDetail.sponsor}</span>
                      </div>
                    ) : null}
                    {eventDetail.tel || eventDetail.sponsorTel ? (
                      <div className="event-detail-sheet__info-row">
                        <span className="event-detail-sheet__label">📞 연락처</span>
                        <span>{eventDetail.tel || eventDetail.sponsorTel}</span>
                      </div>
                    ) : null}
                  </div>

                  {eventDetail.program ? (
                    <div className="event-detail-sheet__section">
                      <h3>프로그램</h3>
                      <p>{eventDetail.program}</p>
                    </div>
                  ) : null}

                  {eventDetail.overview ? (
                    <div className="event-detail-sheet__section">
                      <h3>소개</h3>
                      <p className={overviewExpanded ? "" : "event-detail-sheet__overview-clamp"}>{eventDetail.overview}</p>
                      {eventDetail.overview.length > 120 ? (
                        <button className="event-detail-sheet__more-btn" type="button" onClick={() => setOverviewExpanded(!overviewExpanded)}>
                          {overviewExpanded ? "접기" : "더보기"}
                        </button>
                      ) : null}
                    </div>
                  ) : null}

                  {eventDetail.homepage ? (
                    <a className="event-detail-sheet__link" href={eventDetail.homepage} target="_blank" rel="noopener noreferrer">
                      🔗 홈페이지 바로가기
                    </a>
                  ) : null}
                </>
              ) : (
                <div className="event-detail-sheet__info-grid">
                  {selectedEvent.startDate ? (
                    <div className="event-detail-sheet__info-row">
                      <span className="event-detail-sheet__label">📅 기간</span>
                      <span>{formatEventDate(selectedEvent.startDate)} ~ {formatEventDate(selectedEvent.endDate)}</span>
                    </div>
                  ) : null}
                  {selectedEvent.addr ? (
                    <div className="event-detail-sheet__info-row">
                      <span className="event-detail-sheet__label">🗺 주소</span>
                      <span>{selectedEvent.addr}</span>
                    </div>
                  ) : null}
                  {selectedEvent.tel ? (
                    <div className="event-detail-sheet__info-row">
                      <span className="event-detail-sheet__label">📞 연락처</span>
                      <span>{selectedEvent.tel}</span>
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}

// ─────────────────────────────────────────────────────────
// 가볼만한 곳 섹션 — 헤더 + 내 위치 칩 + 필터칩 + SpotCard 리스트
// 참고: 참고자료/design-source/screen-explore.jsx ('가볼만한 곳')
// ─────────────────────────────────────────────────────────
function SpotsSection({ events, loading, error, spotFilter, onSpotFilterChange, onOpenEvent, onSeeMore }) {
  // 행사 데이터를 SpotCard 가 받는 spot 객체로 변환
  const spotsFromEvents = events.map((event) => {
    const status = getEventStatus(event.startDate, event.endDate)
    const period = formatEventPeriod(event.startDate, event.endDate)
    const thumb = pickEventThumb(event.id || event.title)
    return {
      _raw: event,
      kind: "event",
      dateLabel: period,
      day: status?.label || "",
      urgent: status?.kind === "urgent" || status?.kind === "live",
      title: event.title,
      sub: event.contentTypeName || event.category || "행사",
      loc: event.addr || event.area || "",
      distance: event.distance ? `${event.distance}` : "",
      thumb,
    }
  })

  // 필터 적용
  const filtered = spotsFromEvents.filter((s) => {
    if (spotFilter === "전체") return true
    if (spotFilter === "행사") return s.kind === "event"
    if (spotFilter === "인기") return s.kind === "hot" || s.kind === "rising"
    return true
  })

  return (
    <section className="ex-spots">
      <div className="ex-spots__head">
        <div>
          <h2 className="ex-spots__title">가볼만한 곳</h2>
          <p className="ex-spots__sub">가까운 행사 · 기록 많은 동네 장소</p>
        </div>
        <button type="button" className="ex-pill-btn ex-spots__loc">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
            <circle cx="12" cy="12" r="5" />
            <circle cx="12" cy="12" r="1.5" fill="var(--accent)" stroke="none" />
          </svg>
          내 위치 <span style={{ color: "var(--ink-mute)", fontWeight: 700 }}>· 근처</span>
        </button>
      </div>

      <div className="ex-spots__chips">
        {["전체", "행사", "인기"].map((f) => (
          <button
            key={f}
            type="button"
            className={`ex-filter-chip${spotFilter === f ? " is-active" : ""}`}
            onClick={() => onSpotFilterChange(f)}
          >
            {f}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="ex-spots__empty">행사를 불러오는 중...</div>
      ) : error ? (
        <div className="ex-spots__empty">{error}</div>
      ) : filtered.length === 0 ? (
        <div className="ex-spots__empty">
          {spotFilter === "인기" ? "인기 장소 데이터를 준비 중이에요" : "근처에서 열리는 행사가 없어요"}
        </div>
      ) : (
        <>
          <div className="ex-spots__list">
            {filtered.slice(0, 3).map((spot, idx) => (
              <SpotCard key={spot._raw?.id || idx} spot={spot} onClick={() => onOpenEvent(spot._raw)} />
            ))}
          </div>
          {filtered.length > 3 ? (
            <button type="button" className="ex-spots__more" onClick={onSeeMore}>
              더보기 <span className="ex-spots__more-num">{filtered.length}개</span> →
            </button>
          ) : null}
        </>
      )}
    </section>
  )
}

// SpotCard — 100px 좌측 이미지 + 우측 정보. kind 별 뱃지 변형.
function SpotCard({ spot, onClick }) {
  const isEvent = spot.kind === "event"
  const isRising = spot.kind === "rising"
  const isHot = spot.kind === "hot"
  const thumb = spot.thumb || {}
  return (
    <button type="button" className="ex-spot-card" onClick={onClick}>
      <div className="ex-spot-card__thumb" style={thumb.gradient ? { background: thumb.gradient } : undefined}>
        {spot._raw?.image ? (
          <span className="ex-spot-card__img" style={{ backgroundImage: `url(${spot._raw.image})` }} />
        ) : (
          <span className="ex-spot-card__ico">{thumb.emoji || "🎫"}</span>
        )}
        {isEvent && spot.day ? (
          <span className={`ex-spot-card__day${spot.urgent ? " is-urgent" : ""}`}>{spot.day}</span>
        ) : null}
      </div>
      <div className="ex-spot-card__body">
        <div className="ex-spot-card__tags">
          {isEvent ? (
            <span className="ex-spot-card__kicker">
              EVENT{spot.dateLabel ? ` · ${spot.dateLabel}` : ""}
            </span>
          ) : isRising ? (
            <>
              <span className="ex-spot-card__rising">↗ {spot.heatLabel || "뜨고 있어요"}</span>
              {spot.deltaPct ? <span className="ex-spot-card__delta">+{spot.deltaPct}%</span> : null}
            </>
          ) : isHot ? (
            <span className="ex-spot-card__hot">● {spot.heatLabel || "이번 주 인기"}</span>
          ) : null}
        </div>
        <div className="ex-spot-card__title">{spot.title}</div>
        {spot.sub ? <div className="ex-spot-card__sub">{spot.sub}</div> : null}
        <div className="ex-spot-card__foot">
          <MapPin size={10} strokeWidth={2} />
          <span className="ex-spot-card__loc">
            {spot.distance ? `${spot.distance} · ` : ""}{spot.loc}
          </span>
          {!isEvent && spot.records > 0 ? (
            <span className="ex-spot-card__rec">♥ {spot.records}</span>
          ) : null}
        </div>
      </div>
    </button>
  )
}

// ─────────────────────────────────────────────────────────
// Editor's Pick 2:1 큰 카드 — recommendedMaps[0] 사용
// 어두운 그라데이션 + 흰 타이틀 + "다른 지도 찾기" 흰 필 버튼
// ─────────────────────────────────────────────────────────
function EditorsPickCard({ map, onOpen, onSearch }) {
  if (!map) return null
  const title = map.title || "이번 주 추천"
  const meta = map.creator
    ? `@${String(map.creator).replace(/^@/, "")} · ${map.placeCount || 0}곳`
    : `${map.placeCount || 0}곳의 장소`
  const gradient = Array.isArray(map.gradient) && map.gradient.length >= 2
    ? `linear-gradient(135deg, ${map.gradient[0]}, ${map.gradient[1]})`
    : undefined
  return (
    <div className="ex-editor-section">
      <div className="ex-editor-head">
        <div>
          <span className="ex-editor-kicker">Editor&rsquo;s Pick</span>
          <h2 className="ex-editor-title">이번 주 추천</h2>
        </div>
        <button type="button" className="ex-pill-btn ex-editor-search" onClick={onSearch}>
          <SearchIcon size={12} strokeWidth={2} />
          다른 지도 찾기
        </button>
      </div>

      <button
        type="button"
        className="ex-editor-card"
        onClick={() => onOpen?.(map.mapId || map.id)}
        aria-label={`${title} 추천 지도 열기`}
      >
        <PhotoBlock
          tone="b"
          width="100%"
          height="100%"
          radius={16}
          style={gradient ? { background: gradient, aspectRatio: "2 / 1" } : { aspectRatio: "2 / 1" }}
        >
          <div className="ex-editor-card__overlay">
            <div className="ex-editor-card__title">{title}</div>
            <div className="ex-editor-card__meta">{meta}</div>
          </div>
        </PhotoBlock>
      </button>
    </div>
  )
}
