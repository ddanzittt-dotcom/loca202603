import { requireSupabase } from "./supabase"
import {
  requireUser,
  normalizeMap,
  normalizePublication,
  normalizeMemo,
  mergeFeaturesWithMemos,
} from "./mapService.utils"
import {
  getPublicRecommendedPixelId,
  publicPixelEmojiValue,
} from "../utils/publicMapMarkers"

const SUPABASE_IN_FILTER_CHUNK_SIZE = 100

function chunkArray(items, size = SUPABASE_IN_FILTER_CHUNK_SIZE) {
  if (!Array.isArray(items) || items.length === 0) return []
  const chunks = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

// ─── 내부 batch 조회 ───

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

function canIgnoreOptionalTableRead(error, objectName) {
  return isMissingDbObject(error, objectName) || isPermissionDenied(error)
}

function isMissingColumn(error, columnName = "") {
  if (!error) return false
  const message = `${error.message || ""}`.toLowerCase()
  const column = `${columnName || ""}`.toLowerCase()
  return error.code === "42703" && (!column || message.includes(column))
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

async function _listApprovedCommunityRecordFeatures(mapId) {
  const supabase = requireSupabase()
  const { data, error } = await supabase
    .from("community_records")
    .select("id,type,title,description,reason,keywords,representative_keyword,pixel_icon_key,lat,lng,route_summary_text,author_name,status,created_at,updated_at,approved_at")
    .eq("status", "approved")
    .order("approved_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })

    if (error) {
    if (isMissingDbObject(error, "community_records")) return []
    throw error
  }

  return (data || [])
    .map((row) => normalizeCommunityRecordFeature(row, mapId))
    .filter(Boolean)
}

function normalizeSnapshotMapRow(liveRevision, requestedSlug) {
  const mapSnapshot = liveRevision?.snapshot?.map || {}
  const publishedAt = (
    liveRevision?.published_at
    || mapSnapshot?.published_at
    || mapSnapshot?.updated_at
    || liveRevision?.created_at
    || new Date().toISOString()
  )

  return {
    id: liveRevision?.map_id || mapSnapshot?.id,
    title: mapSnapshot?.title || "LOCA 지도",
    description: mapSnapshot?.description || "",
    theme: mapSnapshot?.theme || "#4F46E5",
    visibility: mapSnapshot?.visibility || "public",
    slug: liveRevision?.slug || mapSnapshot?.slug || requestedSlug || null,
    tags: Array.isArray(mapSnapshot?.tags) ? mapSnapshot.tags : [],
    category: mapSnapshot?.category || "personal",
    config: mapSnapshot?.config || {},
    is_published: true,
    published_at: publishedAt,
    updated_at: mapSnapshot?.updated_at || publishedAt,
    created_at: mapSnapshot?.created_at || liveRevision?.created_at || publishedAt,
  }
}

function asPublishedViewerMap(map) {
  if (!map || typeof map !== "object") return map
  return {
    ...map,
    userRole: "viewer",
    canManage: false,
    canEditFeatures: false,
  }
}

function normalizeSnapshotFeatureRows(liveRevision) {
  const rawRows = Array.isArray(liveRevision?.snapshot?.features)
    ? liveRevision.snapshot.features
    : []

  return rawRows
    .filter((row) => row && typeof row === "object" && typeof row.id === "string" && row.id.length > 0)
    .map((row, index) => {
      const type = row.type || "pin"
      const sortOrder = Number.isFinite(Number(row.sort_order)) ? Number(row.sort_order) : index
      return {
        ...row,
        map_id: row.map_id || liveRevision?.map_id,
        type,
        title: row.title || "새 항목",
        emoji: row.emoji || (type === "route" ? "🛣️" : type === "area" ? "🟩" : "📍"),
        tags: Array.isArray(row.tags) ? row.tags : [],
        note: row.note || "",
        highlight: Boolean(row.highlight),
        sort_order: sortOrder,
        created_at: row.created_at || liveRevision?.created_at || new Date().toISOString(),
        updated_at: row.updated_at || liveRevision?.published_at || liveRevision?.created_at || new Date().toISOString(),
      }
    })
    .sort((a, b) => {
      if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order
      return (a.created_at || "").localeCompare(b.created_at || "")
    })
}

async function getPublishedBundleFromLiveRevision(supabase, liveRevision, slug) {
  const mapRow = normalizeSnapshotMapRow(liveRevision, slug)
  const featureRows = normalizeSnapshotFeatureRows(liveRevision)

  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  const featureIds = featureRows.map((row) => row.id).filter((id) => uuidPattern.test(id))

  const publicationReq = supabase
    .from("map_publications")
    .select("*")
    .eq("map_id", liveRevision.map_id)
    .maybeSingle()

  const memoReq = featureIds.length ? listMemosForFeatureIds(featureIds) : Promise.resolve([])
  const mediaReq = featureIds.length ? listMediaForFeatureIds(featureIds) : Promise.resolve([])

  const [{ data: publicationRow, error: publicationError }, memoRows, mediaRows] = await Promise.all([
    publicationReq,
    memoReq,
    mediaReq,
  ])
  if (publicationError && !canIgnoreOptionalTableRead(publicationError, "map_publications")) {
    throw publicationError
  }

  const publication = normalizePublication(publicationRow)
  return {
    map: asPublishedViewerMap(normalizeMap(mapRow, publication)),
    features: mergeFeaturesWithMemos(featureRows, memoRows, mediaRows),
    publication,
  }
}

export async function listPublicationsForMapIds(mapIds) {
  if (!mapIds.length) return []
  const supabase = requireSupabase()
  const rows = []

  for (const chunk of chunkArray(mapIds)) {
    const { data, error } = await supabase
      .from("map_publications")
      .select("*")
      .in("map_id", chunk)

    if (error) {
      if (canIgnoreOptionalTableRead(error, "map_publications")) return []
      throw error
    }
    rows.push(...(data || []))
  }

  return rows
}

export async function listCollaboratorCountsForMapIds(mapIds) {
  if (!mapIds.length) return new Map()
  const supabase = requireSupabase()
  const rows = []

  for (const chunk of chunkArray(mapIds)) {
    const { data, error } = await supabase
      .from("map_collaborators")
      .select("map_id")
      .in("map_id", chunk)
      .eq("status", "accepted")

    if (error) {
      if (isMissingColumn(error, "status")) {
        const legacyRes = await supabase
          .from("map_collaborators")
          .select("map_id")
          .in("map_id", chunk)
        if (legacyRes.error) {
          if (canIgnoreOptionalTableRead(legacyRes.error, "map_collaborators")) return new Map()
          throw legacyRes.error
        }
        rows.push(...(legacyRes.data || []))
        continue
      }
      if (canIgnoreOptionalTableRead(error, "map_collaborators")) return new Map()
      throw error
    }
    rows.push(...(data || []))
  }

  return rows.reduce((acc, row) => {
    acc.set(row.map_id, (acc.get(row.map_id) || 0) + 1)
    return acc
  }, new Map())
}

async function listMyAcceptedCollaboratorRows(supabase, userId) {
  const withStatus = await supabase
    .from("map_collaborators")
    .select("map_id, role, status")
    .eq("user_id", userId)
    .eq("status", "accepted")

  if (!withStatus.error) return withStatus.data || []
  if (!isMissingColumn(withStatus.error, "status")) throw withStatus.error

  const legacy = await supabase
    .from("map_collaborators")
    .select("map_id, role")
    .eq("user_id", userId)
  if (legacy.error) throw legacy.error
  return legacy.data || []
}

export async function listCollaborationInvites() {
  const supabase = requireSupabase()
  const { data, error } = await supabase.rpc("list_pending_map_collaboration_invites")
  if (error) {
    if (isMissingDbObject(error, "list_pending_map_collaboration_invites")) return []
    throw error
  }
  return (data || []).map((row) => ({
    id: row.id,
    mapId: row.map_id,
    role: row.role || "viewer",
    status: row.status || "pending",
    createdAt: row.created_at,
    invitedBy: row.invited_by || row.owner_id || null,
    mapTitle: row.map_title || "초대받은 지도",
    mapDescription: row.map_description || "",
    mapTheme: row.map_theme || "#FF6B35",
    ownerId: row.owner_id || null,
    ownerName: row.owner_nickname || "LOCA 사용자",
    ownerAvatarUrl: row.owner_avatar_url || "",
  }))
}

export async function listFeaturesForMapIds(mapIds) {
  if (!mapIds.length) return []
  const supabase = requireSupabase()
  const rows = []

  for (const chunk of chunkArray(mapIds)) {
    const { data, error } = await supabase
      .from("map_features")
      .select("*")
      .in("map_id", chunk)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true })

    if (error) {
      if (canIgnoreOptionalTableRead(error, "map_features")) return []
      throw error
    }
    rows.push(...(data || []))
  }

  return rows.sort((a, b) => {
    const sortOrder = (a.sort_order || 0) - (b.sort_order || 0)
    if (sortOrder !== 0) return sortOrder
    return `${a.created_at || ""}`.localeCompare(`${b.created_at || ""}`)
  })
}

export async function listMemosForFeatureIds(featureIds) {
  if (!featureIds.length) return []
  const supabase = requireSupabase()
  const rows = []

  for (const chunk of chunkArray(featureIds)) {
    let { data, error } = await supabase
      .from("feature_memos")
      .select("*")
      .in("feature_id", chunk)
      .eq("status", "visible")
      .order("created_at", { ascending: true })

    if (error && isMissingColumn(error, "status")) {
      ;({ data, error } = await supabase
        .from("feature_memos")
        .select("*")
        .in("feature_id", chunk)
        .order("created_at", { ascending: true }))
    }

    if (error) {
      if (canIgnoreOptionalTableRead(error, "feature_memos")) return []
      throw error
    }
    rows.push(...(data || []))
  }

  return rows.sort((a, b) => `${a.created_at || ""}`.localeCompare(`${b.created_at || ""}`))
}

export async function listMediaForFeatureIds(featureIds) {
  if (!featureIds.length) return []
  const supabase = requireSupabase()
  const rows = []
  for (const chunk of chunkArray(featureIds)) {
    const { data, error } = await supabase
      .from("feature_media")
      .select("*")
      .in("feature_id", chunk)
      .order("created_at", { ascending: true })
    // feature_media 테이블이 없거나 조회 실패 시 빈 배열로 폴백 (미디어 누락 방지)
    if (error) {
      if (canIgnoreOptionalTableRead(error, "feature_media")) return []
      console.error("listMediaForFeatureIds error:", error)
      return rows.sort((a, b) => `${a.created_at || ""}`.localeCompare(`${b.created_at || ""}`))
    }
    rows.push(...(data || []))
  }
  return rows.sort((a, b) => `${a.created_at || ""}`.localeCompare(`${b.created_at || ""}`))
}

// ─── 공개 조회 API ───

export async function getMyMaps() {
  const user = await requireUser()
  const supabase = requireSupabase()

  const [ownedMapsRes, collaboratorsRes] = await Promise.all([
    supabase
      .from("maps")
      .select("*")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false }),
    listMyAcceptedCollaboratorRows(supabase, user.id).catch((error) => {
      if (canIgnoreOptionalTableRead(error, "map_collaborators")) return []
      throw error
    }),
  ])

  if (ownedMapsRes.error) throw ownedMapsRes.error

  const ownerMapRows = ownedMapsRes.data || []
  const collaboratorRows = Array.isArray(collaboratorsRes) ? collaboratorsRes : []
  const ownerMapIdSet = new Set(ownerMapRows.map((row) => row.id))
  const collaboratorMapIds = [...new Set(
    collaboratorRows.map((row) => row.map_id).filter((mapId) => mapId && !ownerMapIdSet.has(mapId)),
  )]

  let collaboratorMapRows = []
  if (collaboratorMapIds.length > 0) {
    for (const chunk of chunkArray(collaboratorMapIds)) {
      const collaboratorMapsRes = await supabase
        .from("maps")
        .select("*")
        .in("id", chunk)

      if (collaboratorMapsRes.error && !canIgnoreOptionalTableRead(collaboratorMapsRes.error, "maps")) {
        throw collaboratorMapsRes.error
      }
      collaboratorMapRows.push(...(collaboratorMapsRes.data || []))
    }
  }

  const mapRows = [...ownerMapRows, ...collaboratorMapRows]
  const roleByMapId = new Map()
  ownerMapRows.forEach((row) => roleByMapId.set(row.id, "owner"))
  collaboratorRows.forEach((row) => {
    if (!roleByMapId.has(row.map_id)) roleByMapId.set(row.map_id, row.role || "viewer")
  })

  const mapIds = mapRows.map((row) => row.id)
  const [publicationRows, collaboratorCounts] = await Promise.all([
    listPublicationsForMapIds(mapIds),
    listCollaboratorCountsForMapIds(mapIds),
  ])
  const publicationsByMapId = new Map(publicationRows.map((row) => [row.map_id, normalizePublication(row)]))

  return mapRows
    .map((row) => normalizeMap(
      {
        ...row,
        user_role: roleByMapId.get(row.id) || "owner",
        collab_count: collaboratorCounts.get(row.id) || 0,
      },
      publicationsByMapId.get(row.id) || null,
    ))
    .sort((a, b) => `${b.updatedAt || ""}`.localeCompare(`${a.updatedAt || ""}`))
}

