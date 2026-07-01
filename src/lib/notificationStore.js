// 참여자 알림 저장소 (localStorage 기반)

const STORE_KEY = "loca.notifications"
const MAX_ITEMS = 100

/** 알림 유형 */
export const NOTI_TYPES = {
  FEATURE_COMMENT: "feature_comment",
  FEATURE_UPDATE_REQUEST: "feature_update_request",
  MAP_VIEWED: "map_viewed",
  COMMENT_PINNED: "comment_pinned",
}

/** 카테고리별 스타일 (SVG 아이콘 + 색상) */
export const NOTI_CATEGORY = {
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
  [NOTI_TYPES.COMMENT_PINNED]: {
    label: "내 댓글 고정",
    bg: "#EEEDFE",
    color: "#3C3489",
    // pinned star
    icon: '<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill="currentColor"/>',
  },
}

/** 알림 설정 키 매핑 (appSettings key -> type) */
export const NOTI_SETTING_KEYS = {
  noti_feature_comment: NOTI_TYPES.FEATURE_COMMENT,
  noti_feature_update_request: NOTI_TYPES.FEATURE_UPDATE_REQUEST,
  noti_map_viewed: NOTI_TYPES.MAP_VIEWED,
  noti_comment_pinned: NOTI_TYPES.COMMENT_PINNED,
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

