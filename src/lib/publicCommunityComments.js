import { requireSupabase } from "./supabase"

const GUEST_SESSION_TOKEN_KEY = "loca.public.guest_session_token"

function getGuestSessionToken({ create = false } = {}) {
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

function getRecordKind(record) {
  return record?.recordType === "route" || record?.record_type === "route" || record?.type === "route"
    ? "route"
    : "place"
}

export function getCommunityRecordIdentity(record) {
  const recordId = String(
    record?.serverRecordId
      || record?.record_id
      || record?.recordId
      || record?.id
      || "",
  )
  const recordKey = String(
    record?.record_key
      || record?.recordKey
      || `${record?.sourceContext || record?.source_context || "community"}:${record?.mapId || record?.map_id || "map"}:${recordId}`,
  )
  return {
    recordId,
    recordKey,
    recordType: getRecordKind(record),
  }
}

function normalizeComment(row) {
  return {
    id: row.id,
    recordId: row.record_id,
    recordKey: row.record_key,
    authorName: row.author_name || "방문자",
    body: row.body || "",
    isMine: Boolean(row.is_mine),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function parseRpcResult(data) {
  return typeof data === "string" ? JSON.parse(data) : data
}

function toFriendlyCommentError(error) {
  const message = `${error?.message || ""} ${error?.details || ""}`.toLowerCase()
  if (error?.code === "PGRST202" || message.includes("could not find the function")) {
    return new Error("댓글 기능 업데이트가 아직 반영되지 않았어요. 잠시 후 다시 시도해주세요.")
  }
  if (message.includes("rate_limited")) {
    return new Error("댓글 작성이 너무 빠릅니다. 잠시 후 다시 시도해주세요.")
  }
  if (message.includes("body_required")) {
    return new Error("댓글 내용을 입력해주세요.")
  }
  if (message.includes("guest_session_token_required") || message.includes("identity_required")) {
    return new Error("댓글 작성 세션을 만들지 못했어요. 새로고침 후 다시 시도해주세요.")
  }
  if (message.includes("network") || message.includes("fetch")) {
    return new Error("네트워크 연결을 확인한 뒤 다시 시도해주세요.")
  }
  return error
}

export async function listCommunityRecordComments(record, { limit = 30, offset = 0 } = {}) {
  const identity = getCommunityRecordIdentity(record)
  if (!identity.recordId) return { comments: [], total: 0 }

  const supabase = requireSupabase()
  const { data, error } = await supabase.rpc("list_community_record_comments", {
    p_record_id: identity.recordId,
    p_record_key: identity.recordKey,
    p_session_token: getGuestSessionToken(),
    p_limit: limit,
    p_offset: offset,
  })
  if (error) throw toFriendlyCommentError(error)

  const result = parseRpcResult(data) || {}
  return {
    comments: (result.comments || []).map(normalizeComment),
    total: result.total || 0,
  }
}

export async function createCommunityRecordComment(record, { body, authorName = "" }) {
  const identity = getCommunityRecordIdentity(record)
  if (!identity.recordId) throw new Error("댓글을 남길 기록을 찾지 못했어요.")

  const supabase = requireSupabase()
  const { data, error } = await supabase.rpc("create_community_record_comment_guest", {
    p_session_token: getGuestSessionToken({ create: true }),
    p_record_id: identity.recordId,
    p_record_key: identity.recordKey,
    p_record_type: identity.recordType,
    p_body: body,
    p_author_name: authorName || null,
  })
  if (error) throw toFriendlyCommentError(error)

  const result = parseRpcResult(data)
  if (result?.error) throw toFriendlyCommentError(new Error(result.error))
  return normalizeComment(result)
}

export async function deleteCommunityRecordComment(commentId) {
  const supabase = requireSupabase()
  const { error } = await supabase.rpc("delete_community_record_comment_guest", {
    p_session_token: getGuestSessionToken({ create: true }),
    p_comment_id: commentId,
  })
  if (error) throw toFriendlyCommentError(error)
}

export async function reportCommunityRecordComment(commentId, reason = "inappropriate") {
  const supabase = requireSupabase()
  const { data, error } = await supabase.rpc("report_community_record_comment_guest", {
    p_session_token: getGuestSessionToken({ create: true }),
    p_comment_id: commentId,
    p_reason: reason,
  })
  if (error) throw toFriendlyCommentError(error)
  return parseRpcResult(data)
}
