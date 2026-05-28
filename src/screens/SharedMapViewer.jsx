import { useState, useCallback, useMemo, useRef, useEffect } from "react"
import { X, ArrowLeft, Share2 } from "lucide-react"
import { getPinIcon, emojiToCategory } from "../data/pinIcons"
import { MapErrorBoundary } from "../components/MapErrorBoundary"
import { MapRenderer as NaverMap } from "../components/MapRenderer"
import { hasSupabaseEnv } from "../lib/supabase"
import { logEvent } from "../lib/analytics"
import { getFeatureCenter } from "../lib/appUtils"
import { triggerSelectionFeedback } from "../lib/haptics"
import { saveMap as saveMapRecord } from "../lib/mapService"
import { isEventMap as checkIsEventMap } from "../lib/mapPlacement"
import { useEventMapData, formatDistance } from "../hooks/useEventMapData"
import { useEventComments } from "../hooks/useEventComments"
import { useNotifications } from "../hooks/useNotifications"
import { NotificationPanel, NotificationBanner } from "../components/NotificationPanel"
import { SurveyPopup } from "../components/viewer/SurveyPopup"
import { ReportDialog } from "../components/viewer/ReportDialog"
import { SpotComments } from "../components/viewer/SpotComments"
import { FeaturePopupCard } from "../components/FeaturePopupCard"
import { useVoicePlayback, makeVoiceScopeKey } from "../hooks/useVoicePlayback"
import { BrandLogo } from "../components/BrandLogo"

// 길 길이 (haversine) — FeaturePopupCard 의 routeLengthKm prop 으로 전달
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

const DEFAULT_CHECKIN_RADIUS_M = 50

