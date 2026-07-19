import * as Sentry from "@sentry/react"

// 에러 추적(Sentry) 래퍼.
// DSN 은 클라이언트에 공개되도록 설계된 값(비밀 아님)이라 기본값을 코드에 둔다.
// env(VITE_SENTRY_DSN)가 있으면 그걸 우선 사용. 활성화 조건은 initMonitoring 참조.

let enabled = false

// 프로덕션 기본 DSN (LOCA Sentry 프로젝트). env 로 덮어쓸 수 있음.
const FALLBACK_DSN = "https://bdf0ddaf5448c2e5e9bb048a8b6437e1@o4511700656848896.ingest.us.sentry.io/4511700666351616"
const DSN = import.meta.env.VITE_SENTRY_DSN || FALLBACK_DSN

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
  // iOS 인앱 브라우저(카카오톡·네이버 등 WKWebView)가 주입한 스크립트가
  // pagehide 시점에 해제된 네이티브 브리지를 호출하며 내는 잡음
  "webkit.messageHandlers",
]

export function initMonitoring() {
  if (enabled || !DSN) return
  // 명시적 env 없이 기본 DSN 만 있을 땐 프로덕션 빌드에서만 활성화한다.
  // (로컬 dev 에러가 Sentry 로 쏟아지는 것 방지 — env 를 직접 넣으면 dev 에서도 켤 수 있음)
  if (!import.meta.env.VITE_SENTRY_DSN && !import.meta.env.PROD) return
  try {
    Sentry.init({
      dsn: DSN,
      environment: import.meta.env.MODE,
      // 성능 추적은 사용 안 함 (Tracing 제품 미사용, 무료 한도 보호)
      tracesSampleRate: 0,
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