export async function getMyAppData() {
  const user = await requireUser()
  const supabase = requireSupabase()

  const [ownedMapsRes, collaboratorsRes, followsRes, followersRes] = await Promise.all([
    supabase
      .from("maps")
      .select("*")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false }),
    listMyAcceptedCollaboratorRows(supabase, user.id).catch((error) => {
      if (canIgnoreOptionalTableRead(error, "map_collaborators")) return []
      throw error
    }),
    supabase
      .from("follows")
      .select("following_id")
      .eq("follower_id", user.id),
    supabase
      .from("follows")
      .select("follower_id", { count: "exact", head: true })
      .eq("following_id", user.id),
  ])

  if (ownedMapsRes.error) throw ownedMapsRes.error
  if (followsRes.error && !canIgnoreOptionalTableRead(followsRes.error, "follows")) {
    throw followsRes.error
  }
  // followersRes 에러는 무시 — followerCount 0으로 폴백

  const ownerMapRows = ownedMapsRes.data || []
  const collaboratorRows = Array.isArray(collaboratorsRes) ? collaboratorsRes : []
  const ownerMapIdSet = new Set(ownerMapRows.map((row) => row.id))
  const collaboratorMapIds = [...new Set(
    collaboratorRows.map((row) => row.map_id).filter((mapId) => mapId && !ownerMapIdSet.has(mapId)),
  )]

  let collaboratorMapRows = []
  if (collaboratorMapIds.length > 0) {
    for (const chunk of chunkArray(collaboratorMapIds)) {
      const collaboratorMapsRes = await supabase
        .from("maps")
        .select("*")
        .in("id", chunk)
      if (collaboratorMapsRes.error && !canIgnoreOptionalTableRead(collaboratorMapsRes.error, "maps")) {
        throw collaboratorMapsRes.error
      }
      collaboratorMapRows.push(...(collaboratorMapsRes.data || []))
    }
  }

  const mapRows = [...ownerMapRows, ...collaboratorMapRows]
  const roleByMapId = new Map()
  ownerMapRows.forEach((row) => roleByMapId.set(row.id, "owner"))
  collaboratorRows.forEach((row) => {
    if (!roleByMapId.has(row.map_id)) roleByMapId.set(row.map_id, row.role || "viewer")
  })

  const mapIds = mapRows.map((row) => row.id)
  const [featureRows, publicationRows, collaboratorCounts, collaborationInvites] = await Promise.all([
    listFeaturesForMapIds(mapIds).catch((error) => {
      console.error("Failed to load personal map features", error)
      return []
    }),
    listPublicationsForMapIds(mapIds),
    listCollaboratorCountsForMapIds(mapIds),
    listCollaborationInvites().catch((error) => {
      console.warn("Failed to load collaboration invites", error)
      return []
    }),
  ])

  const featureIds = featureRows.map((row) => row.id)
  const [memoRows, mediaRows] = await Promise.all([
    listMemosForFeatureIds(featureIds).catch((error) => {
      console.error("Failed to load personal feature memos", error)
      return []
    }),
    listMediaForFeatureIds(featureIds),
  ])

  // 프로필 노출(shares) = map_publications row 가 존재하고 그 지도가 실제 발행된 상태일 때만.
  // 발행 != 프로필 노출 이므로 is_published=true 인 지도만 통과시킨다.
  const publishedMapIds = new Set(
    mapRows.filter((row) => row.is_published && row.slug).map((row) => row.id),
  )
  const activePublicationRows = publicationRows.filter((row) => publishedMapIds.has(row.map_id))

  return {
    maps: mapRows
      .map((row) => normalizeMap(
        {
          ...row,
          user_role: roleByMapId.get(row.id) || "owner",
          collab_count: collaboratorCounts.get(row.id) || 0,
        },
        normalizePublication(activePublicationRows.find((item) => item.map_id === row.id)),
      ))
      .sort((a, b) => `${b.updatedAt || ""}`.localeCompare(`${a.updatedAt || ""}`)),
    features: mergeFeaturesWithMemos(featureRows, memoRows, mediaRows),
    shares: activePublicationRows.map((row) => normalizePublication(row)),
    followed: followsRes.error ? [] : (followsRes.data || []).map((row) => row.following_id),
    followerCount: followersRes.error ? 0 : (followersRes.count ?? 0),
    collaborationInvites,
  }
}

