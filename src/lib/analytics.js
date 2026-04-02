import { supabase, hasSupabaseEnv } from "./supabase"

const QUEUE_KEY = "loca.event_queue"
const MAX_RETRY = 5

/**
 * 브라우저 세션 ID를 반환한다.
 * sessionStorage에 저장되므로 탭을 닫으면 리셋된다.
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

// ─── 세션 레벨 utm_source ───
const UTM_KEY = "loca_utm_source"

/**
 * 세션의 utm_source를 저장한다.
 * SharedMapViewer 마운트 시 한 번 호출되며, 이후 모든 이벤트에 자동 포함된다.
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

function buildRow(eventType, payload, viewerId) {
  const sessionUtm = getUtmSource()
  const source = payload.source || payload.referrer || sessionUtm || "direct"
  const meta = {
    ...payload.meta,
    ...(payload.feature_id ? { feature_id: payload.feature_id } : {}),
    ...(payload.referrer ? { referrer: payload.referrer } : {}),
    utm_source: source,
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
      // 전송 성공 → 큐에서 제거 (remaining에 넣지 않음)
    } catch {
      item.retryCount = (item.retryCount || 0) + 1
      if (item.retryCount < MAX_RETRY) {
        remaining.push(item)
      }
      // MAX_RETRY 초과 시 버림
    }
  }

  writeQueue(remaining)

  // flush 완료 — 디버그 로그 제거됨
}

/**
 * 이벤트를 view_logs에 기록한다.
 * 오프라인이거나 전송 실패 시 로컬 큐에 저장한다.
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
