import { useState, useCallback, useMemo, useRef, useEffect } from "react"
import { X, Bell, ArrowLeft, Share2, LocateFixed } from "lucide-react"
import { getPinIcon, emojiToCategory } from "../data/pinIcons"
import { MapErrorBoundary } from "../components/MapErrorBoundary"
import { MapRenderer as NaverMap } from "../components/MapRenderer"
import { hasSupabaseEnv } from "../lib/supabase"
import { logEvent } from "../lib/analytics"
import { getFeatureCenter } from "../lib/appUtils"
import { useEventMapData, formatDistance } from "../hooks/useEventMapData"
import { useEventComments } from "../hooks/useEventComments"
import { useNotifications } from "../hooks/useNotifications"
import { NotificationPanel, NotificationBanner } from "../components/NotificationPanel"
import { SurveyPopup } from "../components/viewer/SurveyPopup"
import { ReportDialog } from "../components/viewer/ReportDialog"
import { SpotComments } from "../components/viewer/SpotComments"

const DEFAULT_CHECKIN_RADIUS_M = 50

// 공지 노출 시 announcement_view 이벤트를 1회만 발생시키는 헬퍼
const _loggedAnnouncements = new Set()
function AnnouncementViewTracker({ mapId, announcements, dismissed }) {
  useEffect(() => {
    if (!hasSupabaseEnv || !mapId || dismissed || !announcements?.length) return
    announcements.forEach((a) => {
      const key = `${mapId}:${a.id}`
      if (_loggedAnnouncements.has(key)) return
      _loggedAnnouncements.add(key)
      logEvent("announcement_view", { map_id: mapId, meta: { announcement_id: a.id } })
    })
  }, [mapId, announcements, dismissed])
  return null
}

// Pin SVG icon for save button
function PinSvg() {
  return (
    <svg width="10" height="12" viewBox="0 0 10 12" fill="none">
      <path d="M5 0C2.24 0 0 2.24 0 5c0 3.5 5 7 5 7s5-3.5 5-7c0-2.76-2.24-5-5-5zm0 6.5a1.5 1.5 0 110-3 1.5 1.5 0 010 3z" fill="#FF6B35"/>
    </svg>
  )
}

// Save button component
function SaveButton({ onClick, isEvent }) {
  return (
    <button
      className={`lw-save-btn${isEvent ? " lw-save-btn--event" : ""}`}
      type="button"
      onClick={onClick}
    >
      <PinSvg />
      <span className="lw-save-btn__text">loca에 저장</span>
    </button>
  )
}

// Category icon helper
function CatIcon({ feature, size = 12 }) {
  const catId = feature.category || emojiToCategory(feature.emoji)
  const ic = getPinIcon(catId)
  return (
    <span className="lw-cat-icon" style={{ background: ic.bg }}>
      <img src={`/icons/pins/${catId}.svg`} width={size} height={size} alt="" />
    </span>
  )
}

// Get region text from feature (note or tags)
function getRegionText(feature) {
  const parts = []
  if (feature.tags?.length) parts.push(`#${feature.tags[0]}`)
  return parts.join(" ") || ""
}