async function resolveMapUserRole(supabase, mapRow) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return mapRow.visibility === "public" || mapRow.visibility === "unlisted" ? "viewer" : null
  if (mapRow.user_id === user.id) return "owner"

  let { data, error } = await supabase
    .from("map_collaborators")
    .select("role, status")
    .eq("map_id", mapRow.id)
    .eq("user_id", user.id)
    .eq("status", "accepted")
    .maybeSingle()

  if (error && isMissingColumn(error, "status")) {
    ;({ data, error } = await supabase
      .from("map_collaborators")
      .select("role")
      .eq("map_id", mapRow.id)
      .eq("user_id", user.id)
      .maybeSingle())
  }

  if (error) return "viewer"
  return data?.role || "viewer"
}

export async function getMapBundle(mapId) {
  const supabase = requireSupabase()

  const [{ data: mapRow, error: mapError }, { data: publicationRow, error: publicationError }] = await Promise.all([
    supabase.from("maps").select("*").eq("id", mapId).single(),
    supabase.from("map_publications").select("*").eq("map_id", mapId).maybeSingle(),
  ])

  if (mapError) throw mapError
  if (publicationError && !canIgnoreOptionalTableRead(publicationError, "map_publications")) {
    throw publicationError
  }

  const [userRole, featureRows] = await Promise.all([
    resolveMapUserRole(supabase, mapRow),
    listFeaturesForMapIds([mapId]),
  ])
  const collaboratorCounts = userRole && userRole !== "viewer"
    ? await listCollaboratorCountsForMapIds([mapId])
    : new Map()
  const featureIds = featureRows.map((row) => row.id)
  const [memoRows, mediaRows] = await Promise.all([
    listMemosForFeatureIds(featureIds),
    listMediaForFeatureIds(featureIds),
  ])

  return {
    map: normalizeMap(
      { ...mapRow, user_role: userRole, collab_count: collaboratorCounts.get(mapId) || 0 },
      normalizePublication(publicationRow),
    ),
    features: mergeFeaturesWithMemos(featureRows, memoRows, mediaRows),
    publication: normalizePublication(publicationRow),
  }
}

