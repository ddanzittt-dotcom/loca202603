import { useEffect, useState, useRef } from "react"
import { Search as SearchIcon, X, ArrowLeft, Link2, Navigation, MapPin } from "lucide-react"
import { MapErrorBoundary } from "../components/MapErrorBoundary"

import { NaverMap } from "../components/NaverMap"
import { ShareSheet } from "../components/sheets/ShareSheet"

const formatFeatureMeta = (feature) => {
  if (!feature) return ""
  if (feature.type === "route") return `경로 · ${feature.points.length}개 지점`
  if (feature.type === "area") return `범위 · ${feature.points.length}개 꼭짓점`
  return "장소"
}

const summarizeFeatureNote = (feature, length = 46) => {
  if (!feature?.note) return "등록된 메모가 아직 없습니다."
  return feature.note.length > length ? `${feature.note.slice(0, length)}...` : feature.note
}

export function MapEditorScreen({
  map,
  features,
  selectedFeatureId,
  selectedFeatureSummary,
  editorMode,
  draftPoints,
  focusPoint,
  fitTrigger,
  readOnly = false,
  hideCount = false,
  communityMode = false,
  showLabels = true,
  myLocation = null,
  characterStyle = "m3",
  levelEmoji = "🥚",
  onBack,
  onLocate,
  onSearchLocation,
  onModeChange,
  onMapTap,
  onFeatureTap,
  onUndoDraft,
  onCompleteRoute,
  onCompleteArea,
  onCancelDraft,
  onToggleLabels,
  onOpenFeatureDetail,
  onCloseFeatureSummary,
  onAddMemo,
  onOpenShareEditor,
  onStripFeatureTap,
  showToast,
  shareUrl = "",
}) {
  const isEventMap = map.category === "event"
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState([])
  const [searchOpen, setSearchOpen] = useState(false)
  const [searching, setSearching] = useState(false)
  const [userNoteText, setUserNoteText] = useState("")
  const [activeFilter, setActiveFilter] = useState("all")
  const [filterOpen, setFilterOpen] = useState(false)
  const [stripOpen, setStripOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [capturing, setCapturing] = useState(false)
  const naverMapRef = useRef(null)
  const stripRef = useRef(null)
  const stripDragRef = useRef({ startX: 0, scrollLeft: 0, dragging: false })
  const trimmedSearchQuery = searchQuery.trim()
  const recentMemos = selectedFeatureSummary?.memos || []

  const pinCount = features.filter((feature) => feature.type === "pin").length
  const routeCount = features.filter((feature) => feature.type === "route").length
  const areaCount = features.filter((feature) => feature.type === "area").length
  const isDrawing = editorMode === "route" || editorMode === "area"

  const visibleFeatures = activeFilter === "all" ? features : features.filter((feature) => feature.type === activeFilter)

  useEffect(() => {
    if (!trimmedSearchQuery) return undefined

    const controller = new AbortController()
    let cancelled = false
    const timeoutId = window.setTimeout(() => {
      const query = trimmedSearchQuery
      setSearching(true)

      // Naver geocode (주소 검색)
      const tryNaver = () =>
        new Promise((resolve) => {
          const naverMaps = window.naver?.maps
          if (!naverMaps?.Service) {
            resolve([])
            return
          }
          naverMaps.Service.geocode({ query }, (status, response) => {
            if (status !== naverMaps.Service.Status.OK || !response.v2) {
              resolve([])
              return
            }
            resolve(
              (response.v2.addresses || []).slice(0, 5).map((addr, i) => ({
                id: `naver-${i}`,
                roadAddress: addr.roadAddress || "",
                jibunAddress: addr.jibunAddress || "",
                lat: Number(addr.y),
                lng: Number(addr.x),
              })),
            )
          })
        })

      // Nominatim 폴백 (장소명 검색)
      const tryNominatim = () =>
        fetch(
          `https://nominatim.openstreetmap.org/search?format=json&limit=5&accept-language=ko&q=${encodeURIComponent(query)}`,
          { signal: controller.signal },
        )
          .then((r) => r.json())
          .then((data) =>
            (Array.isArray(data) ? data : []).map((r, i) => ({
              id: `osm-${i}`,
              roadAddress: (r.display_name || "").split(",")[0],
              jibunAddress: r.display_name || "",
              lat: Number(r.lat),
              lng: Number(r.lon),
            })),
          )
          .catch(() => [])

      Promise.all([tryNaver(), tryNominatim()]).then(([naverResults, osmResults]) => {
        if (cancelled || controller.signal.aborted) return
        // 한글이 포함된 검색어면 네이버 우선, 아니면 Nominatim 우선
        const hasKorean = /[가-힣]/.test(query)
        const primary = hasKorean ? naverResults : osmResults
        const secondary = hasKorean ? osmResults : naverResults
        const merged = primary.length > 0 ? primary : secondary
        setSearchResults(merged)
        setSearchOpen(true)
        setSearching(false)
      })
    }, 320)

    return () => {
      cancelled = true
      controller.abort()
      window.clearTimeout(timeoutId)
    }
  }, [trimmedSearchQuery])

  return (
    <section className="map-editor">
      {/* ─── 지도 바 ─── */}
      <div className="me-bar">
        <div className="me-bar__card">
          <div className="me-bar__left">
            <button className="me-bar__back" type="button" onClick={onBack} aria-label="뒤로 가기">
              <ArrowLeft size={16} color="#2D4A3E" />
            </button>
            <span className="me-bar__name">{map.title}</span>
          </div>
          <div className="me-bar__right">
            {!hideCount ? (
              <>
                <span className="me-bar__count"><svg width="10" height="10" viewBox="0 0 24 24" fill="#FF6B35" stroke="none"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="2.5" fill="#FFF4EB"/></svg> {pinCount}</span>
                <span className="me-bar__count"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#0F6E56" strokeWidth="2" strokeLinecap="round"><path d="M4 19L10 7L16 14L20 5"/></svg> {routeCount}</span>
                <span className="me-bar__count"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#854F0B" strokeWidth="2" strokeLinecap="round" strokeDasharray="3 2"><rect x="4" y="4" width="16" height="16" rx="3"/></svg> {areaCount}</span>
                <span className="me-bar__divider" />
              </>
            ) : null}
            {!communityMode ? (
              <button className="me-bar__share" type="button" onClick={() => setShareOpen(true)} aria-label="공유">
                <Link2 size={16} color="#2D4A3E" />
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="map-editor__canvas-wrap">
        <div className="map-search-box">
          <div className="map-search-box__bar">
            <SearchIcon size={13} color="#aaa" />
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => {
                const nextQuery = event.target.value
                setSearchQuery(nextQuery)
                if (!nextQuery.trim()) {
                  setSearchResults([])
                  setSearchOpen(false)
                  setSearching(false)
                }
              }}
              placeholder="주소·지명 검색"
            />
            {searchQuery ? (
              <button
                className="map-search-box__clear"
                type="button"
                onClick={() => {
                  setSearchQuery("")
                  setSearchResults([])
                  setSearchOpen(false)
                  setSearching(false)
                }}
                aria-label="검색어 지우기"
              >
                ✕
              </button>
            ) : null}
          </div>
          {searchOpen ? (
            <div className="map-search-box__results">
              {searching && searchResults.length === 0 ? <div className="map-search-box__item">검색 중...</div> : null}
              {!searching && searchResults.length === 0 ? <div className="map-search-box__item">검색 결과가 없어요.</div> : null}
              {searchResults.map((result) => (
                <button
                  key={result.id}
                  className="map-search-box__item"
                  type="button"
                  onClick={() => {
                    onSearchLocation?.({ lat: result.lat, lng: result.lng, zoom: 16 })
                    setSearchQuery(result.roadAddress || result.jibunAddress)
                    setSearchOpen(false)
                    setSearching(false)
                  }}
                >
                  <strong>{result.roadAddress || result.jibunAddress}</strong>
                  {result.roadAddress && result.jibunAddress ? <span>{result.jibunAddress}</span> : null}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <MapErrorBoundary>
          <NaverMap
            ref={naverMapRef}
            features={visibleFeatures}
            selectedFeatureId={selectedFeatureId}
            draftPoints={draftPoints}
            draftMode={editorMode}
            focusPoint={focusPoint}
            fitTrigger={fitTrigger}
            onMapTap={readOnly ? undefined : onMapTap}
            onFeatureTap={onFeatureTap}
            showLabels={showLabels}
            myLocation={myLocation}
            characterStyle={characterStyle}
            levelEmoji={levelEmoji}
          />
        </MapErrorBoundary>

        <div className="me-fabs">
          <button className="me-fab" type="button" onClick={onLocate} aria-label="현재 위치">
            <Navigation size={16} color="#2D4A3E" />
          </button>
          <button className={`me-fab me-fab--label${showLabels ? " is-active" : ""}`} type="button" onClick={onToggleLabels} aria-label="이름 토글">
            <span>이름</span>
          </button>
          {!readOnly ? (
            <button className={`me-fab me-fab--pin${editorMode === "pin" ? " is-active" : ""}`} type="button" onClick={() => onModeChange(editorMode === "pin" ? "browse" : "pin")} aria-label="핀 추가">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="#FF6B35" stroke="none"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="2.5" fill="#FFF4EB"/></svg>
            </button>
          ) : null}
          {!readOnly ? (
            <button className={`me-fab me-fab--route${editorMode === "route" ? " is-active" : ""}`} type="button" onClick={() => onModeChange(editorMode === "route" ? "browse" : "route")} aria-label="경로 추가">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0F6E56" strokeWidth="2" strokeLinecap="round"><path d="M4 19L10 7L16 14L20 5"/></svg>
            </button>
          ) : null}
          {!readOnly ? (
            <button className={`me-fab me-fab--area${editorMode === "area" ? " is-active" : ""}`} type="button" onClick={() => onModeChange(editorMode === "area" ? "browse" : "area")} aria-label="범위 추가">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#854F0B" strokeWidth="2" strokeLinecap="round" strokeDasharray="3 2"><rect x="4" y="4" width="16" height="16" rx="3"/></svg>
            </button>
          ) : null}
        </div>

        {editorMode === "relocate" ? (
          <div className="draft-bar draft-bar--compact draft-bar--relocate">
            <span>📍 지도를 탭하여 위치를 지정하세요</span>
            <button className="button button--ghost" type="button" onClick={() => onModeChange("browse")}>
              취소
            </button>
          </div>
        ) : null}
        {!readOnly && isDrawing && draftPoints.length > 0 ? (
          <div className="draft-bar draft-bar--compact">
            <button className="button button--ghost" type="button" onClick={onUndoDraft}>
              되돌리기
            </button>
            <button className="button button--primary" type="button" onClick={editorMode === "area" ? onCompleteArea : onCompleteRoute}>
              {editorMode === "area" ? "범위 저장" : "경로 저장"}
            </button>
          </div>
        ) : null}
        {!readOnly && isDrawing ? (
          <button className="fab fab--cancel" type="button" onClick={onCancelDraft} aria-label="취소"><X size={18} /></button>
        ) : null}

        {selectedFeatureSummary ? (
          <article className="map-feature-summary">
            <div className="map-feature-summary__head">
              <div>
                <strong>
                  {selectedFeatureSummary.emoji} {selectedFeatureSummary.title}
                </strong>
                <span>{formatFeatureMeta(selectedFeatureSummary)}</span>
              </div>
              <button className="icon-button map-feature-summary__close" type="button" onClick={onCloseFeatureSummary} aria-label="요약 닫기">
                <X size={16} />
              </button>
            </div>
            <p>{summarizeFeatureNote(selectedFeatureSummary)}</p>
            {selectedFeatureSummary.tags?.length ? (
              <div className="map-feature-summary__tags">
                {selectedFeatureSummary.tags.slice(0, 3).map((tag) => (
                  <span className="chip chip--small" key={tag}>
                    #{tag}
                  </span>
                ))}
              </div>
            ) : null}
            {communityMode ? (
              <div className="map-feature-summary__note-form">
                <div className="map-feature-summary__note-row">
                  <input
                    className="map-feature-summary__note-input"
                    type="text"
                    placeholder="메모 추가..."
                    value={userNoteText}
                    onChange={(e) => setUserNoteText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && userNoteText.trim()) {
                        onAddMemo?.(selectedFeatureSummary.id, userNoteText.trim())
                        setUserNoteText("")
                      }
                    }}
                  />
                  <button
                    className="button button--primary map-feature-summary__note-btn"
                    type="button"
                    disabled={!userNoteText.trim()}
                    onClick={() => {
                      if (userNoteText.trim()) {
                        onAddMemo?.(selectedFeatureSummary.id, userNoteText.trim())
                        setUserNoteText("")
                      }
                    }}
                  >
                    추가
                  </button>
                </div>
                {recentMemos.length ? (
                  <ul className="map-feature-summary__notes-list">
                    {recentMemos.map((memo) => (
                      <li key={memo.id}>
                        <strong>{memo.userName}</strong>
                        <span>{memo.text}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : (
              <button className="button button--primary map-feature-summary__action" type="button" onClick={() => onOpenFeatureDetail(selectedFeatureSummary.id)}>
                상세 보기
              </button>
            )}
          </article>
        ) : null}

        <div className={`map-filter-bar map-filter-bar--upper${communityMode ? " map-filter-bar--community" : ""}`} aria-label="지도 필터">
          <button className="map-filter-chip map-filter-toggle" type="button" onClick={() => setFilterOpen(!filterOpen)}>
            필터 <span style={{ fontSize: "0.5em", verticalAlign: "middle", lineHeight: 1 }}>{filterOpen ? "◀" : "▶"}</span>
          </button>
          {filterOpen ? (
            <>
              <button className={`map-filter-chip${activeFilter === "all" ? " is-active" : ""}`} type="button" onClick={() => setActiveFilter("all")}>전체</button>
              <button className={`map-filter-chip${activeFilter === "pin" ? " is-active" : ""}`} type="button" onClick={() => setActiveFilter("pin")}>핀</button>
              <button className={`map-filter-chip${activeFilter === "route" ? " is-active" : ""}`} type="button" onClick={() => setActiveFilter("route")}>경로</button>
              <button className={`map-filter-chip${activeFilter === "area" ? " is-active" : ""}`} type="button" onClick={() => setActiveFilter("area")}>범위</button>
            </>
          ) : null}
        </div>

        {features.length > 0 ? (
          <div className="map-list-bar" aria-label="맵핑 목록">
            <button className="map-filter-chip map-filter-toggle" type="button" onClick={() => setStripOpen(!stripOpen)}>
              목록 ({features.length}) <span style={{ fontSize: "0.5em", verticalAlign: "middle", lineHeight: 1 }}>{stripOpen ? "◀" : "▶"}</span>
            </button>
            {stripOpen ? (
              <div
                className="map-place-strip"
                ref={stripRef}
                onMouseDown={(e) => {
                  const el = stripRef.current
                  if (!el) return
                  stripDragRef.current = { startX: e.pageX, scrollLeft: el.scrollLeft, dragging: true }
                  el.style.cursor = "grabbing"
                }}
                onMouseMove={(e) => {
                  const d = stripDragRef.current
                  if (!d.dragging) return
                  e.preventDefault()
                  const el = stripRef.current
                  if (!el) return
                  el.scrollLeft = d.scrollLeft - (e.pageX - d.startX)
                }}
                onMouseUp={() => { stripDragRef.current.dragging = false; if (stripRef.current) stripRef.current.style.cursor = "" }}
                onMouseLeave={() => { stripDragRef.current.dragging = false; if (stripRef.current) stripRef.current.style.cursor = "" }}
                onTouchStart={(e) => {
                  const el = stripRef.current
                  if (!el) return
                  stripDragRef.current = { startX: e.touches[0].pageX, scrollLeft: el.scrollLeft, dragging: true }
                }}
                onTouchMove={(e) => {
                  const d = stripDragRef.current
                  if (!d.dragging) return
                  const el = stripRef.current
                  if (!el) return
                  el.scrollLeft = d.scrollLeft - (e.touches[0].pageX - d.startX)
                }}
                onTouchEnd={() => { stripDragRef.current.dragging = false }}
              >
                {features.map((feature) => (
                  <div
                    key={feature.id}
                    className={`map-place-card${selectedFeatureId === feature.id ? " is-active" : ""}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => { if (!stripDragRef.current.dragging) (onStripFeatureTap || onFeatureTap)?.(feature.id) }}
                    onKeyDown={(e) => { if (e.key === "Enter") (onStripFeatureTap || onFeatureTap)?.(feature.id) }}
                  >
                    <div className={`me-strip-icon me-strip-icon--${feature.type}`}>
                      {feature.type === "pin" ? <svg width="14" height="14" viewBox="0 0 24 24" fill="#FF6B35" stroke="none"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="2.5" fill="#FFF4EB"/></svg> :
                       feature.type === "route" ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0F6E56" strokeWidth="2" strokeLinecap="round"><path d="M4 19L10 7L16 14L20 5"/></svg> :
                       <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#854F0B" strokeWidth="2" strokeLinecap="round" strokeDasharray="3 2"><rect x="4" y="4" width="16" height="16" rx="3"/></svg>}
                    </div>
                    <div className="me-strip-info">
                      <strong>{feature.title}</strong>
                      <span>{feature.note || ""}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

      </div>

      <ShareSheet
        open={shareOpen}
        map={map}
        shareUrl={shareUrl}
        onClose={() => setShareOpen(false)}
        capturing={capturing}
        onOpenImageShare={async () => {
          if (capturing || !naverMapRef.current) return
          setCapturing(true)
          try {
            const canvas = await naverMapRef.current.capture()
            if (canvas) {
              setShareOpen(false)
              onOpenShareEditor?.(canvas)
            }
          } catch (err) {
            console.error("지도 캡처 실패:", err)
          } finally {
            setCapturing(false)
          }
        }}
        showToast={showToast}
      />
    </section>
  )
}
