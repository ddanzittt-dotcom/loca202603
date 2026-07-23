import { requireSupabase } from "./supabase"

// 현재 시행 중인 약관/개인정보 처리방침 버전.
// privacy.html / terms.html 시행일과 반드시 일치시킨다.
// 방침 내용이 실질적으로 바뀌면 이 값을 올리고 재동의 흐름을 검토할 것.
export const CONSENT_VERSION = "2026-07-09"

const ALLOWED_ORIGINS = [
  "https://loca.im",
  "http://localhost:5173",
  "http://localhost:4173",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:4173",
  "capacitor://localhost",
  "com.ddanzittt.loca://",
]

function isNativeApp() {
  return typeof window !== "undefined" && (
    window.location.origin === "capacitor://localhost" ||
    window.location.origin === "http://localhost" ||
    window.Capacitor?.isNativePlatform?.()
  )
}

function getDefaultRedirectTo() {
  if (typeof window === "undefined") return undefined
  if (isNativeApp()) return "com.ddanzittt.loca://"
  const origin = window.location.origin
  if (ALLOWED_ORIGINS.includes(origin)) return origin
  if (origin.startsWith("http://localhost:") || origin.startsWith("http://127.0.0.1:")) return origin
  if (origin.endsWith(".vercel.app")) return origin
  return ALLOWED_ORIGINS[0]
}

export async function signInWithEmail(email, password, captchaToken) {
  const supabase = requireSupabase()
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
    ...(captchaToken ? { options: { captchaToken } } : {}),
  })
  if (error) throw error
  return data
}

export async function signUpWithEmail(email, password, nickname, captchaToken, consent = {}, slug = "") {
  const supabase = requireSupabase()
  const normalizedSlug = (slug || "").trim()
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        name: nickname,
        // 가입 폼에서 고른 공개 아이디 — handle_new_user() 트리거(077)가 profiles.slug 로 사용한다.
        ...(normalizedSlug ? { slug: normalizedSlug } : {}),
        // 동의 기록 — handle_new_user() 트리거(059)가 profiles 로 복사한다.
        terms_agreed: Boolean(consent.terms),
        privacy_agreed: Boolean(consent.privacy),
        marketing_consent: Boolean(consent.marketing),
        consent_version: CONSENT_VERSION,
      },
      ...(captchaToken ? { captchaToken } : {}),
    },
  })
  if (error) throw error
  return data
}

// 간편 로그인 복귀 주소 — ?login=<provider> 마커를 붙여 복귀를 앱이 알아챌 수 있게 한다.
// (마커가 없으면 페이지가 통째로 리로드되면서 로그인 직후 토스트·탭이동·신규 온보딩이 전부 누락된다.)
// Supabase Redirect URLs 허용목록에 쿼리를 포함하는 `https://loca.im/**` 형태가 등록돼 있어야 한다.
export function buildOAuthRedirectTo(provider) {
  const base = getDefaultRedirectTo()
  if (!base || !provider) return base
  // 네이티브(Capacitor)는 마커를 붙이지 않는다 — 커스텀 스킴도 URL 파싱은 되기 때문에
  // `com.ddanzittt.loca://?login=kakao` 가 만들어지고, 딥링크/허용목록 매칭이 깨질 수 있다.
  // 네이티브는 앱 복귀가 리로드가 아니라 세션 이벤트로 처리되므로 마커 자체가 필요 없다.
  if (isNativeApp()) return base
  try {
    const url = new URL(base)
    url.searchParams.set("login", provider)
    return url.toString()
  } catch {
    // URL 파싱이 안 되는 형태면 마커 없이 진행
    return base
  }
}

export async function signInWithOAuth(provider, options = {}) {
  const supabase = requireSupabase()
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: buildOAuthRedirectTo(provider),
      ...options,
    },
  })
  if (error) throw error
  return data
}

export function signInWithGoogle(options = {}) {
  // prompt=select_account — 이미 로그인된 구글 계정으로 자동 통과되지 않고 계정을 고르게 한다.
  return signInWithOAuth("google", {
    ...options,
    queryParams: { prompt: "select_account", ...(options.queryParams || {}) },
  })
}

export function signInWithKakao(options) {
  // scope 는 Supabase 기본값(account_email profile_nickname profile_image) 사용.
  return signInWithOAuth("kakao", options)
}

