// OAuth 복귀 감지 — 카카오/구글 로그인 후 브라우저가 앱으로 되돌아온 것을 판별한다.
//
// 왜 별도 모듈인가:
//   supabase 클라이언트는 detectSessionInUrl:true 라 초기화 직후 URL 해시(#access_token=... /
//   #error=...)를 지운다. 그 전에 값을 잡아야 하므로 이 모듈은 **import 시점에 동기적으로**
//   현재 URL 을 스냅샷한다. main.jsx 최상단(supabase 를 끌어오는 App/화면 import 보다 먼저)에서
//   import 할 것.
//
// 흐름:
//   auth.js buildOAuthRedirectTo() 가 redirectTo 에 ?login=<provider> 마커를 붙인다
//   → provider 에서 복귀 → App.jsx 가 getOAuthReturn() 으로 읽어 토스트/탭이동/신규 온보딩 처리
//   → clearOAuthReturnFromUrl() 로 주소창 정리.

const PROVIDERS = new Set(["kakao", "google"])

function readHashParams(hash) {
  const raw = (hash || "").replace(/^#/u, "")
  if (!raw) return null
  try {
    return new URLSearchParams(raw)
  } catch {
    return null
  }
}

// import 시점 스냅샷 — 이후 supabase 가 해시를 지워도 값이 남는다.
const snapshot = (() => {
  if (typeof window === "undefined") return null
  let provider = ""
  try {
    const query = new URLSearchParams(window.location.search || "")
    const raw = (query.get("login") || "").toLowerCase()
    if (PROVIDERS.has(raw)) provider = raw
  } catch {
    // 파싱 불가한 주소면 마커 없음으로 취급
  }

  const hashParams = readHashParams(window.location.hash)
  const error = hashParams?.get("error") || ""
  const errorDescription = hashParams?.get("error_description") || ""

  // 마커도 에러도 없으면 일반 진입 — 아무것도 만들지 않는다.
  if (!provider && !error) return null
  return {
    provider,
    error,
    errorDescription: errorDescription ? errorDescription.replace(/\+/gu, " ") : "",
  }
})()

/**
 * OAuth 복귀 정보. 일반 진입이면 null.
 * @returns {{ provider: string, error: string, errorDescription: string } | null}
 */
export function getOAuthReturn() {
  return snapshot
}

/** 주소창에서 ?login=... 마커를 제거한다(뒤로가기 이력 오염 없이). */
export function clearOAuthReturnFromUrl() {
  if (typeof window === "undefined") return
  try {
    const url = new URL(window.location.href)
    if (!url.searchParams.has("login")) return
    url.searchParams.delete("login")
    const search = url.searchParams.toString()
    window.history.replaceState(null, "", `${url.pathname}${search ? `?${search}` : ""}${url.hash}`)
  } catch {
    // replaceState 실패는 무시 — 기능에 영향 없음
  }
}
