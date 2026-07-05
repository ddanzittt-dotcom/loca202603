// 서버리스 공용 — 앱 요청 판별 + 안전한 리다이렉트 타겟.
// 목적:
//  1) fetch 기반 프록시(walk, place-match)를 우리 앱에서 온 요청으로 제한해
//     익명 스크립트의 유료 API 남용(요금 폭탄)을 차단한다.
//  2) OAuth 복귀 URL을 허용 호스트로만 제한해 오픈 리다이렉트를 막는다.
// (`_` 로 시작하는 폴더/파일은 Vercel 라우트로 취급되지 않아 안전하게 공용 모듈로 쓸 수 있다.)

const ALLOWED_HOSTS = new Set([
  "loca.im",
  "www.loca.im",
  "localhost", // dev + Capacitor (https://localhost, capacitor://localhost)
  "127.0.0.1",
])
const ALLOWED_HOST_SUFFIXES = [".vercel.app"] // 프리뷰 배포

function hostAllowed(host) {
  if (!host) return false
  const h = String(host).toLowerCase().split(":")[0]
  if (ALLOWED_HOSTS.has(h)) return true
  return ALLOWED_HOST_SUFFIXES.some((suffix) => h.endsWith(suffix))
}

function hostOf(value) {
  try {
    return new URL(value).hostname
  } catch {
    return null
  }
}

// 우리 앱(브라우저/웹뷰)에서 온 요청으로 볼 수 있으면 true.
// 헤더가 전혀 없는 스크립트/curl·외부 사이트(cross-site)면 false → 프록시 남용 차단.
export function isAppRequest(req) {
  const h = req.headers || {}
  const origin = h.origin
  if (origin) return hostAllowed(hostOf(origin))
  const secSite = h["sec-fetch-site"]
  if (secSite === "same-origin" || secSite === "same-site") return true
  const referer = h.referer || h.referrer
  if (referer) return hostAllowed(hostOf(referer))
  return false
}

// 허용된 호스트로만 리다이렉트. 아니면 fallback 반환 (오픈 리다이렉트/토큰 유출 방지).
export function safeRedirectTarget(value, fallback) {
  if (!value) return fallback
  try {
    const url = new URL(value)
    if ((url.protocol === "https:" || url.protocol === "http:") && hostAllowed(url.hostname)) {
      return url.toString()
    }
  } catch {
    // 파싱 실패 → fallback
  }
  return fallback
}
