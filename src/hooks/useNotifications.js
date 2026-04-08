import { useState, useEffect, useCallback, useRef } from "react"
import * as store from "../lib/notificationStore"
import { NOTI_TYPES, isTypeEnabled } from "../lib/notificationStore"

const SEEN_ANNOUNCEMENTS_KEY = "loca.seen_announcements"
const REMINDER_SENT_KEY = "loca.reminder_sent"
const EVENT_ENDING_KEY = "loca.event_ending_sent"

function getAppSettings() {
  try {
    return JSON.parse(localStorage.getItem("loca.appSettings") || "{}")
  } catch { return {} }
}

function getSeenAnnouncements() {
  try { return JSON.parse(localStorage.getItem(SEEN_ANNOUNCEMENTS_KEY) || "{}") } catch { return {} }
}
function markAnnouncementSeen(mapId, announcementId) {
  const seen = getSeenAnnouncements()
  if (!seen[mapId]) seen[mapId] = []
  if (!seen[mapId].includes(announcementId)) seen[mapId].push(announcementId)
  localStorage.setItem(SEEN_ANNOUNCEMENTS_KEY, JSON.stringify(seen))
}

function getReminderSent() {
  try { return JSON.parse(sessionStorage.getItem(REMINDER_SENT_KEY) || "{}") } catch { return {} }
}
function markReminderSent(featureId) {
  const sent = getReminderSent()
  sent[featureId] = true
  sessionStorage.setItem(REMINDER_SENT_KEY, JSON.stringify(sent))
}

function getEventEndingSent() {
  try { return JSON.parse(localStorage.getItem(EVENT_ENDING_KEY) || "{}") } catch { return {} }
}
function markEventEndingSent(mapId, dateStr) {
  const sent = getEventEndingSent()
  sent[mapId] = dateStr
  localStorage.setItem(EVENT_ENDING_KEY, JSON.stringify(sent))
}

/**
 * 참여자 알림 훅.
 *
 * Phase 1: 이벤트 공지, 체크인 리마인더, 완주 축하, 행사 임박
 * (feature_comment, map_viewed, comment_pinned은 Phase 2 — DB 필요)
 */
export function useNotifications({
  mapId = null,
  mapTitle = "",
  isEventMap = false,
  config = {},
  announcements = [],
  features = [],
  checkedInIds = new Set(),
  isCompleted = false,
  pinDistances = {},
  userPos = null,
} = {}) {
  const [notifications, setNotifications] = useState(() => store.getAll())
  const [unreadCount, setUnreadCount] = useState(() => store.getUnreadCount())
  const prevCompletedRef = useRef(isCompleted)

  const refresh = useCallback(() => {
    setNotifications(store.getAll())
    setUnreadCount(store.getUnreadCount())
  }, [])

  const addIfEnabled = useCallback((type, data) => {
    const settings = getAppSettings()
    if (!isTypeEnabled(settings, type)) return null
    const result = store.add({ type, ...data })
    if (result) refresh()
    return result
  }, [refresh])

  // ── 트리거 1: 이벤트 공지 감지 ──
  useEffect(() => {
    if (!isEventMap || !mapId || announcements.length === 0) return

    const seen = getSeenAnnouncements()
    const seenIds = seen[mapId] || []

    for (const ann of announcements) {
      if (seenIds.includes(ann.id)) continue
      addIfEnabled(NOTI_TYPES.ANNOUNCEMENT, {
        mapId,
        title: "새 공지가 등록됐어요",
        body: ann.title || ann.body?.slice(0, 50) || "",
        meta: { announcementId: ann.id, dedup: `ann_${ann.id}` },
      })
      markAnnouncementSeen(mapId, ann.id)
    }
  }, [isEventMap, mapId, announcements, addIfEnabled])

  // ── 트리거 4: 체크인 리마인더 ──
  useEffect(() => {
    if (!isEventMap || !mapId || !config.checkin_enabled || !userPos) return

    const reminderSent = getReminderSent()
    const radius = config.checkin_radius || 50

    for (const f of features) {
      if (f.type !== "pin" || !f.lat || !f.lng) continue
      if (checkedInIds.has(f.id)) continue
      if (reminderSent[f.id]) continue

      const dist = pinDistances[f.id]
      if (dist == null || dist > radius * 2) continue // 반경의 2배 이내일 때 알림

      addIfEnabled(NOTI_TYPES.CHECKIN_REMINDER, {
        mapId,
        title: `${f.title || f.emoji || "장소"}이(가) 근처에 있어요!`,
        body: `${Math.round(dist)}m 거리`,
        meta: { featureId: f.id, dedup: `reminder_${mapId}_${f.id}` },
      })
      markReminderSent(f.id)
    }
  }, [isEventMap, mapId, config, userPos, features, checkedInIds, pinDistances, addIfEnabled])

  // ── 트리거 5: 완주 축하 ──
  useEffect(() => {
    if (!isEventMap || !mapId) return
    // 이전에 미완주였다가 완주로 전환된 경우에만
    if (isCompleted && !prevCompletedRef.current) {
      addIfEnabled(NOTI_TYPES.COMPLETION, {
        mapId,
        title: "모든 장소를 방문했어요!",
        body: mapTitle ? `${mapTitle} 완주를 축하합니다` : "완주를 축하합니다",
        meta: { dedup: `completion_${mapId}` },
      })
    }
    prevCompletedRef.current = isCompleted
  }, [isEventMap, mapId, mapTitle, isCompleted, addIfEnabled])

  // ── 트리거 7: 행사 임박 ──
  useEffect(() => {
    if (!isEventMap || !mapId) return
    const endDate = config.operationEndDate || config.endDate
    if (!endDate) return

    const end = new Date(endDate)
    if (Number.isNaN(end.getTime())) return

    const now = new Date()
    const diffDays = (end - now) / (1000 * 60 * 60 * 24)
    if (diffDays < 0 || diffDays > 1) return // D-1 이내만

    const today = now.toISOString().slice(0, 10)
    const sent = getEventEndingSent()
    if (sent[mapId] === today) return

    addIfEnabled(NOTI_TYPES.EVENT_ENDING, {
      mapId,
      title: "행사가 곧 종료됩니다",
      body: mapTitle ? `${mapTitle}이(가) 내일 종료됩니다` : "내일 종료되는 행사가 있어요",
      meta: { dedup: `ending_${mapId}_${today}` },
    })
    markEventEndingSent(mapId, today)
  }, [isEventMap, mapId, mapTitle, config, addIfEnabled])

  // ── 배너 (새 알림 도착 시 표시) ──
  const [bannerItem, setBannerItem] = useState(null)
  const prevCountRef = useRef(notifications.length)

  useEffect(() => {
    if (notifications.length > prevCountRef.current && notifications[0] && !notifications[0].read) {
      setBannerItem(notifications[0])
    }
    prevCountRef.current = notifications.length
  }, [notifications])

  const dismissBanner = useCallback(() => setBannerItem(null), [])

  // ── 액션 ──
  const markRead = useCallback((id) => {
    store.markRead(id)
    refresh()
  }, [refresh])

  const markAllRead = useCallback(() => {
    store.markAllRead()
    refresh()
  }, [refresh])

  const removeItem = useCallback((id) => {
    store.remove(id)
    refresh()
  }, [refresh])

  return {
    notifications,
    unreadCount,
    hasUnread: unreadCount > 0,
    bannerItem,
    dismissBanner,
    markRead,
    markAllRead,
    removeItem,
    refresh,
  }
}