/**
 * 모두의 지도(공용 커뮤니티 맵) 번들 조회.
 * - 우선순위: slug='community-map'
 * - 폴백: category='community'
 */
export async function getCommunityMapBundle() {
  const { getCommunityMapBundle: getCommunityMapBundleFromCommunityService } = await import("./mapService.community")
  return getCommunityMapBundleFromCommunityService()
}

export async function getPublishedMapBySlug(slug) {
  const supabase = requireSupabase()

  const { data: liveRevision, error: revisionError } = await supabase
    .from("map_publication_revisions")
    .select("id,map_id,slug,revision_no,status,snapshot,published_at,created_at")
    .eq("slug", slug)
    .eq("status", "live")
    .order("revision_no", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (revisionError) {
    if (!isMissingDbObject(revisionError, "map_publication_revisions")) {
      throw revisionError
    }
  } else if (liveRevision?.snapshot && typeof liveRevision.snapshot === "object") {
    try {
      return await getPublishedBundleFromLiveRevision(supabase, liveRevision, slug)
    } catch (error) {
      console.warn("[publish] failed to load live snapshot. fallback to legacy map lookup:", error)
    }
  }

  const { data: mapRow, error } = await supabase
    .from("maps")
    .select("*")
    .eq("slug", slug)
    .maybeSingle()

  if (error) throw error
  if (!mapRow) return null

  const bundle = await getMapBundle(mapRow.id)
  return {
    ...bundle,
    map: asPublishedViewerMap(bundle.map),
  }
}

export async function getPublishedMaps(limit = 10) {
  const supabase = requireSupabase()

  const { data: liveRevisions, error: revisionError } = await supabase
    .from("map_publication_revisions")
    .select("map_id,slug,revision_no,status,snapshot,published_at,created_at")
    .eq("status", "live")
    .order("published_at", { ascending: false })
    .limit(limit)

  if (revisionError) {
    if (!isMissingDbObject(revisionError, "map_publication_revisions")) {
      throw revisionError
    }
  } else if (liveRevisions?.length) {
    const mapIds = liveRevisions.map((row) => row.map_id)
    const publicationRows = await listPublicationsForMapIds(mapIds)
    const publicationByMapId = new Map(publicationRows.map((row) => [row.map_id, normalizePublication(row)]))

    return liveRevisions
      .map((row) => {
        const mapRow = normalizeSnapshotMapRow(row, row.slug)
        const publication = publicationByMapId.get(row.map_id) || null
        return asPublishedViewerMap(normalizeMap(mapRow, publication))
      })
      .filter((map) => ["public", "unlisted"].includes(map.visibility))
  }

  const { data, error } = await supabase
    .from("maps")
    .select("*, map_publications(likes_count, saves_count)")
    .eq("is_published", true)
    .in("visibility", ["public", "unlisted"])
    .order("published_at", { ascending: false })
    .limit(limit)

  if (error) throw error
  return (data || []).map((row) => {
    const pub = row.map_publications?.[0] || row.map_publications || {}
    return asPublishedViewerMap(normalizeMap(row, normalizePublication(pub)))
  })
}

export async function getCuratedMaps(limit = 12) {
  const supabase = requireSupabase()

  // is_curated 컬럼이 아직 없는 스키마에서는 에러를 삼킨다.
  const { data, error } = await supabase
    .from("maps")
    .select("*, map_publications(likes_count, saves_count)")
    .eq("is_curated", true)
    .eq("is_published", true)
    .in("visibility", ["public", "unlisted"])
    .order("published_at", { ascending: false })
    .limit(limit)

  if (error) return []
  return (data || []).map((row) => {
    const pub = row.map_publications?.[0] || row.map_publications || {}
    return asPublishedViewerMap(normalizeMap(row, normalizePublication(pub)))
  })
}

export async function getFeatureMemos(featureId) {
  const supabase = requireSupabase()
  let { data, error } = await supabase
    .from("feature_memos")
    .select("*")
    .eq("feature_id", featureId)
    .eq("status", "visible")
    .order("created_at", { ascending: true })

  if (error && isMissingColumn(error, "status")) {
    ;({ data, error } = await supabase
      .from("feature_memos")
      .select("*")
      .eq("feature_id", featureId)
      .order("created_at", { ascending: true }))
  }

  if (error) throw error
  return (data || []).map((row) => normalizeMemo(row))
}

export async function getProfile(userId) {
  const supabase = requireSupabase()
  const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).single()
  if (error) throw error
  return data
}

