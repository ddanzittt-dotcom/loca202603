import { useEffect, useMemo, useState, useRef, useCallback } from "react"
import { createPortal } from "react-dom"
import { Search as SearchIcon, X, ArrowLeft, Link2, Minus, Navigation, Plus, Users } from "lucide-react"
import { CoachMark } from "../components/CoachMark"
import { FeatureEmoji, resolvePlaceMarkerEmoji } from "../components/FeatureEmoji"
import { MapErrorBoundary } from "../components/MapErrorBoundary"

import { MapRenderer as NaverMap } from "../components/MapRenderer"
import { ShareSheet } from "../components/sheets/ShareSheet"
import { RecordEntrySheet } from "../components/sheets/RecordEntrySheet"
import { CommunityRecordComments } from "../components/CommunityRecordComments"
import { FeaturePopupCard } from "../components/FeaturePopupCard"
import { createId } from "../lib/appUtils"
import { fetchPlaceMatch } from "../lib/placeMatch"
import { buildFeatureRecordGroups, recordEntryId, summarizeRecordGroup } from "../lib/featureRecordGroups"

// 길 길이(km) — 위경도 배열의 haversine 합산
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
  { id: "route", label: "길" },
  { id: "area", label: "영역" },
  { id: "record", label: "기록 있음" },
]
const LARGE_MAP_STRIP_COLLAPSE_THRESHOLD = 120
const NEARBY_RECORD_RADIUS_KM = 5
const DEFAULT_MAP_CENTER = { lat: 37.544, lng: 127.056 }

function hasFeatureRecord(feature) {
  return Boolean(
    feature?.note?.trim()
    || (feature?.memos || []).some((memo) => memo.text?.trim() || (memo.photos || []).length > 0)
    || (feature?.photos || []).length > 0,
  )
}