export function SharedMapViewer({ map, features, onSaveToApp, onBack }) {
  const [selectedId, setSelectedId] = useState(null)
  const [fitTrigger] = useState(1)
  const [focusPoint, setFocusPoint] = useState(null)
  const [sheetExpanded, setSheetExpanded] = useState(false)
  const featureViewStart = useRef(null)
  const prevSelectedId = useRef(null)
  const [spotTab, setSpotTab] = useState("info")
  const [toastMsg, setToastMsg] = useState("")
  const [activeChip, setActiveChip] = useState("all")

  const isEventMap = map.category === "event"
  const config = useMemo(() => map.config || {}, [map.config])

  const showViewerToast = useCallback((msg) => {
    setToastMsg(msg)
    setTimeout(() => setToastMsg(""), 2500)
  }, [])

  // ─── 이벤트 데이터 + 액션 ───
  const {
    checkedInIds, handleCheckin, pinDistances, userPos,
    totalCheckpoints, checkedCount, isCompleted, progressPct, nextSpot,
    announcements, announcementDismissed, setAnnouncementDismissed,
    surveyOpen, setSurveyOpen, surveyRating, setSurveyRating,
    surveyComment, setSurveyComment, surveySubmitted, handleSurveySubmit,
  } = useEventMapData({ map, features, config, isEventMap, showViewerToast })

  // ─── 댓글 ───
  const {
    comments, commentText, setCommentText, commentLoading, myKey,
    editingId, setEditingId, editText, setEditText,
    reportTarget, setReportTarget, commentsEnabled, canComment,
    handleAddComment, handleEditComment, handleDeleteComment, handleReport,
  } = useEventComments({ mapId: map.id, selectedId, isEventMap, config, checkedInIds, showViewerToast })

  // ─── 공유 ───
  const [shareOpen, setShareOpen] = useState(false)
  const shareUrl = useMemo(() => {
    if (map.slug) return `${window.location.origin}/s/${map.slug}`
    return window.location.href
  }, [map.slug])

  const handleCopyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(shareUrl)
      logEvent("share_click", { map_id: map.id, meta: { method: "link" } })
      showViewerToast("링크가 복사되었어요!")
    } catch {
      prompt("복사하세요:", shareUrl)
    }
    setShareOpen(false)
  }, [shareUrl, map.id, showViewerToast])

  const handleKakaoShare = useCallback(async () => {
    logEvent("share_click", { map_id: map.id, meta: { method: "kakao" } })
    const kakaoUrl = shareUrl + (shareUrl.includes("?") ? "&" : "?") + "utm_source=kakao"

    // 카카오 SDK 로드
    const sdkReady = await new Promise((resolve) => {
      if (window.Kakao?.Share) {
        if (!window.Kakao.isInitialized()) {
          const key = import.meta.env.VITE_KAKAO_JS_KEY
          if (key) window.Kakao.init(key)
        }
        resolve(true)
        return
      }
      const key = import.meta.env.VITE_KAKAO_JS_KEY
      if (!key) { resolve(false); return }
      const s = document.createElement("script")
      s.src = "https://t1.kakaocdn.net/kakao_js_sdk/2.7.4/kakao.min.js"
      s.onload = () => {
        if (window.Kakao && !window.Kakao.isInitialized()) window.Kakao.init(key)
        resolve(!!window.Kakao?.Share)
      }
      s.onerror = () => resolve(false)
      document.head.appendChild(s)
    })

    if (sdkReady && window.Kakao?.Share) {
      try {
        const ogImageUrl = `${window.location.origin}/api/og-image/${encodeURIComponent(map.slug || "loca")}`
        window.Kakao.Share.sendDefault({
          objectType: "feed",
          content: {
            title: map.title || "LOCA 지도",
            description: map.description || `${map.title || "LOCA"} 지도를 열어보세요.`,
            imageUrl: ogImageUrl,
            imageWidth: 800,
            imageHeight: 400,
            link: { mobileWebUrl: kakaoUrl, webUrl: kakaoUrl },
          },
          buttons: [{ title: "지도 열기", link: { mobileWebUrl: kakaoUrl, webUrl: kakaoUrl } }],
        })
        setShareOpen(false)
        return
      } catch { /* fallback */ }
    }
    // 카카오 SDK 없으면 클립보드 복사
    try {
      await navigator.clipboard.writeText(shareUrl)
      showViewerToast("링크가 복사되었어요. 카카오톡에 붙여넣기 하세요!")
    } catch {
      prompt("카카오톡에 붙여넣으세요:", shareUrl)
    }
    setShareOpen(false)
  }, [shareUrl, map, showViewerToast])

  // ─── 알림 ───
  const [notiPanelOpen, setNotiPanelOpen] = useState(false)
  const {
    notifications: notiList,
    hasUnread: notiHasUnread,
    bannerItem: notiBanner,
    dismissBanner: notiDismissBanner,
    markRead: notiMarkRead,
    markAllRead: notiMarkAllRead,
    removeItem: notiRemove,
  } = useNotifications({
    mapId: map.id,
    mapTitle: map.title,
    isEventMap,
    config,
    announcements,
    features,
    checkedInIds,
    isCompleted,
    pinDistances,
  })

  const selectedFeature = selectedId ? features.find((f) => f.id === selectedId) : null

  // ─── GPS 위치 ───
  const [localUserPos, setLocalUserPos] = useState(null)
  const [locating, setLocating] = useState(false)
  const currentUserPos = userPos || localUserPos

  const handleLocateMe = useCallback(() => {
    if (!navigator.geolocation) {
      showViewerToast("위치 서비스를 사용할 수 없어요")
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        setLocalUserPos(loc)
        setFocusPoint(loc)
        setLocating(false)
        showViewerToast("현재 위치를 찾았어요")
      },
      () => {
        setLocating(false)
        showViewerToast("위치를 가져올 수 없어요. 위치 권한을 확인해주세요.")
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
    )
  }, [showViewerToast])

  // ─── 도보 길찾기 ───
  const [walkRoute, setWalkRoute] = useState(null)
  const [walkInfo, setWalkInfo] = useState(null) // { distance, duration }
  const [walkLoading, setWalkLoading] = useState(false)

  const handleWalkNavigate = useCallback(async (feature) => {
    if (!currentUserPos || !feature) return
    setWalkLoading(true)
    setWalkRoute(null)
    setWalkInfo(null)
    try {
      const start = `${currentUserPos.lng},${currentUserPos.lat}`
      const goal = `${feature.lng},${feature.lat}`
      const res = await fetch(`/api/directions/walk?start=${start}&goal=${goal}`)
      const data = await res.json()
      if (!res.ok || !data.path) {
        console.warn("[walk] API 실패:", data)
        showViewerToast(data.error || "경로를 찾을 수 없어요")
        return
      }
      setWalkRoute(data.path)
      setWalkInfo({ distance: data.distance, duration: data.duration })
      logEvent("walk_navigate_app", { map_id: map.id, meta: { feature_id: feature.id } })
    } catch {
      showViewerToast("도보 경로 조회에 실패했어요")
    } finally {
      setWalkLoading(false)
    }
  }, [currentUserPos, map.id, showViewerToast])

  // 핀 선택 변경 시 경로 초기화
  useEffect(() => {
    setWalkRoute(null)
    setWalkInfo(null)
  }, [selectedId])

  // Extract unique categories from features
  const uniqueCategories = useMemo(() => {
    const catMap = new Map()
    features.forEach((f) => {
      const catId = f.category || emojiToCategory(f.emoji)
      if (!catMap.has(catId)) {
        const ic = getPinIcon(catId)
        catMap.set(catId, { id: catId, label: ic.label || catId })
      }
    })
    return Array.from(catMap.values())
  }, [features])

  // Extract tag pills for normal map
  const mapTags = useMemo(() => {
    const tagSet = new Set()
    features.forEach((f) => {
      const catId = f.category || emojiToCategory(f.emoji)
      const ic = getPinIcon(catId)
      if (ic.label) tagSet.add(ic.label)
      f.tags?.forEach((t) => tagSet.add(t))
    })
    return Array.from(tagSet).slice(0, 6)
  }, [features])

  // Filtered features for event map chip filter
  const filteredFeatures = useMemo(() => {
    if (activeChip === "all") return features
    return features.filter((f) => {
      const catId = f.category || emojiToCategory(f.emoji)
      return catId === activeChip
    })
  }, [features, activeChip])

  // 피처 선택 이벤트 로깅 + 장소별 체류시간 추적
  const handleFeatureSelect = useCallback((featureId) => {
    // 이전 feature 체류시간 기록
    if (prevSelectedId.current && featureViewStart.current && hasSupabaseEnv && map.id) {
      const duration = Date.now() - featureViewStart.current
      if (duration > 500) {
        logEvent("feature_view_end", { map_id: map.id, feature_id: prevSelectedId.current, meta: { duration_ms: duration } })
      }
    }

    setSelectedId(featureId)
    setSheetExpanded(false)
    prevSelectedId.current = featureId
    featureViewStart.current = featureId ? Date.now() : null

    if (hasSupabaseEnv && map.id && featureId) {
      logEvent("feature_click", { map_id: map.id, feature_id: featureId })
      logEvent("feature_view", { map_id: map.id, feature_id: featureId })
    }
  }, [map.id])

  const handleSpotTap = (feature) => {
    handleFeatureSelect(feature.id)
    setFocusPoint(getFeatureCenter(feature))
  }

  const goToNextSpot = useCallback(() => {
    if (!nextSpot) return
    handleFeatureSelect(nextSpot.id)
    setFocusPoint(getFeatureCenter(nextSpot))
  }, [nextSpot, handleFeatureSelect])

  const handleSave = useCallback(() => {
    if (hasSupabaseEnv && map.id) logEvent("map_save", { map_id: map.id })
    onSaveToApp()
  }, [map.id, onSaveToApp])

  // 체크인 버튼 렌더 헬퍼
  const renderCheckinBtn = (feature, size = "normal") => {
    if (!isEventMap || !config.checkin_enabled || feature.type !== "pin") return null
    const alreadyChecked = checkedInIds.has(feature.id)
    const dist = pinDistances[feature.id]
    const radiusM = config.checkin_radius || DEFAULT_CHECKIN_RADIUS_M
    const noLimit = radiusM === 0
    const isNearby = noLimit || (dist != null && dist <= radiusM)
    const tooFar = !noLimit && !isNearby && dist != null

    let label
    if (alreadyChecked) label = "✓ 완료"
    else if (tooFar) label = `${formatDistance(dist)} 거리`
    else label = "체크인"

    return (
      <button
        className={`lw-checkin-btn${size === "large" ? " lw-checkin-btn--lg" : ""}${alreadyChecked ? " is-checked" : tooFar ? " is-far" : ""}`}
        type="button"
        onClick={() => handleCheckin(feature.id)}
        disabled={alreadyChecked || tooFar}
      >
        {label}
      </button>
    )
  }

  // ─── Bottom Sheet (shared by both map types) ───
  const renderBottomSheet = (featureList) => (
    <div className={`lw-sheet${sheetExpanded ? " is-expanded" : ""}`}>
      <div className="lw-sheet__handle" onClick={() => setSheetExpanded((v) => !v)} />
      {!sheetExpanded ? (
        <div className="lw-sheet__scroll">
          {featureList.map((f) => {
            const catId = f.category || emojiToCategory(f.emoji)
            const ic = getPinIcon(catId)
            return (
              <button key={f.id} className="lw-sheet__card" type="button" onClick={() => handleSpotTap(f)}>
                <span className="lw-sheet__card-icon" style={{ background: ic.bg }}>
                  <img src={`/icons/pins/${catId}.svg`} width="10" height="10" alt="" />
                </span>
                <span className="lw-sheet__card-name">{f.title}</span>
                <span className="lw-sheet__card-sub">{getRegionText(f)}</span>
              </button>
            )
          })}
        </div>
      ) : (
        <>
          <div className="lw-sheet__header">장소 목록 ({featureList.length}곳)</div>
          <div className="lw-sheet__list">
            {featureList.map((f) => {
              const catId = f.category || emojiToCategory(f.emoji)
              const ic = getPinIcon(catId)
              const checked = isEventMap && checkedInIds.has(f.id)
              return (
                <button
                  key={f.id}
                  className={`lw-sheet__row${checked ? " is-checked" : ""}`}
                  type="button"
                  onClick={() => handleSpotTap(f)}
                >
                  <span className="lw-sheet__row-icon" style={{ background: ic.bg }}>
                    <img src={`/icons/pins/${catId}.svg`} width="18" height="18" alt="" />
                  </span>
                  <span className="lw-sheet__row-info">
                    <span className="lw-sheet__row-name">{f.title}</span>
                    <span className="lw-sheet__row-sub">{getRegionText(f)}</span>
                  </span>
                  {checked ? <span className="lw-sheet__row-badge">✓</span> : null}
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )

  // ─── Event: next spot / completed row inside bottom sheet ───
  const renderEventSheetExtras = () => {
    if (!isEventMap) return null
    if (isCompleted) {
      return (
        <div className="lw-sheet__completed">
          <span>모든 장소를 방문했어요!</span>
          {config.survey_enabled && !surveySubmitted ? (
            <button className="lw-sheet__survey-btn" type="button" onClick={() => setSurveyOpen(true)}>
              설문 참여하기
            </button>
          ) : null}
        </div>
      )
    }
    if (nextSpot) {
      const catId = nextSpot.category || emojiToCategory(nextSpot.emoji)
      const ic = getPinIcon(catId)
      return (
        <button className="lw-sheet__next-spot" type="button" onClick={goToNextSpot}>
          <span className="lw-cat-icon" style={{ background: ic.bg }}>
            <img src={`/icons/pins/${catId}.svg`} width="12" height="12" alt="" />
          </span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span className="lw-sheet__next-label">다음 장소</span>
            <span className="lw-sheet__next-title">{nextSpot.title}</span>
          </span>
          {pinDistances[nextSpot.id] != null ? (
            <span className="lw-sheet__next-dist">{formatDistance(pinDistances[nextSpot.id])}</span>
          ) : null}
        </button>
      )
    }
    return null
  }

  // ─── 비이벤트 지도 (일반 공유) ───
  if (!isEventMap) {
    return (
      <div className="lw-viewer">
        {/* Hero card header */}
        <div className="lw-hero">
          <div className="lw-hero__blob" />
          <div className="lw-hero__row1">
            {onBack ? (
              <button type="button" onClick={onBack} className="lw-hero__logo" style={{ border: 'none', cursor: 'pointer', padding: 0, background: 'none' }}>loca</button>
            ) : (
              <span className="lw-hero__logo">loca</span>
            )}
            <span className="lw-hero__sep">·</span>
            <span className="lw-hero__author">@{map.authorName || "user"}</span>
            <span className="lw-hero__row1-right">
              {onSaveToApp ? <SaveButton onClick={handleSave} isEvent={false} /> : null}
            </span>
          </div>
          <div className="lw-hero__title">{map.title}</div>
          {map.description ? <div className="lw-hero__desc">{map.description}</div> : null}
          {mapTags.length > 0 ? (
            <div className="lw-hero__tags">
              {mapTags.map((tag) => <span key={tag} className="lw-hero__tag">{tag}</span>)}
            </div>
          ) : null}
        </div>

        {/* Map area */}
        <div className="lw-map">
          <MapErrorBoundary>
            <NaverMap features={features} selectedFeatureId={selectedId} draftPoints={[]} draftMode="browse" focusPoint={focusPoint} fitTrigger={fitTrigger} onFeatureTap={handleFeatureSelect} showLabels mapCategory={map.category} walkRoute={walkRoute} />
          </MapErrorBoundary>

          {/* 내 위치 버튼 */}
          <button type="button" className="lw-locate-btn" onClick={handleLocateMe} disabled={locating} aria-label="내 위치">
            <LocateFixed size={18} />
          </button>

          {/* Pin tap card */}
          {selectedFeature ? (
            <div className="lw-pin-card">
              <div className="lw-pin-card__top">
                <div className="lw-pin-card__icon" style={{ background: getPinIcon(selectedFeature.category || emojiToCategory(selectedFeature.emoji)).bg }}>
                  <img src={`/icons/pins/${selectedFeature.category || emojiToCategory(selectedFeature.emoji)}.svg`} width="16" height="16" alt="" />
                </div>
                <div className="lw-pin-card__info">
                  <span className="lw-pin-card__name">{selectedFeature.title}</span>
                  <span className="lw-pin-card__region">{selectedFeature.note || getRegionText(selectedFeature)}</span>
                </div>
                <div className="lw-pin-card__actions">
                  {walkInfo ? (
                    <span className="lw-walk-badge">🚶 {Math.max(1, Math.round(walkInfo.duration / 60000))}분</span>
                  ) : null}
                  <button
                    type="button"
                    className="lw-route-btn"
                    disabled={walkLoading || !currentUserPos}
                    onClick={() => handleWalkNavigate(selectedFeature)}
                  >
                    {walkLoading ? "..." : walkRoute ? "↻" : "경로"}
                  </button>
                  <button className="lw-pin-card__close" type="button" onClick={() => setSelectedId(null)}>
                    <X size={16} strokeWidth={1.5} />
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {/* Bottom sheet */}
          {renderBottomSheet(features)}
        </div>

        {toastMsg ? <div className="lw-toast">{toastMsg}</div> : null}
      </div>
    )
  }

  // ─── 행사 지도 participant shell ───
  const ciMainColor = config.ci_main_color || "#1A3C5E"
  const ciDarkColor = config.ci_dark_color || "#0D2740"
  const orgName = config.org_name || map.title
  const orgLogo = config.org_logo
  const eventPeriod = config.event_period || ""

  return (
    <div className="lw-event">
      <div
        className="lw-ci-frame"
        style={{ background: `linear-gradient(160deg, ${ciMainColor}, ${ciDarkColor})` }}
      >
        {/* Top frame (corporate branding) */}
        <div className="lw-ci-top">
          {onBack ? (
            <button type="button" onClick={onBack} className="lw-back-btn" aria-label="뒤로가기">
              <ArrowLeft size={20} />
            </button>
          ) : null}
          <div className="lw-ci-logo">
            {orgLogo ? <img src={orgLogo} alt="" /> : orgName.slice(0, 2)}
          </div>
          <div className="lw-ci-info">
            <span className="lw-ci-title">{map.title}</span>
            <span className="lw-ci-org">
              {orgName}{eventPeriod ? ` · ${eventPeriod}` : ""}
            </span>
          </div>
          <div className="lw-ci-actions">
            {onSaveToApp ? <SaveButton onClick={handleSave} isEvent /> : null}
            <button
              className="lw-noti-btn"
              type="button"
              aria-label="공유"
              onClick={() => setShareOpen((v) => !v)}
            >
              <Share2 size={14} />
            </button>
            <button
              className="lw-noti-btn"
              type="button"
              aria-label="알림"
              onClick={() => setNotiPanelOpen((v) => !v)}
            >
              <Bell size={14} />
              {notiHasUnread && <span className="lw-noti-dot" style={{ borderColor: ciMainColor }} />}
            </button>
          </div>

          {/* 공유 드롭다운 */}
          {shareOpen && (
            <>
              <div className="lw-share-overlay" onClick={() => setShareOpen(false)} />
              <div className="lw-share-dropdown">
                <button type="button" className="lw-share-item" onClick={handleCopyLink}>
                  <span className="lw-share-icon">🔗</span>
                  <span>링크 복사</span>
                </button>
                <button type="button" className="lw-share-item lw-share-item--kakao" onClick={handleKakaoShare}>
                  <span className="lw-share-icon">💬</span>
                  <span>카카오톡</span>
                </button>
              </div>
            </>
          )}
        </div>

        {/* Inner content area */}
        <div className="lw-ci-inner">
          {/* Filter chip bar */}
          <div className="lw-chips">
            <span className="lw-chips__count">📍 {features.length}곳</span>
            <span className="lw-chips__sep" />
            <button
              className={`lw-chip${activeChip === "all" ? " is-active" : ""}`}
              type="button"
              onClick={() => setActiveChip("all")}
            >
              전체
            </button>
            {uniqueCategories.map((cat) => (
              <button
                key={cat.id}
                className={`lw-chip${activeChip === cat.id ? " is-active" : ""}`}
                type="button"
                onClick={() => setActiveChip(cat.id)}
              >
                {cat.label}
              </button>
            ))}
            {config.checkin_enabled ? (
              <span className="lw-chips__progress">
                <span className="lw-chips__progress-track">
                  <span className="lw-chips__progress-fill" style={{ width: `${progressPct}%` }} />
                </span>
                <span className="lw-chips__progress-label">
                  {isCompleted ? "완주!" : `${checkedCount}/${totalCheckpoints}`}
                </span>
              </span>
            ) : null}
          </div>

          {/* Announcement banner */}
          {announcements.length > 0 && !announcementDismissed ? (
            <div className="lw-announce">
              <span className="lw-announce__icon">⚡</span>
              <span className="lw-announce__text">
                <strong>공지</strong> {announcements[0].title}
                {announcements[0].body ? ` — ${announcements[0].body}` : ""}
              </span>
              <button className="lw-announce__close" type="button" onClick={() => setAnnouncementDismissed(true)}>
                <X size={8} strokeWidth={1.5} />
              </button>
            </div>
          ) : null}
          <AnnouncementViewTracker mapId={map.id} announcements={announcements} dismissed={announcementDismissed} />

          {/* Map area */}
          <div className="lw-event-map">
            <MapErrorBoundary>
              <NaverMap
                features={filteredFeatures}
                selectedFeatureId={selectedId}
                draftPoints={[]}
                draftMode="browse"
                focusPoint={focusPoint}
                fitTrigger={fitTrigger}
                onFeatureTap={handleFeatureSelect}
                showLabels
                checkedInIds={config.checkin_enabled ? checkedInIds : null}
                mapCategory={map.category}
                walkRoute={walkRoute}
              />
            </MapErrorBoundary>

            {/* 내 위치 버튼 */}
            <button type="button" className="lw-locate-btn" onClick={handleLocateMe} disabled={locating} aria-label="내 위치">
              <LocateFixed size={18} />
            </button>

            {/* Pin tap card (event) — with checkin + tabs */}
            {selectedFeature ? (
              <div className="lw-spot-detail">
                <div className="lw-spot-detail__head">
                  <div className="lw-spot-detail__icon" style={{ background: getPinIcon(selectedFeature.category || emojiToCategory(selectedFeature.emoji)).bg }}>
                    <img src={`/icons/pins/${selectedFeature.category || emojiToCategory(selectedFeature.emoji)}.svg`} width="16" height="16" alt="" />
                  </div>
                  <div className="lw-spot-detail__info">
                    <span className="lw-spot-detail__name">{selectedFeature.title}</span>
                  </div>
                  <div className="lw-spot-detail__actions">
                    {walkInfo ? (
                      <span className="lw-walk-badge">🚶 {Math.max(1, Math.round(walkInfo.duration / 60000))}분</span>
                    ) : null}
                    <button
                      type="button"
                      className="lw-route-btn"
                      disabled={walkLoading || !currentUserPos}
                      onClick={() => handleWalkNavigate(selectedFeature)}
                    >
                      {walkLoading ? "..." : walkRoute ? "↻" : "경로"}
                    </button>
                    {renderCheckinBtn(selectedFeature)}
                    <button className="lw-spot-detail__close" type="button" onClick={() => setSelectedId(null)}>
                      <X size={16} strokeWidth={1.5} />
                    </button>
                  </div>
                </div>

                {/* Tabs */}
                <div className="lw-spot-tabs">
                  <button className={`lw-spot-tab${spotTab === "info" ? " is-active" : ""}`} type="button" onClick={() => setSpotTab("info")}>정보</button>
                  <button className={`lw-spot-tab${spotTab === "comments" ? " is-active" : ""}`} type="button" onClick={() => setSpotTab("comments")}>
                    댓글{comments.length > 0 ? ` (${comments.length})` : ""}
                  </button>
                </div>

                {/* Info tab */}
                {spotTab === "info" ? (
                  <div className="lw-spot-body">
                    {selectedFeature.note ? <p className="lw-spot-note">{selectedFeature.note}</p> : <p className="lw-spot-note lw-spot-note--empty">등록된 설명이 없어요.</p>}
                    {selectedFeature.tags?.length ? (
                      <div className="lw-spot-tags">
                        {selectedFeature.tags.map((tag) => <span key={tag} className="chip chip--small">#{tag}</span>)}
                      </div>
                    ) : null}

                  </div>
                ) : null}

                {/* Comments tab */}
                {spotTab === "comments" ? (
                  <SpotComments
                    comments={comments} commentText={commentText} setCommentText={setCommentText}
                    commentLoading={commentLoading} myKey={myKey}
                    editingId={editingId} setEditingId={setEditingId}
                    editText={editText} setEditText={setEditText}
                    commentsEnabled={commentsEnabled} canComment={canComment} config={config}
                    onAddComment={handleAddComment} onEditComment={handleEditComment}
                    onDeleteComment={handleDeleteComment} onReport={setReportTarget}
                  />
                ) : null}
              </div>
            ) : null}

            {/* Bottom sheet */}
            {!selectedFeature ? (
              <div className={`lw-sheet${sheetExpanded ? " is-expanded" : ""}`}>
                <div className="lw-sheet__handle" onClick={() => setSheetExpanded((v) => !v)} />
                {!sheetExpanded ? (
                  <>
                    {renderEventSheetExtras()}
                    <div className="lw-sheet__scroll">
                      {filteredFeatures.map((f) => {
                        const catId = f.category || emojiToCategory(f.emoji)
                        const ic = getPinIcon(catId)
                        return (
                          <button key={f.id} className="lw-sheet__card" type="button" onClick={() => handleSpotTap(f)}>
                            <span className="lw-sheet__card-icon" style={{ background: ic.bg }}>
                              <img src={`/icons/pins/${catId}.svg`} width="10" height="10" alt="" />
                            </span>
                            <span className="lw-sheet__card-name">{f.title}</span>
                            <span className="lw-sheet__card-sub">{getRegionText(f)}</span>
                          </button>
                        )
                      })}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="lw-sheet__header">장소 목록 ({filteredFeatures.length}곳)</div>
                    <div className="lw-sheet__list">
                      {filteredFeatures.map((f) => {
                        const catId = f.category || emojiToCategory(f.emoji)
                        const ic = getPinIcon(catId)
                        const checked = checkedInIds.has(f.id)
                        return (
                          <button
                            key={f.id}
                            className={`lw-sheet__row${checked ? " is-checked" : ""}`}
                            type="button"
                            onClick={() => handleSpotTap(f)}
                          >
                            <span className="lw-sheet__row-icon" style={{ background: ic.bg }}>
                              <img src={`/icons/pins/${catId}.svg`} width="18" height="18" alt="" />
                            </span>
                            <span className="lw-sheet__row-info">
                              <span className="lw-sheet__row-name">{f.title}</span>
                              <span className="lw-sheet__row-sub">{getRegionText(f)}</span>
                            </span>
                            {checked ? <span className="lw-sheet__row-badge">✓</span> : null}
                          </button>
                        )
                      })}
                    </div>
                  </>
                )}
              </div>
            ) : null}
          </div>
        </div>

        {/* Bottom frame */}
        <div className="lw-ci-bottom">
          <span className="lw-ci-powered">Powered by</span>
          <span className="lw-ci-powered-logo">loca</span>
        </div>
      </div>

      {/* Report dialog */}
      {reportTarget ? (
        <ReportDialog onReport={handleReport} onClose={() => setReportTarget(null)} />
      ) : null}

      {/* Survey popup */}
      {surveyOpen ? (
        <SurveyPopup
          rating={surveyRating} setRating={setSurveyRating}
          comment={surveyComment} setComment={setSurveyComment}
          onSubmit={handleSurveySubmit} onClose={() => setSurveyOpen(false)}
        />
      ) : null}

      <NotificationBanner
        notification={notiBanner}
        onTap={() => { notiDismissBanner(); setNotiPanelOpen(true) }}
        onDismiss={notiDismissBanner}
      />

      {notiPanelOpen && (
        <NotificationPanel
          notifications={notiList}
          onMarkRead={notiMarkRead}
          onMarkAllRead={notiMarkAllRead}
          onRemove={notiRemove}
          onClose={() => setNotiPanelOpen(false)}
          onTap={(item) => {
            setNotiPanelOpen(false)
            if (item.meta?.featureId) {
              const feat = features.find((f) => f.id === item.meta.featureId)
              if (feat) handleSpotTap(feat)
            }
          }}
        />
      )}

      {toastMsg ? <div className="lw-toast">{toastMsg}</div> : null}
    </div>
  )
}
