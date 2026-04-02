import { useState, useEffect, useCallback, useRef, useMemo } from "react"
import { MapErrorBoundary } from "../components/MapErrorBoundary"
import { NaverMap } from "../components/NaverMap"
import { hasSupabaseEnv } from "../lib/supabase"
import { logEvent, setUtmSource } from "../lib/analytics"
import { getActiveAnnouncements, submitSurveyResponse, addFeatureMemo, getFeatureMemos } from "../lib/mapService"

const CHECKIN_RADIUS_M = 10

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

const featureTypeLabel = (type) => {
  if (type === "route") return "경로"
  if (type === "area") return "범위"
  return "장소"
}

export function SharedMapViewer({ map, features, onSaveToApp }) {
  const [selectedId, setSelectedId] = useState(null)
  const [fitTrigger] = useState(1)
  const [focusPoint, setFocusPoint] = useState(null)
  const [listOpen, setListOpen] = useState(false)

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
  const [announcements, setAnnouncements] = useState([])
  const [announcementDismissed, setAnnouncementDismissed] = useState(false)
  const [surveyOpen, setSurveyOpen] = useState(false)
  const [surveyRating, setSurveyRating] = useState(0)
  const [surveyComment, setSurveyComment] = useState("")
  const [surveySubmitted, setSurveySubmitted] = useState(false)

  // GPS 위치 추적 (이벤트 지도 전용)
  const [userPos, setUserPos] = useState(null)
  const [geoError, setGeoError] = useState(null)
  const watchIdRef = useRef(null)

  useEffect(() => {
    if (!isEventMap || !config.checkin_enabled) return
    if (!navigator.geolocation) { setGeoError("위치 서비스를 지원하지 않는 브라우저입니다."); return }

    const onSuccess = (pos) => {
      setUserPos({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy })
      setGeoError(null)
    }
    const onError = (err) => {
      if (err.code === 1) setGeoError("위치 권한을 허용해주세요.")
      else if (err.code === 2) setGeoError("위치를 확인할 수 없어요.")
      else setGeoError("위치 확인 중...")
    }
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

  // 각 핀까지의 거리 계산
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
  const routes = features.filter((f) => f.type === "route")
  const areas = features.filter((f) => f.type === "area")
  const selectedFeature = selectedId ? features.find((f) => f.id === selectedId) : null

  // 댓글(메모) 상태
  const [memos, setMemos] = useState([])
  const [memoText, setMemoText] = useState("")
  const [memoLoading, setMemoLoading] = useState(false)

  // 피처 선택 시 댓글 로드
  useEffect(() => {
    if (!selectedId || !hasSupabaseEnv) { setMemos([]); return }
    getFeatureMemos(selectedId).then(setMemos).catch(() => setMemos([]))
  }, [selectedId])

  const handleAddMemo = useCallback(async () => {
    if (!memoText.trim() || !selectedId || !hasSupabaseEnv) return
    setMemoLoading(true)
    try {
      const memo = await addFeatureMemo(selectedId, memoText.trim())
      setMemos((prev) => [...prev, memo])
      setMemoText("")
      showViewerToast("댓글을 남겼어요!")
    } catch {
      showViewerToast("댓글 등록에 실패했어요.")
    } finally {
      setMemoLoading(false)
    }
  }, [memoText, selectedId, showViewerToast])

  const totalCheckpoints = pins.length
  const checkedCount = checkedInIds.size
  const isCompleted = totalCheckpoints > 0 && checkedCount >= totalCheckpoints

  // 온라인 복귀 시 설문 큐 flush
  useEffect(() => {
    const flushSurveyQueue = async () => {
      if (!hasSupabaseEnv) return
      const key = "loca.survey_queue"
      try {
        const queue = JSON.parse(localStorage.getItem(key) || "[]")
        if (queue.length === 0) return
        const remaining = []
        for (const item of queue) {
          try {
            await submitSurveyResponse(item.mapId, item.data)
          } catch {
            remaining.push(item)
          }
        }
        if (remaining.length === 0) localStorage.removeItem(key)
        else localStorage.setItem(key, JSON.stringify(remaining))
      } catch { /* ignore */ }
    }
    window.addEventListener("online", flushSurveyQueue)
    // 마운트 시에도 한 번 시도
    if (navigator.onLine) flushSurveyQueue()
    return () => window.removeEventListener("online", flushSurveyQueue)
  }, [])

  // 지도 조회 이벤트 로깅 + 세션 utm_source 저장
  useEffect(() => {
    if (!hasSupabaseEnv || !map.id) return
    const utmSource = new URLSearchParams(window.location.search).get("utm_source") || "direct"
    setUtmSource(utmSource)
    logEvent("map_view", {
      map_id: map.id,
      referrer: utmSource,
      source: utmSource,
    })
  }, [map.id])

  // 이벤트 지도: 공지사항 로드 (오프라인 시 캐시 사용)
  useEffect(() => {
    if (!isEventMap || !hasSupabaseEnv || !config.announcements_enabled) return
    const cacheKey = `loca.announcements_${map.id}`
    getActiveAnnouncements(map.id)
      .then((data) => {
        setAnnouncements(data)
        try { sessionStorage.setItem(cacheKey, JSON.stringify(data)) } catch { /* ignore */ }
      })
      .catch(() => {
        // 오프라인 → 캐시에서 복원
        try {
          const cached = sessionStorage.getItem(cacheKey)
          if (cached) setAnnouncements(JSON.parse(cached))
        } catch { /* ignore */ }
      })
  }, [isEventMap, map.id, config.announcements_enabled])

  // 완주 시 자동 설문 표시
  const surveyTriggeredRef = useRef(false)
  useEffect(() => {
    if (isEventMap && isCompleted && config.survey_enabled && !surveySubmitted && !surveyTriggeredRef.current) {
      surveyTriggeredRef.current = true
      setSurveyOpen(true) // eslint-disable-line react-hooks/set-state-in-effect -- 완주 감지 후 1회성 팝업
    }
  }, [isEventMap, isCompleted, config.survey_enabled, surveySubmitted])

  // 피처 선택 시 클릭 이벤트 로깅
  const handleFeatureSelect = useCallback((featureId) => {
    setSelectedId(featureId)
    if (hasSupabaseEnv && map.id) {
      logEvent("feature_click", { map_id: map.id, feature_id: featureId })
    }
  }, [map.id])

  // 체크인 (오프라인에서도 동작)
  const handleCheckin = useCallback((featureId) => {
    if (checkedInIds.has(featureId)) return
    const next = new Set(checkedInIds)
    next.add(featureId)
    setCheckedInIds(next)
    sessionStorage.setItem(`loca_checkins_${map.id}`, JSON.stringify([...next]))
    if (hasSupabaseEnv && map.id) {
      const feat = features.find((f) => f.id === featureId)
      logEvent("checkin", { map_id: map.id, feature_id: featureId, meta: { feature_type: feat?.type || "pin" } })
    }
    // 완주 체크
    if (next.size >= totalCheckpoints && hasSupabaseEnv && map.id) {
      logEvent("completion", { map_id: map.id })
    }
    if (!navigator.onLine) {
      showViewerToast("오프라인 체크인 완료! 온라인 시 자동 동기화됩니다.")
    } else {
      showViewerToast("체크인 완료!")
    }
  }, [checkedInIds, features, map.id, totalCheckpoints, showViewerToast])

  // 설문 제출 (오프라인 시 로컬 저장 후 온라인 복귀 시 재시도)
  const handleSurveySubmit = async () => {
    if (surveyRating === 0) return
    const surveyData = { rating: surveyRating, comment: surveyComment }

    if (!navigator.onLine) {
      // 오프라인 → 로컬 큐에 저장
      try {
        const key = `loca.survey_queue`
        const queue = JSON.parse(localStorage.getItem(key) || "[]")
        queue.push({ mapId: map.id, data: surveyData, timestamp: new Date().toISOString() })
        localStorage.setItem(key, JSON.stringify(queue))
      } catch { /* localStorage full */ }
      setSurveySubmitted(true)
      setSurveyOpen(false)
      showViewerToast("오프라인 저장 완료! 온라인 시 자동 전송됩니다.")
      return
    }

    try {
      if (hasSupabaseEnv && map.id) {
        await submitSurveyResponse(map.id, surveyData)
      }
      setSurveySubmitted(true)
      setSurveyOpen(false)
      showViewerToast("설문을 제출했어요!")
    } catch {
      showViewerToast("설문 제출에 실패했어요. 다시 시도해주세요.")
      // 설문 팝업 유지 — 재시도 가능
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

  const handleFeatureListTap = (feature) => {
    handleFeatureSelect(feature.id)
    setFocusPoint(getFeatureCenter(feature))
    setListOpen(false)
  }

  return (
    <div className="shared-viewer">
      <header className="shared-viewer__header">
        <div className="shared-viewer__title-area">
          <div className="shared-viewer__title-row">
            <strong className="shared-viewer__title">{map.title}</strong>
            {isEventMap ? <span className="shared-viewer__event-badge">이벤트</span> : null}
          </div>
          {map.description ? <p className="shared-viewer__desc">{map.description}</p> : null}
        </div>
      </header>

      {/* 공지사항 배너 */}
      {isEventMap && announcements.length > 0 && !announcementDismissed ? (
        <div className="shared-viewer__announcement">
          <div className="shared-viewer__announcement-content">
            <strong>📢 {announcements[0].title}</strong>
            {announcements[0].body ? <p>{announcements[0].body}</p> : null}
          </div>
          <button
            className="shared-viewer__announcement-close"
            type="button"
            onClick={() => setAnnouncementDismissed(true)}
          >✕</button>
        </div>
      ) : null}

      {/* 체크인 진행률 */}
      {isEventMap && config.checkin_enabled ? (
        <div className="shared-viewer__progress">
          <div className="shared-viewer__progress-bar">
            <div
              className="shared-viewer__progress-fill"
              style={{ width: `${totalCheckpoints > 0 ? (checkedCount / totalCheckpoints) * 100 : 0}%` }}
            />
          </div>
          <span className="shared-viewer__progress-text">
            {isCompleted ? "🎉 완주!" : `${checkedCount} / ${totalCheckpoints} 체크인`}
          </span>
        </div>
      ) : null}

      <div className="shared-viewer__map">
        <MapErrorBoundary>
          <NaverMap
            features={features}
            selectedFeatureId={selectedId}
            draftPoints={[]}
            draftMode="browse"
            focusPoint={focusPoint}
            fitTrigger={fitTrigger}
            onFeatureTap={(id) => handleFeatureSelect(id)}
            showLabels
            checkedInIds={isEventMap && config.checkin_enabled ? checkedInIds : null}
          />
        </MapErrorBoundary>

        <div className="shared-viewer__map-count">
          <span>📍 {pins.length}</span>
          {routes.length > 0 ? <span>🔀 {routes.length}</span> : null}
          {areas.length > 0 ? <span>⬡ {areas.length}</span> : null}
        </div>
      </div>

      {selectedFeature ? (
        <div className="shared-viewer__selected">
          <div className="shared-viewer__selected-head">
            <div className="shared-viewer__selected-info">
              <strong>{selectedFeature.emoji} {selectedFeature.title}</strong>
              <span className="shared-viewer__selected-type">{featureTypeLabel(selectedFeature.type)}</span>
            </div>
            <div className="shared-viewer__selected-actions">
              {/* 이벤트 지도: 체크인 버튼 */}
              {isEventMap && config.checkin_enabled && selectedFeature.type === "pin" ? (() => {
                const alreadyChecked = checkedInIds.has(selectedFeature.id)
                const dist = pinDistances[selectedFeature.id]
                const isNearby = dist != null && dist <= CHECKIN_RADIUS_M
                const noGps = !userPos && !geoError
                const btnDisabled = alreadyChecked

                let label
                if (alreadyChecked) {
                  label = "✓ 완료"
                } else {
                  label = "체크인"
                }

                return (
                  <button
                    className={`shared-viewer__checkin-btn${alreadyChecked ? " is-checked" : isNearby ? "" : " is-far"}`}
                    type="button"
                    onClick={() => handleCheckin(selectedFeature.id)}
                    disabled={btnDisabled}
                  >
                    {label}
                  </button>
                )
              })() : null}
              <button className="shared-viewer__close-btn" type="button" onClick={() => setSelectedId(null)}>✕</button>
            </div>
          </div>
          {selectedFeature.note ? <p className="shared-viewer__selected-note">{selectedFeature.note}</p> : null}
          {selectedFeature.tags?.length ? (
            <div className="shared-viewer__selected-tags">
              {selectedFeature.tags.map((tag) => (
                <span key={tag} className="chip chip--small">#{tag}</span>
              ))}
            </div>
          ) : null}

          {/* 댓글 */}
          {hasSupabaseEnv ? (
            <div className="shared-viewer__memos">
              <div className="shared-viewer__memo-input-row">
                <input
                  className="shared-viewer__memo-input"
                  type="text"
                  placeholder="댓글을 남겨보세요..."
                  value={memoText}
                  onChange={(e) => setMemoText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleAddMemo() }}
                  disabled={memoLoading}
                />
                <button
                  className="shared-viewer__memo-submit"
                  type="button"
                  onClick={handleAddMemo}
                  disabled={!memoText.trim() || memoLoading}
                >
                  등록
                </button>
              </div>
              {memos.length > 0 ? (
                <div className="shared-viewer__memo-list">
                  {memos.map((m) => (
                    <div key={m.id} className="shared-viewer__memo-item">
                      <strong>{m.userName}</strong>
                      <span>{m.text}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      <button
        className="shared-viewer__list-toggle"
        type="button"
        onClick={() => setListOpen(!listOpen)}
      >
        목록 {listOpen ? "닫기" : "보기"} ({features.length})
      </button>

      {listOpen ? (
        <div className="shared-viewer__list">
          {features.length === 0 ? (
            <p className="shared-viewer__list-empty">등록된 장소가 없어요.</p>
          ) : null}
          {features.map((feature) => (
            <button
              key={feature.id}
              className={`shared-viewer__list-item${selectedId === feature.id ? " is-active" : ""}`}
              type="button"
              onClick={() => handleFeatureListTap(feature)}
            >
              <span className="shared-viewer__list-emoji">
                {feature.emoji}
              </span>
              <div className="shared-viewer__list-info">
                <strong>{feature.title}</strong>
                <span>
                  {featureTypeLabel(feature.type)}
                  {feature.tags?.length ? ` · ${feature.tags.slice(0, 2).join(", ")}` : ""}
                </span>
              </div>
            </button>
          ))}
        </div>
      ) : null}

      <div className="shared-viewer__cta">
        <button className="shared-viewer__cta-btn" type="button" onClick={onSaveToApp}>
          LOCA 앱으로 저장하기
        </button>
        <p className="shared-viewer__cta-hint">앱에서 지도를 편집하고 나만의 장소를 추가해보세요.</p>
      </div>

      {/* 설문 팝업 */}
      {surveyOpen ? (
        <div className="shared-viewer__survey-overlay">
          <div className="shared-viewer__survey">
            <h3>🎉 축하해요! 설문에 참여해주세요</h3>
            <div className="shared-viewer__survey-stars">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  className={`shared-viewer__star${surveyRating >= star ? " is-active" : ""}`}
                  onClick={() => setSurveyRating(star)}
                >
                  ★
                </button>
              ))}
            </div>
            <textarea
              className="shared-viewer__survey-comment"
              rows={2}
              value={surveyComment}
              onChange={(e) => setSurveyComment(e.target.value)}
              placeholder="한줄 후기를 남겨주세요 (선택)"
            />
            <div className="shared-viewer__survey-actions">
              <button
                className="button button--ghost"
                type="button"
                onClick={() => setSurveyOpen(false)}
              >
                건너뛰기
              </button>
              <button
                className="button button--primary"
                type="button"
                onClick={handleSurveySubmit}
                disabled={surveyRating === 0}
              >
                제출
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* 토스트 메시지 */}
      {toastMsg ? (
        <div className="shared-viewer__toast">{toastMsg}</div>
      ) : null}
    </div>
  )
}
