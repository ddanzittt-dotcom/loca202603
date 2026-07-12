import { requireSupabase } from "./supabase"
import { getSessionId } from "./analytics"
import { friendlyAdminError } from "./adminModeration"

// "치즈냥의 귓속말" — 사용자 피드백 RPC 래퍼 (migration 065).
// 테이블 직접 접근은 RLS 로 전면 차단되어 있고 SECURITY DEFINER RPC 로만 접근한다.
// 제출(submit)은 익명(anon) 허용 — 검증·rate limit 은 서버(RPC)가 담당.

function parseRpcJson(data) {
  return typeof data === "string" ? JSON.parse(data) : data
}

// 이야기 유형 — 시트 칩과 admin 목록이 공유
export const FEEDBACK_CATEGORIES = [
  { key: "bug", emoji: "🐞", label: "버그" },
  { key: "idea", emoji: "💡", label: "아이디어" },
  { key: "pain", emoji: "😿", label: "불편해요" },
  { key: "praise", emoji: "💛", label: "칭찬해요" },
]

export function feedbackCategoryLabel(key) {
  const found = FEEDBACK_CATEGORIES.find((c) => c.key === key)
  return found ? found.label : key
}

// admin 상태 탭 — 워크플로: 새 이야기 → 확인함 → 처리됨 (스팸은 격리)
export const FEEDBACK_STATUS_TABS = [
  { key: "new", label: "새 이야기" },
  { key: "acked", label: "확인함" },
  { key: "resolved", label: "처리됨" },
  { key: "spam", label: "스팸" },
]

// 제출 실패 안내 — 치즈냥 말투로 사용자에게 그대로 보여줄 수 있는 문구
export function friendlyFeedbackError(error) {
  const msg = `${error?.message || ""} ${error?.details || ""}`.toLowerCase()
  if (msg.includes("rate_limited")) return "귓속말이 너무 빨라! 숨 좀 돌리고 다시 말해줘"
  if (msg.includes("body_required") || msg.includes("body_too_long")) return "이야기 내용을 다시 확인해줘!"
  if (msg.includes("invalid_category")) return "이야기 유형을 골라줘!"
  if (msg.includes("network") || msg.includes("fetch")) return "지금은 전달을 못 했어. 네트워크를 확인해줘!"
  return "지금은 전달을 못 했어. 잠깐 뒤에 다시 말해줘!"
}

// 현재 화면 컨텍스트 — 재현에 필요한 최소 정보만 (개인 식별 정보 없음, 서버가 2KB 캡)
export function collectFeedbackContext(extra = {}) {
  try {
    return {
      path: window.location?.pathname || "",
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      ua: (navigator.userAgent || "").slice(0, 160),
      lang: navigator.language || "",
      ...extra,
    }
  } catch {
    return { ...extra }
  }
}

// 이야기 보내기 — 성공 시 { ok, id } 반환, 실패 시 친화 문구로 감싼 Error throw
export async function submitFeedback({ category, body, context = {} }) {
  const supabase = requireSupabase()
  const { data, error } = await supabase.rpc("submit_user_feedback", {
    p_category: category,
    p_body: body,
    p_context: context,
    p_session_id: getSessionId(),
  })
  if (error) {
    const wrapped = new Error(friendlyFeedbackError(error))
    wrapped.cause = error
    throw wrapped
  }
  return parseRpcJson(data) || {}
}

// ── 이하 admin 전용 (platform_admin 게이트는 서버 RPC 가 담당) ──

// 목록 + 상태별 카운트: { records: [...], counts: {new,acked,resolved,spam}, generated_at }
export async function listAdminFeedback(status = "new", limit = 100) {
  const supabase = requireSupabase()
  const { data, error } = await supabase.rpc("admin_list_feedback", {
    p_status: status,
    p_limit: limit,
  })
  if (error) {
    const wrapped = new Error(friendlyAdminError(error))
    wrapped.cause = error
    throw wrapped
  }
  const parsed = parseRpcJson(data) || {}
  return {
    records: Array.isArray(parsed.records) ? parsed.records : [],
    counts: parsed.counts || {},
    generatedAt: parsed.generated_at || null,
  }
}

export async function updateFeedbackStatus(id, status, note = null) {
  const supabase = requireSupabase()
  const { data, error } = await supabase.rpc("admin_update_feedback_status", {
    p_id: id,
    p_status: status,
    p_note: note,
  })
  if (error) {
    const wrapped = new Error(friendlyAdminError(error))
    wrapped.cause = error
    throw wrapped
  }
  return parseRpcJson(data)
}
