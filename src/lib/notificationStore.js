// 참여자 알림 저장소 (localStorage 기반)

const STORE_KEY = "loca.notifications"
const MAX_ITEMS = 100

/** 알림 유형 */
export const NOTI_TYPES = {
  ANNOUNCEMENT: "announcement",
  FEATURE_COMMENT: "feature_comment",
  FEATURE_UPDATE_REQUEST: "feature_update_request",
  MAP_VIEWED: "map_viewed",
  CHECKIN_REMINDER: "checkin_reminder",
  COMPLETION: "completion",
  COMMENT_PINNED: "comment_pinned",
  EVENT_ENDING: "event_ending",
}

/** 카테고리별 스타일 (SVG 아이콘 + 색상) */
export const NOTI_CATEGORY = {
  [NOTI_TYPES.ANNOUNCEMENT]: {
    label: "이벤트 공지",
    bg: "#FFF4EB",
    color: "#FF6B35",
    // lightning bolt
    icon: '<path d="M13 2L4.5 12H11L10 22L18.5 12H12L13 2Z" fill="currentColor"/>',
  },
  [NOTI_TYPES.FEATURE_COMMENT]: {
    label: "내 맵핑 댓글",
    bg: "#E1F5EE",
    color: "#0F6E56",
    // chat bubble
    icon: '<path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" fill="currentColor"/>',
  },
  [NOTI_TYPES.FEATURE_UPDATE_REQUEST]: {
    label: "수정 요청",
    bg: "#FFF4EB",
    color: "#C2410C",
    // edit pencil
    icon: '<path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm14.71-9.04a1.003 1.003 0 000-1.42l-2.5-2.5a1.003 1.003 0 00-1.42 0l-1.83 1.83 3.75 3.75 1.97-1.66z" fill="currentColor"/>',
  },
  [NOTI_TYPES.MAP_VIEWED]: {
    label: "내 지도 공유",
    bg: "#E6F1FB",
    color: "#185FA5",
    // bookmark
    icon: '<path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" fill="currentColor"/>',
  },
  [NOTI_TYPES.CHECKIN_REMINDER]: {
    label: "체크인 리마인더",
    bg: "#FAEEDA",
    color: "#BA7517",
    // location pin
    icon: '<path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 110-5 2.5 2.5 0 010 5z" fill="currentColor"/>',
  },
  [NOTI_TYPES.COMPLETION]: {
    label: "완주 축하",
    bg: "#FFF4EB",
    color: "#FF6B35",
    // star
    icon: '<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill="currentColor"/>',
  },
  [NOTI_TYPES.COMMENT_PINNED]: {
    label: "내 댓글 고정",
    bg: "#EEEDFE",
    color: "#3C3489",
    // pinned star
    icon: '<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill="currentColor"/>',
  },
  [NOTI_TYPES.EVENT_ENDING]: {
    label: "행사 임박",
    bg: "#FCEBEB",
    color: "#E24B4A",
    // clock
    icon: '<circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/><polyline points="12 6 12 12 16 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  },
}

/** 알림 설정 키 매핑 (appSettings key -> type) */
export const NOTI_SETTING_KEYS = {
  noti_announcement: NOTI_TYPES.ANNOUNCEMENT,
  noti_feature_comment: NOTI_TYPES.FEATURE_COMMENT,
  noti_feature_update_request: NOTI_TYPES.FEATURE_UPDATE_REQUEST,
  noti_map_viewed: NOTI_TYPES.MAP_VIEWED,
  noti_checkin_reminder: NOTI_TYPES.CHECKIN_REMINDER,
  noti_completion: NOTI_TYPES.COMPLETION,
  noti_comment_pinned: NOTI_TYPES.COMMENT_PINNED,
  noti_event_ending: NOTI_TYPES.EVENT_ENDING,
}

// 내부 helper

function readStore() {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) || "[]")
  } catch {
    return []
  }
}

function writeStore(items) {
  localStorage.setItem(STORE_KEY, JSON.stringify(items))
}

function generateId() {
  return `noti_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

// 공개 API

/** 전체 알림 목록 (최신순) */
export function getAll() {
  return readStore().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
}

/** 읽지 않은 알림 수 */
export function getUnreadCount() {
  return readStore().filter((n) => !n.read).length
}

/** 읽지 않은 알림 여부 */
export function hasUnread() {
  return readStore().some((n) => !n.read)
}

/**
 * 알림 추가.
 * `meta.dedup` 이 있으면 같은 dedup 키는 중복 저장하지 않는다.
 * 반환: 추가된 알림 객체 또는 null(중복)
 */
export function add({ type, mapId, title, body, meta = {} }) {
  const items = readStore()

  if (meta.dedup && items.some((n) => n.meta?.dedup === meta.dedup)) {
    return null
  }

  const notification = {
    id: generateId(),
    type,
    mapId: mapId || null,
    title,
    body: body || "",
    read: false,
    createdAt: new Date().toISOString(),
    meta,
  }

  items.unshift(notification)

  if (items.length > MAX_ITEMS) {
    items.splice(MAX_ITEMS)
  }

  writeStore(items)
  return notification
}

/** 단일 알림 읽음 처리 */
export function markRead(id) {
  const items = readStore()
  const target = items.find((n) => n.id === id)
  if (target) {
    target.read = true
    writeStore(items)
  }
}

/** 전체 읽음 처리 */
export function markAllRead() {
  const items = readStore()
  items.forEach((n) => { n.read = true })
  writeStore(items)
}

/** 단일 알림 삭제 */
export function remove(id) {
  const items = readStore().filter((n) => n.id !== id)
  writeStore(items)
}

/** 특정 지도의 알림 전체 삭제 */
export function clearByMap(mapId) {
  const items = readStore().filter((n) => n.mapId !== mapId)
  writeStore(items)
}

/** 전체 초기화 */
export function clearAll() {
  writeStore([])
}

/** 알림 설정 확인 */
export function isTypeEnabled(appSettings, type) {
  if (appSettings.notifications === false) return false
  const settingKey = Object.entries(NOTI_SETTING_KEYS).find(([, t]) => t === type)?.[0]
  if (!settingKey) return true
  return appSettings[settingKey] !== false
}

