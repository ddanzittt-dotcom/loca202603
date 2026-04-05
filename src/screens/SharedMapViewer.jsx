import { useState, useEffect, useCallback, useRef, useMemo } from "react"
import { ArrowLeft, X, ChevronRight } from "lucide-react"
import { MapErrorBoundary } from "../components/MapErrorBoundary"
import { NaverMap } from "../components/NaverMap"
import { hasSupabaseEnv } from "../lib/supabase"
import { logEvent, setUtmSource } from "../lib/analytics"
import { getActiveAnnouncements, submitSurveyResponse } from "../lib/mapService"
import { submitEventCheckin, getMyCheckins, awardSouvenir, submitSurveyReward } from "../lib/gamificationService"
import {
  listEventComments, createEventComment, updateEventComment,
  deleteEventComment, reportEventComment, getParticipantKey,
} from "../lib/eventCommentsService"

const DEFAULT_CHECKIN_RADIUS_M = 50

function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function formatDistance(m) {
  if (m < 1000) return `${Math.round(m)}m`
  return `${(m / 1000).toFixed(1)}km`
}

function timeAgo(dateStr) {
  if (!dateStr) return ""
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "방금"
  if (mins < 60) return `${mins}분 전`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}시간 전`
  const days = Math.floor(hrs / 24)
  return `${days}일 전`
}

export function SharedMapViewer({ map, features, onSaveToApp, onBack }) {
  const [selectedId, setSelectedId] = useState(null)
  const [fitTrigger] = useState(1)
  const [focusPoint, setFocusPoint] = useState(null)
  const [sheetExpanded, setSheetExpanded] = useState(false)
  const [sheetTab, setSheetTab] = useState("spots") // spots | announcements | info

  const isEventMap = map.category === "event"
  const config = map.config || {}
  const [toastMsg, setToastMsg] = useState("")

  const showViewerToast = useCallback((msg) => {
    setToastMsg(msg)
    setTimeout(() => setToastMsg(""), 2500)
  }, [])

  // --- 이벤트 지도 전용 상태 ---
  const [checkedInIds, setCheckedInIds] = useState(() => {
    if (!isEventMap) return new Set()
    try {
      const stored = sessionStorage.getItem(`loca_checkins_${map.id}`)
      return stored ? new Set(JSON.parse(stored)) : new Set()
    } catch { return new Set() }
  })

  useEffect(() => {
    if (!isEventMap || !hasSupabaseEnv || !map.id) return
    getMyCheckins(map.id).then((rows) => {
      if (rows.length > 0) {
        const serverIds = new Set(rows.map((r) => r.feature_id))
        setCheckedInIds((prev) => {
          const merged = new Set([...prev, ...serverIds])
          sessionStorage.setItem(`loca_checkins_${map.id}`, JSON.stringify([...merged]))
          return merged
        })
      }
    }).catch(() => {})
  }, [isEventMap, map.id])

  const [announcements, setAnnouncements] = useState([])
  const [announcementDismissed, setAnnouncementDismissed] = useState(false)
  const [surveyOpen, setSurveyOpen] = useState(false)
  const [surveyRating, setSurveyRating] = useState(0)
  const [surveyComment, setSurveyComment] = useState("")
  const [surveySubmitted, setSurveySubmitted] = useState(false)

  // GPS 위치 추적
  const [userPos, setUserPos] = useState(null)
  const watchIdRef = useRef(null)

  useEffect(() => {
    if (!isEventMap || !config.checkin_enabled) return
    if (!navigator.geolocation) return

    const onSuccess = (pos) => {
      setUserPos({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy })
    }
    const onError = () => {}
    const opts = { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }

    navigator.geolocation.getCurrentPosition(onSuccess, onError, opts)
    watchIdRef.current = navigator.geolocation.watchPosition(onSuccess, onError, opts)

    return () => {
      if (watchIdRef.current != null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
        watchIdRef.current = null
      }
    }
  }, [isEventMap, config.checkin_enabled])

  // 핀 거리 계산
  const pinDistances = useMemo(() => {
    if (!userPos) return {}
    const result = {}
    for (const f of features) {
      if (f.type === "pin" && f.lat && f.lng) {
        result[f.id] = haversineDistance(userPos.lat, userPos.lng, f.lat, f.lng)
      }
    }
    return result
  }, [userPos, features])

  const pins = features.filter((f) => f.type === "pin")
  const selectedFeature = selectedId ? features.find((f) => f.id === selectedId) : null

  // 다음 목표 장소 (체크인 안 한 것 중 가장 가까운)
  const nextSpot = useMemo(() => {
    if (!isEventMap || !config.checkin_enabled) return null
    const unchecked = pins.filter((p) => !checkedInIds.has(p.id))
    if (unchecked.length === 0) return null
    if (Object.keys(pinDistances).length > 0) {
      return unchecked.reduce((closest, p) => {
        const d = pinDistances[p.id] ?? Infinity
        const cd = pinDistances[closest.id] ?? Infinity
        return d < cd ? p : closest
      }, unchecked[0])
    }
    return unchecked[0]
  }, [isEventMap, config.checkin_enabled, pins, checkedInIds, pinDistances])

  // ─── 댓글 (event_comments) ───
  const [comments, setComments] = useState([])
  const [commentText, setCommentText] = useState("")
  const [commentLoading, setCommentLoading] = useState(false)
  const [myKey, setMyKey] = useState("")
  const [spotTab, setSpotTab] = useState("info") // info | comments
  const [editingId, setEditingId] = useState(null)
  const [editText, setEditText] = useState("")
  const [reportTarget, setReportTarget] = useState(null) // comment id
  const commentsCache = useRef({}) // featureId → comments[]

  // participant_key 로드
  useEffect(() => {
    if (!hasSupabaseEnv) return
    getParticipantKey().then(setMyKey).catch(() => { /* ignore */ })
  }, [])

  // feature 선택 시 댓글 로드
  useEffect(() => {
    if (!selectedId || !hasSupabaseEnv || !isEventMap) { setComments([]); return }
    // 캐시가 있으면 즉시 표시
    if (commentsCache.current[selectedId]) {
      setComments(commentsCache.current[selectedId])
    }
    listEventComments(map.id, selectedId)
      .then((res) => {
        setComments(res.comments)
        commentsCache.current[selectedId] = res.comments
      })
      .catch(() => setComments([]))
  }, [selectedId, isEventMap, map.id])

  const commentsEnabled = config.comments_enabled !== false
  const commentPerm = config.comment_permission || "all_logged_in"
  const canComment = commentsEnabled && (
    commentPerm !== "checked_in_only" || (selectedId && checkedInIds.has(selectedId))
  )

  const refreshComments = useCallback(async () => {
    if (!selectedId || !hasSupabaseEnv) return
    try {
      const res = await listEventComments(map.id, selectedId)
      setComments(res.comments)
      commentsCache.current[selectedId] = res.comments
    } catch { /* ignore */ }
  }, [selectedId, map.id])

  const handleAddComment = useCallback(async () => {
    if (!commentText.trim() || !selectedId || !hasSupabaseEnv) return
    setCommentLoading(true)
    try {
      await createEventComment(map.id, selectedId, commentText.trim())
      setCommentText("")
      await refreshComments()
      showViewerToast("댓글을 남겼어요!")
    } catch (err) {
      showViewerToast(err.message || "댓글 등록에 실패했어요.")
    } finally {
      setCommentLoading(false)
    }
  }, [commentText, selectedId, map.id, refreshComments, showViewerToast])

  const handleEditComment = useCallback(async () => {
    if (!editText.trim() || !editingId) return
    try {
      await updateEventComment(editingId, editText.trim())
      setEditingId(null)
      setEditText("")
      await refreshComments()
      showViewerToast("댓글을 수정했어요.")
    } catch {
      showViewerToast("수정에 실패했어요.")
    }
  }, [editText, editingId, refreshComments, showViewerToast])

  const handleDeleteComment = useCallback(async (id) => {
    if (!window.confirm("댓글을 삭제할까요?")) return
    try {
      await deleteEventComment(id)
      await refreshComments()
      showViewerToast("댓글을 삭제했어요.")
    } catch {
      showViewerToast("삭제에 실패했어요.")
    }
  }, [refreshComments, showViewerToast])

  const handleReport = useCallback(async (reason) => {
    if (!reportTarget) return
    try {
      await reportEventComment(reportTarget, reason)
      setReportTarget(null)
      showViewerToast("신고가 접수되었어요.")
    } catch {
      showViewerToast("신고에 실패했어요.")
    }
  }, [reportTarget, showViewerToast])

  const totalCheckpoints = pins.length
  const checkedCount = checkedInIds.size
  const isCompleted = totalCheckpoints > 0 && checkedCount >= totalCheckpoints
  const progressPct = totalCheckpoints > 0 ? Math.round((checkedCount / totalCheckpoints) * 100) : 0

  // 설문 큐 flush
  useEffect(() => {
    const flushSurveyQueue = async () => {
      if (!hasSupabaseEnv) return
      const key = "loca.survey_queue"
      try {
        const queue = JSON.parse(localStorage.getItem(key) || "[]")
        if (queue.length === 0) return
        const remaining = []
        for (const item of queue) {
          try { await submitSurveyResponse(item.mapId, item.data) } catch { remaining.push(item) }
        }
        if (remaining.length === 0) localStorage.removeItem(key)
        else localStorage.setItem(key, JSON.stringify(remaining))
      } catch { /* ignore */ }
    }
    window.addEventListener("online", flushSurveyQueue)
    if (navigator.onLine) flushSurveyQueue()
    return () => window.removeEventListener("online", flushSurveyQueue)
  }, [])

  // 지도 조회 이벤트 로깅
  useEffect(() => {
    if (!hasSupabaseEnv || !map.id) return
    const utmSource = new URLSearchParams(window.location.search).get("utm_source") || "direct"
    setUtmSource(utmSource)
    logEvent("map_view", { map_id: map.id, referrer: utmSource, source: utmSource })
  }, [map.id])

  // 공지사항 로드
  useEffect(() => {
    if (!isEventMap || !hasSupabaseEnv || !config.announcements_enabled) return
    const cacheKey = `loca.announcements_${map.id}`
    getActiveAnnouncements(map.id)
      .then((data) => {
        setAnnouncements(data)
        try { sessionStorage.setItem(cacheKey, JSON.stringify(data)) } catch { /* ignore */ }
      })
      .catch(() => {
        try {
          const cached = sessionStorage.getItem(cacheKey)
          if (cached) setAnnouncements(JSON.parse(cached))
        } catch { /* ignore */ }
      })
  }, [isEventMap, map.id, config.announcements_enabled])

  // 완주 시 설문
  const surveyTriggeredRef = useRef(false)
  useEffect(() => {
    if (isEventMap && isCompleted && config.survey_enabled && !surveySubmitted && !surveyTriggeredRef.current) {
      surveyTriggeredRef.current = true
      setSurveyOpen(true)
    }
  }, [isEventMap, isCompleted, config.survey_enabled, surveySubmitted])

  // 피처 선택 이벤트 로깅
  const handleFeatureSelect = useCallback((featureId) => {
    setSelectedId(featureId)
    setSheetExpanded(false)
    if (hasSupabaseEnv && map.id) {
      logEvent("feature_click", { map_id: map.id, feature_id: featureId })
    }
  }, [map.id])

  // 체크인 큐 flush
  useEffect(() => {
    const flushCheckinQueue = async () => {
      if (!hasSupabaseEnv) return
      const key = "loca.checkin_queue"
      try {
        const queue = JSON.parse(localStorage.getItem(key) || "[]")
        if (queue.length === 0) return
        const remaining = []
        for (const item of queue) {
          try {
            await submitEventCheckin({ mapId: item.mapId, featureId: item.featureId, sessionId: item.sessionId, proofMeta: item.proofMeta })
          } catch { remaining.push(item) }
        }
        if (remaining.length === 0) localStorage.removeItem(key)
        else localStorage.setItem(key, JSON.stringify(remaining))
      } catch { /* ignore */ }
    }
    window.addEventListener("online", flushCheckinQueue)
    if (navigator.onLine) flushCheckinQueue()
    return () => window.removeEventListener("online", flushCheckinQueue)
  }, [])

  // 체크인
  const handleCheckin = useCallback(async (featureId) => {
    if (checkedInIds.has(featureId)) return
    const sessionId = sessionStorage.getItem("loca_session_id") || null
    const proofMeta = { lat: userPos?.lat || null, lng: userPos?.lng || null, accuracy: userPos?.accuracy || null }

    const next = new Set(checkedInIds)
    next.add(featureId)
    setCheckedInIds(next)
    sessionStorage.setItem(`loca_checkins_${map.id}`, JSON.stringify([...next]))

    if (hasSupabaseEnv && map.id) {
      const feat = features.find((f) => f.id === featureId)
      logEvent("checkin", { map_id: map.id, feature_id: featureId, meta: { feature_type: feat?.type || "pin" } })
    }

    if (hasSupabaseEnv && map.id && navigator.onLine) {
      try {
        const result = await submitEventCheckin({ mapId: map.id, featureId, sessionId, proofMeta })
        if (result?.completed) {
          logEvent("completion", { map_id: map.id })
          if (config.souvenir_enabled !== false) {
            awardSouvenir(
              `event_completion:${map.id}`, map.id,
              { title: config.souvenir_title || `${map.title} 완주`, emoji: config.souvenir_emoji || "🏆", map_title: map.title },
            ).catch(() => {})
          }
          const totalXp = (result.xp_earned || 15) + (result.completion_xp || 50)
          showViewerToast(`🎉 완주! +${totalXp} XP`)
        } else if (result?.xp_earned) {
          showViewerToast(`체크인! +${result.xp_earned} XP`)
        } else if (result?.status === "already_checked_in") {
          showViewerToast("이미 체크인한 장소예요.")
        } else {
          showViewerToast("체크인 완료!")
        }
      } catch {
        showViewerToast("체크인 완료!")
      }
    } else if (hasSupabaseEnv && map.id && !navigator.onLine) {
      try {
        const key = "loca.checkin_queue"
        const queue = JSON.parse(localStorage.getItem(key) || "[]")
        queue.push({ mapId: map.id, featureId, sessionId, proofMeta, timestamp: new Date().toISOString() })
        localStorage.setItem(key, JSON.stringify(queue))
      } catch { /* ignore */ }
      showViewerToast("오프라인 체크인! 온라인 시 자동 동기화됩니다.")
    } else {
      showViewerToast("체크인 완료!")
    }
  }, [checkedInIds, config, features, map.id, map.title, showViewerToast, userPos])

  // 설문 제출
  const handleSurveySubmit = async () => {
    if (surveyRating === 0) return
    const surveyData = { rating: surveyRating, comment: surveyComment }

    if (!navigator.onLine) {
      try {
        const key = "loca.survey_queue"
        const queue = JSON.parse(localStorage.getItem(key) || "[]")
        queue.push({ mapId: map.id, data: surveyData, timestamp: new Date().toISOString() })
        localStorage.setItem(key, JSON.stringify(queue))
      } catch { /* ignore */ }
      setSurveySubmitted(true)
      setSurveyOpen(false)
      showViewerToast("오프라인 저장 완료! 온라인 시 자동 전송됩니다.")
      return
    }

    try {
      if (hasSupabaseEnv && map.id) {
        await submitSurveyResponse(map.id, surveyData)
        const reward = await submitSurveyReward({ mapId: map.id })
        if (reward?.xp_delta) showViewerToast(`설문 완료! +${reward.xp_delta} XP`)
        else showViewerToast("설문을 제출했어요!")
      } else {
        showViewerToast("설문을 제출했어요!")
      }
      setSurveySubmitted(true)
      setSurveyOpen(false)
    } catch {
      showViewerToast("설문 제출에 실패했어요. 다시 시도해주세요.")
    }
  }

  const getFeatureCenter = (feature) => {
    if (feature.type === "pin") return { lat: feature.lat, lng: feature.lng, zoom: 16 }
    if (!feature.points?.length) return null
    const total = feature.points.reduce(
      (acc, [lng, lat]) => ({ lat: acc.lat + lat, lng: acc.lng + lng }),
      { lat: 0, lng: 0 },
    )
    return { lat: total.lat / feature.points.length, lng: total.lng / feature.points.length, zoom: 15 }
  }

  const handleSpotTap = (feature) => {
    handleFeatureSelect(feature.id)
    setFocusPoint(getFeatureCenter(feature))
  }

  // 다음 장소로 포커스
  const goToNextSpot = useCallback(() => {
    if (!nextSpot) return
    handleFeatureSelect(nextSpot.id)
    setFocusPoint(getFeatureCenter(nextSpot))
  }, [nextSpot, handleFeatureSelect])

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
        className={`sv-checkin-btn${size === "large" ? " sv-checkin-btn--lg" : ""}${alreadyChecked ? " is-checked" : tooFar ? " is-far" : ""}`}
        type="button"
        onClick={() => handleCheckin(feature.id)}
        disabled={alreadyChecked || tooFar}
      >
        {label}
      </button>
    )
  }

  // ─── 비행사 지도 (일반 공유) ───
  if (!isEventMap) {
    return (
      <div className="shared-viewer">
        <header className="shared-viewer__header">
          {onBack ? <button className="icon-button" type="button" onClick={onBack} aria-label="뒤로 가기"><ArrowLeft size={20} /></button> : null}
          <div className="shared-viewer__title-area">
            <strong className="shared-viewer__title">{map.title}</strong>
            {map.description ? <p className="shared-viewer__desc">{map.description}</p> : null}
          </div>
        </header>
        <div className="shared-viewer__map">
          <MapErrorBoundary>
            <NaverMap features={features} selectedFeatureId={selectedId} draftPoints={[]} draftMode="browse" focusPoint={focusPoint} fitTrigger={fitTrigger} onFeatureTap={handleFeatureSelect} showLabels />
          </MapErrorBoundary>
        </div>
        {selectedFeature ? (
          <div className="shared-viewer__selected">
            <div className="shared-viewer__selected-head">
              <div className="shared-viewer__selected-info">
                <strong>{selectedFeature.emoji} {selectedFeature.title}</strong>
              </div>
              <button className="shared-viewer__close-btn" type="button" onClick={() => setSelectedId(null)}><X size={18} /></button>
            </div>
            {selectedFeature.note ? <p className="shared-viewer__selected-note">{selectedFeature.note}</p> : null}
          </div>
        ) : null}
        {onSaveToApp ? (
          <div className="shared-viewer__cta">
            <button className="shared-viewer__cta-btn" type="button" onClick={onSaveToApp}>LOCA 앱으로 저장하기</button>
          </div>
        ) : null}
        {toastMsg ? <div className="shared-viewer__toast">{toastMsg}</div> : null}
      </div>
    )
  }

  // ─── 행사 지도 participant shell ───
  const remainingCount = totalCheckpoints - checkedCount

  return (
    <div className="sv-event">
      {/* ─── 상단 행사 헤더 카드 ─── */}
      <header className="sv-event__header">
        <div className="sv-event__header-top">
          {onBack ? <button className="sv-event__back" type="button" onClick={onBack} aria-label="뒤로 가기"><ArrowLeft size={20} /></button> : null}
          <div className="sv-event__header-info">
            <div className="sv-event__title-row">
              <strong className="sv-event__title">{map.title}</strong>
              <span className="sv-event__badge">이벤트</span>
            </div>
            {map.description ? <p className="sv-event__desc">{map.description}</p> : null}
          </div>
        </div>

        {config.checkin_enabled ? (
          <div className="sv-event__progress">
            <div className="sv-event__progress-track">
              <div className="sv-event__progress-fill" style={{ width: `${progressPct}%` }} />
            </div>
            <div className="sv-event__progress-label">
              {isCompleted ? (
                <span className="sv-event__progress-done">🎉 완주!</span>
              ) : (
                <>
                  <span>{checkedCount}/{totalCheckpoints}</span>
                  <span className="sv-event__progress-hint">
                    {remainingCount === 1 ? "마지막 1곳!" : `${remainingCount}곳 남음`}
                  </span>
                </>
              )}
            </div>
          </div>
        ) : null}
      </header>

      {/* ─── 공지 배너 ─── */}
      {announcements.length > 0 && !announcementDismissed ? (
        <div className="sv-event__notice">
          <div className="sv-event__notice-body">
            <strong>📢 {announcements[0].title}</strong>
            {announcements[0].body ? <p>{announcements[0].body}</p> : null}
          </div>
          <button className="sv-event__notice-close" type="button" onClick={() => setAnnouncementDismissed(true)}><X size={18} /></button>
        </div>
      ) : null}

      {/* ─── 지도 ─── */}
      <div className="sv-event__map">
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
            checkedInIds={config.checkin_enabled ? checkedInIds : null}
          />
        </MapErrorBoundary>

        {/* 지도 위 미니 컨트롤 */}
        <div className="sv-event__map-fabs">
          <button className="sv-event__fab" type="button" onClick={() => setSheetExpanded(true)} aria-label="목록">
            📋
          </button>
        </div>
      </div>

      {/* ─── 선택된 장소 카드 (탭: 정보/댓글) ─── */}
      {selectedFeature ? (
        <div className="sv-event__spot-card">
          <div className="sv-event__spot-head">
            <div className="sv-event__spot-info">
              <span className="sv-event__spot-emoji">{selectedFeature.emoji}</span>
              <div>
                <strong>{selectedFeature.title}</strong>
                {pinDistances[selectedFeature.id] != null ? (
                  <span className="sv-event__spot-dist">{formatDistance(pinDistances[selectedFeature.id])}</span>
                ) : null}
              </div>
            </div>
            <div className="sv-event__spot-actions">
              {renderCheckinBtn(selectedFeature)}
              <button className="sv-event__spot-close" type="button" onClick={() => setSelectedId(null)}><X size={18} /></button>
            </div>
          </div>

          {/* 탭 전환 */}
          <div className="sv-event__spot-tabs">
            <button className={`sv-event__spot-tab${spotTab === "info" ? " is-active" : ""}`} type="button" onClick={() => setSpotTab("info")}>정보</button>
            <button className={`sv-event__spot-tab${spotTab === "comments" ? " is-active" : ""}`} type="button" onClick={() => setSpotTab("comments")}>
              댓글{comments.length > 0 ? ` (${comments.length})` : ""}
            </button>
          </div>

          {/* 정보 탭 */}
          {spotTab === "info" ? (
            <div className="sv-event__spot-body">
              {selectedFeature.note ? <p className="sv-event__spot-note">{selectedFeature.note}</p> : <p className="sv-event__spot-note sv-event__spot-note--empty">등록된 설명이 없어요.</p>}
              {selectedFeature.tags?.length ? (
                <div className="sv-event__spot-tags">
                  {selectedFeature.tags.map((tag) => <span key={tag} className="chip chip--small">#{tag}</span>)}
                </div>
              ) : null}
            </div>
          ) : null}

          {/* 댓글 탭 */}
          {spotTab === "comments" ? (
            <div className="sv-event__spot-body">
              {/* 댓글 입력 */}
              {commentsEnabled ? (
                canComment ? (
                  <div className="sv-event__comment-input">
                    <input
                      type="text"
                      placeholder="이 장소에 대한 댓글을 남겨보세요..."
                      value={commentText}
                      onChange={(e) => setCommentText(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") handleAddComment() }}
                      disabled={commentLoading}
                    />
                    <button type="button" onClick={handleAddComment} disabled={!commentText.trim() || commentLoading}>등록</button>
                  </div>
                ) : (
                  <div className="sv-event__comment-locked">
                    체크인 후 댓글을 남길 수 있어요.
                  </div>
                )
              ) : null}

              {/* 댓글 목록 */}
              {comments.length > 0 ? (
                <div className="sv-event__comment-list">
                  {comments.map((c) => {
                    const isMine = myKey && c.participantKey === myKey
                    const isEditing = editingId === c.id
                    return (
                      <div key={c.id} className={`sv-event__comment${c.isPinned ? " is-pinned" : ""}`}>
                        {c.isPinned ? <span className="sv-event__comment-pin">📌</span> : null}
                        <div className="sv-event__comment-main">
                          <div className="sv-event__comment-meta">
                            <strong>{c.authorName}</strong>
                            <time>{timeAgo(c.createdAt)}</time>
                          </div>
                          {isEditing ? (
                            <div className="sv-event__comment-edit">
                              <input
                                type="text"
                                value={editText}
                                onChange={(e) => setEditText(e.target.value)}
                                onKeyDown={(e) => { if (e.key === "Enter") handleEditComment() }}
                                autoFocus
                              />
                              <div className="sv-event__comment-edit-actions">
                                <button type="button" onClick={handleEditComment}>저장</button>
                                <button type="button" onClick={() => setEditingId(null)}>취소</button>
                              </div>
                            </div>
                          ) : (
                            <p>{c.body}</p>
                          )}
                        </div>
                        {!isEditing ? (
                          <div className="sv-event__comment-actions">
                            {isMine ? (
                              <>
                                {config.allow_comment_edit !== false ? (
                                  <button type="button" onClick={() => { setEditingId(c.id); setEditText(c.body) }} title="수정">수정</button>
                                ) : null}
                                {config.allow_comment_delete !== false ? (
                                  <button type="button" onClick={() => handleDeleteComment(c.id)} title="삭제">삭제</button>
                                ) : null}
                              </>
                            ) : (
                              <button type="button" onClick={() => setReportTarget(c.id)} title="신고">신고</button>
                            )}
                          </div>
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="sv-event__comment-empty">
                  {commentsEnabled ? "아직 댓글이 없어요. 첫 댓글을 남겨보세요!" : "댓글이 비활성화되어 있어요."}
                </div>
              )}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* 신고 다이얼로그 */}
      {reportTarget ? (
        <div className="sv-event__report-overlay">
          <div className="sv-event__report">
            <h4>댓글 신고</h4>
            <p>사유를 선택해주세요.</p>
            <div className="sv-event__report-options">
              {[
                { value: "spam", label: "스팸/광고" },
                { value: "offensive", label: "욕설/혐오" },
                { value: "inappropriate", label: "부적절한 내용" },
                { value: "misinformation", label: "허위 정보" },
                { value: "other", label: "기타" },
              ].map((opt) => (
                <button key={opt.value} type="button" onClick={() => handleReport(opt.value)}>{opt.label}</button>
              ))}
            </div>
            <button className="sv-event__report-cancel" type="button" onClick={() => setReportTarget(null)}>취소</button>
          </div>
        </div>
      ) : null}

      {/* ─── 하단 시트 (접힘/펼침) ─── */}
      {!selectedFeature ? (
        <div className={`sv-event__sheet${sheetExpanded ? " is-expanded" : ""}`}>
          {/* 접힘 상태: 다음 장소 미리보기 */}
          {!sheetExpanded ? (
            <div className="sv-event__sheet-peek">
              {isCompleted ? (
                <div className="sv-event__sheet-completed">
                  <span>🎉 모든 장소를 방문했어요!</span>
                  {config.survey_enabled && !surveySubmitted ? (
                    <button className="sv-event__sheet-survey-btn" type="button" onClick={() => setSurveyOpen(true)}>
                      설문 참여하기
                    </button>
                  ) : null}
                </div>
              ) : nextSpot ? (
                <button className="sv-event__next-spot" type="button" onClick={goToNextSpot}>
                  <span className="sv-event__next-emoji">{nextSpot.emoji}</span>
                  <div className="sv-event__next-info">
                    <span className="sv-event__next-label">다음 장소</span>
                    <strong>{nextSpot.title}</strong>
                  </div>
                  {pinDistances[nextSpot.id] != null ? (
                    <span className="sv-event__next-dist">{formatDistance(pinDistances[nextSpot.id])}</span>
                  ) : null}
                  <span className="sv-event__next-arrow"><ChevronRight size={16} /></span>
                </button>
              ) : (
                <div className="sv-event__sheet-empty">장소 목록을 확인하세요</div>
              )}
              <button className="sv-event__sheet-expand" type="button" onClick={() => setSheetExpanded(true)}>
                전체 목록 ({features.length})
              </button>
            </div>
          ) : (
            /* 펼침 상태 */
            <div className="sv-event__sheet-full">
              <div className="sv-event__sheet-handle" onClick={() => setSheetExpanded(false)}>
                <div className="sv-event__sheet-handle-bar" />
              </div>

              {/* 탭 */}
              <div className="sv-event__tabs">
                <button className={`sv-event__tab${sheetTab === "spots" ? " is-active" : ""}`} type="button" onClick={() => setSheetTab("spots")}>
                  장소 ({features.length})
                </button>
                {announcements.length > 0 ? (
                  <button className={`sv-event__tab${sheetTab === "announcements" ? " is-active" : ""}`} type="button" onClick={() => setSheetTab("announcements")}>
                    공지 ({announcements.length})
                  </button>
                ) : null}
                <button className={`sv-event__tab${sheetTab === "info" ? " is-active" : ""}`} type="button" onClick={() => setSheetTab("info")}>
                  정보
                </button>
              </div>

              <div className="sv-event__sheet-content">
                {sheetTab === "spots" ? (
                  <div className="sv-event__spot-list">
                    {features.map((f) => {
                      const checked = checkedInIds.has(f.id)
                      const dist = pinDistances[f.id]
                      const isNext = nextSpot?.id === f.id
                      return (
                        <button
                          key={f.id}
                          className={`sv-event__spot-row${checked ? " is-checked" : ""}${isNext ? " is-next" : ""}${selectedId === f.id ? " is-active" : ""}`}
                          type="button"
                          onClick={() => handleSpotTap(f)}
                        >
                          <span className="sv-event__spot-row-emoji">{f.emoji}</span>
                          <div className="sv-event__spot-row-info">
                            <strong>{f.title}</strong>
                            {dist != null ? <span>{formatDistance(dist)}</span> : null}
                          </div>
                          {checked ? (
                            <span className="sv-event__spot-row-check">✓</span>
                          ) : isNext ? (
                            <span className="sv-event__spot-row-next">다음</span>
                          ) : null}
                        </button>
                      )
                    })}
                  </div>
                ) : null}

                {sheetTab === "announcements" ? (
                  <div className="sv-event__announce-list">
                    {announcements.map((a) => (
                      <div key={a.id} className="sv-event__announce-item">
                        <strong>📢 {a.title}</strong>
                        {a.body ? <p>{a.body}</p> : null}
                      </div>
                    ))}
                  </div>
                ) : null}

                {sheetTab === "info" ? (
                  <div className="sv-event__info-tab">
                    {map.description ? <p className="sv-event__info-desc">{map.description}</p> : null}
                    <div className="sv-event__info-stats">
                      <div className="sv-event__info-stat">
                        <span className="sv-event__info-stat-val">{totalCheckpoints}</span>
                        <span>장소</span>
                      </div>
                      <div className="sv-event__info-stat">
                        <span className="sv-event__info-stat-val">{checkedCount}</span>
                        <span>체크인</span>
                      </div>
                      <div className="sv-event__info-stat">
                        <span className="sv-event__info-stat-val">{progressPct}%</span>
                        <span>달성률</span>
                      </div>
                    </div>
                    {config.souvenir_enabled !== false ? (
                      <div className="sv-event__info-reward">
                        <span>{config.souvenir_emoji || "🏆"}</span>
                        <span>완주 보상: {config.souvenir_title || "수비니어 획득"}</span>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          )}
        </div>
      ) : null}

      {/* 설문 팝업 */}
      {surveyOpen ? (
        <div className="sv-event__survey-overlay">
          <div className="sv-event__survey">
            <h3>🎉 축하해요! 설문에 참여해주세요</h3>
            <div className="sv-event__survey-stars">
              {[1, 2, 3, 4, 5].map((star) => (
                <button key={star} type="button" className={`sv-event__star${surveyRating >= star ? " is-active" : ""}`} onClick={() => setSurveyRating(star)}>★</button>
              ))}
            </div>
            <textarea className="sv-event__survey-comment" rows={2} value={surveyComment} onChange={(e) => setSurveyComment(e.target.value)} placeholder="한줄 후기를 남겨주세요 (선택)" />
            <div className="sv-event__survey-actions">
              <button className="button button--ghost" type="button" onClick={() => setSurveyOpen(false)}>건너뛰기</button>
              <button className="button button--primary" type="button" onClick={handleSurveySubmit} disabled={surveyRating === 0}>제출</button>
            </div>
          </div>
        </div>
      ) : null}

      {toastMsg ? <div className="shared-viewer__toast">{toastMsg}</div> : null}
    </div>
  )
}
