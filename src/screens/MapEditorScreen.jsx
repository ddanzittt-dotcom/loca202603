import { useEffect, useMemo, useState, useRef } from "react"
import { MapErrorBoundary } from "../components/MapErrorBoundary"
import { getMapCompletionSnapshot } from "../lib/mapCompletion"
import { NaverMap } from "../components/NaverMap"
import { AnnouncementSheet } from "../components/sheets/AnnouncementSheet"
import { CollaboratorsSheet } from "../components/sheets/CollaboratorsSheet"
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
  cloudMode = false,
  isAdmin = false,
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
  onOpenDashboard,
  showToast,
  shareUrl = "",
}) {
  const isEventMap = map.category === "event"
  const [announcementSheetOpen, setAnnouncementSheetOpen] = useState(false)
  const [collaboratorsSheetOpen, setCollaboratorsSheetOpen] = useState(false)
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

  // 지도 완성도
  const completion = useMemo(() => getMapCompletionSnapshot(map, features), [map, features])
  const [completionOpen, setCompletionOpen] = useState(false)
  const completionLabel = completion.tier === "excellent" ? "추천 후보" : completion.tier === "good" ? "발행 준비 완료" : completion.tier === "progress" ? "정리 중" : "초안"
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
      <header className="map-editor__header">
        <button className="icon-button" type="button" onClick={onBack} aria-label="뒤로 가기">
          ←
        </button>
        <div className="map-editor__title-wrap">
          <strong>{map.title}</strong>
        </div>
        {!hideCount ? (
          <span className="map-editor__count">📍{pinCount} 🔀{routeCount} ⬡{areaCount}</span>
        ) : null}
        {isEventMap && !communityMode ? (
          <>
            {onOpenDashboard ? (
              <button className="icon-button" type="button" onClick={onOpenDashboard} aria-label="대시보드" title="대시보드">
                📊
              </button>
            ) : null}
            {cloudMode && isAdmin ? (
              <>
                <button className="icon-button" type="button" onClick={() => setCollaboratorsSheetOpen(true)} aria-label="협업자 관리" title="협업자 관리">
                  👥
                </button>
                <button className="icon-button" type="button" onClick={() => setAnnouncementSheetOpen(true)} aria-label="공지 관리" title="공지 관리">
                  📢
                </button>
              </>
            ) : null}
            <span className="map-editor__event-badge">이벤트</span>
          </>
        ) : null}
        {!communityMode ? (
          <button className="icon-button" type="button" onClick={() => setShareOpen(true)} aria-label="지도 공유하기">
            🔗
          </button>
        ) : null}
      </header>

      {/* 완성도 게이지 */}
      {!communityMode && !readOnly ? (
        <div className="map-completion-bar" onClick={() => setCompletionOpen(!completionOpen)}>
          <div className="map-completion-bar__gauge">
            <div className="map-completion-bar__fill" style={{ width: `${completion.score}%` }} />
          </div>
          <span className="map-completion-bar__label">{completionLabel} · {completion.score}점</span>
          <span className="map-completion-bar__toggle">{completionOpen ? "▲" : "▼"}</span>
        </div>
      ) : null}

      {completionOpen && !communityMode && !readOnly ? (
        <div className="map-completion-checklist">
          {completion.breakdown.map((item) => (
            <div key={item.key} className={`map-completion-item${item.done ? " is-done" : ""}`}>
              <span>{item.done ? "✓" : "○"}</span>
              <span>{item.label}</span>
              <span className="map-completion-item__pts">{item.points}/{item.max}</span>
            </div>
          ))}
          {completion.score >= 90 ? (
            <p className="map-completion-feedback">🎉 훌륭해요! 발행하면 더 많은 사람이 볼 수 있어요.</p>
          ) : completion.score >= 70 ? (
            <p className="map-completion-feedback">👍 발행 준비가 거의 끝났어요! 조금만 더 보강해보세요.</p>
          ) : null}
        </div>
      ) : null}

      <div className="map-editor__canvas-wrap">
        <div className="map-search-box">
          <div className="map-search-box__bar">
            <span aria-hidden="true">🔍</span>
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

        <div className="map-editor__floating-actions">
          <button className="fab fab--stacked fab--text-only" type="button" onClick={onLocate} aria-label="현재 위치" title="현재 위치">
            <span className="fab__label">내위치</span>
          </button>
          <button
            className={`fab fab--stacked fab--text-only fab--label-toggle${showLabels ? " is-active" : ""}`}
            type="button"
            onClick={onToggleLabels}
            aria-label={showLabels ? "이름 숨기기" : "이름 보기"}
            title={showLabels ? "이름 숨기기" : "이름 보기"}
          >
            <span className="fab__label">{showLabels ? "이름 ON" : "이름 OFF"}</span>
          </button>
          {!readOnly ? (
            <button
              className={`fab fab--stacked${editorMode === "pin" ? " is-active" : ""}`}
              type="button"
              onClick={() => onModeChange(editorMode === "pin" ? "browse" : "pin")}
              aria-label="핀 추가"
              title="핀 추가"
            >
              <span>📍</span>
            </button>
          ) : null}
          {!readOnly ? (
            <button
              className={`fab fab--stacked${editorMode === "route" ? " is-active" : ""}`}
              type="button"
              onClick={() => onModeChange(editorMode === "route" ? "browse" : "route")}
              aria-label="경로 추가"
              title="경로 추가"
            >
              <span>🔀</span>
            </button>
          ) : null}
          {!readOnly ? (
            <button
              className={`fab fab--stacked${editorMode === "area" ? " is-active" : ""}`}
              type="button"
              onClick={() => onModeChange(editorMode === "area" ? "browse" : "area")}
              aria-label="범위 추가"
              title="범위 추가"
            >
              <span>⬡</span>
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
          <button className="fab fab--cancel" type="button" onClick={onCancelDraft} aria-label="취소">✕</button>
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
                ×
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
                    <span className="map-place-card__meta">{feature.type === "route" ? "경로" : feature.type === "area" ? "범위" : "장소"}</span>
                    <strong>{feature.emoji} {feature.title}</strong>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

      </div>

      <CollaboratorsSheet
        open={collaboratorsSheetOpen}
        mapId={map.id}
        onClose={() => setCollaboratorsSheetOpen(false)}
        showToast={showToast}
      />

      <AnnouncementSheet
        open={announcementSheetOpen}
        mapId={map.id}
        onClose={() => setAnnouncementSheetOpen(false)}
        showToast={showToast}
      />

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
