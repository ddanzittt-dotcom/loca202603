import { requireSupabase } from "./supabase"

const ALLOWED_ORIGINS = [
  "https://loca.ddanzittt.com",
  "http://localhost:5173",
  "http://localhost:4173",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:4173",
  "capacitor://localhost",
]

function getDefaultRedirectTo() {
  if (typeof window === "undefined") return undefined
  const origin = window.location.origin
  if (ALLOWED_ORIGINS.includes(origin)) return origin
  if (origin.startsWith("http://localhost:") || origin.startsWith("http://127.0.0.1:")) return origin
  return ALLOWED_ORIGINS[0]
}

export async function signInWithEmail(email, password) {
  const supabase = requireSupabase()
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  return data
}

export async function signUpWithEmail(email, password, nickname) {
  const supabase = requireSupabase()
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        name: nickname,
      },
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

export async function resetPasswordForEmail(email) {
  const supabase = requireSupabase()
  const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: getDefaultRedirectTo(),
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
