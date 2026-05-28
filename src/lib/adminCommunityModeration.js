import { hasSupabaseEnv, requireSupabase } from "./supabase"

const COMMUNITY_RECORD_FIELDS = [
  "id",
  "type",
  "title",
  "description",
  "reason",
  "keywords",
  "representative_keyword",
  "pixel_icon_key",
  "lat",
  "lng",
  "route_summary_text",
  "author_name",
  "status",
  "created_at",
  "updated_at",
  "approved_at",
].join(", ")

const RECOMMEND_MAP_FIELDS = [
  "id",
  "title",
  "slug",
  "description",
  "region",
  "keywords",
  "reel_url",
  "reel_id",
  "recommender_name",
  "recommender_instagram",
  "cover_image_url",
  "status",
  "created_at",
  "updated_at",
].join(", ")

const SCHEMA_MISSING_CODES = new Set(["42P01", "42703", "PGRST200", "PGRST204", "PGRST205"])

const mockRecords = [
  {
    id: "mock-pending-record-1",
    type: "place",
    title: "조용한 골목 카페",
    description: "오후에 노트북 펴고 앉기 좋은 작은 카페예요.",
    reason: "다시 가고 싶어서 남겨요.",
    keywords: ["카페", "조용함", "작업"],
    representative_keyword: "카페",
    pixel_icon_key: "place",
    lat: 36.4551,
    lng: 127.1248,
    route_summary_text: null,
    author_name: "익명",
    status: "pending",
    created_at: new Date().toISOString(),
    approved_at: null,
  },
  {
    id: "mock-pending-record-2",
    type: "route",
    title: "천변 산책길",
    description: "퇴근 후 20분 정도 걷기 좋은 생활 동선입니다.",
    reason: "산책하기 좋아요.",
    keywords: ["산책길", "하천길"],
    representative_keyword: "산책길",
    pixel_icon_key: "river_route",
    lat: 36.4565,
    lng: 127.1221,
    route_summary_text: "다리 아래에서 시장 입구까지 이어지는 짧은 산책길",
    author_name: "",
    status: "pending",
    created_at: new Date(Date.now() - 1000 * 60 * 24).toISOString(),
    approved_at: null,
  },
]

const mockReportedRecords = [
  {
    id: "mock-reported-record-1",
    type: "place",
    title: "운영 확인 필요 장소",
    description: "신고 목록 구조 확인용 mock 항목입니다.",
    reason: "부정확한 정보 신고",
    keywords: ["신고", "확인필요"],
    representative_keyword: "신고",
    pixel_icon_key: "place",
    lat: 36.451,
    lng: 127.119,
    route_summary_text: null,
    author_name: "익명",
    status: "reported",
    created_at: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
    approved_at: null,
  },
]

function isSchemaMissingError(error) {
  const message = `${error?.message || ""} ${error?.details || ""}`.toLowerCase()
  return SCHEMA_MISSING_CODES.has(error?.code)
    || message.includes("community_records")
    || message.includes("recommend_maps")
    || message.includes("schema cache")
    || message.includes("could not find the table")
}

function isMissingAuthSessionError(error) {
  const message = `${error?.message || ""}`.toLowerCase()
  return error?.name === "AuthSessionMissingError"
    || message.includes("auth session missing")
    || message.includes("session missing")
}

function parseRpcJson(data) {
  return typeof data === "string" ? JSON.parse(data) : data
}

function toFriendlyAdminError(error) {
  const message = `${error?.message || ""}`.toLowerCase()
  if (isMissingAuthSessionError(error)) {
    return "관리자 로그인 없이 검수 목록을 확인하는 개발 모드입니다. 실제 운영 전 관리자 인증을 연결해야 합니다."
  }
  if (message.includes("permission") || message.includes("row-level security") || error?.code === "42501") {
    return "관리자 권한이 필요해요. 운영용 RPC/API route 연결 후 다시 시도해주세요."
  }
  if (message.includes("network") || message.includes("fetch")) {
    return "네트워크 연결을 확인해주세요."
  }
  return error?.message || "운영자 데이터를 처리하지 못했어요."
}

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    || `recommend-${Date.now()}`
}

function parseKeywordList(value) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean)
  return String(value || "")
    .split(/[,#\n]/u)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 12)
}

function parseRecordIdList(value) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean)
  return String(value || "")
    .split(/[\n,]/u)
    .map((item) => item.trim())
    .filter(Boolean)
}

export function buildRecommendMapDraftPayload(input = {}) {
  const title = String(input.title || "").trim()
  const slug = slugify(input.slug || title)
  if (!title) throw new Error("추천지도 제목을 입력해주세요.")

  return {
    title,
    slug,
    description: String(input.description || "").trim() || null,
    region: String(input.region || "").trim() || null,
    keywords: parseKeywordList(input.keywords),
    reel_url: String(input.reel_url || "").trim() || null,
    reel_id: String(input.reel_id || "").trim() || null,
    recommender_name: String(input.recommender_name || "").trim() || null,
    recommender_instagram: String(input.recommender_instagram || "").trim() || null,
    cover_image_url: String(input.cover_image_url || "").trim() || null,
    status: "draft",
  }
}

export function buildRecommendMapItemDrafts(recommendMapId, recordIds) {
  return parseRecordIdList(recordIds).map((recordId, index) => ({
    recommend_map_id: recommendMapId,
    record_id: recordId,
    sort_order: index + 1,
  }))
}

