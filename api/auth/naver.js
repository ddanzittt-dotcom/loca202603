/**
 * 네이버 OAuth 시작 — 사용자를 네이버 로그인 페이지로 리다이렉트
 * GET /api/auth/naver?redirect_to=https://loca.ddanzittt.com
 */
export default function handler(req, res) {
  const clientId = process.env.NAVER_CLIENT_ID
  if (!clientId) {
    return res.status(500).json({ error: "NAVER_CLIENT_ID not configured" })
  }

  const redirectTo = req.query.redirect_to || process.env.SITE_URL || "https://loca.ddanzittt.com"
  const callbackUrl = `${new URL(req.url, `https://${req.headers.host}`).origin}/api/auth/naver-callback`

  // state에 앱 복귀 URL을 인코딩
  const state = Buffer.from(JSON.stringify({ redirect_to: redirectTo })).toString("base64url")

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: callbackUrl,
    state,
  })

  res.redirect(302, `https://nid.naver.com/oauth2.0/authorize?${params}`)
}