const toFiniteNumber = (value) => {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function getFeatureListPoint(feature) {
  const representativeLat = toFiniteNumber(feature?.representativeLocation?.lat)
  const representativeLng = toFiniteNumber(feature?.representativeLocation?.lng)
  if (representativeLat !== null && representativeLng !== null) {
    return { lat: representativeLat, lng: representativeLng }
  }

  const lat = toFiniteNumber(feature?.lat)
  const lng = toFiniteNumber(feature?.lng)
  if (lat !== null && lng !== null && !(lat === 0 && lng === 0)) {
    return { lat, lng }
  }

  const points = Array.isArray(feature?.points) ? feature.points : []
  if (points.length === 0) return null
  let minLat = Infinity
  let maxLat = -Infinity
  let minLng = Infinity
  let maxLng = -Infinity
  for (const point of points) {
    const pointLat = toFiniteNumber(point?.[1])
    const pointLng = toFiniteNumber(point?.[0])
    if (pointLat === null || pointLng === null) continue
    minLat = Math.min(minLat, pointLat)
    maxLat = Math.max(maxLat, pointLat)
    minLng = Math.min(minLng, pointLng)
    maxLng = Math.max(maxLng, pointLng)
  }
  if (![minLat, maxLat, minLng, maxLng].every(Number.isFinite)) return null
  return { lat: (minLat + maxLat) / 2, lng: (minLng + maxLng) / 2 }
}

function distanceKm(from, to) {
  const lat1 = toFiniteNumber(from?.lat)
  const lng1 = toFiniteNumber(from?.lng)
  const lat2 = toFiniteNumber(to?.lat)
  const lng2 = toFiniteNumber(to?.lng)
  if ([lat1, lng1, lat2, lng2].some((value) => value === null)) return Infinity
  const R = 6371
  const toRad = (deg) => (deg * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const s = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)))
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
  onRemoveFeatureFromMap,
  readOnly = false,
  hideCount = false,
  communityMode = false,
  currentUserId = "me",
  showLabels = true,
  myLocation = null,
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
  onToggleLabels,
  onRenameMap,
  onAddCards,
  onOpenCollaborators,
  onOpenFeatureEdit,
  onCloseFeatureSummary,
  onAddMemo,
  onUpdateMemo,
  onDeleteMemo,
  photoInputRef,
  onPhotoSelected,
  onDeletePhoto,
  onBeginFeatureRecord,
  onEndFeatureRecord,
  importedCommunityFeatureIds,
  onImportCommunityFeature,
  onUnimportCommunityFeature,
  onRequestCommunityUpdateFromSummary,
  onOpenShareEditor,
  onStripFeatureTap,
  showToast,
  shareUrl = "",
  onPublishMap,
  onUnpublishMap,
  coachmarkStep = 0,
  onCoachmarkNext,
  onCoachmarkSkip,
  firstPinHintVisible = false,
  onDismissFirstPinHint,
}) {
  const [externalSearchQuery, setExternalSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState([])
  const [searchOpen, setSearchOpen] = useState(false)
  const [searching, setSearching] = useState(false)
  const [pendingSearchPin, setPendingSearchPin] = useState(null)
  const [mappingSearchPin, setMappingSearchPin] = useState(false)
  const [activeFilter, setActiveFilter] = useState("all")
  const stripTouchedRef = useRef(false)
  const [stripOpen, setStripOpen] = useState(() => !(communityMode || features.length > LARGE_MAP_STRIP_COLLAPSE_THRESHOLD))
  const [shareOpen, setShareOpen] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [nameDraft, setNameDraft] = useState(map.title)
  const commitRename = () => {
    const next = nameDraft.trim()
    setRenaming(false)
    if (next && next !== map.title) onRenameMap?.(next)
    else setNameDraft(map.title)
  }
  const [summaryRecordOpen, setSummaryRecordOpen] = useState(false)
  const [summaryRecordDraft, setSummaryRecordDraft] = useState(null)
  const [mapCenter, setMapCenter] = useState(() => focusPoint || myLocation || DEFAULT_MAP_CENTER)
  // v2: 펼침형 FAB — 평소 + 1개만, 탭하면 도구 3개 stagger 펼침.
  const [capturing, setCapturing] = useState(false)
  const naverMapRef = useRef(null)
  const stripRef = useRef(null)
  const stripDragRef = useRef({ startX: 0, scrollLeft: 0, dragging: false })
  const trimmedExternalSearchQuery = externalSearchQuery.trim()
  const summaryOpen = Boolean(selectedFeatureSummary)
  const isSummaryCreator = Boolean(selectedFeatureSummary?.createdBy) && selectedFeatureSummary?.createdBy === currentUserId
  const isPublicCommunityRecord = selectedFeatureSummary?.sourceContext === "public_community_records"
  // 내 지도(personal)는 본인 지도이므로 항상 작성자. 커뮤니티는 createdBy 로 판정.
  // 데모/공유 등 readOnly 환경에서는 작성자 권한을 주지 않는다.
  const isSummaryAuthor = readOnly ? false : (communityMode ? isSummaryCreator : true)
  const canEditSummary = !readOnly && typeof onOpenFeatureEdit === "function" && (communityMode ? isSummaryCreator : true)
  const canRequestSummaryEdit = (
    communityMode
    && !readOnly
    && !isPublicCommunityRecord
    && !isSummaryCreator
    && typeof onRequestCommunityUpdateFromSummary === "function"
  )
  const showCommunityRecordComments = communityMode && !readOnly && Boolean(selectedFeatureSummary)
  const canMapPinFromSearch = !readOnly && typeof onCreatePinAtLocation === "function"
  const showExternalPlaceSearch = !readOnly
  const canWriteSummaryRecord = !communityMode && isSummaryAuthor && typeof onAddMemo === "function"
  const summaryRecordGroups = useMemo(() => (
    selectedFeatureSummary ? buildFeatureRecordGroups(selectedFeatureSummary) : []
  ), [selectedFeatureSummary])

  const openSummaryRecord = useCallback(() => {
    if (!selectedFeatureSummary?.id || !canWriteSummaryRecord) return
    onBeginFeatureRecord?.(selectedFeatureSummary.id)
    setSummaryRecordDraft({ id: createId("record"), mode: "create", initialText: "", memoId: null, groupId: null })
    setSummaryRecordOpen(true)
  }, [canWriteSummaryRecord, onBeginFeatureRecord, selectedFeatureSummary?.id])

  const openSummaryRecordEdit = useCallback((group) => {
    if (!selectedFeatureSummary?.id || !canWriteSummaryRecord || !group) return
    const summary = summarizeRecordGroup(group)
    const memo = group.memos?.[0] || null
    const recordId = group.recordId || recordEntryId(memo) || group.id || createId("record")
    onBeginFeatureRecord?.(selectedFeatureSummary.id)
    setSummaryRecordDraft({
      id: recordId,
      mode: "edit",
      initialText: summary.text || "",
      memoId: memo?.id || null,
      groupId: group.id,
    })
    setSummaryRecordOpen(true)
  }, [canWriteSummaryRecord, onBeginFeatureRecord, selectedFeatureSummary?.id])

  const deleteSummaryRecord = useCallback(async (group) => {
    if (!selectedFeatureSummary?.id || !canWriteSummaryRecord || !group) return
    if (!window.confirm("이 기록을 삭제할까요?\n사진과 메모가 함께 삭제돼요.")) return
    onBeginFeatureRecord?.(selectedFeatureSummary.id)
    const photoItems = group.photos || []
    const memoItems = group.memos || []
    for (const photo of photoItems) {
      const id = photo.id || photo.localId
      if (id) await onDeletePhoto?.(id, { skipConfirm: true, silent: true, featureId: selectedFeatureSummary.id })
    }
    for (const memo of memoItems) {
      if (memo?.id) await onDeleteMemo?.(selectedFeatureSummary.id, memo.id, { silent: true })
    }
    onEndFeatureRecord?.()
    showToast?.("기록을 삭제했어요.")
  }, [
    canWriteSummaryRecord,
    onBeginFeatureRecord,
    onDeleteMemo,
    onDeletePhoto,
    onEndFeatureRecord,
    selectedFeatureSummary?.id,
    showToast,
  ])

  const closeSummaryRecord = useCallback(({ saved = false } = {}) => {
    if (!saved && summaryRecordDraft?.mode !== "edit" && summaryRecordDraft?.id && selectedFeatureSummary) {
      const draftId = summaryRecordDraft.id
      ;(selectedFeatureSummary.photos || [])
        .filter((photo) => recordEntryId(photo) === draftId)
        .forEach((photo) => {
          const id = photo.id || photo.localId
          if (id) onDeletePhoto?.(id, { skipConfirm: true })
        })
    }
    setSummaryRecordOpen(false)
    setSummaryRecordDraft(null)
    onEndFeatureRecord?.()
  }, [onDeletePhoto, onEndFeatureRecord, selectedFeatureSummary, summaryRecordDraft?.id, summaryRecordDraft?.mode])

  const summaryRecordPhotos = useMemo(() => {
    if (!summaryRecordDraft?.id) return []
    if (summaryRecordDraft.groupId) {
      const group = summaryRecordGroups.find((item) => item.id === summaryRecordDraft.groupId || item.recordId === summaryRecordDraft.id)
      if (group) return group.photos || []
    }
    return (selectedFeatureSummary?.photos || []).filter((photo) => recordEntryId(photo) === summaryRecordDraft.id)
  }, [selectedFeatureSummary?.photos, summaryRecordDraft?.groupId, summaryRecordDraft?.id, summaryRecordGroups])

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
    const placeName = (result?.name || "").trim()
    const locationLabel = placeName || result?.address || "선택한 위치"
    onSearchLocation?.({ lat, lng, zoom: 16 })
    setExternalSearchQuery(locationLabel)
    setSearchOpen(false)
    setSearching(false)
    if (canMapPinFromSearch) {
      // 상호명은 새 핀 제목으로, 주소는 메모로 넘겨 등록 경험을 내 장소 등록과 맞춘다
      setPendingSearchPin({ lat, lng, label: locationLabel, title: placeName || null, note: result?.address || "" })
    } else {
      setPendingSearchPin(null)
    }
  }, [canMapPinFromSearch, onSearchLocation])

  const handleConfirmSearchPin = useCallback(async () => {
    if (!canMapPinFromSearch || !pendingSearchPin || mappingSearchPin) return
    setMappingSearchPin(true)
    try {
      await onCreatePinAtLocation?.({
        lat: pendingSearchPin.lat,
        lng: pendingSearchPin.lng,
        title: pendingSearchPin.title,
        note: pendingSearchPin.note,
      })
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
        title: "\uAE38 \uC0DD\uC131 \uBAA8\uB4DC",
        description: draftPoints.length > 0
          ? `${draftPoints.length}\uAC1C \uC9C0\uC810\uC744 \uC120\uD0DD\uD588\uC5B4\uC694. \uC6B0\uCE21 \uD558\uB2E8 \uBC84\uD2BC\uC73C\uB85C \uC644\uB8CC\uD574 \uC8FC\uC138\uC694.`
          : "\uC9C0\uB3C4\uC5D0\uC11C \uC21C\uC11C\uB300\uB85C \uC9C0\uC810\uC744 \uD0ED\uD574 \uAE38\uC744 \uADF8\uB824 \uBCF4\uC138\uC694.",
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

  const filteredFeatures = useMemo(() => (
    features.filter((feature) => {
      const matchesFilter = (() => {
        if (activeFilter === "all") return true
        if (activeFilter === "record") return hasFeatureRecord(feature)
        return feature.type === activeFilter
      })()
      return matchesFilter
    })
  ), [activeFilter, features])

  const nearbyVisibleFeatures = useMemo(() => {
    return filteredFeatures.filter((feature) => {
      if (feature.id === selectedFeatureId) return true
      const point = getFeatureListPoint(feature)
      if (!point) return false
      return distanceKm(mapCenter, point) <= NEARBY_RECORD_RADIUS_KM
    })
  }, [filteredFeatures, mapCenter, selectedFeatureId])

  const handleViewportChange = useCallback(({ center } = {}) => {
    const lat = toFiniteNumber(center?.lat)
    const lng = toFiniteNumber(center?.lng)
    if (lat === null || lng === null) return
    setMapCenter((current) => {
      if (current && Math.abs(current.lat - lat) < 0.0001 && Math.abs(current.lng - lng) < 0.0001) return current
      return { lat, lng }
    })
  }, [])

  useEffect(() => {
    const lat = toFiniteNumber(focusPoint?.lat ?? myLocation?.lat)
    const lng = toFiniteNumber(focusPoint?.lng ?? myLocation?.lng)
    if (lat === null || lng === null) return
    setMapCenter((current) => current || { lat, lng })
  }, [focusPoint?.lat, focusPoint?.lng, myLocation?.lat, myLocation?.lng])

  useEffect(() => {
    if (stripTouchedRef.current || stripOpen === false) return
    if (communityMode || features.length > LARGE_MAP_STRIP_COLLAPSE_THRESHOLD) {
      setStripOpen(false)
    }
  }, [communityMode, features.length, stripOpen])

  const toggleStripOpen = useCallback(() => {
    stripTouchedRef.current = true
    setStripOpen((current) => !current)
  }, [])

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
    if (!showExternalPlaceSearch || trimmedExternalSearchQuery.length < 2) return undefined

    let cancelled = false
    const query = trimmedExternalSearchQuery
    const bias = mapCenter || myLocation || DEFAULT_MAP_CENTER
    const timeoutId = window.setTimeout(() => {
      setSearching(true)
      // 내 장소 등록과 같은 매커니즘 — 카카오 로컬(상호+주소) 검색. 지도 중심을 거리 정렬 기준으로 쓴다.
      fetchPlaceMatch({ lat: bias.lat, lng: bias.lng, q: query })
        .then((candidates) => {
          if (cancelled) return
          setSearchResults(candidates.slice(0, 7).map((candidate, i) => ({
            id: `place-${i}-${candidate.lat}-${candidate.lng}`,
            name: candidate.name || "",
            categoryName: candidate.categoryName || "",
            address: candidate.address || "",
            lat: Number(candidate.lat),
            lng: Number(candidate.lng),
          })))
          setSearchOpen(true)
        })
        .catch(() => {
          if (cancelled) return
          setSearchResults([])
          setSearchOpen(true)
        })
        .finally(() => {
          if (!cancelled) setSearching(false)
        })
    }, 320)

    return () => {
      cancelled = true
      window.clearTimeout(timeoutId)
    }
  }, [showExternalPlaceSearch, trimmedExternalSearchQuery, mapCenter, myLocation])

  return (
    <section className={`map-editor map-editor--v2${summaryOpen ? " map-editor--summary-open" : ""}${stripOpen && features.length > 0 ? " map-editor--record-panel-open" : ""}`}>
      {/* 상단 헤더 — v2: 2줄 (제목/액션 행 + 카운터 점 행) */}
      <div className="me-bar me-bar--v2">
        <div className="me-bar__card">
          <div className="me-bar__main-row">
            <div className="me-bar__left">
              <button className="me-bar__back" type="button" onClick={onBack} aria-label="뒤로가기">
                <ArrowLeft size={16} />
              </button>
              <div className="me-bar__title-stack">
                {onRenameMap && !readOnly ? (
                  renaming ? (
                    <input
                      className="me-bar__name-input"
                      value={nameDraft}
                      autoFocus
                      maxLength={40}
                      onChange={(event) => setNameDraft(event.target.value)}
                      onBlur={commitRename}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") commitRename()
                        if (event.key === "Escape") { setNameDraft(map.title); setRenaming(false) }
                      }}
                      aria-label="지도 이름"
                    />
                  ) : (
                    <button
                      type="button"
                      className="me-bar__name me-bar__name--editable"
                      onClick={() => { setNameDraft(map.title); setRenaming(true) }}
                      title="이름 바꾸기"
                    >
                      {map.title}
                    </button>
                  )
                ) : (
                  <span className="me-bar__name">{map.title}</span>
                )}
                {!hideCount ? (
                  <div className="me-bar__counters" aria-label="지도 기록 수">
                    <span className="me-bar__counter me-bar__counter--pin">
                      <span className="me-bar__counter-dot" aria-hidden="true" />
                      <span className="me-bar__counter-label">장소</span>
                      <strong className="loca-v2-num">{pinCount}</strong>
                    </span>
                    <span className="me-bar__counter me-bar__counter--route">
                      <span className="me-bar__counter-dot" aria-hidden="true" />
                      <span className="me-bar__counter-label">길</span>
                      <strong className="loca-v2-num">{routeCount}</strong>
                    </span>
                    <span className="me-bar__counter me-bar__counter--area">
                      <span className="me-bar__counter-dot" aria-hidden="true" />
                      <span className="me-bar__counter-label">영역</span>
                      <strong className="loca-v2-num">{areaCount}</strong>
                    </span>
                  </div>
                ) : null}
              </div>
            </div>
            <div className="me-bar__right">
              {!communityMode ? (
                <>
                  {onAddCards && !readOnly ? (
                    <button
                      className="me-bar__addcards"
                      type="button"
                      onClick={onAddCards}
                      aria-label="카드 추가"
                    >
                      + 카드 추가
                    </button>
                  ) : null}
                  <button
                    className={`me-bar__label-toggle${showLabels ? " is-active" : ""}`}
                    type="button"
                    onClick={onToggleLabels}
                    aria-pressed={showLabels}
                    aria-label="이름 표시 전환"
                  >
                    이름 {showLabels ? "ON" : "OFF"}
                  </button>
                  <button className="me-bar__share" type="button" onClick={() => setShareOpen(true)} aria-label="공유하기">
                    <Link2 size={16} color="#2D4A3E" />
                  </button>
                  {typeof onOpenCollaborators === "function" ? (
                    <button className="me-bar__share me-bar__collab" type="button" onClick={onOpenCollaborators} aria-label="협업자 관리">
                      <Users size={16} color="#2D4A3E" />
                    </button>
                  ) : null}
                </>
              ) : null}
            </div>
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
                    <strong>{result.name || result.address}</strong>
                    {(result.categoryName || result.address) ? (
                      <span>{[result.categoryName, result.address].filter(Boolean).join(" · ")}</span>
                    ) : null}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        <MapErrorBoundary>
          <NaverMap
            ref={naverMapRef}
            features={filteredFeatures}
            selectedFeatureId={selectedFeatureId}
            draftPoints={draftPoints}
            draftMode={editorMode}
            focusPoint={focusPoint}
            fitTrigger={fitTrigger}
            onMapTap={readOnly ? undefined : onMapTap}
            onFeatureTap={onFeatureTap}
            onViewportChange={handleViewportChange}
            showLabels={showLabels}
            myLocation={myLocation}
          />
        </MapErrorBoundary>

        <button className="map-locate-button" type="button" onClick={onLocate} aria-label="내 위치로 이동">
          <Navigation size={18} />
          <span className="map-locate-button__label">내 위치</span>
        </button>

        {/* 줌 컨트롤 — 데스크톱 전용 노출 (editor-focused.css) */}
        <div className="me-zoom-ctl" role="group" aria-label="지도 확대 축소">
          <button type="button" onClick={() => naverMapRef.current?.zoomIn?.()} aria-label="확대">
            <Plus size={15} />
          </button>
          <button type="button" onClick={() => naverMapRef.current?.zoomOut?.()} aria-label="축소">
            <Minus size={15} />
          </button>
        </div>

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

        {/* 입력 도구 (장소/길/영역) — 상시 노출 */}
        <div className="me-fabs me-fabs--v2 is-expanded">
          {!readOnly ? (
            <>
              <button
                className={`me-fab me-fab--pin me-fab--tool${editorMode === "pin" ? " is-active" : ""}`}
                type="button"
                onClick={() => onModeChange(editorMode === "pin" ? "browse" : "pin")}
                aria-label="장소 남기기 모드"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="2.5" fill="#FFF4EB"/></svg>
                <span>장소</span>
              </button>
              <button
                className={`me-fab me-fab--route me-fab--tool${editorMode === "route" ? " is-active" : ""}`}
                type="button"
                onClick={() => onModeChange(editorMode === "route" ? "browse" : "route")}
                aria-label="길 그리기 모드"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 19L10 7L16 14L20 5"/></svg>
                <span>길</span>
              </button>
              <button
                className={`me-fab me-fab--area me-fab--tool${editorMode === "area" ? " is-active" : ""}`}
                type="button"
                onClick={() => onModeChange(editorMode === "area" ? "browse" : "area")}
                aria-label="영역 그리기 모드"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeDasharray="3 2"><rect x="4" y="4" width="16" height="16" rx="3"/></svg>
                <span>영역</span>
              </button>
            </>
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
              {editorMode === "area" ? "영역 완성하기" : "길 완성하기"}
            </button>
          </div>
        ) : null}
        {selectedFeatureSummary ? createPortal(
          <>
          <button
            type="button"
            className="map-feature-summary-backdrop"
            aria-label="닫기"
            onClick={() => { closeSummaryRecord(); onCloseFeatureSummary?.() }}
          />
          <div className={`map-feature-summary-wrap${showCommunityRecordComments ? " map-feature-summary-wrap--comments" : ""}`}>
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
              onClose={() => { closeSummaryRecord(); onCloseFeatureSummary?.() }}
              onAddRecord={
                canWriteSummaryRecord
                  ? openSummaryRecord
                  : undefined
              }
              onEditRecord={
                canWriteSummaryRecord && typeof onUpdateMemo === "function"
                  ? openSummaryRecordEdit
                  : undefined
              }
              onDeleteRecord={
                canWriteSummaryRecord && typeof onDeleteMemo === "function"
                  ? deleteSummaryRecord
                  : undefined
              }
              onEdit={
                canEditSummary
                  ? () => onOpenFeatureEdit?.(selectedFeatureSummary.id)
                  : undefined
              }
              onRemoveFromMap={
                typeof onRemoveFeatureFromMap === "function"
                  && isSummaryAuthor
                  && !communityMode
                  && selectedFeatureSummary.type === "pin"
                  ? () => onRemoveFeatureFromMap(selectedFeatureSummary.id)
                  : undefined
              }
              onRequestEdit={canRequestSummaryEdit ? handleSummaryRequestEdit : undefined}
              onAddMemo={
                communityMode && !readOnly && !isPublicCommunityRecord && typeof onAddMemo === "function"
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
            />
            {showCommunityRecordComments ? (
              <CommunityRecordComments
                feature={selectedFeatureSummary}
                className="public-record-comments--app"
              />
            ) : null}
          </div>
          </>,
          document.body,
        ) : null}
        {summaryRecordOpen && selectedFeatureSummary ? (
          <RecordEntrySheet
            open={summaryRecordOpen}
            featureTitle={selectedFeatureSummary.title}
            recordId={summaryRecordDraft?.id || ""}
            mode={summaryRecordDraft?.mode || "create"}
            initialText={summaryRecordDraft?.initialText || ""}
            saveLabel={summaryRecordDraft?.mode === "edit" ? "수정 저장" : undefined}
            onClose={closeSummaryRecord}
            onSave={async (text, meta = {}) => {
              const recordId = meta.recordId || summaryRecordDraft?.id
              if (summaryRecordDraft?.mode === "edit") {
                if (summaryRecordDraft.memoId && typeof onUpdateMemo === "function") {
                  await onUpdateMemo(selectedFeatureSummary.id, summaryRecordDraft.memoId, text, { recordId })
                  return
                }
                if (text?.trim()) {
                  await onAddMemo?.(selectedFeatureSummary.id, text, [], { recordId })
                }
                return
              }
              if (text?.trim()) await onAddMemo?.(selectedFeatureSummary.id, text, [], { recordId })
            }}
            photos={summaryRecordPhotos}
            onPhotoSelected={onPhotoSelected}
            onDeletePhoto={onDeletePhoto}
            photoInputRef={photoInputRef}
          />
        ) : null}
        {features.length > 0 ? (
          <div className={`map-list-bar${stripOpen ? " is-open" : " is-collapsed"}`} aria-label="지도 안 기록 목록">
            <div className="map-list-bar__head">
              <button className="map-filter-chip map-filter-toggle map-list-bar__toggle" type="button" onClick={toggleStripOpen}>
                지도 안 기록 <span className="map-list-bar__count">{nearbyVisibleFeatures.length}/{features.length}</span>
                <span style={{ fontSize: "0.5em", verticalAlign: "middle", lineHeight: 1 }}>{stripOpen ? "▼" : "▲"}</span>
              </button>
              {stripOpen ? (
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
              ) : null}
            </div>
            {stripOpen ? (
              <>
                {nearbyVisibleFeatures.length === 0 ? (
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
                    {nearbyVisibleFeatures.map((feature) => (
                      <div
                        key={feature.id}
                        className={`map-place-card${selectedFeatureId === feature.id ? " is-active" : ""}`}
                        role="button"
                        tabIndex={0}
                        onClick={() => { if (!stripDragRef.current.dragging) (onStripFeatureTap || onFeatureTap)?.(feature.id) }}
                        onKeyDown={(e) => { if (e.key === "Enter") (onStripFeatureTap || onFeatureTap)?.(feature.id) }}
                      >
                        {/* 종류색 이모지 썸네일 + 이름 + 종류 + (장소)기록 수 */}
                        <span className={`me-strip-thumb me-strip-thumb--${feature.type}`} aria-hidden="true">
                          <FeatureEmoji emoji={resolvePlaceMarkerEmoji(feature)} size={16} />
                        </span>
                        <div className="me-strip-info">
                          <strong>{feature.title}</strong>
                          <span className="me-strip-kind">
                            {feature.type === "pin" ? "장소" : feature.type === "route" ? "길" : "영역"}
                          </span>
                        </div>
                        {feature.type === "pin" ? (
                          <span className="me-strip-rec">기록 {buildFeatureRecordGroups(feature).length}</span>
                        ) : null}
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
        onPublishMap={onPublishMap}
        onUnpublishMap={onUnpublishMap}
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
          title="장소, 길, 영역을 자유롭게 남겨보세요"
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
          description="지도에 남긴 장소를 누르면 설명과 사진을 미리보기로 확인할 수 있습니다."
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
            <p className="first-pin-hint__desc">장소에 설명과 사진을 추가해서 더 풍부하게 기록해 보세요.</p>
          </div>
          <button className="first-pin-hint__close" type="button" onClick={() => onDismissFirstPinHint?.()} aria-label="닫기">
            <X size={16} />
          </button>
        </div>
      ) : null}
    </section>
  )
}

