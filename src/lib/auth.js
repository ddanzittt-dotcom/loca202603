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

export async function signUpWithEmail(email, password, nickname, captchaToken, consent = {}) {
  const supabase = requireSupabase()
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        name: nickname,
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

export async function signInWithOAuth(provider, options = {}) {
  const supabase = requireSupabase()
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: getDefaultRedirectTo(),
      ...options,
    },
  })
  if (error) throw error
  return data
}

export function signInWithGoogle(options) {
  return signInWithOAuth("google", options)
}

export function signInWithKakao(options) {
  return signInWithOAuth("kakao", options)
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
