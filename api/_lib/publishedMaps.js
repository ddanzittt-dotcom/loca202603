// 서버리스 공용 — 검색 노출(사이트맵/RSS)용 공개 발행 지도 조회.
//
// ⚠️ 보안: maps 의 RLS(maps_select_visible_or_owner)는 anon 에게 'public'뿐 아니라
// 'unlisted'(링크 공유 전용)도 열어준다 — 링크 미리보기를 위한 의도된 설계다.
// 따라서 아래 .eq("visibility", "public") 양성 필터가 unlisted 비노출의 "유일한" 방어선이다.
// 제외 방식(neq 등)으로 바꾸거나 필터를 호출부로 옮기지 말 것.
// SERVICE_ROLE 키 사용 금지 — anon 전용으로 RLS 를 다층 방어로 유지한다.
import { createClient } from "@supabase/supabase-js"

export const SITE_URL = (process.env.SITE_URL || "https://loca.im").replace(/\/$/, "")

export async function fetchPublicPublishedMaps({ columns = "slug, published_at, updated_at", limit = 5000 } = {}) {
  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseKey) return []

  const supabase = createClient(supabaseUrl, supabaseKey)
  const { data, error } = await supabase
    .from("maps")
    .select(columns)
    .eq("is_published", true)
    .eq("visibility", "public") // ⚠️ unlisted 비노출의 유일한 방어선 (상단 주석 참조)
    .not("slug", "is", null)
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(limit)

  if (error) throw error
  return data || []
}

// XML 텍스트 노드/속성용 이스케이프
export function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}
