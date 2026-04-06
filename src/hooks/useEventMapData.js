import { useState, useEffect, useCallback, useRef, useMemo } from "react"
import { hasSupabaseEnv } from "../lib/supabase"
import { logEvent, setUtmSource, markMapViewed } from "../lib/analytics"
import { getActiveAnnouncements, submitSurveyResponse } from "../lib/mapService"
import { submitEventCheckin, getMyCheckins, awardSouvenir, submitSurveyReward } from "../lib/gamificationService"

const DEFAULT_CHECKIN_RADIUS_M = 50

export function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export function formatDistance(m) {
  if (m < 1000) return `${Math.round(m)}m`
  return `${(m / 1000).toFixed(1)}km`
}

export function useEventMapData({ map, features, config, isEventMap, showViewerToast }) {
  // ─── 체크인 상태 (Array 기반 — Set은 useMemo 파생) ───
  const [checkedInList, setCheckedInList] = useState(() => {
    if (!isEventMap) return []
    try {
      const stored = sessionStorage.getItem(`loca_checkins_${map.id}`)
      return stored ? JSON.parse(stored) : []
    } catch { return [] }
  })
  const checkedInIds = useMemo(() => new Set(checkedInList), [checkedInList])

  // 서버 체크인 동기화
  useEffect(() => {
    if (!isEventMap || !hasSupabaseEnv || !map.id) return
    getMyCheckins(map.id).then((rows) => {
      if (rows.length > 0) {
        const serverIds = rows.map((r) => r.feature_id)
        setCheckedInList((prev) => {
          const merged = [...new Set([...prev, ...serverIds])]
          if (merged.length === prev.length && merged.every((id, i) => id === prev[i])) return prev
          sessionStorage.setItem(`loca_checkins_${map.id}`, JSON.stringify(merged))
          return merged
        })
      }
    }).catch(() => {})
  }, [isEventMap, map.id])

  // ─── GPS 위치 추적 ───
  const [userPos, setUserPos] = useState(null)
  const watchIdRef = useRef(null)

  useEffect(() => {
    if (!isEventMap || !config.checkin_enabled) return
    if (!navigator.geolocation) return

    const onSuccess = (pos) => {
      setUserPos({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy })
    }
    const opts = { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }

    navigator.geolocation.getCurrentPosition(onSuccess, () => {}, opts)
    watchIdRef.current = navigator.geolocation.watchPosition(onSuccess, () => {}, opts)

    return () => {
      if (watchIdRef.current != null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
        watchIdRef.current = null
      }
    }
  }, [isEventMap, config.checkin_enabled])

  // ─── 핀 거리 계산 ───
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

  // ─── 진행률 ───
  const pins = features.filter((f) => f.type === "pin")
  const totalCheckpoints = pins.length
  const checkedCount = checkedInList.length
  const isCompleted = totalCheckpoints > 0 && checkedCount >= totalCheckpoints
  const progressPct = totalCheckpoints > 0 ? Math.round((checkedCount / totalCheckpoints) * 100) : 0

  // ─── 다음 목표 장소 ───
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

  // ─── 공지사항 ───
  const [announcements, setAnnouncements] = useState([])
  const [announcementDismissed, setAnnouncementDismissed] = useState(false)

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

  // ─── 설문 ───
  const [surveyOpen, setSurveyOpen] = useState(false)
  const [surveyRating, setSurveyRating] = useState(0)
  const [surveyComment, setSurveyComment] = useState("")
  const [surveySubmitted, setSurveySubmitted] = useState(false)
  const [surveyTriggered, setSurveyTriggered] = useState(false)

  // 완주 시 설문 자동 트리거 (렌더 중 조건부 setState)
  if (isEventMap && isCompleted && config.survey_enabled && !surveySubmitted && !surveyTriggered) {
    setSurveyTriggered(true)
    setSurveyOpen(true)
  }

  // ─── 오프라인 큐 flush ───
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

  // ─── 지도 조회 이벤트 로깅 ───
  // markMapViewed()로 동일 세션+map_id 조합의 중복 기록을 방지한다.
  useEffect(() => {
    if (!hasSupabaseEnv || !map.id) return
    const utmSource = new URLSearchParams(window.location.search).get("utm_source") || "direct"
    setUtmSource(utmSource)
    if (markMapViewed(map.id)) {
      logEvent("map_view", { map_id: map.id, referrer: utmSource, source: utmSource })
    }
  }, [map.id])

  // ─── 체크인 액션 ───
  const handleCheckin = useCallback(async (featureId) => {
    if (checkedInList.includes(featureId)) return
    const sessionId = sessionStorage.getItem("loca_session_id") || null
    const proofMeta = { lat: userPos?.lat || null, lng: userPos?.lng || null, accuracy: userPos?.accuracy || null }

    const next = [...checkedInList, featureId]
    setCheckedInList(next)
    sessionStorage.setItem(`loca_checkins_${map.id}`, JSON.stringify(next))

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
  }, [checkedInList, config, features, map.id, map.title, showViewerToast, userPos])

  // ─── 설문 제출 ───
  const handleSurveySubmit = useCallback(async () => {
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
        // survey_submit 이벤트를 view_logs에도 기록하여 참여 퍼널 집계에 활용
        logEvent("survey_submit", { map_id: map.id, meta: { rating: surveyRating } })
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
  }, [surveyRating, surveyComment, map.id, showViewerToast])

  return {
    // 체크인
    checkedInIds,
    handleCheckin,
    pinDistances,
    // 진행률
    totalCheckpoints,
    checkedCount,
    isCompleted,
    progressPct,
    nextSpot,
    // 공지
    announcements,
    announcementDismissed,
    setAnnouncementDismissed,
    // 설문
    surveyOpen,
    setSurveyOpen,
    surveyRating,
    setSurveyRating,
    surveyComment,
    setSurveyComment,
    surveySubmitted,
    handleSurveySubmit,
  }
}
