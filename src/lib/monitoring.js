import * as Sentry from "@sentry/react"

// 에러 추적(Sentry) 래퍼.
// VITE_SENTRY_DSN 이 설정된 경우에만 활성화되고, 없으면 완전 no-op 이라
// 로컬/데모 환경이나 DSN 미설정 상태에서도 앱 동작에 영향을 주지 않는다.

let enabled = false

const DSN = import.meta.env.VITE_SENTRY_DSN

// 로그/리포트에서 걸러낼 민감 정보 키 (개인정보 최소 수집 원칙)
function scrubEvent(event) {
  // IP·쿠키·요청 헤더 등 자동 수집분 제거
  if (event.request) {
    delete event.request.cookies
    delete event.request.headers
  }
  if (event.user) {
    // 사용자 식별은 익명 id 만 남기고 이메일/IP 는 제거
    delete event.user.email
    delete event.user.ip_address
    delete event.user.username
  }
  return event
}

// 앱 자체 문제와 무관한 잡음(외부 SDK cross-origin, 네트워크 취소 등) 필터
const IGNORED_MESSAGES = [
  "Script error.",
  "ResizeObserver loop",
  "Non-Error promise rejection captured",
  "Load failed",
  "NetworkError",
  "Failed to fetch",
  "AbortError",
]

export function initMonitoring() {
  if (enabled || !DSN) return
  try {
    Sentry.init({
      dsn: DSN,
      environment: import.meta.env.MODE,
      // 성능 추적은 소량만 샘플링 (비용/개인정보 최소화)
      tracesSampleRate: 0.1,
      // 세션 리플레이(화면 녹화)는 개인정보 보호를 위해 사용하지 않음
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: 0,
      sendDefaultPii: false,
      ignoreErrors: IGNORED_MESSAGES,
      beforeSend(event) {
        return scrubEvent(event)
      },
    })
    enabled = true
  } catch (err) {
    // 모니터링 초기화 실패가 앱을 깨뜨리지 않도록 방어
    console.error("[monitoring] Sentry init failed:", err)
  }
}

// 익명 사용자 식별자만 연결 (이메일/PII 없이 세션 묶음용)
export function setMonitoringUser(userId) {
  if (!enabled) return
  try {
    Sentry.setUser(userId ? { id: userId } : null)
  } catch {
    // no-op
  }
}

// 수동 에러 리포트 — DSN 없으면 콘솔에만 남긴다.
export function captureError(error, context) {
  if (!enabled) {
    console.error("[monitoring]", error, context || "")
    return
  }
  try {
    Sentry.captureException(error, context ? { extra: context } : undefined)
  } catch {
    console.error("[monitoring]", error)
  }
}
