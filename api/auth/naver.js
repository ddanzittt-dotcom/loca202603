import crypto from "crypto"

/**
 * 네이버 OAuth 시작 — 사용자를 네이버 로그인 페이지로 리다이렉트
 * GET /api/auth/naver?redirect_to=https://loca.ddanzittt.com
 *
 * CSRF 방어: 랜덤 csrf 토큰을 state에 포함 + httpOnly 쿠키에 저장.
 * callback에서 두 값이 일치하는지 검증한다.
 */
export default function handler(req, res) {
  const clientId = process.env.NAVER_CLIENT_ID
  if (!clientId) {
    return res.status(500).json({ error: "NAVER_CLIENT_ID not configured" })
  }

  const redirectTo = req.query.redirect_to || process.env.SITE_URL || "https://loca.ddanzittt.com"
  const callbackUrl = `${new URL(req.url, `https://${req.headers.host}`).origin}/api/auth/naver-callback`

  // CSRF 토큰 생성
  const csrf = crypto.randomBytes(24).toString("base64url")

  // state에 앱 복귀 URL + CSRF 토큰 인코딩
  const state = Buffer.from(JSON.stringify({ redirect_to: redirectTo, csrf })).toString("base64url")

  // CSRF 토큰을 httpOnly 쿠키에 저장 (5분 만료)
  res.setHeader("Set-Cookie", `naver_csrf=${csrf}; HttpOnly; Secure; SameSite=Lax; Path=/api/auth; Max-Age=300`)

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: callbackUrl,
    state,
  })

  res.redirect(302, `https://nid.naver.com/oauth2.0/authorize?${params}`)
}