export async function getProfileBySlug(slug) {
  const supabase = requireSupabase()
  const { data, error } = await supabase.from("profiles").select("*").eq("slug", slug).single()
  if (error) throw error
  return data
}

/**
 * 프로필 검색 — nickname 또는 slug로 검색.
 * 최대 20명. 본인은 제외.
 */
export async function searchProfiles(query) {
  const supabase = requireSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  const myId = user?.id

  const trimmed = query.trim()
  if (!trimmed) return []

  // slug 정확 매치 또는 nickname ilike
  const { data, error } = await supabase
    .from("profiles")
    .select("id, nickname, avatar_url, bio, slug")
    .or(`nickname.ilike.%${trimmed}%,slug.ilike.%${trimmed}%`)
    .limit(20)

  if (error) throw error

  return (data || [])
    .filter((p) => p.id !== myId)
    .map((p) => ({
      id: p.id,
      name: p.nickname || "LOCA 사용자",
      handle: p.slug ? `@${p.slug}` : "",
      emoji: p.avatar_url || "😊",
      bio: p.bio || "",
    }))
}

export async function getFollowingIds(userId) {
  const supabase = requireSupabase()
  const { data, error } = await supabase
    .from("follows")
    .select("following_id")
    .eq("follower_id", userId)

  if (error) throw error
  return (data || []).map((row) => row.following_id)
}

