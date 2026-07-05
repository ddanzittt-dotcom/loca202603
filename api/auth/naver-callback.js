import { createClient } from "@supabase/supabase-js"
import { safeRedirectTarget } from "../_lib/appRequest.js"

/**
 * 네이버 OAuth 콜백
 * 1) code → access_token 교환
 * 2) 네이버 프로필 조회
 * 3) Supabase 유저 생성/조회 → 세션 발급
 * 4) 앱으로 리다이렉트 (access_token + refresh_token 해시)
 */
export default async function handler(req, res) {
  const { code, state } = req.query
  if (!code) return res.status(400).json({ error: "missing code" })

  const clientId = process.env.NAVER_CLIENT_ID
  const clientSecret = process.env.NAVER_CLIENT_SECRET
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!clientId || !clientSecret || !supabaseUrl || !serviceRoleKey) {
    return res.status(500).json({ error: "server env not configured" })
  }

  // CSRF 검증: state 내 csrf 토큰과 쿠키의 csrf 토큰 비교 (fail-closed)
  const clearCsrfCookie = "naver_csrf=; HttpOnly; Secure; SameSite=Lax; Path=/api/auth; Max-Age=0"

  // state 파싱 실패 시에도 검증을 건너뛰지 않고 거절한다 (CSRF 우회 차단)
  let parsed
  try {
    parsed = JSON.parse(Buffer.from(String(state || ""), "base64url").toString())
  } catch {
    res.setHeader("Set-Cookie", clearCsrfCookie)
    return res.status(403).json({ error: "잘못된 요청입니다 — 다시 로그인해주세요." })
  }

  // 쿠키에서 csrf 토큰 추출
  const cookies = Object.fromEntries(
    (req.headers.cookie || "").split(";").map((c) => {
      const [k, ...v] = c.trim().split("=")
      return [k, v.join("=")]
    }),
  )
  const cookieCsrf = cookies.naver_csrf
  if (!parsed.csrf || !cookieCsrf || parsed.csrf !== cookieCsrf) {
    res.setHeader("Set-Cookie", clearCsrfCookie)
    return res.status(403).json({ error: "CSRF 검증 실패 — 다시 로그인해주세요." })
  }

  // csrf 쿠키 소비 (일회용)
  res.setHeader("Set-Cookie", clearCsrfCookie)

  // 오픈 리다이렉트 방지: 허용된 호스트로만 복귀 (세션 토큰 유출 차단)
  const redirectTo = safeRedirectTarget(parsed.redirect_to, "https://loca.im")

  const origin = new URL(req.url, `https://${req.headers.host}`).origin
  const callbackUrl = `${origin}/api/auth/naver-callback`

  try {
    // 1) code → access_token
    const tokenRes = await fetch("https://nid.naver.com/oauth2.0/token?" + new URLSearchParams({
      grant_type: "authorization_code",
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: callbackUrl,
    }))
    const tokenData = await tokenRes.json()
    if (tokenData.error) throw new Error(tokenData.error_description || tokenData.error)

    // 2) 네이버 프로필 조회
    const profileRes = await fetch("https://openapi.naver.com/v1/nid/me", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    })
    const profileData = await profileRes.json()
    if (profileData.resultcode !== "00") throw new Error("naver profile fetch failed")

    const naver = profileData.response
    const naverEmail = naver.email
    const naverName = naver.nickname || naver.name || "네이버 사용자"
    const naverId = naver.id

    if (!naverEmail) throw new Error("네이버 계정에 이메일 정보가 없습니다.")

    // 3) Supabase Admin으로 유저 생성/조회
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // 이메일로 기존 유저 확인
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers()
    let user = existingUsers?.users?.find((u) => u.email === naverEmail)

    if (!user) {
      // 신규 유저 생성
      const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email: naverEmail,
        email_confirm: true,
        user_metadata: {
          name: naverName,
          provider: "naver",
          naver_id: naverId,
          avatar_url: naver.profile_image || "",
        },
      })
      if (createErr) throw createErr
      user = created.user

      // 프로필 레코드 생성
      await supabaseAdmin.from("profiles").upsert({
        id: user.id,
        nickname: naverName,
        avatar_url: naver.profile_image || "",
        updated_at: new Date().toISOString(),
      }, { onConflict: "id" })
    } else {
      // 기존 유저 메타데이터 업데이트
      await supabaseAdmin.auth.admin.updateUserById(user.id, {
        user_metadata: {
          ...user.user_metadata,
          provider: user.user_metadata?.provider || "naver",
          naver_id: naverId,
        },
      })
    }

    // 4) 세션 생성 (magic link 방식)
    const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email: naverEmail,
    })
    if (linkErr) throw linkErr

    // Supabase verify 엔드포인트로 리다이렉트 → 세션 설정 → 앱으로 복귀
    const verifyUrl = new URL(`${supabaseUrl}/auth/v1/verify`)
    verifyUrl.searchParams.set("token", linkData.properties.hashed_token)
    verifyUrl.searchParams.set("type", "magiclink")
    verifyUrl.searchParams.set("redirect_to", redirectTo)

    res.redirect(302, verifyUrl.toString())
  } catch (err) {
    // 업스트림/내부 에러 상세는 서버 로그로만 — 클라이언트엔 일반 메시지
    console.error("Naver OAuth error:", err)
    const errorUrl = new URL(redirectTo)
    errorUrl.searchParams.set("error", "naver_auth_failed")
    errorUrl.searchParams.set("error_description", "네이버 로그인에 실패했어요. 다시 시도해주세요.")
    res.redirect(302, errorUrl.toString())
  }
}
