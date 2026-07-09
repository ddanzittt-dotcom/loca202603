import { requireSupabase } from "./supabase"
import {
  mergeFeaturesWithMemos,
  normalizeMap,
} from "./mapService.utils"
import {
  getPublicRecommendedPixelId,
  publicPixelEmojiValue,
} from "../utils/publicMapMarkers"

function isMissingDbObject(error, objectName) {
  if (!error) return false
  const message = `${error.message || ""}`.toLowerCase()
  return (
    error.code === "42883"
    || error.code === "42P01"
    || error.code === "PGRST200"
    || error.code === "PGRST204"
    || error.code === "PGRST205"
    || message.includes(`${objectName}`.toLowerCase())
  )
}

function isPermissionDenied(error) {
  if (!error) return false
  const message = `${error.message || ""}`.toLowerCase()
  return error.code === "42501" || message.includes("permission denied")
}

function canIgnoreCommunityRead(error, objectName) {
  return isMissingDbObject(error, objectName) || isPermissionDenied(error)
}

function toCommunityMap(row) {
  const normalized = normalizeMap({
    ...row,
    config: { ...(row?.config || {}), community: true },
    user_role: "viewer",
    collab_count: 0,
  })

  return {
    ...normalized,
    isCommunity: true,
    userRole: "viewer",
    canManage: false,
    canEditFeatures: false,
  }
}

function toStaticCommunityFeatureRow(feature, mapId, index) {
  const now = new Date().toISOString()
  return {
    id: feature.id,
    map_id: mapId,
    type: feature.type || "pin",
    title: feature.title || "모두의 지도 장소",
    emoji: feature.emoji || "loca-emoji:pixel:px-map-pin",
    emoji_kind: feature.emojiKind || "pixel",
    emoji_pixel_id: feature.emojiPixelId || null,
    emoji_photo_url: feature.emojiPhotoUrl || null,
    tags: Array.isArray(feature.tags) ? feature.tags : [],
    note: feature.note || "",
    lat: feature.lat,
    lng: feature.lng,
    points: feature.points || null,
    style: feature.style || {},
    highlight: Boolean(feature.highlight),
    sort_order: Number.isFinite(Number(feature.sortOrder)) ? Number(feature.sortOrder) : index,
    created_by: null,
    created_by_name: feature.createdByName || null,
    created_at: feature.createdAt || now,
    updated_at: feature.updatedAt || now,
    is_sample: true,
    sample_batch: feature.sampleBatch || null,
    sample_key: feature.sampleKey || null,
  }
}

async function listStaticCommunityFeatureRows(mapId) {
  const { communitySampleFeatures } = await import("../data/communitySampleFeatures")
  return communitySampleFeatures.map((feature, index) => toStaticCommunityFeatureRow(feature, mapId, index))
}

