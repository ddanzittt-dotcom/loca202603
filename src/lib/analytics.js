import { supabase, hasSupabaseEnv } from "./supabase"

const QUEUE_KEY = "loca.event_queue"
const MAX_RETRY = 5

// ─── 대시보드 지표에 필요한 이벤트 타입 정의 ───
// 대시보드 집계 기준과 일치해야 한다.
// unique_visits, total_views  ← map_view
// pin_click_rate              ← feature_click / map_view
// checkin_rate                ← checkin (DISTINCT session) / map_view (DISTINCT session)
// completion_rate             ← completion / checkin (DISTINCT session)
// qr_share                   ← source='qr' / total map_view
// avg_satisfaction            ← survey_responses.rating AVG (별도 테이블)
// survey_count               ← survey_responses COUNT (별도 테이블)
export const EVENT_TYPES = {
  MAP_VIEW: "map_view",
  FEATURE_CLICK: "feature_click",
  FEATURE_VIEW: "feature_view",
  FEATURE_VIEW_END: "feature_view_end",
  CHECKIN: "checkin",
  COMPLETION: "completion",
  QR_SCAN: "qr_scan",
  SESSION_END: "session_end",
  SHARE_CLICK: "share_click",
  MAP_SAVE: "map_save",
  ANNOUNCEMENT_VIEW: "announcement_view",
  SURVEY_SUBMIT: "survey_submit",
  FEATURE_CREATE: "feature_create",
  MAP_PUBLISH: "map_publish",
  MAP_UNPUBLISH: "map_unpublish",
  MAP_IMPORT: "map_import",
  FOLLOW_TOGGLE: "follow_toggle",
}

/**
 * 브라우저 세션 ID를 반환한다.
 * sessionStorage에 저장되므로 탭을 닫으면 리셋된다.
 * 단일 세션(탭) 내 이벤트 상관관계 추적용.
 */
export function getSessionId() {
  const key = "loca_session_id"
  let id = sessionStorage.getItem(key)
  if (!id) {
    id = crypto.randomUUID()
    sessionStorage.setItem(key, id)
  }
  return id
}

/**
 * 영구 방문자 ID를 반환한다.
 * localStorage에 저장되므로 브라우저를 닫아도 유지된다.
 * 재방문 추적 및 유니크 방문자 카운트에 사용.
 */
