import { hasSupabaseEnv, requireSupabase } from "./supabase"

const ANONYMOUS_USER_ID_KEY = "loca.public.anonymous_user_id"
const GUEST_SESSION_TOKEN_KEY = "loca.public.guest_session_token"
const SAVE_CLAIM_TOKEN_KEY = "loca.public.save_claim_token"
const SAVED_BOX_CACHE_KEY = "loca.public.saved_box_cache"

function isAnonymousUser(user) {
  return Boolean(user?.is_anonymous || user?.app_metadata?.provider === "anonymous")
}

function isMissingAuthSessionError(error) {
  const message = `${error?.message || ""}`.toLowerCase()
  return error?.name === "AuthSessionMissingError"
    || message.includes("auth session missing")
    || message.includes("session missing")
}

function isAnonymousSignInDisabledError(error) {
  const message = `${error?.message || ""}`.toLowerCase()
  return message.includes("anonymous sign-ins are disabled")
    || message.includes("anonymous sign in is disabled")
    || message.includes("anonymous_provider_disabled")
}

function isGuestRpcMissingError(error) {
  const message = `${error?.message || ""} ${error?.details || ""}`.toLowerCase()
  return error?.code === "PGRST202"
    || message.includes("could not find the function")
    || message.includes("save_public_record_guest")
    || message.includes("save_public_recommend_map_guest")
    || message.includes("list_public_saved_items_guest")
}

function toFriendlySaveError(error) {
  if (isGuestRpcMissingError(error)) {
    return new Error("서버 저장 기능 업데이트가 아직 반영되지 않았어요. 잠시 후 다시 시도해주세요.")
  }
  if (isAnonymousSignInDisabledError(error)) {
    return new Error("비로그인 저장 설정을 확인하지 못했어요. 잠시 후 다시 시도해주세요.")
  }
  const message = `${error?.message || ""}`.toLowerCase()
  if (message.includes("permission") || message.includes("row-level security")) {
    return new Error("저장 권한을 확인하지 못했어요. 잠시 후 다시 시도해주세요.")
  }
  if (message.includes("network") || message.includes("fetch")) {
    return new Error("네트워크 연결을 확인한 뒤 다시 시도해주세요.")
  }
  return error
}

export function isPublicAnonymousUser(user) {
  return isAnonymousUser(user)
}

export function getStoredPublicGuestSessionId() {
  if (typeof window === "undefined") return null
  return window.localStorage.getItem(ANONYMOUS_USER_ID_KEY)
    || window.localStorage.getItem(GUEST_SESSION_TOKEN_KEY)
}