// 인증 에러 → 한국어 안내. 로그인 화면과 OAuth 복귀 처리(App.jsx)가 함께 쓴다.
export function friendlyAuthError(message = "") {
  const msg = String(message || "").toLowerCase()
  if (msg.includes("invalid login credentials") || msg.includes("invalid_credentials")) return "이메일 또는 비밀번호가 맞지 않아요."
  if (msg.includes("email not confirmed")) return "이메일 인증이 필요해요. 메일함을 확인해주세요."
  if (msg.includes("user already registered")) return "이미 가입된 이메일이에요. 로그인을 시도해보세요."
  if (msg.includes("password") && msg.includes("6")) return "비밀번호는 6자 이상이어야 해요."
  if (msg.includes("captcha") || msg.includes("verification")) return "보안 확인에 실패했어요. 잠시 후 다시 시도해주세요."
  if (msg.includes("rate limit") || msg.includes("too many")) return "요청이 너무 많아요. 잠시 후 다시 시도해주세요."
  if (msg.includes("network") || msg.includes("fetch")) return "네트워크 연결을 확인해주세요."
  if (msg.includes("provider is not enabled") || msg.includes("unsupported provider")) return "지금은 이 방법으로 로그인할 수 없어요. 이메일로 로그인해주세요."
  // provider 가 해시로 돌려주는 취소/거부 (#error=access_denied 등)
  if (msg.includes("access_denied") || msg.includes("cancel") || msg.includes("denied")) return "로그인을 취소했어요. 다시 시도하려면 로그인 버튼을 눌러주세요."
  if (msg.includes("server_error") || msg.includes("unexpected_failure")) return "로그인 서버에 문제가 있어요. 잠시 후 다시 시도해주세요."
  if (msg.includes("popup") || msg.includes("redirect")) return "로그인 창을 열지 못했어요. 팝업 차단을 해제하고 다시 시도해주세요."
  return message || "알 수 없는 오류가 발생했어요."
}

export async function signInWithMagicLink(email, options = {}) {
  const supabase = requireSupabase()
  const { data, error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: options.redirectTo || getDefaultRedirectTo(),
      shouldCreateUser: true,
      ...(options.captchaToken ? { captchaToken: options.captchaToken } : {}),
      data: {
        source_context: options.sourceContext || "public_saved_box_connect",
        ...(options.data || {}),
      },
    },
  })
  if (error) throw error
  return data
}

export async function resetPasswordForEmail(email, captchaToken) {
  const supabase = requireSupabase()
  const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: getDefaultRedirectTo(),
    ...(captchaToken ? { captchaToken } : {}),
  })
  if (error) throw error
  return data
}

export async function updatePassword(password) {
  const supabase = requireSupabase()
  const { data, error } = await supabase.auth.updateUser({ password })
  if (error) throw error
  return data
}

export async function signOut() {
  const supabase = requireSupabase()
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

// 회원탈퇴 — migration 053 delete_my_account() RPC 호출.
// 서버에서 auth 계정+데이터가 삭제되면 세션은 이미 무효라 signOut 실패는 무시한다.
export async function deleteMyAccount() {
  const supabase = requireSupabase()
  const { error } = await supabase.rpc("delete_my_account")
  if (error) throw error
  try {
    await supabase.auth.signOut()
  } catch {
    // 세션이 서버에서 먼저 무효화된 경우 — 로컬 토큰만 정리되면 충분
  }
}

export async function getCurrentUser() {
  const supabase = requireSupabase()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()
  if (error) throw error
  return user
}

export async function getCurrentSession() {
  const supabase = requireSupabase()
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession()
  if (error) throw error
  return session
}

export function onAuthStateChange(callback) {
  const supabase = requireSupabase()
  return supabase.auth.onAuthStateChange((event, session) => {
    callback(session?.user ?? null, event, session ?? null)
  })
}

// ─── 동의(consent) 상태 — 로그인 후 게이트용 ───
// 058 로 consent 컬럼은 공개 SELECT 불가라 RPC(073)로 본인 상태를 읽고 기록한다.

export async function getMyConsentState() {
  const supabase = requireSupabase()
  const { data, error } = await supabase.rpc("get_my_consent_state")
  if (error) throw error
  return data || {}
}

export async function recordMyConsent(marketing = false) {
  const supabase = requireSupabase()
  const { data, error } = await supabase.rpc("record_my_consent", {
    p_consent_version: CONSENT_VERSION,
    p_marketing: Boolean(marketing),
  })
  if (error) throw error
  return data
}
