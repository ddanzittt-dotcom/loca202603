import { useEffect, useState, useRef } from "react"
import { MapErrorBoundary } from "../components/MapErrorBoundary"
import { NaverMap } from "../components/NaverMap"

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

const draftModeLabel = (editorMode) => {
  if (editorMode === "route") return "경로"
  if (editorMode === "area") return "범위"
  return ""
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
  onBack,
  onEditMap,
  onLocate,
  onSearchLocation,
  onModeChange,
  onMapTap,
  onFeatureTap,
  onUndoDraft,
  onCompleteRoute,
  onCompleteArea,
  onCancelDraft,
  onHighlightTap,
  onToggleLabels,
  onOpenFeatureDetail,
  onCloseFeatureSummary,
  onAddUserNote,
}) {
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState([])
  const [searchOpen, setSearchOpen] = useState(false)
  const [searching, setSearching] = useState(false)
  const [userNoteText, setUserNoteText] = useState("")
  const [activeFilter, setActiveFilter] = useState("all")
  const [filterOpen, setFilterOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [copied, setCopied] = useState("")
  const shareRef = useRef(null)

  const mapId = map.id || "unknown"
  const shareUrl = `${window.location.origin}/map/${mapId}`

  useEffect(() => {
    if (!shareOpen) return
    const handleClickOutside = (e) => {
      if (shareRef.current && !shareRef.current.contains(e.target)) setShareOpen(false)
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [shareOpen])

  const handleCopy = async (text, type) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(type)
      setTimeout(() => setCopied(""), 2000)
    } catch {
      prompt("복사하세요:", text)
    }
  }

  const pinCount = features.filter((feature) => feature.type === "pin").length
  const routeCount = features.filter((feature) => feature.type === "route").length
  const areaCount = features.filter((feature) => feature.type === "area").length
  const highlights = features.filter((feature) => feature.highlight && feature.type === "pin")
  const isDrawing = editorMode === "route" || editorMode === "area"
  const visibleFeatures = activeFilter === "all" ? features : features.filter((feature) => feature.type === activeFilter)

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([])
      setSearchOpen(false)
      return
    }

    const controller = new AbortController()
    const timeoutId = window.setTimeout(() => {
      const query = searchQuery.trim()
      setSearching(true)

      // Naver geocode (주소 검색)
      const tryNaver = () =>
        new Promise((resolve) => {
          if (typeof naver === "undefined" || !naver.maps || !naver.maps.Service) {
            resolve([])
            return
          }
          naver.maps.Service.geocode({ query }, (status, response) => {
            if (status !== naver.maps.Service.Status.OK || !response.v2) {
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

      tryNaver().then((naverResults) => {
        if (naverResults.length > 0) {
          setSearchResults(naverResults)
          setSearchOpen(true)
          setSearching(false)
        } else {
          tryNominatim().then((osmResults) => {
            setSearchResults(osmResults)
            setSearchOpen(true)
            setSearching(false)
          })
        }
      })
    }, 320)

    return () => {
      controller.abort()
      window.clearTimeout(timeoutId)
    }
  }, [searchQuery])

  return (
    <section className="map-editor">
      <header className="map-editor__header">
        <button className="icon-button" type="button" onClick={onBack} aria-label="뒤로 가기">
          ←
        </button>
        <div className="map-editor__title-wrap">
          <strong>{map.title}</strong>
        </div>
        {!readOnly && !communityMode ? (
          <button className="icon-button" type="button" onClick={onEditMap} aria-label="지도 편집">
            편집
          </button>
        ) : null}
        {!communityMode ? (
          <div className="share-button-wrap" ref={shareRef}>
            <button className="icon-button" type="button" onClick={() => setShareOpen(!shareOpen)} aria-label="지도 공유하기">
              공유
            </button>
            {shareOpen ? (
              <div className="share-panel">
                <strong className="share-panel__title">지도 공유하기</strong>

                <div className="share-panel__section">
                  <label className="share-panel__label">링크 복사</label>
                  <div className="share-panel__link-row">
                    <input className="share-panel__input" type="text" value={shareUrl} readOnly />
                    <button className="button button--primary share-panel__copy-btn" type="button" onClick={() => handleCopy(shareUrl, "link")}>
                      {copied === "link" ? "복사됨!" : "복사"}
                    </button>
                  </div>
                </div>

                <div className="share-panel__section">
                  <label className="share-panel__label">지도 번호</label>
                  <div className="share-panel__link-row">
                    <span className="share-panel__map-id">{mapId}</span>
                    <button className="button button--primary share-panel__copy-btn" type="button" onClick={() => handleCopy(mapId, "id")}>
                      {copied === "id" ? "복사됨!" : "복사"}
                    </button>
                  </div>
                </div>

                <div className="share-panel__section">
                  <label className="share-panel__label">QR 코드</label>
                  <img
                    className="share-panel__qr"
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(shareUrl)}`}
                    alt="QR 코드"
                    width={160}
                    height={160}
                  />
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </header>

      <div className="map-editor__canvas-wrap">
        <div className="map-search-box">
          <div className="map-search-box__bar">
            <span aria-hidden="true">🔍</span>
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
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
            features={visibleFeatures}
            selectedFeatureId={selectedFeatureId}
            draftPoints={draftPoints}
            draftMode={editorMode}
            focusPoint={focusPoint}
            fitTrigger={fitTrigger}
            onMapTap={readOnly ? undefined : onMapTap}
            onFeatureTap={onFeatureTap}
            showLabels={showLabels}
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
                        onAddUserNote?.(selectedFeatureSummary.id, userNoteText.trim())
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
                        onAddUserNote?.(selectedFeatureSummary.id, userNoteText.trim())
                        setUserNoteText("")
                      }
                    }}
                  >
                    추가
                  </button>
                </div>
                {selectedFeatureSummary.userNotes?.length ? (
                  <ul className="map-feature-summary__notes-list">
                    {selectedFeatureSummary.userNotes.map((note, i) => (
                      <li key={i}>{note}</li>
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

        {!hideCount ? (
          <div className="map-count-card" aria-label="지도 개수 요약">
            <span>📍 {pinCount}</span>
            <span>🔀 {routeCount}</span>
            <span>⬡ {areaCount}</span>
          </div>
        ) : null}

        <div className="map-filter-bar map-filter-bar--bottom" aria-label="지도 필터">
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


      </div>
    </section>
  )
}
