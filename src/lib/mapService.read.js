import { requireSupabase } from "./supabase"
import {
  requireUser,
  normalizeMap,
  normalizePublication,
  normalizeMemo,
  mergeFeaturesWithMemos,
} from "./mapService.utils"

// ─── 내부 batch 조회 ───

function isMissingDbObject(error, objectName) {
  if (!error) return false
  const message = `${error.message || ""}`.toLowerCase()
  return (
    error.code === "42883"
    || error.code === "42P01"
    || message.includes(`${objectName}`.toLowerCase())
  )
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
  if (publicationError) throw publicationError

  const publication = normalizePublication(publicationRow)
  return {
    map: normalizeMap(mapRow, publication),
    features: mergeFeaturesWithMemos(featureRows, memoRows, mediaRows),
    publication,
  }
}

export async function listPublicationsForMapIds(mapIds) {
  if (!mapIds.length) return []
  const supabase = requireSupabase()
  const { data, error } = await supabase
    .from("map_publications")
    .select("*")
    .in("map_id", mapIds)

  if (error) throw error
  return data || []
}

export async function listFeaturesForMapIds(mapIds) {
  if (!mapIds.length) return []
  const supabase = requireSupabase()
  const { data, error } = await supabase
    .from("map_features")
    .select("*")
    .in("map_id", mapIds)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })

  if (error) throw error
  return data || []
}

export async function listMemosForFeatureIds(featureIds) {
  if (!featureIds.length) return []
  const supabase = requireSupabase()
  const { data, error } = await supabase
    .from("feature_memos")
    .select("*")
    .in("feature_id", featureIds)
    .eq("status", "visible")
    .order("created_at", { ascending: true })

  if (error) throw error
  return data || []
}

export async function listMediaForFeatureIds(featureIds) {
  if (!featureIds.length) return []
  const supabase = requireSupabase()
  const { data, error } = await supabase
    .from("feature_media")
    .select("*")
    .in("feature_id", featureIds)
    .order("created_at", { ascending: true })
  if (error) throw error
  return data || []
}

// ─── 공개 조회 API ───

export async function getMyMaps() {
  const user = await requireUser()
  const supabase = requireSupabase()

  const { data, error } = await supabase
    .from("maps")
    .select("*")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })

  if (error) throw error

  const mapRows = data || []
  const publicationRows = await listPublicationsForMapIds(mapRows.map((row) => row.id))
  const publicationsByMapId = new Map(publicationRows.map((row) => [row.map_id, normalizePublication(row)]))

  return mapRows.map((row) => normalizeMap(row, publicationsByMapId.get(row.id) || null))
}

export async function getMyAppData() {
  const user = await requireUser()
  const supabase = requireSupabase()

  const [mapsRes, followsRes, followersRes] = await Promise.all([
    supabase
      .from("maps")
      .select("*")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false }),
    supabase
      .from("follows")
      .select("following_id")
      .eq("follower_id", user.id),
    supabase
      .from("follows")
      .select("follower_id", { count: "exact", head: true })
      .eq("following_id", user.id),
  ])

  if (mapsRes.error) throw mapsRes.error
  if (followsRes.error) throw followsRes.error
  // followersRes 에러는 무시 — followerCount 0으로 폴백

  const mapRows = mapsRes.data || []
  const mapIds = mapRows.map((row) => row.id)
  const [featureRows, publicationRows] = await Promise.all([
    listFeaturesForMapIds(mapIds),
    listPublicationsForMapIds(mapIds),
  ])

  const featureIds = featureRows.map((row) => row.id)
  const [memoRows, mediaRows] = await Promise.all([
    listMemosForFeatureIds(featureIds),
    listMediaForFeatureIds(featureIds),
  ])

  return {
    maps: mapRows.map((row) => normalizeMap(row, normalizePublication(publicationRows.find((item) => item.map_id === row.id)))),
    features: mergeFeaturesWithMemos(featureRows, memoRows, mediaRows),
    shares: publicationRows.filter((row) => row.visibility === "public").map((row) => normalizePublication(row)),
    followed: (followsRes.data || []).map((row) => row.following_id),
    followerCount: followersRes.count ?? 0,
  }
}

export async function getMapBundle(mapId) {
  const supabase = requireSupabase()

  const [{ data: mapRow, error: mapError }, { data: publicationRow, error: publicationError }] = await Promise.all([
    supabase.from("maps").select("*").eq("id", mapId).single(),
    supabase.from("map_publications").select("*").eq("map_id", mapId).maybeSingle(),
  ])

  if (mapError) throw mapError
  if (publicationError) throw publicationError

  const featureRows = await listFeaturesForMapIds([mapId])
  const featureIds = featureRows.map((row) => row.id)
  const [memoRows, mediaRows] = await Promise.all([
    listMemosForFeatureIds(featureIds),
    listMediaForFeatureIds(featureIds),
  ])

  return {
    map: normalizeMap(mapRow, normalizePublication(publicationRow)),
    features: mergeFeaturesWithMemos(featureRows, memoRows, mediaRows),
    publication: normalizePublication(publicationRow),
  }
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

  return getMapBundle(mapRow.id)
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
        return normalizeMap(mapRow, publication)
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
    return normalizeMap(row, normalizePublication(pub))
  })
}

export async function getFeatureMemos(featureId) {
  const supabase = requireSupabase()
  const { data, error } = await supabase
    .from("feature_memos")
    .select("*")
    .eq("feature_id", featureId)
    .eq("status", "visible")
    .order("created_at", { ascending: true })

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

export async function getMyCheckins(mapId) {
  const supabase = requireSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data, error } = await supabase
    .from("event_checkins")
    .select("feature_id, created_at")
    .eq("user_id", user.id)
    .eq("map_id", mapId)

  if (error) throw error
  return data || []
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
  const { data, error } = await supabase
    .from("profiles")
    .select("id, nickname, emoji")
    .ilike("nickname", `%${query.trim()}%`)
    .limit(10)

  if (error) throw error
  return data || []
}

export async function checkCollaboratorAccess(mapId) {
  const supabase = requireSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false

  const { data, error } = await supabase
    .from("map_collaborators")
    .select("id, role")
    .eq("map_id", mapId)
    .eq("user_id", user.id)
    .limit(1)

  if (error) return false
  return data.length > 0 ? data[0].role : false
}

export async function checkAdminRole() {
  return false
}