export async function getGameProfile(userId = null) {
  const supabase = requireSupabase()
  const { data, error } = await supabase.rpc("get_game_profile", {
    p_user_id: userId,
  })
  if (error) throw error
  return data
}

/** @deprecated gamificationService.getGameProfile() 사용 */
export async function getUserStats() {
  const supabase = requireSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data, error } = await supabase
    .from("user_stats")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle()

  if (error) throw error
  return data
}

export async function getUserBadges() {
  const supabase = requireSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data, error } = await supabase
    .from("user_badges")
    .select("badge_id, earned_at")
    .eq("user_id", user.id)
    .order("earned_at", { ascending: false })

  if (error) throw error
  return data || []
}

export async function searchUsersForInvite(query) {
  if (!query || query.trim().length < 2) return []
  const supabase = requireSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from("profiles")
    .select("id, nickname, avatar_url, slug")
    .ilike("nickname", `%${query.trim()}%`)
    .limit(10)

  if (error) throw error
  return (data || [])
    .filter((profile) => profile.id !== user?.id)
    .map((profile) => {
      const avatarValue = profile.avatar_url || ""
      const hasImageAvatar = avatarValue.startsWith("http") || avatarValue.startsWith("data:")
      const name = profile.nickname || "LOCA 사용자"
      return {
        id: profile.id,
        nickname: name,
        handle: profile.slug ? `@${profile.slug}` : "",
        avatarUrl: hasImageAvatar ? avatarValue : null,
        emoji: hasImageAvatar ? name.slice(0, 1) : (avatarValue || name.slice(0, 1) || "U"),
      }
    })
}

