/**
 * eventCommentsService.js
 * 행사 지도 participant 댓글 CRUD
 * - Supabase RPC 기반 (서버 권한 검증)
 * - 오프라인 큐 미지원 (댓글은 온라인 전용)
 */
import { requireSupabase } from "./supabase"

function getSessionId() {
  let sid = sessionStorage.getItem("loca_session_id")
  if (!sid) {
    sid = crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`
    sessionStorage.setItem("loca_session_id", sid)
  }
  return sid
}

function getCurrentParticipantKey() {
  const sb = requireSupabase()
  const userId = sb.auth.getUser?.()?.data?.user?.id
  if (userId) return `u:${userId}`
  return `s:${getSessionId()}`
}

/** participant_key를 비동기로 가져오기 (auth.getUser 결과 대기) */
async function getParticipantKey() {
  const sb = requireSupabase()
  const { data } = await sb.auth.getUser()
  if (data?.user?.id) return `u:${data.user.id}`
  return `s:${getSessionId()}`
}

// ─── 댓글 목록 ───

export async function listEventComments(mapId, featureId, { limit = 50, offset = 0 } = {}) {
  const sb = requireSupabase()
  const { data, error } = await sb.rpc("list_event_comments", {
    p_map_id: mapId,
    p_feature_id: featureId,
    p_limit: limit,
    p_offset: offset,
  })
  if (error) throw error
  // RPC는 jsonb를 반환 → { comments, total, limit, offset }
  const result = typeof data === "string" ? JSON.parse(data) : data
  return {
    comments: (result.comments || []).map(normalizeComment),
    total: result.total || 0,
    limit: result.limit,
    offset: result.offset,
  }
}

function normalizeComment(row) {
  return {
    id: row.id,
    participantKey: row.participant_key,
    authorName: row.author_name,
    body: row.body,
    isPinned: row.is_pinned,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

// ─── 댓글 작성 ───

export async function createEventComment(mapId, featureId, body, authorName = null) {
  const sb = requireSupabase()
  const sessionId = getSessionId()
  const { data, error } = await sb.rpc("create_event_comment", {
    p_map_id: mapId,
    p_feature_id: featureId,
    p_body: body,
    p_session_id: sessionId,
    p_author_name: authorName,
  })
  if (error) throw error
  const result = typeof data === "string" ? JSON.parse(data) : data
  if (result.error) {
    const msg = {
      comments_disabled: "이 행사는 댓글이 비활성화되어 있어요.",
      login_required: "댓글을 남기려면 로그인이 필요해요.",
      checkin_required: "체크인 후 댓글을 남길 수 있어요.",
      no_identity: "사용자 정보를 확인할 수 없어요.",
      map_not_found: "지도를 찾을 수 없어요.",
    }
    throw new Error(msg[result.error] || result.error)
  }
  return result
}

// ─── 댓글 수정 ───

export async function updateEventComment(commentId, body) {
  const sb = requireSupabase()
  const { error } = await sb
    .from("event_comments")
    .update({ body, updated_at: new Date().toISOString() })
    .eq("id", commentId)
  if (error) throw error
}

// ─── 댓글 삭제 ───

export async function deleteEventComment(commentId) {
  const sb = requireSupabase()
  const { error } = await sb
    .from("event_comments")
    .delete()
    .eq("id", commentId)
  if (error) throw error
}

// ─── 댓글 신고 ───

export async function reportEventComment(commentId, reason) {
  const sb = requireSupabase()
  const sessionId = getSessionId()
  const { data, error } = await sb.rpc("report_event_comment", {
    p_comment_id: commentId,
    p_reason: reason,
    p_session_id: sessionId,
  })
  if (error) throw error
  const result = typeof data === "string" ? JSON.parse(data) : data
  if (result.error) {
    const msg = {
      comment_not_found: "댓글을 찾을 수 없어요.",
      invalid_reason: "유효하지 않은 신고 사유예요.",
    }
    throw new Error(msg[result.error] || result.error)
  }
  return result
}

// ─── 현재 참여자인지 확인 (본인 댓글 판별용) ───

export async function isMyComment(comment) {
  const key = await getParticipantKey()
  return comment.participantKey === key
}

export { getCurrentParticipantKey, getParticipantKey }