// 공지 노출 이벤트를 한 번만 발생시키는 버퍼
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
function SaveButton({ onClick, isEvent, loading = false }) {
  return (
    <button
      className={`lw-save-btn${isEvent ? " lw-save-btn--event" : ""}`}
      type="button"
      onClick={onClick}
      disabled={loading}
    >
      <PinSvg />
      <span className="lw-save-btn__text">{loading ? "저장 중..." : "내 라이브러리에 저장"}</span>
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

export function SharedMapViewer({ map, features, onSaveToApp, onBack, savingToApp = false }) {
  const [selectedId, setSelectedId] = useState(null)
  const [fitTrigger] = useState(1)
  const [focusPoint, setFocusPoint] = useState(null)
  const [sheetExpanded, setSheetExpanded] = useState(false)
  const featureViewStart = useRef(null)
  const prevSelectedId = useRef(null)
  const [spotTab, setSpotTab] = useState("info")
  const voicePlayback = useVoicePlayback()
  const [toastMsg, setToastMsg] = useState("")

  const isEventMap = checkIsEventMap(map)
  const config = useMemo(() => map.config || {}, [map.config])

  const showViewerToast = useCallback((msg) => {
    setToastMsg(msg)
    setTimeout(() => setToastMsg(""), 2500)
  }, [])

  // 이벤트 데이터와 액션
  const {
    checkedInIds, handleCheckin, pinDistances, userPos,
    isCompleted, nextSpot,
    announcements, announcementDismissed, setAnnouncementDismissed,
    surveyOpen, setSurveyOpen, surveyRating, setSurveyRating,
    surveyComment, setSurveyComment, surveySubmitted, handleSurveySubmit,
  } = useEventMapData({ map, features, config, isEventMap, showViewerToast })

  // 댓글
  const {
    comments, commentText, setCommentText, commentLoading, myKey,
    editingId, setEditingId, editText, setEditText,
    reportTarget, setReportTarget, commentsEnabled, canComment,
    handleAddComment, handleEditComment, handleDeleteComment, handleReport,
  } = useEventComments({ mapId: map.id, selectedId, isEventMap, config, checkedInIds, showViewerToast })

  // 공유
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
      prompt("복사하세요", shareUrl)
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
            description: map.description || `${map.title || "LOCA"} 지도를 열어보세요`,
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
    // 카카오 SDK가 없으면 클립보드 복사로 대체
    try {
      await navigator.clipboard.writeText(shareUrl)
      showViewerToast("링크가 복사되었어요. 카카오톡에 붙여넣어 주세요.")
    } catch {
      prompt("카카오톡에 붙여넣으세요:", shareUrl)
    }
    setShareOpen(false)
  }, [shareUrl, map, showViewerToast])

  // 알림
  const [notiPanelOpen, setNotiPanelOpen] = useState(false)
  const {
    notifications: notiList,
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

  const currentUserPos = userPos || null

  // Extract tag pills for normal map
  const _mapTags = useMemo(() => {
    const tagSet = new Set()
    features.forEach((f) => {
      const catId = f.category || emojiToCategory(f.emoji)
      const ic = getPinIcon(catId)
      if (ic.label) tagSet.add(ic.label)
      f.tags?.forEach((t) => tagSet.add(t))
    })
    return Array.from(tagSet).slice(0, 6)
  }, [features])

  // 장소 선택 이벤트 로깅과 장소별 체류 시간 추적
  const handleFeatureSelect = useCallback((featureId) => {
    triggerSelectionFeedback()
    // 이전 feature 체류 시간 기록
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

  const handleSave = useCallback(async () => {
    if (savingToApp || !onSaveToApp) return
    if (hasSupabaseEnv && map.id) {
      logEvent("map_save", { map_id: map.id })
      try {
        await saveMapRecord(map.id, { source: "viewer_save" })
      } catch {
        // Do not block save UX when save conversion sync fails.
      }
    }
    onSaveToApp()
  }, [map.id, onSaveToApp, savingToApp])

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
    if (alreadyChecked) label = "\uCCB4\uD06C \uC644\uB8CC"
    else if (tooFar) label = `${formatDistance(dist)} \uAC70\uB9AC`
    else label = "\uCCB4\uD06C\uC778"

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

  // ??? Bottom Sheet (shared by both map types) ???
  const _renderBottomSheet = (featureList) => (
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
                  {checked ? <span className="lw-sheet__row-badge">체크됨</span> : null}
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )

  // ??? Event: next spot / completed row inside bottom sheet ???
  const renderEventSheetExtras = () => {
    if (!isEventMap) return null
    if (isCompleted) {
      return (
        <div className="lw-sheet__completed">
          <span>모든 장소를 방문했어요</span>
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

  // 비이벤트 지도(일반 공유)
  // config.ci_* 색상은 추후 사용 예정 — 현 v2 리디자인 단계에서는 미사용.
  const orgName = config.org_name || map.title
  const orgLogo = config.org_logo
  const eventPeriod = config.event_period || ""
  // unified shared viewer shell
    return (
      <div className="lw-viewer lw-viewer--v2">
        {/* Hero card header */}
        <div className="lw-hero">
          <div className="lw-hero__blob" />
          <div className="lw-hero__row1">
          {onBack ? (
            <button type="button" onClick={onBack} className="lw-back-btn" aria-label="뒤로">
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
            {onSaveToApp ? <SaveButton onClick={handleSave} isEvent loading={savingToApp} /> : null}
            <button
              className="lw-noti-btn"
              type="button"
              aria-label="공유"
              onClick={() => setShareOpen((v) => !v)}
            >
              <Share2 size={14} />
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
          {/* Announcement banner */}
          {announcements.length > 0 && !announcementDismissed ? (
            <div className="lw-announce">
              <span className="lw-announce__icon">📢</span>
              <span className="lw-announce__text">
                <strong>공지</strong> {announcements[0].title}
                {announcements[0].body ? ` · ${announcements[0].body}` : ""}
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
                features={features}
                selectedFeatureId={selectedId}
                draftPoints={[]}
                draftMode="browse"
                focusPoint={focusPoint}
                fitTrigger={fitTrigger}
                onFeatureTap={handleFeatureSelect}
                showLabels
                myLocation={currentUserPos}
                checkedInIds={config.checkin_enabled ? checkedInIds : null}
                isEventMap={isEventMap}
              />
            </MapErrorBoundary>

            {/* Pin tap card — FeaturePopupCard (subscriber view) */}
            {selectedFeature ? (
              <div className="lw-spot-detail-wrap">
                <FeaturePopupCard
                  feature={selectedFeature}
                  mapMode="personal"
                  isAuthor={false}
                  currentUserId={myKey}
                  routeLengthKm={
                    selectedFeature.type === "route"
                      ? computeRouteLengthKm(selectedFeature.points)
                      : null
                  }
                  onClose={() => { voicePlayback.stop(); setSelectedId(null) }}
                  headerExtra={renderCheckinBtn(selectedFeature)}
                  currentPlayingVoiceId={voicePlayback.playingId}
                  onVoiceClick={(voice, index) => {
                    const key = makeVoiceScopeKey(selectedFeature.id, voice, index)
                    voicePlayback.toggle(voice, key)
                  }}
                />

                {/* 이벤트 지도: 댓글 영역을 카드 아래에 따라 붙인다 */}
                {isEventMap && commentsEnabled ? (
                  <div className="lw-spot-detail-wrap__comments">
                    <button
                      type="button"
                      className={`lw-spot-comments-toggle${spotTab === "comments" ? " is-open" : ""}`}
                      onClick={() => setSpotTab(spotTab === "comments" ? "info" : "comments")}
                      aria-expanded={spotTab === "comments"}
                    >
                      <span>댓글{comments.length > 0 ? ` ${comments.length}` : ""}</span>
                      <span className="lw-spot-comments-toggle__chev" aria-hidden>
                        {spotTab === "comments" ? "▾" : "▸"}
                      </span>
                    </button>
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
                      {features.map((f) => {
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
                    <div className="lw-sheet__header">장소 목록 ({features.length}곳)</div>
                    <div className="lw-sheet__list">
                      {features.map((f) => {
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
          <BrandLogo as="span" className="lw-ci-powered-logo" dotClassName="lw-ci-powered-logo__dot" />
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
