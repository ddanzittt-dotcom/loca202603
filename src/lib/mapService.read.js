import { requireSupabase } from "./supabase"
import {
  requireUser,
  normalizeMap,
  normalizePublication,
  normalizeMemo,
  mergeFeaturesWithMemos,
} from "./mapService.utils"

// ─── 내부 batch 조회 ───

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
    shares: publicationRows.map((row) => normalizePublication(row)),
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
