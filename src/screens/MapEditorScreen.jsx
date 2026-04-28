import { useEffect, useMemo, useState, useRef, useCallback } from "react"
import { Search as SearchIcon, X, ArrowLeft, Link2, Navigation, MoreHorizontal } from "lucide-react"
import { CoachMark } from "../components/CoachMark"
import { getPinIcon, emojiToCategory, isMappedPinEmoji } from "../data/pinIcons"
import { MapErrorBoundary } from "../components/MapErrorBoundary"

import { MapRenderer as NaverMap } from "../components/MapRenderer"
import { ShareSheet } from "../components/sheets/ShareSheet"
import { getProfilePlacementState } from "../lib/mapPlacement"
import { FeaturePopupCard } from "../components/FeaturePopupCard"
import { useVoicePlayback, makeVoiceScopeKey } from "../hooks/useVoicePlayback"

// 경로 길이(km) — 위경도 배열의 haversine 합산
function computeRouteLengthKm(points) {
  if (!Array.isArray(points) || points.length < 2) return null
  const R = 6371
  const toRad = (deg) => (deg * Math.PI) / 180
  let km = 0
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1]
    const b = points[i]
    const lat1 = Number(a?.lat ?? a?.[1] ?? a?.y)
    const lng1 = Number(a?.lng ?? a?.[0] ?? a?.x)
    const lat2 = Number(b?.lat ?? b?.[1] ?? b?.y)
    const lng2 = Number(b?.lng ?? b?.[0] ?? b?.x)
    if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) continue
    const dLat = toRad(lat2 - lat1)
    const dLng = toRad(lng2 - lng1)
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
    km += 2 * R * Math.asin(Math.min(1, Math.sqrt(s)))
  }
  return km > 0 ? km : null
}

const RECORD_FILTERS = [
  { id: "all", label: "전체" },
  { id: "pin", label: "장소" },
  { id: "route", label: "길·코스" },
  { id: "area", label: "구역" },
  { id: "photo", label: "사진 있음" },
  { id: "memory", label: "기억 있음" },
]

function getFeaturePhotos(feature) {
  const ownPhotos = Array.isArray(feature?.photos) ? feature.photos : []
  const memoPhotos = (feature?.memos || []).flatMap((memo) => (
    Array.isArray(memo.photos) ? memo.photos : []
  ))
  return [...ownPhotos, ...memoPhotos].filter(Boolean)
}

function hasFeatureMemory(feature) {
  return Boolean(
    feature?.note?.trim()
    || (feature?.memos || []).some((memo) => memo.text?.trim() || (memo.photos || []).length > 0)
    || (feature?.voices || []).length > 0,
  )
}

function getFeatureSearchText(feature) {
  const memoTexts = (feature?.memos || []).map((memo) => memo.text || "")
  return [
    feature?.title,
    feature?.note,
    ...(Array.isArray(feature?.tags) ? feature.tags : []),
    ...memoTexts,
  ].join(" ").toLowerCase()
}