export async function getModerationAuthState() {
  if (!hasSupabaseEnv) {
    return { user: null, isAdminLike: false, mode: "mock", message: "Supabase 환경 변수가 없어 mock mode로 표시합니다." }
  }

  try {
    const supabase = requireSupabase()
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser()
    if (error) {
      if (isMissingAuthSessionError(error)) {
        return {
          user: null,
          isAdminLike: false,
          mode: "anonymous",
          message: "관리자 로그인 없이 검수 목록을 확인하는 개발 모드입니다. 실제 운영 전 관리자 인증을 연결해야 합니다.",
        }
      }
      throw error
    }

    const role = user?.app_metadata?.role || user?.user_metadata?.role || ""
    const dashboardRole = user?.app_metadata?.dashboard_role || user?.user_metadata?.dashboard_role || ""
    const isAdminLike = role === "admin" || dashboardRole === "platform_admin"

    return {
      user,
      isAdminLike,
      mode: user ? "supabase" : "anonymous",
      message: isAdminLike ? "" : "관리자 인증이 아직 연결되지 않았어요. 실제 운영 전 admin auth/RPC가 필요합니다.",
    }
  } catch (error) {
    return { user: null, isAdminLike: false, mode: "error", message: toFriendlyAdminError(error) }
  }
}

export async function listCommunityModerationRecords(status = "pending") {
  if (!hasSupabaseEnv) {
    return {
      records: status === "reported" ? mockReportedRecords : mockRecords,
      mode: "mock",
    }
  }

  try {
    const supabase = requireSupabase()
    const { data, error } = await supabase.rpc("list_community_moderation_records", {
      p_status: status,
      p_limit: 80,
    })

    if (error) throw error
    const result = parseRpcJson(data)

    return {
      records: result?.records || [],
      mode: "supabase",
    }
  } catch (error) {
    if (isSchemaMissingError(error)) {
      return {
        records: status === "reported" ? mockReportedRecords : mockRecords,
        mode: "mock",
        warning: "community_records 테이블이 아직 없어 mock 목록을 표시합니다.",
      }
    }
    throw new Error(toFriendlyAdminError(error))
  }
}

export async function updateCommunityRecordModerationStatus(recordId, status) {
  if (!["approved", "rejected", "hidden"].includes(status)) {
    throw new Error("지원하지 않는 검수 상태입니다.")
  }

  if (!hasSupabaseEnv || String(recordId).startsWith("mock-")) {
    return {
      id: recordId,
      status,
      approved_at: status === "approved" ? new Date().toISOString() : null,
      mode: "mock",
    }
  }

  try {
    const supabase = requireSupabase()
    const { data, error } = await supabase.rpc("update_community_moderation_status", {
      p_record_id: recordId,
      p_status: status,
    })

    if (error) throw error
    return { ...parseRpcJson(data), mode: "supabase" }
  } catch (error) {
    throw new Error(toFriendlyAdminError(error))
  }
}

export async function getRecommendMapModerationSummary() {
  if (!hasSupabaseEnv) {
    return { draft: 0, published: 0, mode: "mock" }
  }

  try {
    const supabase = requireSupabase()
    const [draftResult, publishedResult] = await Promise.all([
      supabase
        .from("recommend_maps")
        .select("id", { count: "exact", head: true })
        .eq("status", "draft"),
      supabase
        .from("recommend_maps")
        .select("id", { count: "exact", head: true })
        .eq("status", "published"),
    ])

    if (draftResult.error) throw draftResult.error
    if (publishedResult.error) throw publishedResult.error

    return {
      draft: draftResult.count || 0,
      published: publishedResult.count || 0,
      mode: "supabase",
    }
  } catch (error) {
    if (isSchemaMissingError(error)) return { draft: 0, published: 0, mode: "mock" }
    throw new Error(toFriendlyAdminError(error))
  }
}

export async function createRecommendMapDraft(input = {}) {
  const mapPayload = buildRecommendMapDraftPayload(input)
  const recordIds = parseRecordIdList(input.record_ids)

  if (!hasSupabaseEnv) {
    return {
      map: {
        ...mapPayload,
        id: `mock-recommend-map-${Date.now()}`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      items: recordIds.map((recordId, index) => ({ record_id: recordId, sort_order: index + 1 })),
      mode: "mock",
    }
  }

  try {
    const supabase = requireSupabase()
    const { data: map, error: mapError } = await supabase
      .from("recommend_maps")
      .insert(mapPayload)
      .select(RECOMMEND_MAP_FIELDS)
      .single()

    if (mapError) throw mapError

    let items = []
    if (recordIds.length) {
      const { data: recordRows, error: recordsError } = await supabase
        .from("community_records")
        .select("id, type")
        .in("id", recordIds)

      if (recordsError) throw recordsError

      const recordTypeById = new Map((recordRows || []).map((record) => [record.id, record.type]))
      const itemPayloads = recordIds.map((recordId, index) => ({
        recommend_map_id: map.id,
        record_id: recordId,
        record_type: recordTypeById.get(recordId) || "place",
        sort_order: index + 1,
      }))
      const { data: itemRows, error: itemError } = await supabase
        .from("recommend_map_items")
        .insert(itemPayloads)
        .select("*")

      if (itemError) throw itemError
      items = itemRows || []
    }

    return { map, items, mode: "supabase" }
  } catch (error) {
    if (isSchemaMissingError(error)) {
      return {
        map: {
          ...mapPayload,
          id: `mock-recommend-map-${Date.now()}`,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        items: recordIds.map((recordId, index) => ({ record_id: recordId, sort_order: index + 1 })),
        mode: "mock",
        warning: "recommend_maps 테이블이 아직 없어 mock draft로 생성했습니다.",
      }
    }
    throw new Error(toFriendlyAdminError(error))
  }
}