function getStoredGuestSessionToken({ create = false } = {}) {
  if (typeof window === "undefined") return ""
  let token = window.localStorage.getItem(GUEST_SESSION_TOKEN_KEY)
  if (token || !create) return token || ""

  const bytes = new Uint8Array(32)
  if (window.crypto?.getRandomValues) {
    window.crypto.getRandomValues(bytes)
    token = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")
  } else {
    token = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`
  }
  window.localStorage.setItem(GUEST_SESSION_TOKEN_KEY, token)
  return token
}

function getStoredClaimToken() {
  if (typeof window === "undefined") return ""
  let token = window.localStorage.getItem(SAVE_CLAIM_TOKEN_KEY)
  if (token) return token

  const bytes = new Uint8Array(32)
  window.crypto.getRandomValues(bytes)
  token = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")
  window.localStorage.setItem(SAVE_CLAIM_TOKEN_KEY, token)
  return token
}

async function sha256Hex(value) {
  const data = new TextEncoder().encode(value)
  const hash = await window.crypto.subtle.digest("SHA-256", data)
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("")
}

async function getClaimTokenHash(user) {
  if (!isAnonymousUser(user)) return null
  const token = getStoredClaimToken()
  return sha256Hex(token)
}

async function getCurrentUser() {
  if (!hasSupabaseEnv) return null
  const supabase = requireSupabase()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()
  if (error) {
    if (isMissingAuthSessionError(error)) return null
    throw error
  }
  return user
}

async function claimAnonymousSavesIfNeeded(user) {
  if (!user || isAnonymousUser(user) || typeof window === "undefined") return null
  const fromUserId = window.localStorage.getItem(ANONYMOUS_USER_ID_KEY)
  const claimToken = window.localStorage.getItem(SAVE_CLAIM_TOKEN_KEY)
  const guestSessionToken = window.localStorage.getItem(GUEST_SESSION_TOKEN_KEY)
  const claimResults = []
  const supabase = requireSupabase()

  if (fromUserId && claimToken && fromUserId === user.id) {
    const claimTokenHash = await sha256Hex(claimToken)
    const [recommendMapsResult, recordsResult] = await Promise.all([
      supabase
        .from("user_saved_recommend_maps")
        .update({ owner_kind: "auth_user", claim_token_hash: null })
        .eq("user_id", user.id)
        .eq("owner_kind", "anonymous")
        .eq("claim_token_hash", claimTokenHash),
      supabase
        .from("user_saved_records")
        .update({ owner_kind: "auth_user", claim_token_hash: null })
        .eq("user_id", user.id)
        .eq("owner_kind", "anonymous")
        .eq("claim_token_hash", claimTokenHash),
    ])
    if (recommendMapsResult.error) throw recommendMapsResult.error
    if (recordsResult.error) throw recordsResult.error
    window.localStorage.removeItem(ANONYMOUS_USER_ID_KEY)
    window.localStorage.removeItem(SAVE_CLAIM_TOKEN_KEY)
    claimResults.push({ success: true, recommend_maps: null, records: null, same_user: true })
  }

  if (fromUserId && claimToken && fromUserId !== user.id) {
    const { data, error } = await supabase.rpc("claim_public_saved_items", {
      p_from_user_id: fromUserId,
      p_claim_token: claimToken,
    })
    if (error) throw error

    window.localStorage.removeItem(ANONYMOUS_USER_ID_KEY)
    window.localStorage.removeItem(SAVE_CLAIM_TOKEN_KEY)
    claimResults.push(data)
  }

  if (guestSessionToken) {
    const { data, error } = await supabase.rpc("claim_public_guest_saved_items", {
      p_session_token: guestSessionToken,
    })
    if (error) throw error
    window.localStorage.removeItem(GUEST_SESSION_TOKEN_KEY)
    claimResults.push(data)
  }

  if (!claimResults.length) return null
  if (claimResults.length === 1) return claimResults[0]
  return { success: true, results: claimResults }
}

export async function claimPublicSavedItemsForCurrentUser() {
  const user = await getCurrentUser()
  if (!user) return null
  return claimAnonymousSavesIfNeeded(user)
}

export async function getPublicSavedBoxConnectionStatus() {
  const user = await getCurrentUser()
  if (!user) {
    return {
      connected: false,
      user: null,
      email: "",
      guestSessionId: getStoredPublicGuestSessionId(),
      claimResult: null,
    }
  }

  const claimResult = await claimAnonymousSavesIfNeeded(user)
  return {
    connected: !isAnonymousUser(user),
    user,
    email: user.email || "",
    guestSessionId: getStoredPublicGuestSessionId() || user.id,
    claimResult,
  }
}

async function ensurePublicSaveUser() {
  if (!hasSupabaseEnv) {
    throw new Error("Supabase 저장 환경이 없어 서버 저장을 할 수 없어요.")
  }

  let user = await getCurrentUser()
  if (!user) {
    return {
      mode: "guest",
      user: null,
      guestSessionToken: getStoredGuestSessionToken({ create: true }),
      ownerKind: "guest",
      claimTokenHash: null,
    }
  }

  if (!user) {
    throw new Error("저장함 세션을 만들지 못했어요. 잠시 후 다시 시도해주세요.")
  }

  if (isAnonymousUser(user) && typeof window !== "undefined") {
    window.localStorage.setItem(ANONYMOUS_USER_ID_KEY, user.id)
    getStoredClaimToken()
  } else {
    await claimAnonymousSavesIfNeeded(user)
  }

  return {
    mode: "auth",
    user,
    ownerKind: isAnonymousUser(user) ? "anonymous" : "auth_user",
    claimTokenHash: await getClaimTokenHash(user),
  }
}

function compactSnapshot(value) {
  return JSON.parse(JSON.stringify(value || {}))
}

function getKeywords(value) {
  return Array.from(new Set([
    ...(Array.isArray(value?.keywords) ? value.keywords : []),
    ...(Array.isArray(value?.tags) ? value.tags : []),
  ].map((item) => String(item).trim()).filter(Boolean))).slice(0, 12)
}

function getRecordKind(record) {
  return record?.recordType === "route" || record?.record_type === "route" || record?.type === "route"
    ? "route"
    : "place"
}

function getRecordLocation(record) {
  const location = record?.representativeLocation || record?.representative_location
  if (location?.lat && location?.lng) return location
  if (record?.lat && record?.lng) return { lat: record.lat, lng: record.lng }
  return { lat: null, lng: null }
}

function getRecordKey(record) {
  return record?.record_key
    || record?.recordKey
    || `${record?.sourceContext || record?.source_context || "community"}:${record?.mapId || record?.map_id || "map"}:${record?.id}`
}

function getRecordId(record) {
  return String(record?.record_id || record?.recordId || record?.id || getRecordKey(record))
}

export async function savePublicRecommendMap(map) {
  const { mode, user, ownerKind, claimTokenHash, guestSessionToken } = await ensurePublicSaveUser()
  const supabase = requireSupabase()
  if (mode === "guest") {
    const { data, error } = await supabase.rpc("save_public_recommend_map_guest", {
      p_session_token: guestSessionToken,
      p_recommend_map_id: map.id,
      p_recommend_map_slug: map.slug,
      p_title: map.title,
      p_region: map.region || null,
      p_recommender: map.recommender || null,
      p_reel_id: map.reel_id || null,
      p_source_context: map.source_context || "public_recommend_map",
      p_snapshot: compactSnapshot(map),
    })
    if (error) throw toFriendlySaveError(error)
    return data
  }

  const { data, error } = await supabase
    .from("user_saved_recommend_maps")
    .upsert({
      user_id: user.id,
      owner_kind: ownerKind,
      claim_token_hash: claimTokenHash,
      recommend_map_id: map.id,
      recommend_map_slug: map.slug,
      title: map.title,
      region: map.region || null,
      recommender: map.recommender || null,
      reel_id: map.reel_id || null,
      source_context: map.source_context || "public_recommend_map",
      snapshot: compactSnapshot(map),
      deleted_at: null,
    }, { onConflict: "user_id,recommend_map_id" })
    .select("*")
    .single()
  if (error) throw toFriendlySaveError(error)
  return data
}

export async function savePublicRecord(record, options = {}) {
  const { mode, user, ownerKind, claimTokenHash, guestSessionToken } = await ensurePublicSaveUser()
  const supabase = requireSupabase()
  const location = getRecordLocation(record)
  if (mode === "guest") {
    const { data, error } = await supabase.rpc("save_public_record_guest", {
      p_session_token: guestSessionToken,
      p_record_id: getRecordId(record),
      p_record_key: getRecordKey(record),
      p_record_type: getRecordKind(record),
      p_title: record.title || "이름 없는 기록",
      p_region: record.region || record.address || record.neighborhood || null,
      p_intro: record.intro || record.note || record.description || null,
      p_source_context: record.sourceContext || record.source_context || "public_community_web",
      p_recommend_map_slug: options.recommendMapSlug || record.recommend_map_slug || null,
      p_lat: location.lat,
      p_lng: location.lng,
      p_keywords: getKeywords(record),
      p_snapshot: compactSnapshot(record),
    })
    if (error) throw toFriendlySaveError(error)
    return data
  }

  const { data, error } = await supabase
    .from("user_saved_records")
    .upsert({
      user_id: user.id,
      owner_kind: ownerKind,
      claim_token_hash: claimTokenHash,
      record_id: getRecordId(record),
      record_key: getRecordKey(record),
      record_type: getRecordKind(record),
      title: record.title || "이름 없는 기록",
      region: record.region || record.address || record.neighborhood || null,
      intro: record.intro || record.note || record.description || null,
      source_context: record.sourceContext || record.source_context || "public_community_web",
      recommend_map_slug: options.recommendMapSlug || record.recommend_map_slug || null,
      lat: location.lat,
      lng: location.lng,
      keywords: getKeywords(record),
      snapshot: compactSnapshot(record),
      deleted_at: null,
    }, { onConflict: "user_id,record_id" })
    .select("*")
    .single()
  if (error) throw toFriendlySaveError(error)
  return data
}

export async function listPublicSavedItems() {
  if (!hasSupabaseEnv) return { recommendMaps: [], records: [] }
  const user = await getCurrentUser()
  if (!user) {
    const guestSessionToken = getStoredGuestSessionToken()
    if (!guestSessionToken) return { recommendMaps: [], records: [] }
    const supabase = requireSupabase()
    const { data, error } = await supabase.rpc("list_public_saved_items_guest", {
      p_session_token: guestSessionToken,
    })
    if (error) throw toFriendlySaveError(error)
    return {
      recommendMaps: data?.recommendMaps || data?.recommend_maps || [],
      records: data?.records || [],
    }
  }
  await claimAnonymousSavesIfNeeded(user)

  const supabase = requireSupabase()
  const [recommendMapsResult, recordsResult] = await Promise.all([
    supabase
      .from("user_saved_recommend_maps")
      .select("*")
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    supabase
      .from("user_saved_records")
      .select("*")
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
  ])

  if (recommendMapsResult.error) throw recommendMapsResult.error
  if (recordsResult.error) throw recordsResult.error

  const result = {
    recommendMaps: recommendMapsResult.data || [],
    records: recordsResult.data || [],
  }
  if (typeof window !== "undefined") {
    window.localStorage.setItem(SAVED_BOX_CACHE_KEY, JSON.stringify({
      recommendMapCount: result.recommendMaps.length,
      recordCount: result.records.length,
      cachedAt: new Date().toISOString(),
    }))
  }
  return result
}

export async function deleteSavedRecommendMap(id) {
  const user = await getCurrentUser()
  const supabase = requireSupabase()
  if (!user) {
    const guestSessionToken = getStoredGuestSessionToken()
    if (!guestSessionToken) throw new Error("저장함 세션을 찾지 못했어요.")
    const { error } = await supabase.rpc("delete_public_recommend_map_guest", {
      p_session_token: guestSessionToken,
      p_saved_id: id,
    })
    if (error) throw toFriendlySaveError(error)
    return
  }
  const { error } = await supabase
    .from("user_saved_recommend_maps")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
  if (error) throw error
}

export async function deleteSavedRecord(id) {
  const user = await getCurrentUser()
  const supabase = requireSupabase()
  if (!user) {
    const guestSessionToken = getStoredGuestSessionToken()
    if (!guestSessionToken) throw new Error("저장함 세션을 찾지 못했어요.")
    const { error } = await supabase.rpc("delete_public_record_guest", {
      p_session_token: guestSessionToken,
      p_saved_id: id,
    })
    if (error) throw toFriendlySaveError(error)
    return
  }
  const { error } = await supabase
    .from("user_saved_records")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
  if (error) throw error
}

export async function recordSavedBoxLead({ email = "", sourceContext = "public_saved_box_connect", metadata = {} } = {}) {
  if (!hasSupabaseEnv) return null

  const user = await getCurrentUser().catch(() => null)
  const guestSessionId = getStoredPublicGuestSessionId() || (isAnonymousUser(user) ? user.id : null)
  const supabase = requireSupabase()
  const { data, error } = await supabase
    .from("app_interest_leads")
    .insert({
      auth_user_id: user?.id || null,
      email: email || user?.email || null,
      guest_session_id: guestSessionId,
      source_context: sourceContext,
      lead_type: "saved_box_connect",
      metadata: {
        current_path: typeof window !== "undefined" ? `${window.location.pathname}${window.location.search}` : "",
        method: metadata.method || null,
        ...metadata,
      },
    })
    .select("*")
    .single()
  if (error) throw error
  return data
}
