import { hasSupabaseEnv, requireSupabase } from "./supabase"
import { getPublicMarkerIconKey } from "../utils/publicMapMarkers"

const MOCK_RECORD_TABLE_CODES = new Set(["42P01", "42703", "PGRST200", "PGRST204", "PGRST205"])
const MISSING_RECORD_EDIT_CODES = new Set(["42P01", "42703", "PGRST200", "PGRST202", "PGRST204", "PGRST205"])
const GUEST_SESSION_TOKEN_KEY = "loca.public.guest_session_token"

function isAnonymousUser(user) {
  return Boolean(user?.is_anonymous || user?.app_metadata?.provider === "anonymous")
}

function isMissingAuthSessionError(error) {
  const message = `${error?.message || ""}`.toLowerCase()
  return error?.name === "AuthSessionMissingError"
    || message.includes("auth session missing")
    || message.includes("session missing")
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

export function getPublicGuestSessionToken({ create = false } = {}) {
  return getStoredGuestSessionToken({ create })
}

function compactKeywords(value) {
  return Array.from(new Set((Array.isArray(value) ? value : [])
    .map((item) => String(item).trim())
    .filter(Boolean)))
    .slice(0, 12)
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

async function ensureSubmissionIdentity() {
  if (!hasSupabaseEnv) return { user: null, guestSessionId: null, mode: "mock" }
  const currentUser = await getCurrentUser()
  if (currentUser) {
    return {
      user: currentUser,
      guestSessionId: null,
      mode: isAnonymousUser(currentUser) ? "anonymous_auth" : "auth_user",
    }
  }
  return {
    user: null,
    guestSessionId: getStoredGuestSessionToken({ create: true }),
    mode: "guest",
  }
}

function isSchemaMissingError(error) {
  const message = `${error?.message || ""} ${error?.details || ""}`.toLowerCase()
  return MOCK_RECORD_TABLE_CODES.has(error?.code)
    || message.includes("could not find the table")
    || message.includes("schema cache")
}

function isMissingPublicCreateRpcError(error) {
  const message = `${error?.message || ""} ${error?.details || ""}`.toLowerCase()
  return error?.code === "PGRST202"
    || message.includes("create_community_record_public")
    || message.includes("could not find the function")
}

function createClientRecordId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }
  return `community-record-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function parseRpcJson(data) {
  return typeof data === "string" ? JSON.parse(data) : data
}

function isMissingRecordEditError(error) {
  const message = `${error?.message || ""} ${error?.details || ""}`.toLowerCase()
  return MISSING_RECORD_EDIT_CODES.has(error?.code)
    || message.includes("could not find the table")
    || message.includes("could not find the function")
    || message.includes("schema cache")
}

function getRecordId(record) {
  return String(record?.serverRecordId || record?.record_id || record?.recordId || record?.id || "").trim()
}

function toFriendlySubmitError(error) {
  const message = `${error?.message || ""}`.toLowerCase()
  if (message.includes("permission") || message.includes("row-level security")) {
    return "기록을 접수할 권한을 확인하지 못했어요. 잠시 후 다시 시도해주세요."
  }
  if (message.includes("rate_limited")) {
    return "기록 접수가 너무 빠릅니다. 잠시 후 다시 시도해주세요."
  }
  if (message.includes("network") || message.includes("fetch")) {
    return "네트워크 연결을 확인한 뒤 다시 시도해주세요."
  }
  if (message.includes("invalid") || message.includes("check constraint")) {
    return "입력한 내용을 다시 확인해주세요."
  }
  return "기록을 접수하지 못했어요. 잠시 후 다시 시도해주세요."
}

function normalizeCommunityRecordInput(input) {
  if (input?.type === "area") throw new Error("영역은 아직 공개 웹에서 남길 수 없어요.")
  const type = input?.type === "route" ? "route" : input?.type === "place" ? "place" : ""
  if (!type) throw new Error("장소 또는 길만 남길 수 있어요.")

  const title = String(input?.title || "").trim()
  const description = String(input?.description || "").trim()
  const lat = Number(input?.lat)
  const lng = Number(input?.lng)
  const keywords = compactKeywords(input?.keywords)
  const representativeKeyword = String(input?.representative_keyword || keywords[0] || "").trim() || null
  const pixelIconKey = input?.pixel_icon_key
    || getPublicMarkerIconKey({
      type,
      recordType: type,
      title,
      description,
      keywords,
      representative_keyword: representativeKeyword,
    })

  if (!title) throw new Error("이름을 입력해주세요.")
  if (!description) throw new Error("한 줄 소개를 입력해주세요.")
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error("지도에서 기록 위치를 찍어주세요.")

  return {
    type,
    title,
    description,
    reason: input?.reason ? String(input.reason).trim() : null,
    keywords,
    representative_keyword: representativeKeyword,
    pixel_icon_key: pixelIconKey,
    region_sido: input?.region_sido || null,
    region_sigungu: input?.region_sigungu || null,
    address_text: input?.address_text || null,
    lat,
    lng,
    route_summary_text: type === "route" ? String(input?.route_summary_text || description).trim() : null,
    author_name: input?.author_name ? String(input.author_name).trim() : null,
    photo_url: input?.photo_url || null,
    status: "pending",
    guest_session_id: input?.guest_session_id || null,
    auth_user_id: input?.auth_user_id || null,
  }
}

function normalizeCommunityRecordEditInput(input) {
  const title = String(input?.title || "").trim()
  const description = String(input?.description || input?.note || input?.intro || "").trim()
  const keywords = compactKeywords(input?.keywords)
  const representativeKeyword = String(input?.representative_keyword || keywords[0] || "").trim() || null
  const pixelIconKey = input?.pixel_icon_key || null
  const type = input?.type === "route" ? "route" : "place"

  if (!title) throw new Error("이름을 입력해주세요.")
  if (!description) throw new Error("간단한 설명을 입력해주세요.")

  return {
    title,
    description,
    reason: input?.reason ? String(input.reason).trim() : null,
    keywords,
    representative_keyword: representativeKeyword,
    pixel_icon_key: pixelIconKey,
    route_summary_text: type === "route" ? String(input?.route_summary_text || description).trim() : null,
  }
}

function createMockRecord(payload) {
  return {
    ...payload,
    id: `mock-community-record-${Date.now()}`,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    approved_at: null,
    __mode: "mock",
  }
}

export async function createCommunityRecordAnonymous(input) {
  const normalized = normalizeCommunityRecordInput(input)

  if (!hasSupabaseEnv) {
    return {
      data: createMockRecord(normalized),
      mode: "mock",
      payload: normalized,
    }
  }

  const identity = normalized.auth_user_id || normalized.guest_session_id
    ? { user: null, guestSessionId: null, mode: "provided" }
    : await ensureSubmissionIdentity()
  const id = input?.id || createClientRecordId()
  const payload = {
    id,
    ...normalized,
    auth_user_id: normalized.auth_user_id || identity.user?.id || null,
    guest_session_id: normalized.guest_session_id || identity.guestSessionId || null,
  }

  const fallbackDirectInsert = async (supabase) => {
    const { error } = await supabase
      .from("community_records")
      .insert(payload)

    if (error) throw error

    return {
      ...payload,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      approved_at: null,
    }
  }

  try {
    const supabase = requireSupabase()
    let data = null
    const rpcResult = await supabase.rpc("create_community_record_public", {
      p_record: payload,
    })

    if (rpcResult.error) {
      if (!isMissingPublicCreateRpcError(rpcResult.error)) throw rpcResult.error
      data = await fallbackDirectInsert(supabase)
    } else {
      data = parseRpcJson(rpcResult.data)
    }

    return {
      data,
      mode: identity.mode,
      payload,
    }
  } catch (error) {
    if (isSchemaMissingError(error)) {
      throw new Error("검수 저장 테이블이 아직 반영되지 않았어요. 036 커뮤니티 기록 마이그레이션을 먼저 적용해주세요.")
    }
    const friendlyError = new Error(toFriendlySubmitError(error))
    friendlyError.cause = error
    throw friendlyError
  }
}

export async function updateCommunityRecordAnonymous(record, input) {
  const recordId = getRecordId(record)
  if (!recordId) throw new Error("수정할 기록을 찾지 못했어요.")
  const patch = normalizeCommunityRecordEditInput({ ...input, type: input?.type || record?.recordType || record?.type })

  if (!hasSupabaseEnv) {
    return {
      data: { id: recordId, ...patch, updated_at: new Date().toISOString(), __mode: "mock" },
      mode: "mock",
      payload: patch,
    }
  }

  try {
    const supabase = requireSupabase()
    const { data, error } = await supabase.rpc("update_community_record_guest", {
      p_session_token: getStoredGuestSessionToken({ create: true }),
      p_record_id: recordId,
      p_patch: patch,
    })
    if (error) throw error
    return {
      data: parseRpcJson(data),
      mode: "server",
      payload: patch,
    }
  } catch (error) {
    if (isMissingRecordEditError(error)) {
      throw new Error("기록 수정 기능이 아직 서버에 반영되지 않았어요. 038 수정 요청 마이그레이션을 적용해주세요.")
    }
    const message = `${error?.message || ""}`.toLowerCase()
    if (message.includes("not_owner") || message.includes("permission") || message.includes("row-level security")) {
      throw new Error("이 기록을 직접 수정할 권한을 확인하지 못했어요.")
    }
    throw new Error("기록을 수정하지 못했어요. 잠시 후 다시 시도해주세요.")
  }
}

export async function requestCommunityRecordEditAnonymous(record, input) {
  const recordId = getRecordId(record)
  if (!recordId) throw new Error("수정 요청할 기록을 찾지 못했어요.")
  const patch = normalizeCommunityRecordEditInput({ ...input, type: input?.type || record?.recordType || record?.type })

  if (!hasSupabaseEnv) {
    return {
      data: { id: `mock-edit-request-${Date.now()}`, record_id: recordId, ...patch, status: "pending" },
      mode: "mock",
      payload: patch,
    }
  }

  try {
    const supabase = requireSupabase()
    const { data, error } = await supabase.rpc("create_community_record_edit_request_guest", {
      p_session_token: getStoredGuestSessionToken({ create: true }),
      p_record_id: recordId,
      p_record_key: record?.record_key || record?.recordKey || null,
      p_record_type: record?.recordType === "route" || record?.type === "route" ? "route" : "place",
      p_current_title: record?.title || null,
      p_patch: patch,
    })
    if (error) throw error
    return {
      data: parseRpcJson(data),
      mode: "server",
      payload: patch,
    }
  } catch (error) {
    if (isMissingRecordEditError(error)) {
      throw new Error("수정 요청 기능이 아직 서버에 반영되지 않았어요. 038 수정 요청 마이그레이션을 적용해주세요.")
    }
    const message = `${error?.message || ""}`.toLowerCase()
    if (message.includes("rate_limited")) {
      throw new Error("수정 요청이 너무 빠릅니다. 잠시 후 다시 시도해주세요.")
    }
    throw new Error("수정 요청을 접수하지 못했어요. 잠시 후 다시 시도해주세요.")
  }
}