const getFeatureBadgeMeta = (feature) => {
  if (!feature) return { kind: "none" }
  if (feature.type !== "pin") return { kind: feature.type }
  const explicitCategory = typeof feature.category === "string" ? feature.category.trim() : ""
  if (explicitCategory) {
    const iconData = getPinIcon(explicitCategory)
    return { kind: "icon", catId: iconData.id, bg: iconData.bg }
  }
  const emoji = typeof feature.emoji === "string" ? feature.emoji.trim() : ""
  if (isMappedPinEmoji(emoji)) {
    const catId = emojiToCategory(emoji)
    const iconData = getPinIcon(catId)
    return { kind: "icon", catId, bg: iconData.bg }
  }
  const isEmojiValue = emoji && emoji.length <= 4 && !emoji.includes("/")
  if (isEmojiValue) return { kind: "emoji", emoji }
  const catId = feature.category || emojiToCategory(feature.emoji)
  const iconData = getPinIcon(catId)
  return { kind: "icon", catId, bg: iconData.bg }
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
  currentUserId = "me",
  showLabels = true,
  myLocation = null,
  characterStyle = "m3",
  levelEmoji = "\uD83E\uDD5A",
  onBack,
  onLocate,
  onSearchLocation,
  onCreatePinAtLocation,
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
  importedCommunityFeatureIds,
  onImportCommunityFeature,
  onUnimportCommunityFeature,
  onRequestCommunityUpdateFromSummary,
  onOpenShareEditor,
  onStripFeatureTap,
  showToast,
  shareUrl = "",
  placementRow = null,
  onPublishMap,
  onUnpublishMap,
  onAddMapToProfile,
  onRemoveMapFromProfile,
  coachmarkStep = 0,
  onCoachmarkNext,
  onCoachmarkSkip,
  firstPinHintVisible = false,
  onDismissFirstPinHint,
}) {
  const placement = getProfilePlacementState(map, placementRow)
  const [externalSearchQuery, setExternalSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState([])
  const [searchOpen, setSearchOpen] = useState(false)
  const [searching, setSearching] = useState(false)
  const [pendingSearchPin, setPendingSearchPin] = useState(null)
  const [mappingSearchPin, setMappingSearchPin] = useState(false)
  const [recordSearchQuery, setRecordSearchQuery] = useState("")
  const [activeFilter, setActiveFilter] = useState("all")
  const [stripOpen, setStripOpen] = useState(true)
  const [shareOpen, setShareOpen] = useState(false)
  const [capturing, setCapturing] = useState(false)
  const [mapMenuOpen, setMapMenuOpen] = useState(false)
  const mapMenuRef = useRef(null)
  useEffect(() => {
    if (!mapMenuOpen) return
    const onPointerDown = (e) => {
      if (mapMenuRef.current && !mapMenuRef.current.contains(e.target)) setMapMenuOpen(false)
    }
    document.addEventListener("pointerdown", onPointerDown)
    return () => document.removeEventListener("pointerdown", onPointerDown)
  }, [mapMenuOpen])
  const naverMapRef = useRef(null)
  const voicePlayback = useVoicePlayback()
  const stripRef = useRef(null)
  const stripDragRef = useRef({ startX: 0, scrollLeft: 0, dragging: false })
  const trimmedExternalSearchQuery = externalSearchQuery.trim()
  const normalizedRecordSearchQuery = recordSearchQuery.trim().toLowerCase()
  const summaryOpen = Boolean(selectedFeatureSummary)
  const isSummaryCreator = Boolean(selectedFeatureSummary?.createdBy) && selectedFeatureSummary?.createdBy === currentUserId
  // 내 지도(personal)는 본인 지도이므로 항상 작성자. 커뮤니티는 createdBy 로 판정.
  // 데모/공유 등 readOnly 환경에서는 작성자 권한을 주지 않는다.
  const isSummaryAuthor = readOnly ? false : (communityMode ? isSummaryCreator : true)
  const canEditOwnCommunitySummary = communityMode && !readOnly && isSummaryCreator
  const canRequestSummaryEdit = (
    communityMode
    && !readOnly
    && !isSummaryCreator
    && typeof onRequestCommunityUpdateFromSummary === "function"
  )
  const canOpenDetailOnHeader = !communityMode && typeof onOpenFeatureDetail === "function"
  const canMapPinFromSearch = !readOnly && typeof onCreatePinAtLocation === "function"
  const showExternalPlaceSearch = !readOnly && editorMode === "pin"

  const handleSummaryRequestEdit = useCallback(async () => {
    if (!selectedFeatureSummary?.id || !canRequestSummaryEdit) return
    const requestMessage = window.prompt("수정 제안 메시지를 남겨주세요. 작성자에게 전달돼요. (선택)")
    if (requestMessage === null) return
    const requested = await onRequestCommunityUpdateFromSummary?.(selectedFeatureSummary.id, requestMessage)
    if (requested) onCloseFeatureSummary?.()
  }, [
    canRequestSummaryEdit,
    onCloseFeatureSummary,
    onRequestCommunityUpdateFromSummary,
    selectedFeatureSummary?.id,
  ])

  const handleSearchResultSelect = useCallback((result) => {
    const lat = Number(result?.lat)
    const lng = Number(result?.lng)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return
    const locationLabel = result?.roadAddress || result?.jibunAddress || "선택한 위치"
    onSearchLocation?.({ lat, lng, zoom: 16 })
    setExternalSearchQuery(locationLabel)
    setSearchOpen(false)
    setSearching(false)
    if (canMapPinFromSearch) {
      setPendingSearchPin({ lat, lng, label: locationLabel })
    } else {
      setPendingSearchPin(null)
    }
  }, [canMapPinFromSearch, onSearchLocation])

  const handleConfirmSearchPin = useCallback(async () => {
    if (!canMapPinFromSearch || !pendingSearchPin || mappingSearchPin) return
    setMappingSearchPin(true)
    try {
      await onCreatePinAtLocation?.({ lat: pendingSearchPin.lat, lng: pendingSearchPin.lng })
      setPendingSearchPin(null)
    } finally {
      setMappingSearchPin(false)
    }
  }, [canMapPinFromSearch, mappingSearchPin, onCreatePinAtLocation, pendingSearchPin])

  useEffect(() => {
    if (!canMapPinFromSearch) {
      setPendingSearchPin(null)
      setMappingSearchPin(false)
    }
  }, [canMapPinFromSearch])

  const pinCount = features.filter((feature) => feature.type === "pin").length
  const routeCount = features.filter((feature) => feature.type === "route").length
  const areaCount = features.filter((feature) => feature.type === "area").length
  const isDrawing = editorMode === "route" || editorMode === "area"
  const editorGuide = !readOnly ? (() => {
    if (editorMode === "pin") {
      return {
        title: "\uD540 \uCD94\uAC00 \uBAA8\uB4DC",
        description: "\uC9C0\uB3C4\uB97C \uD0ED\uD558\uBA74 \uC7A5\uC18C\uAC00 \uBC14\uB85C \uCD94\uAC00\uB429\uB2C8\uB2E4.",
      }
    }
    if (editorMode === "route") {
      return {
        title: "\uACBD\uB85C \uC0DD\uC131 \uBAA8\uB4DC",
        description: draftPoints.length > 0
          ? `${draftPoints.length}\uAC1C \uC9C0\uC810\uC744 \uC120\uD0DD\uD588\uC5B4\uC694. \uC6B0\uCE21 \uD558\uB2E8 \uBC84\uD2BC\uC73C\uB85C \uC644\uB8CC\uD574 \uC8FC\uC138\uC694.`
          : "\uC9C0\uB3C4\uC5D0\uC11C \uC21C\uC11C\uB300\uB85C \uC9C0\uC810\uC744 \uD0ED\uD574 \uACBD\uB85C\uB97C \uADF8\uB824 \uBCF4\uC138\uC694.",
      }
    }
    if (editorMode === "area") {
      return {
        title: "\uC601\uC5ED \uC0DD\uC131 \uBAA8\uB4DC",
        description: draftPoints.length > 0
          ? `${draftPoints.length}\uAC1C \uAF2D\uC9D3\uC810\uC744 \uC120\uD0DD\uD588\uC5B4\uC694. 3\uAC1C \uC774\uC0C1 \uC120\uD0DD \uD6C4 \uC644\uB8CC\uD574 \uC8FC\uC138\uC694.`
          : "\uC601\uC5ED\uC758 \uAF2D\uC9D3\uC810\uC744 \uC21C\uC11C\uB300\uB85C \uC120\uD0DD\uD574 \uACBD\uACC4\uB97C \uB9CC\uB4E4\uC5B4 \uBCF4\uC138\uC694.",
      }
    }
    if (editorMode === "relocate") {
      return {
        title: "\uC704\uCE58 \uC774\uB3D9 \uBAA8\uB4DC",
        description: "\uC9C0\uB3C4\uB97C \uD0ED\uD574 \uC0C8\uB85C\uC6B4 \uC704\uCE58\uB97C \uC9C0\uC815\uD574 \uC8FC\uC138\uC694.",
      }
    }
    return null
  })() : null

  const visibleFeatures = useMemo(() => (
    features.filter((feature) => {
      const matchesFilter = (() => {
        if (activeFilter === "all") return true
        if (activeFilter === "photo") return getFeaturePhotos(feature).length > 0
        if (activeFilter === "memory") return hasFeatureMemory(feature)
        return feature.type === activeFilter
      })()
      if (!matchesFilter) return false
      if (!normalizedRecordSearchQuery) return true
      return getFeatureSearchText(feature).includes(normalizedRecordSearchQuery)
    })
  ), [activeFilter, features, normalizedRecordSearchQuery])

  useEffect(() => {
    if (showExternalPlaceSearch) return
    setExternalSearchQuery("")
    setSearchResults([])
    setSearchOpen(false)
    setSearching(false)
    setPendingSearchPin(null)
    setMappingSearchPin(false)
  }, [showExternalPlaceSearch])

  useEffect(() => {
    if (!showExternalPlaceSearch || !trimmedExternalSearchQuery) return undefined

    const controller = new AbortController()
    let cancelled = false
    const timeoutId = window.setTimeout(() => {
      const query = trimmedExternalSearchQuery
      setSearching(true)

      // 한국어 검색어는 Naver geocode를 우선 사용
      const tryNaver = () =>
        new Promise((resolve) => {
          const naverMaps = window.naver?.maps
          if (!naverMaps?.Service) { resolve([]); return }
          naverMaps.Service.geocode({ query }, (status, response) => {
            if (status !== naverMaps.Service.Status.OK || !response.v2) { resolve([]); return }
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

      // Google geocode는 보조 결과로 병합
      const tryGoogle = () =>
        new Promise((resolve) => {
          const googleKey = import.meta.env.VITE_GOOGLE_MAPS_KEY
          if (!googleKey) { resolve([]); return }
          fetch(
            `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&key=${googleKey}&language=ko`,
            { signal: controller.signal },
          )
            .then((r) => r.json())
            .then((data) => {
              if (data.status !== "OK" || !data.results) { resolve([]); return }
              resolve(
                data.results.slice(0, 5).map((r, i) => ({
                  id: `google-${i}`,
                  roadAddress: r.formatted_address?.split(",")[0] || "",
                  jibunAddress: r.formatted_address || "",
                  lat: r.geometry.location.lat,
                  lng: r.geometry.location.lng,
                })),
              )
            })
            .catch(() => resolve([]))
        })

      Promise.all([tryNaver(), tryGoogle()]).then(([naverResults, googleResults]) => {
        if (cancelled || controller.signal.aborted) return
        // 검색어 언어에 따라 기본 소스를 선택하고 보조 소스를 병합
        const hasKorean = /[\uAC00-\uD7A3]/.test(query)
        const primary = hasKorean ? naverResults : googleResults
        const secondary = hasKorean ? googleResults : naverResults
        // 좌표가 거의 같은 결과는 중복 제거
        const merged = [...primary]
        for (const s of secondary) {
          const isDuplicate = merged.some((p) => Math.abs(p.lat - s.lat) < 0.001 && Math.abs(p.lng - s.lng) < 0.001)
          if (!isDuplicate) merged.push(s)
        }
        setSearchResults(merged.slice(0, 7))
        setSearchOpen(true)
        setSearching(false)
      })
    }, 320)

    return () => {
      cancelled = true
      controller.abort()
      window.clearTimeout(timeoutId)
    }
  }, [showExternalPlaceSearch, trimmedExternalSearchQuery])

  return (
    <section className={`map-editor${summaryOpen ? " map-editor--summary-open" : ""}${stripOpen && features.length > 0 ? " map-editor--record-panel-open" : ""}`}>
      {/* 상단 헤더 */}
      <div className="me-bar">
        <div className="me-bar__card">
          <div className="me-bar__left">
            <button className="me-bar__back" type="button" onClick={onBack} aria-label="뒤로가기">
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
              <>
                <button className="me-bar__share" type="button" onClick={() => setShareOpen(true)} aria-label="공유하기">
                  <Link2 size={16} color="#2D4A3E" />
                </button>
                {(placement.canPublish || placement.canUnpublish || placement.canAddToProfile || placement.canRemoveFromProfile) ? (
                  <div style={{ position: "relative" }} ref={mapMenuRef}>
                    <button
                      className="me-bar__share"
                      type="button"
                      aria-label="메뉴 열기"
                      onClick={() => setMapMenuOpen((prev) => !prev)}
                    >
                      <MoreHorizontal size={16} color="#2D4A3E" />
                    </button>
                    {mapMenuOpen ? (
                      <div
                        role="menu"
                        style={{
                          position: "absolute",
                          right: 0, top: "calc(100% + 6px)",
                          background: "#fff",
                          border: "0.5px solid rgba(0,0,0,.06)",
                          borderRadius: 12,
                          padding: 6,
                          minWidth: 170,
                          boxShadow: "0 10px 24px rgba(0,0,0,.15)",
                          display: "flex", flexDirection: "column", gap: 2,
                          zIndex: 10,
                        }}
                      >
                        {placement.canPublish && onPublishMap ? (
                          <MapMenuItem onClick={() => { setMapMenuOpen(false); onPublishMap(map.id) }}>
                            링크 공유 켜기
                          </MapMenuItem>
                        ) : null}
                        {placement.canAddToProfile && onAddMapToProfile ? (
                          <MapMenuItem onClick={() => { setMapMenuOpen(false); onAddMapToProfile(map.id) }}>
                            내 프로필에 공개
                          </MapMenuItem>
                        ) : null}
                        {placement.canRemoveFromProfile && onRemoveMapFromProfile ? (
                          <MapMenuItem onClick={() => { setMapMenuOpen(false); onRemoveMapFromProfile(map.id) }}>
                            프로필에서 내리기
                          </MapMenuItem>
                        ) : null}
                        {placement.canUnpublish && onUnpublishMap ? (
                          <MapMenuItem variant="danger" onClick={() => { setMapMenuOpen(false); onUnpublishMap(map.id) }}>
                            링크 공유 중지
                          </MapMenuItem>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </>
            ) : null}
          </div>
        </div>
      </div>

      <div className="map-editor__canvas-wrap">
        {showExternalPlaceSearch ? (
          <div className="map-search-box map-search-box--external">
            <div className="map-search-box__bar">
              <SearchIcon size={13} color="#aaa" />
              <input
                type="search"
                value={externalSearchQuery}
                onChange={(event) => {
                  const nextQuery = event.target.value
                  setExternalSearchQuery(nextQuery)
                  setPendingSearchPin(null)
                  if (!nextQuery.trim()) {
                    setSearchResults([])
                    setSearchOpen(false)
                    setSearching(false)
                  }
                }}
                placeholder="주소 또는 장소를 검색하세요"
              />
              {externalSearchQuery ? (
                <button
                  className="map-search-box__clear"
                  type="button"
                  onClick={() => {
                    setExternalSearchQuery("")
                    setSearchResults([])
                    setSearchOpen(false)
                    setSearching(false)
                    setPendingSearchPin(null)
                  }}
                  aria-label="검색어 지우기"
                >
                  ×
                </button>
              ) : null}
            </div>
            {searchOpen ? (
              <div className="map-search-box__results">
                {searching && searchResults.length === 0 ? <div className="map-search-box__item">검색 중...</div> : null}
                {!searching && searchResults.length === 0 ? <div className="map-search-box__item">검색 결과가 없어요. 다른 주소나 장소 이름으로 다시 검색해 주세요.</div> : null}
                {searchResults.map((result) => (
                  <button
                    key={result.id}
                    className="map-search-box__item"
                    type="button"
                    onClick={() => handleSearchResultSelect(result)}
                  >
                    <strong>{result.roadAddress || result.jibunAddress}</strong>
                    {result.roadAddress && result.jibunAddress ? <span>{result.jibunAddress}</span> : null}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

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
            isEventMap={placement.isEventMap}
          />
        </MapErrorBoundary>

        {pendingSearchPin && canMapPinFromSearch && showExternalPlaceSearch ? (
          <div className="search-pin-confirm">
            <div className="search-pin-confirm__text">
              <strong>{"이 위치를 장소로 남길까요?"}</strong>
              <span>{pendingSearchPin.label}</span>
            </div>
            <div className="search-pin-confirm__actions">
              <button
                className="button button--ghost"
                type="button"
                onClick={() => setPendingSearchPin(null)}
                disabled={mappingSearchPin}
              >
                {"취소"}
              </button>
              <button
                className="button button--primary"
                type="button"
                onClick={handleConfirmSearchPin}
                disabled={mappingSearchPin}
              >
                {mappingSearchPin ? "남기는 중..." : "장소 남기기"}
              </button>
            </div>
          </div>
        ) : null}

        <div className="me-fabs">
          <button className="me-fab" type="button" onClick={onLocate} aria-label="내 위치로 이동">
            <Navigation size={16} color="#2D4A3E" />
          </button>
          <button className={`me-fab me-fab--label${showLabels ? " is-active" : ""}`} type="button" onClick={onToggleLabels} aria-label="이름 라벨 표시 전환">
            <span>이름</span>
          </button>
          {!readOnly ? (
            <button className={`me-fab me-fab--pin${editorMode === "pin" ? " is-active" : ""}`} type="button" onClick={() => onModeChange(editorMode === "pin" ? "browse" : "pin")} aria-label="장소 남기기 모드">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="#FF6B35" stroke="none"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="2.5" fill="#FFF4EB"/></svg>
            </button>
          ) : null}
          {!readOnly ? (
            <button className={`me-fab me-fab--route${editorMode === "route" ? " is-active" : ""}`} type="button" onClick={() => onModeChange(editorMode === "route" ? "browse" : "route")} aria-label="경로 그리기 모드">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0F6E56" strokeWidth="2" strokeLinecap="round"><path d="M4 19L10 7L16 14L20 5"/></svg>
            </button>
          ) : null}
          {!readOnly ? (
            <button className={`me-fab me-fab--area${editorMode === "area" ? " is-active" : ""}`} type="button" onClick={() => onModeChange(editorMode === "area" ? "browse" : "area")} aria-label="영역 그리기 모드">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#854F0B" strokeWidth="2" strokeLinecap="round" strokeDasharray="3 2"><rect x="4" y="4" width="16" height="16" rx="3"/></svg>
            </button>
          ) : null}
        </div>

        {editorGuide ? (
          <div className={`editor-mode-guide editor-mode-guide--${editorMode}`}>
            <strong>{editorGuide.title}</strong>
            <span>{editorGuide.description}</span>
          </div>
        ) : null}

        {editorMode === "relocate" ? (
          <div className="draft-bar draft-bar--compact draft-bar--relocate">
            <span>지도를 눌러 새 위치를 지정한 뒤 완료해 주세요.</span>
            <button className="button button--ghost" type="button" onClick={() => onModeChange("browse")}>
              나가기
            </button>
          </div>
        ) : null}
        {!readOnly && isDrawing && draftPoints.length > 0 ? (
          <div className="draft-bar draft-bar--compact">
            <button className="button button--ghost" type="button" onClick={onUndoDraft}>
              마지막 점 취소
            </button>
            <button className="button button--primary" type="button" onClick={editorMode === "area" ? onCompleteArea : onCompleteRoute}>
              {editorMode === "area" ? "영역 완성하기" : "경로 완성하기"}
            </button>
          </div>
        ) : null}
        {!readOnly && isDrawing ? (
          <button className="fab fab--cancel" type="button" onClick={onCancelDraft} aria-label="그리기 취소">
            <X size={18} />
          </button>
        ) : null}

        {selectedFeatureSummary ? (
          <div className="map-feature-summary-wrap">
            <FeaturePopupCard
              feature={selectedFeatureSummary}
              mapMode={communityMode ? "community" : "personal"}
              isAuthor={isSummaryAuthor}
              currentUserId={currentUserId}
              routeLengthKm={
                selectedFeatureSummary.type === "route"
                  ? computeRouteLengthKm(selectedFeatureSummary.points)
                  : null
              }
              onClose={() => { voicePlayback.stop(); onCloseFeatureSummary?.() }}
              onOpenDetail={
                canOpenDetailOnHeader
                  ? () => onOpenFeatureDetail?.(selectedFeatureSummary.id)
                  : undefined
              }
              onEdit={
                canEditOwnCommunitySummary
                  ? () => onOpenFeatureDetail?.(selectedFeatureSummary.id)
                  : undefined
              }
              onRequestEdit={canRequestSummaryEdit ? handleSummaryRequestEdit : undefined}
              onAddMemo={
                communityMode && !readOnly && typeof onAddMemo === "function"
                  ? (text, files) => onAddMemo(selectedFeatureSummary.id, text, files)
                  : undefined
              }
              imported={
                communityMode && importedCommunityFeatureIds
                  ? importedCommunityFeatureIds.has(selectedFeatureSummary.id)
                  : false
              }
              onImport={
                communityMode && typeof onImportCommunityFeature === "function"
                  ? () => onImportCommunityFeature(selectedFeatureSummary.id)
                  : undefined
              }
              onUnimport={
                communityMode && typeof onUnimportCommunityFeature === "function"
                  ? () => {
                      if (window.confirm("가져오기를 취소할까요?\n내 지도에서 이 항목이 삭제돼요.")) {
                        onUnimportCommunityFeature(selectedFeatureSummary.id)
                      }
                    }
                  : undefined
              }
              currentPlayingVoiceId={voicePlayback.playingId}
              onVoiceClick={(voice, index) => {
                const key = makeVoiceScopeKey(selectedFeatureSummary.id, voice, index)
                voicePlayback.toggle(voice, key)
              }}
            />
          </div>
        ) : null}
        {features.length > 0 ? (
          <div className={`map-list-bar${stripOpen ? " is-open" : " is-collapsed"}`} aria-label="지도 안 기록 목록">
            <div className="map-list-bar__head">
              <button className="map-filter-chip map-filter-toggle map-list-bar__toggle" type="button" onClick={() => setStripOpen(!stripOpen)}>
                지도 안 기록 <span className="map-list-bar__count">{visibleFeatures.length}/{features.length}</span>
                <span style={{ fontSize: "0.5em", verticalAlign: "middle", lineHeight: 1 }}>{stripOpen ? "▼" : "▲"}</span>
              </button>
            </div>
            {stripOpen ? (
              <>
                <label className="map-record-search" aria-label="지도 안 기록 검색">
                  <SearchIcon size={14} color="#9b938a" />
                  <input
                    type="search"
                    value={recordSearchQuery}
                    onChange={(event) => setRecordSearchQuery(event.target.value)}
                    placeholder="장소, 메모, 태그로 찾아보세요"
                  />
                  {recordSearchQuery ? (
                    <button
                      className="map-record-search__clear"
                      type="button"
                      onClick={() => setRecordSearchQuery("")}
                      aria-label="기록 검색어 지우기"
                    >
                      ×
                    </button>
                  ) : null}
                </label>

                <div className="map-record-filters" aria-label="지도 안 기록 필터">
                  {RECORD_FILTERS.map((filterItem) => (
                    <button
                      key={filterItem.id}
                      className={`map-filter-chip map-filter-chip--record${activeFilter === filterItem.id ? " is-active" : ""}`}
                      type="button"
                      data-type={filterItem.id}
                      onClick={() => setActiveFilter(filterItem.id)}
                    >
                      {filterItem.label}
                    </button>
                  ))}
                </div>

                {visibleFeatures.length === 0 ? (
                  <div className="map-list-empty">
                    <strong>조건에 맞는 기록이 없어요</strong>
                    <span>검색어나 필터를 조금 넓혀보세요.</span>
                  </div>
                ) : (
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
                    {visibleFeatures.map((feature) => (
                      <div
                        key={feature.id}
                        className={`map-place-card${selectedFeatureId === feature.id ? " is-active" : ""}`}
                        role="button"
                        tabIndex={0}
                        onClick={() => { if (!stripDragRef.current.dragging) (onStripFeatureTap || onFeatureTap)?.(feature.id) }}
                        onKeyDown={(e) => { if (e.key === "Enter") (onStripFeatureTap || onFeatureTap)?.(feature.id) }}
                      >
                        <div className={`me-strip-icon me-strip-icon--${feature.type}`}>
                          {(() => {
                            if (feature.type === "pin") {
                              const badge = getFeatureBadgeMeta(feature)
                              if (badge.kind === "emoji") return <span className="me-strip-icon__emoji">{badge.emoji}</span>
                              if (badge.kind === "icon") return <img src={`/icons/pins/${badge.catId}.svg`} width="14" height="14" alt="" />
                              return <span className="me-strip-icon__emoji">{"\u{1F4CD}"}</span>
                            }
                            if (feature.type === "route") {
                              return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0F6E56" strokeWidth="2" strokeLinecap="round"><path d="M4 19L10 7L16 14L20 5"/></svg>
                            }
                            return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#854F0B" strokeWidth="2" strokeLinecap="round" strokeDasharray="3 2"><rect x="4" y="4" width="16" height="16" rx="3"/></svg>
                          })()}
                        </div>
                        <div className="me-strip-info">
                          <strong>{feature.title}</strong>
                          <span>{feature.note || (feature.tags || []).join(" · ") || ""}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
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
            console.error("공유용 지도를 캡처하는 중 오류가 발생했습니다.", err)
          } finally {
            setCapturing(false)
          }
        }}
        showToast={showToast}
      />

      {/* 온보딩 코치마크 */}
      {coachmarkStep === 1 ? (
        <CoachMark
          step={1}
          totalSteps={3}
          title="장소, 경로, 영역을 자유롭게 남겨보세요"
          description="오른쪽 버튼으로 모드를 선택한 뒤 지도를 탭하면 지도에 기록을 남길 수 있습니다."
          onNext={() => onCoachmarkNext?.(2)}
          onSkip={() => onCoachmarkSkip?.()}
        />
      ) : null}
      {coachmarkStep === 2 ? (
        <CoachMark
          step={2}
          totalSteps={3}
          title="지도에 등록한 항목을 바로 확인할 수 있어요"
          description="지도에 남긴 장소를 누르면 설명, 사진, 음성을 미리보기로 확인할 수 있습니다."
          nextLabel="시작하기"
          onNext={() => onCoachmarkNext?.(0)}
          onSkip={() => onCoachmarkSkip?.()}
        />
      ) : null}

      {/* 첫 장소 등록 힌트 */}
      {firstPinHintVisible ? (
        <div className="first-pin-hint">
          <img src="/characters/cloud_lv1.svg" alt="" className="first-pin-hint__icon" />
          <div className="first-pin-hint__text">
            <p className="first-pin-hint__title">첫 장소 남기기가 완료됐어요</p>
            <p className="first-pin-hint__desc">장소에 설명과 사진, 음성을 추가해서 더 풍부하게 기록해 보세요.</p>
          </div>
          <button className="first-pin-hint__close" type="button" onClick={() => onDismissFirstPinHint?.()} aria-label="닫기">
            <X size={16} />
          </button>
        </div>
      ) : null}
    </section>
  )
}

function MapMenuItem({ onClick, variant = "default", children }) {
  const color = variant === "danger" ? "#E24B4A" : "#1A1A1A"
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      style={{
        background: "transparent", border: "none",
        padding: "8px 10px", borderRadius: 8,
        fontSize: 12, fontWeight: 500, color,
        textAlign: "left", width: "100%", cursor: "pointer",
      }}
    >
      {children}
    </button>
  )
}