function normalizeCommunityRecordFeature(row, mapId) {
  if (!row || typeof row !== "object") return null

  const lat = Number(row.lat)
  const lng = Number(row.lng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null

  const recordType = row.type === "route" ? "route" : "place"
  const type = recordType === "route" ? "route" : "pin"
  const keywords = Array.isArray(row.keywords)
    ? row.keywords.map((item) => `${item || ""}`.trim()).filter(Boolean)
    : []
  const representativeKeyword = row.representative_keyword || keywords[0] || null
  const pixelId = getPublicRecommendedPixelId({
    type: recordType,
    recordType,
    title: row.title,
    description: row.description,
    note: row.description,
    keywords,
    representative_keyword: representativeKeyword,
    pixel_icon_key: row.pixel_icon_key,
  })
  const updatedAt = row.updated_at || row.approved_at || row.created_at || new Date().toISOString()

  return {
    id: `community-record-${row.id}`,
    serverRecordId: row.id,
    recordId: row.id,
    mapId,
    type,
    recordType,
    geometryType: "representative_point",
    title: row.title || "모두의 지도 기록",
    emoji: publicPixelEmojiValue(pixelId),
    emojiKind: "pixel",
    emojiPixelId: pixelId,
    emojiPhotoUrl: null,
    tags: keywords,
    keywords,
    representative_keyword: representativeKeyword,
    pixel_icon_key: row.pixel_icon_key || pixelId,
    reason: row.reason || null,
    category: row.reason || representativeKeyword || null,
    note: row.description || row.route_summary_text || "",
    intro: row.description || row.route_summary_text || "",
    highlight: false,
    status: row.status || "approved",
    publicStatus: row.status || "approved",
    sourceContext: "public_community_records",
    sourceTable: "community_records",
    createdBy: null,
    createdByName: row.author_name || null,
    createdAt: row.created_at || updatedAt,
    updatedAt,
    approvedAt: row.approved_at || null,
    memos: [],
    photos: [],
    voices: [],
    representativeLocation: { lat, lng },
    lat,
    lng,
    points: type === "route" ? [[lng, lat]] : undefined,
    publicSubmission: {
      version: 1,
      source: "community-web",
      status: row.status || "approved",
      reason: row.reason || null,
      keywords,
    },
  }
}

async function getCommunityMapRow(supabase) {
  const bySlugRes = await supabase
    .from("maps")
    .select("*")
    .eq("slug", "community-map")
    .maybeSingle()

  if (bySlugRes.error && !canIgnoreCommunityRead(bySlugRes.error, "maps")) {
    throw bySlugRes.error
  }
  if (bySlugRes.data) return bySlugRes.data

  const byCategoryRes = await supabase
    .from("maps")
    .select("*")
    .eq("category", "community")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle()

  if (byCategoryRes.error && !canIgnoreCommunityRead(byCategoryRes.error, "maps")) {
    throw byCategoryRes.error
  }
  return byCategoryRes.data || null
}

async function listCommunityMapFeatureRows(supabase, mapId) {
  // PostgREST 기본 1000행 상한 대비 — 핀 1000개 넘는 인기 지도도 안 잘리게 페이지네이션
  const PAGE = 1000
  const rows = []
  let error = null
  for (let from = 0; ; from += PAGE) {
    const res = await supabase
      .from("map_features")
      .select("*")
      .eq("map_id", mapId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true })
      .range(from, from + PAGE - 1)
    if (res.error) { error = res.error; break }
    const batch = res.data || []
    rows.push(...batch)
    if (batch.length < PAGE) break
  }

  if (!error) return rows

  if (!canIgnoreCommunityRead(error, "map_features")) {
    console.warn("[community-map] failed to load map feature samples; using bundled sample fallback", error)
  }

  return listStaticCommunityFeatureRows(mapId)
}

async function listApprovedCommunityRecordFeatures(supabase, mapId) {
  const { data, error } = await supabase
    .from("community_records")
    .select("id,type,title,description,reason,keywords,representative_keyword,pixel_icon_key,lat,lng,route_summary_text,author_name,status,created_at,updated_at,approved_at")
    .eq("status", "approved")
    .order("approved_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })

  if (error) {
    if (canIgnoreCommunityRead(error, "community_records")) return []
    throw error
  }

  return (data || [])
    .map((row) => normalizeCommunityRecordFeature(row, mapId))
    .filter(Boolean)
}

export async function getCommunityMapBundle() {
  const supabase = requireSupabase()
  const mapRow = await getCommunityMapRow(supabase)
  if (!mapRow) return null

  const [sampleRows, publicRecordFeatures] = await Promise.all([
    listCommunityMapFeatureRows(supabase, mapRow.id),
    listApprovedCommunityRecordFeatures(supabase, mapRow.id),
  ])

  return {
    map: toCommunityMap(mapRow),
    features: [
      ...mergeFeaturesWithMemos(sampleRows, [], []),
      ...publicRecordFeatures,
    ],
    publication: null,
  }
}