export async function getFeatureOperatorNote(featureId) {
  if (!featureId) return ""
  const supabase = requireSupabase()
  const { data, error } = await supabase
    .from("feature_operator_notes")
    .select("note")
    .eq("feature_id", featureId)
    .maybeSingle()

  if (error) {
    if (isMissingDbObject(error, "feature_operator_notes")) return ""
    throw error
  }
  return data?.note || ""
}

export async function listFeatureChangeRequests(mapId, status = "pending") {
  if (!mapId) return []
  const supabase = requireSupabase()
  let query = supabase
    .from("feature_change_requests")
    .select("id,map_id,feature_id,action,payload,status,requested_by,reviewed_by,review_note,reviewed_at,created_at,updated_at")
    .eq("map_id", mapId)
    .order("created_at", { ascending: false })

  if (status) {
    query = query.eq("status", status)
  }

  const { data, error } = await query
  if (error) {
    if (isMissingDbObject(error, "feature_change_requests")) return []
    throw error
  }

  const rows = data || []
  const profileIds = [...new Set(
    rows.flatMap((row) => [row.requested_by, row.reviewed_by].filter(Boolean)),
  )]

  let profileById = new Map()
  if (profileIds.length > 0) {
    const profilesRes = await supabase
      .from("profiles")
      .select("id,nickname,emoji")
      .in("id", profileIds)
    if (!profilesRes.error) {
      profileById = new Map((profilesRes.data || []).map((profile) => [profile.id, profile]))
    }
  }

  return rows.map((row) => ({
    id: row.id,
    mapId: row.map_id,
    featureId: row.feature_id,
    action: row.action,
    payload: row.payload || {},
    status: row.status,
    requestedBy: row.requested_by,
    requestedByName: profileById.get(row.requested_by)?.nickname || "알 수 없음",
    requestedByEmoji: profileById.get(row.requested_by)?.emoji || "👤",
    reviewedBy: row.reviewed_by || null,
    reviewedByName: profileById.get(row.reviewed_by)?.nickname || "",
    reviewedByEmoji: profileById.get(row.reviewed_by)?.emoji || "",
    reviewNote: row.review_note || "",
    reviewedAt: row.reviewed_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }))
}

export async function checkCollaboratorAccess(mapId) {
  const supabase = requireSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false

  let { data, error } = await supabase
    .from("map_collaborators")
    .select("id, role, status")
    .eq("map_id", mapId)
    .eq("user_id", user.id)
    .eq("status", "accepted")
    .limit(1)

  if (error && isMissingColumn(error, "status")) {
    ;({ data, error } = await supabase
      .from("map_collaborators")
      .select("id, role")
      .eq("map_id", mapId)
      .eq("user_id", user.id)
      .limit(1))
  }

  if (error) return false
  return data.length > 0 ? data[0].role : false
}

export async function checkAdminRole() {
  return false
}
