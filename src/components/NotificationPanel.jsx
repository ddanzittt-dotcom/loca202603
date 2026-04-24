import { useEffect, useRef, useState, useCallback } from "react"
import { NOTI_CATEGORY } from "../lib/notificationStore"

// ─── SVG 아이콘 렌더러 ───
function NotiIcon({ type, size = 16 }) {
  const cat = NOTI_CATEGORY[type]
  if (!cat) return null
  return (
    <span
      className="noti-icon"
      style={{ background: cat.bg, color: cat.color, width: size + 18, height: size + 18 }}
    >
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" dangerouslySetInnerHTML={{ __html: cat.icon }} />
    </span>
  )
}

// ─── 시간 포맷 ───
function timeAgo(dateStr) {
  if (!dateStr) return ""
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "방금 전"
  if (mins < 60) return `${mins}분 전`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}시간 전`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days}일 전`
  return `${Math.floor(days / 30)}달 전`
}

// ─── 날짜 섹션 라벨 ───
function getDateSection(dateStr) {
  const d = new Date(dateStr)
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterdayStart = new Date(todayStart - 86400000)
  const weekStart = new Date(todayStart - 6 * 86400000)

  if (d >= todayStart) return "오늘"
  if (d >= yesterdayStart) return "어제"
  if (d >= weekStart) return "이번 주"
  return "이전"
}

// ─── 메시지 강조 렌더 ───
function renderMessage(title, body) {
  // title을 볼드, body를 일반으로
  return (
    <>
      <span className="noti-msg__title">{title}</span>
      {body ? <span className="noti-msg__body">{body}</span> : null}
    </>
  )
}

// ─── 알림 아이템 ───
function NotiItem({ item, onTap, onMarkRead, onRemove }) {
  const [swipeX, setSwipeX] = useState(0)
  const touchStart = useRef(null)

  const handleTouchStart = (e) => { touchStart.current = e.touches[0].clientX }
  const handleTouchMove = (e) => {
    if (touchStart.current == null) return
    const dx = e.touches[0].clientX - touchStart.current
    if (dx < 0) setSwipeX(Math.max(dx, -80))
  }
  const handleTouchEnd = () => {
    if (swipeX < -40) setSwipeX(-72)
    else setSwipeX(0)
    touchStart.current = null
  }

  const handleClick = () => {
    if (swipeX < -10) return
    if (!item.read) onMarkRead(item.id)
    onTap?.(item)
  }

  return (
    <div className="noti-item-wrap" onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}>
      <button
        type="button"
        className={`noti-item${item.read ? "" : " noti-item--unread"}`}
        style={{ transform: `translateX(${swipeX}px)` }}
        onClick={handleClick}
      >
        <NotiIcon type={item.type} size={16} />
        <div className="noti-item__content">
          {renderMessage(item.title, item.body)}
          <span className="noti-item__time">{timeAgo(item.createdAt)}</span>
        </div>
        {!item.read && <span className="noti-item__dot" />}
      </button>
      {/* 스와이프 삭제 버튼 */}
      <button className="noti-item__delete" type="button" onClick={() => onRemove(item.id)}>삭제</button>
    </div>
  )
}

// ─── 알림 드롭다운 패널 ───
export function NotificationPanel({ notifications, onMarkRead, onMarkAllRead, onRemove, onClose, onTap }) {
  const panelRef = useRef(null)

  // 바깥 클릭 시 닫기
  useEffect(() => {
    const handle = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) onClose()
    }
    document.addEventListener("mousedown", handle)
    document.addEventListener("touchstart", handle)
    return () => {
      document.removeEventListener("mousedown", handle)
      document.removeEventListener("touchstart", handle)
    }
  }, [onClose])

  // 날짜별 그룹핑
  const sections = []
  let lastSection = null
  for (const n of notifications) {
    const section = getDateSection(n.createdAt)
    if (section !== lastSection) {
      sections.push({ type: "label", text: section })
      lastSection = section
    }
    sections.push({ type: "item", data: n })
  }

  return (
    <>
      <div className="noti-dropdown-overlay" onClick={onClose} />
      <div className="noti-dropdown" ref={panelRef}>
        <header className="noti-dropdown__header">
          <strong className="noti-dropdown__title">알림</strong>
          {notifications.some((n) => !n.read) && (
            <button className="noti-dropdown__read-all" type="button" onClick={onMarkAllRead}>모두 읽기</button>
          )}
        </header>

        <div className="noti-dropdown__body">
          {notifications.length === 0 ? (
            <div className="noti-dropdown__empty">
              <NotiIcon type="announcement" size={20} />
              <p className="noti-dropdown__empty-title">아직 알림이 없어요</p>
              <p className="noti-dropdown__empty-desc">새로운 소식이 생기면 여기에 표시돼요</p>
            </div>
          ) : (
            sections.map((s, i) =>
              s.type === "label" ? (
                <div key={`label-${i}`} className="noti-screen__section-label">{s.text}</div>
              ) : (
                <NotiItem
                  key={s.data.id}
                  item={s.data}
                  onTap={onTap}
                  onMarkRead={onMarkRead}
                  onRemove={onRemove}
                />
              ),
            )
          )}
        </div>
      </div>
    </>
  )
}

// ─── 인앱 배너 ───
export function NotificationBanner({ notification, onTap, onDismiss }) {
  const [exiting, setExiting] = useState(false)
  const touchStart = useRef(null)
  const timerRef = useRef(null)

  const dismiss = useCallback(() => {
    setExiting(true)
    setTimeout(() => onDismiss?.(), 200)
  }, [onDismiss])

  useEffect(() => {
    if (!notification) return
    const frame = requestAnimationFrame(() => setExiting(false))
    timerRef.current = setTimeout(dismiss, 3000)
    return () => { cancelAnimationFrame(frame); clearTimeout(timerRef.current) }
  }, [notification, dismiss])

  if (!notification) return null

  const currentItem = notification

  const cat = NOTI_CATEGORY[currentItem.type]

  const handleTouchStart = (e) => { touchStart.current = e.touches[0].clientY }
  const handleTouchEnd = (e) => {
    if (touchStart.current == null) return
    const dy = e.changedTouches[0].clientY - touchStart.current
    if (dy < -30) dismiss()
    touchStart.current = null
  }

  return (
    <div
      className={`noti-banner${exiting ? " noti-banner--exit" : ""}`}
      onClick={() => { clearTimeout(timerRef.current); onTap?.(currentItem); dismiss() }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      role="presentation"
    >
      <NotiIcon type={currentItem.type} size={16} />
      <div className="noti-banner__content">
        <span className="noti-banner__category" style={{ color: cat?.color }}>{cat?.label}</span>
        <span className="noti-banner__msg">{currentItem.title}</span>
      </div>
      <span className="noti-banner__time">{timeAgo(currentItem.createdAt)}</span>
    </div>
  )
}
