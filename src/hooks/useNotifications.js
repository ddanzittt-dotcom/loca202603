import { useState, useCallback, useRef } from "react"
import * as store from "../lib/notificationStore"

/**
 * 알림 훅 — localStorage 기반 알림 저장소(notificationStore)를 구독한다.
 * 알림 생성은 각 기능(협업/커뮤니티 등)에서 store.add() 로 직접 수행한 뒤 refresh() 를 호출하고,
 * 이 훅은 목록/미읽음/배너/읽음처리만 담당한다.
 */
export function useNotifications() {
  const [notifications, setNotifications] = useState(() => store.getAll())
  const [unreadCount, setUnreadCount] = useState(() => store.getUnreadCount())
  const [bannerItem, setBannerItem] = useState(null)
  const prevCountRef = useRef(notifications.length)

  const refresh = useCallback(() => {
    const next = store.getAll()
    // 새 알림이 도착하면(개수 증가 + 최신이 미읽음) 배너로 노출한다.
    if (next.length > prevCountRef.current && next[0] && !next[0].read) {
      setBannerItem(next[0])
    }
    prevCountRef.current = next.length
    setNotifications(next)
    setUnreadCount(store.getUnreadCount())
  }, [])

  const dismissBanner = useCallback(() => setBannerItem(null), [])

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
