import { requireSupabase } from "./supabase"

// 커뮤니티(모두의 지도) 모더레이션 RPC 래퍼.
// 서버 함수(SECURITY DEFINER)가 is_platform_admin 으로 권한을 게이트하므로
// 클라이언트 판별은 UX 용이고, 실제 보안은 함수가 담당한다.
// 관련 마이그레이션: 022(is_platform_admin), 036/045(모더레이션 RPC).

function parseRpcJson(data) {
  return typeof data === "string" ? JSON.parse(data) : data
}

export function friendlyAdminError(error) {
  const code = error?.code
  const msg = `${error?.message || ""} ${error?.details || ""}`.toLowerCase()
  if (code === "42501" || msg.includes("admin_required")) return "관리자 권한이 필요해요."
  if (msg.includes("record_not_found")) return "이미 처리되었거나 없는 항목이에요."
  if (msg.includes("invalid_status")) return "허용되지 않는 상태값이에요."
  if (msg.includes("network") || msg.includes("fetch")) return "네트워크 연결을 확인해 주세요."
  return "요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요."
}

// 현재 로그인 사용자가 platform_admin 인지 (is_platform_admin RPC).
export async function checkPlatformAdmin() {
  const supabase = requireSupabase()
  const { data, error } = await supabase.rpc("is_platform_admin")
  if (error) return false
  return Boolean(data)
}

// 관리 화면에서 다루는 상태 탭
export const MODERATION_TABS = [
  { key: "pending", label: "승인 대기" },
  { key: "approved", label: "승인됨" },
  { key: "rejected", label: "반려" },
  { key: "hidden", label: "숨김" },
]

// 상태 변경으로 지정 가능한 값 (RPC 는 approved/rejected/hidden 만 허용)
export const MODERATION_ACTIONS = [
  { key: "approved", label: "승인" },
  { key: "rejected", label: "반려" },
  { key: "hidden", label: "숨김" },
]

export async function listModerationRecords(status = "pending", limit = 80) {
  const supabase = requireSupabase()
  const { data, error } = await supabase.rpc("list_community_moderation_records", {
    p_status: status,
    p_limit: limit,
  })
  if (error) {
    const wrapped = new Error(friendlyAdminError(error))
    wrapped.cause = error
    throw wrapped
  }
  const parsed = parseRpcJson(data)
  return Array.isArray(parsed?.records) ? parsed.records : []
}

// 운영 통계 개요 (get_admin_overview RPC) — platform_admin 전용
export async function getAdminOverview() {
  const supabase = requireSupabase()
  const { data, error } = await supabase.rpc("get_admin_overview")
  if (error) {
    const wrapped = new Error(friendlyAdminError(error))
    wrapped.cause = error
    throw wrapped
  }
  return parseRpcJson(data) || {}
}

export async function updateModerationStatus(recordId, status) {
  const supabase = requireSupabase()
  const { data, error } = await supabase.rpc("update_community_moderation_status", {
    p_record_id: recordId,
    p_status: status,
  })
  if (error) {
    const wrapped = new Error(friendlyAdminError(error))
    wrapped.cause = error
    throw wrapped
  }
  return parseRpcJson(data)
}