export function getVisitorId() {
  const key = "loca_visitor_id"
  let id = localStorage.getItem(key)
  if (!id) {
    id = typeof crypto?.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`
    localStorage.setItem(key, id)
  }
  return id
}

// ─── 세션 레벨 utm_source ───
const UTM_KEY = "loca_utm_source"

/**
 * 세션의 utm_source를 저장한다.
 * SharedMapViewer 마운트 시 한 번 호출되며, 이후 모든 이벤트에 자동 포함된다.
 * 유입 채널: "qr" | "kakao" | "link" | "direct"
 */
export function setUtmSource(source) {
  if (!source) return
  sessionStorage.setItem(UTM_KEY, source)
}

/**
 * 세션에 저장된 utm_source를 반환한다.
 * 저장된 값이 없으면 null.
 */
export function getUtmSource() {
  return sessionStorage.getItem(UTM_KEY) || null
}

// ─── map_view 중복 방지 ───
// 동일 세션 내 같은 map_id로 map_view가 여러 번 발화되지 않도록 한다.
// React 리렌더/StrictMode/useEffect 재실행으로 인한 중복을 방지.
const _viewedMaps = new Set()

/**
 * 해당 map_id에 대해 이미 map_view를 기록했는지 확인한다.
 * 첫 호출이면 true를 반환하고 내부에 기록한다.
 */
export function markMapViewed(mapId) {
  if (!mapId) return false
  const key = `${getSessionId()}:${mapId}`
  if (_viewedMaps.has(key)) return false
  _viewedMaps.add(key)
  return true
}

// ─── 이벤트 큐 (오프라인 대응) ───

function readQueue() {
  try {
    const raw = localStorage.getItem(QUEUE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function writeQueue(queue) {
  try {
    if (queue.length === 0) {
      localStorage.removeItem(QUEUE_KEY)
    } else {
      localStorage.setItem(QUEUE_KEY, JSON.stringify(queue))
    }
  } catch {
    // localStorage full — 조용히 무시
  }
}

function enqueue(eventType, payload) {
  const queue = readQueue()
  queue.push({
    eventType,
    payload,
    timestamp: new Date().toISOString(),
    retryCount: 0,
  })
  // 큐가 너무 커지지 않도록 최대 200개 유지
  if (queue.length > 200) queue.splice(0, queue.length - 200)
  writeQueue(queue)
}

async function sendEvent(row) {
  const { error } = await supabase.from("view_logs").insert(row)
  if (error) throw error
}

/**
 * view_logs 행을 구성한다.
 * 모든 이벤트는 아래 필드를 포함한다:
 * - map_id: 지도 ID (nullable — follow_toggle 등은 null)
 * - viewer_id: 로그인한 사용자 ID (nullable)
 * - session_id: 브라우저 세션 ID (항상 포함)
 * - event_type: 이벤트 유형 (EVENT_TYPES 참조)
 * - source: 유입 채널 (qr | kakao | link | direct)
 * - meta: JSONB 부가 데이터 (feature_id, feature_type, utm_source 등)
 */
function buildRow(eventType, payload, viewerId) {
  const sessionUtm = getUtmSource()
  const source = payload.source || payload.referrer || sessionUtm || "direct"
  const meta = {
    ...payload.meta,
    ...(payload.feature_id ? { feature_id: payload.feature_id } : {}),
    ...(payload.referrer ? { referrer: payload.referrer } : {}),
    utm_source: source,
    visitor_id: getVisitorId(),
  }
  return {
    map_id: payload.map_id || null,
    viewer_id: viewerId,
    session_id: getSessionId(),
    event_type: eventType,
    source,
    meta,
  }
}

let _cachedViewerId = undefined
async function getViewerId() {
  if (_cachedViewerId !== undefined) return _cachedViewerId
  try {
    const { data } = await supabase.auth.getUser()
    _cachedViewerId = data?.user?.id || null
  } catch {
    _cachedViewerId = null
  }
  return _cachedViewerId
}

// auth 변경 시 캐시 리셋
if (hasSupabaseEnv && supabase) {
  supabase.auth.onAuthStateChange(() => { _cachedViewerId = undefined })
}

/**
 * 큐에 쌓인 이벤트를 Supabase에 전송한다.
 * 온라인 복귀 시 자동 호출됨.
 */
export async function flushEventQueue() {
  if (!hasSupabaseEnv || !supabase || !navigator.onLine) return

  const queue = readQueue()
  if (queue.length === 0) return

  const viewerId = await getViewerId()
  const remaining = []

  for (const item of queue) {
    try {
      const row = buildRow(item.eventType, item.payload, viewerId)
      await sendEvent(row)
    } catch {
      item.retryCount = (item.retryCount || 0) + 1
      if (item.retryCount < MAX_RETRY) {
        remaining.push(item)
      }
    }
  }

  writeQueue(remaining)
}

/**
 * 이벤트를 view_logs에 기록한다.
 * 오프라인이거나 전송 실패 시 로컬 큐에 저장한다.
 *
 * @param {string} eventType - EVENT_TYPES 중 하나
 * @param {object} payload - { map_id, feature_id?, source?, referrer?, meta?: {} }
 */
export async function logEvent(eventType, payload = {}) {
  if (!hasSupabaseEnv || !supabase) return

  // 오프라인이면 바로 큐에 저장
  if (!navigator.onLine) {
    enqueue(eventType, payload)
    return
  }

  try {
    const viewerId = await getViewerId()
    const row = buildRow(eventType, payload, viewerId)
    await sendEvent(row)
  } catch {
    // 전송 실패 → 큐에 저장
    enqueue(eventType, payload)
  }
}

// ─── 온라인 복귀 시 자동 flush ───

if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    // 약간의 지연 후 flush (네트워크 안정화 대기)
    setTimeout(flushEventQueue, 2000)
  })
}
