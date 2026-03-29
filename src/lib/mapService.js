import { requireSupabase } from "./supabase"

const DEFAULT_MAP_THEME = "#635BFF"
const DEFAULT_FEATURE_TITLE = "새 항목"

function createSlugCandidate(value = "") {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-_가-힣]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
}

function getDefaultEmoji(type) {
  if (type === "route") return "🛣️"
  if (type === "area") return "🟩"
  return "📍"
}

function normalizePoints(points) {
  if (!Array.isArray(points)) return []
  return points
    .map((point) => {
      if (Array.isArray(point) && point.length >= 2) return [Number(point[0]), Number(point[1])]
      if (point && typeof point === "object") return [Number(point.lng), Number(point.lat)]
      return null
    })
    .filter((point) => point && Number.isFinite(point[0]) && Number.isFinite(point[1]))
}

function normalizePublication(row) {
  if (!row) return null
  const publishedAt = row.published_at || row.created_at || null
  return {
    id: row.id,
    mapId: row.map_id,
    caption: row.caption || "",
    date: publishedAt ? publishedAt.slice(0, 10) : "",
    likes: row.likes_count || 0,
    saves: row.saves_count || 0,
    publishedAt,
  }
}

function normalizeMap(row, publication = null) {
  return {
    id: row.id,
    title: row.title,
    description: row.description || "",
    theme: row.theme || DEFAULT_MAP_THEME,
    visibility: row.visibility,
    slug: row.slug,
    tags: row.tags || [],
    category: row.category || "personal",
    config: row.config || {},
    isPublished: Boolean(row.is_published),
    publishedAt: row.published_at || publication?.publishedAt || null,
    updatedAt: row.updated_at,
    createdAt: row.created_at,
    publication,
  }
}

function normalizeMemo(row) {
  return {
    id: row.id,
    userId: row.user_id,
    userName: row.user_name,
    date: row.created_at,
    text: row.text,
  }
}

function normalizeFeature(row, memos = []) {
  const base = {
    id: row.id,
    mapId: row.map_id,
    type: row.type,
    title: row.title || DEFAULT_FEATURE_TITLE,
    emoji: row.emoji || getDefaultEmoji(row.type),
    tags: row.tags || [],
    note: row.note || "",
    highlight: Boolean(row.highlight),
    updatedAt: row.updated_at || row.created_at,
    createdBy: row.created_by || null,
    createdByName: row.created_by_name || null,
    memos,
  }

  if (row.type === "pin") {
    return {
      ...base,
      lat: row.lat,
      lng: row.lng,
    }
  }

  return {
    ...base,
    points: normalizePoints(row.points),
  }
}

function toFeatureInsert(feature = {}, fallbackType = "pin") {
  const type = feature.type || fallbackType
  const payload = {
    type,
    title: feature.title?.trim() || DEFAULT_FEATURE_TITLE,
    emoji: feature.emoji || getDefaultEmoji(type),
    tags: feature.tags || [],
    note: feature.note || "",
    highlight: Boolean(feature.highlight),
    sort_order: feature.sortOrder || 0,
    created_by: feature.createdBy || null,
    created_by_name: feature.createdByName || null,
    updated_at: new Date().toISOString(),
  }

  if (type === "pin") {
    payload.lat = feature.lat
    payload.lng = feature.lng
    payload.points = null
  } else {
    payload.lat = null
    payload.lng = null
    payload.points = normalizePoints(feature.points)
  }

  return payload
}

function toFeaturePatch(updates = {}) {
  const payload = {}

  if ("type" in updates) payload.type = updates.type
  if ("title" in updates) payload.title = updates.title?.trim() || DEFAULT_FEATURE_TITLE
  if ("emoji" in updates) payload.emoji = updates.emoji || getDefaultEmoji(updates.type)
  if ("tags" in updates) payload.tags = updates.tags || []
  if ("note" in updates) payload.note = updates.note || ""
  if ("highlight" in updates) payload.highlight = Boolean(updates.highlight)
  if ("sortOrder" in updates) payload.sort_order = updates.sortOrder || 0
  if ("createdBy" in updates) payload.created_by = updates.createdBy
  if ("createdByName" in updates) payload.created_by_name = updates.createdByName
  if ("lat" in updates) payload.lat = updates.lat
  if ("lng" in updates) payload.lng = updates.lng
  if ("points" in updates) payload.points = normalizePoints(updates.points)

  payload.updated_at = new Date().toISOString()
  return payload
}

async function requireUser() {
  const supabase = requireSupabase()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()
  if (error) throw error
  if (!user) throw new Error("Authentication is required.")
  return user
}

async function touchMapRecord(mapId) {
  const supabase = requireSupabase()
  const { error } = await supabase
    .from("maps")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", mapId)

  if (error) throw error
}

async function listPublicationsForMapIds(mapIds) {
  if (!mapIds.length) return []
  const supabase = requireSupabase()
  const { data, error } = await supabase
    .from("map_publications")
    .select("*")
    .in("map_id", mapIds)

  if (error) throw error
  return data || []
}

async function listFeaturesForMapIds(mapIds) {
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

async function listMemosForFeatureIds(featureIds) {
  if (!featureIds.length) return []
  const supabase = requireSupabase()
  const { data, error } = await supabase
    .from("feature_memos")
    .select("*")
    .in("feature_id", featureIds)
    .order("created_at", { ascending: true })

  if (error) throw error
  return data || []
}

function mergeFeaturesWithMemos(featureRows, memoRows) {
  const memosByFeatureId = memoRows.reduce((acc, row) => {
    const current = acc.get(row.feature_id) || []
    current.push(normalizeMemo(row))
    acc.set(row.feature_id, current)
    return acc
  }, new Map())

  return featureRows.map((row) => normalizeFeature(row, memosByFeatureId.get(row.id) || []))
}

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

  const [mapsRes, followsRes] = await Promise.all([
    supabase
      .from("maps")
      .select("*")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false }),
    supabase
      .from("follows")
      .select("following_id")
      .eq("follower_id", user.id),
  ])

  if (mapsRes.error) throw mapsRes.error
  if (followsRes.error) throw followsRes.error

  const mapRows = mapsRes.data || []
  const mapIds = mapRows.map((row) => row.id)
  const [featureRows, publicationRows] = await Promise.all([
    listFeaturesForMapIds(mapIds),
    listPublicationsForMapIds(mapIds),
  ])

  return {
    maps: mapRows.map((row) => normalizeMap(row, normalizePublication(publicationRows.find((item) => item.map_id === row.id)))),
    features: featureRows.map((row) => normalizeFeature(row)),
    shares: publicationRows.map((row) => normalizePublication(row)),
    followed: (followsRes.data || []).map((row) => row.following_id),
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
  const memoRows = await listMemosForFeatureIds(featureRows.map((row) => row.id))

  return {
    map: normalizeMap(mapRow, normalizePublication(publicationRow)),
    features: mergeFeaturesWithMemos(featureRows, memoRows),
    publication: normalizePublication(publicationRow),
  }
}

export async function getPublishedMapBySlug(slug, source = "link") {
  const supabase = requireSupabase()
  const { data: mapRow, error } = await supabase
    .from("maps")
    .select("*")
    .eq("slug", slug)
    .single()

  if (error) throw error

  const bundle = await getMapBundle(mapRow.id)
  await logMapView(mapRow.id, source)
  return bundle
}

export async function createMap(mapData = {}) {
  const user = await requireUser()
  const supabase = requireSupabase()
  const { data, error } = await supabase
    .from("maps")
    .insert({
      user_id: user.id,
      title: mapData.title?.trim() || "새 지도",
      description: mapData.description || "",
      theme: mapData.theme || DEFAULT_MAP_THEME,
      visibility: mapData.visibility || "private",
      tags: mapData.tags || [],
      category: mapData.category || "personal",
      config: mapData.config || {},
    })
    .select("*")
    .single()

  if (error) throw error
  return normalizeMap(data)
}

export async function updateMap(mapId, updates = {}) {
  const user = await requireUser()
  const supabase = requireSupabase()
  const payload = {
    updated_at: new Date().toISOString(),
  }

  if ("title" in updates) payload.title = updates.title?.trim() || "새 지도"
  if ("description" in updates) payload.description = updates.description || ""
  if ("theme" in updates) payload.theme = updates.theme || DEFAULT_MAP_THEME
  if ("visibility" in updates) payload.visibility = updates.visibility
  if ("tags" in updates) payload.tags = updates.tags || []
  if ("category" in updates) payload.category = updates.category || "personal"
  if ("config" in updates) payload.config = updates.config || {}
  if ("slug" in updates) payload.slug = updates.slug || null

  const { data, error } = await supabase
    .from("maps")
    .update(payload)
    .eq("id", mapId)
    .eq("user_id", user.id)
    .select("*")
    .single()

  if (error) throw error
  return normalizeMap(data)
}

export async function deleteMap(mapId) {
  const user = await requireUser()
  const supabase = requireSupabase()
  const { error } = await supabase.from("maps").delete().eq("id", mapId).eq("user_id", user.id)
  if (error) throw error
}

export async function createFeature(mapId, featureData) {
  await requireUser()
  const supabase = requireSupabase()
  const { data, error } = await supabase
    .from("map_features")
    .insert({
      map_id: mapId,
      ...toFeatureInsert(featureData, featureData.type || "pin"),
    })
    .select("*")
    .single()

  if (error) throw error
  await touchMapRecord(mapId)
  return normalizeFeature(data)
}

export async function updateFeature(featureId, updates) {
  await requireUser()
  const supabase = requireSupabase()
  const mapId = updates.mapId
  const { data, error } = await supabase
    .from("map_features")
    .update(toFeaturePatch(updates))
    .eq("id", featureId)
    .select("*")
    .single()

  if (error) throw error
  if (mapId) await touchMapRecord(mapId)
  return normalizeFeature(data)
}

export async function deleteFeature(featureId, mapId) {
  await requireUser()
  const supabase = requireSupabase()
  const { error } = await supabase.from("map_features").delete().eq("id", featureId)
  if (error) throw error
  if (mapId) await touchMapRecord(mapId)
}

export async function addFeatureMemo(featureId, text, userNameOverride = "") {
  const user = await requireUser()
  const supabase = requireSupabase()
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("nickname")
    .eq("id", user.id)
    .maybeSingle()

  if (profileError) throw profileError

  const { data, error } = await supabase
    .from("feature_memos")
    .insert({
      feature_id: featureId,
      user_id: user.id,
      user_name: userNameOverride || profile?.nickname || user.email || "User",
      text: text.trim(),
    })
    .select("*")
    .single()

  if (error) throw error
  return normalizeMemo(data)
}

export async function getFeatureMemos(featureId) {
  const supabase = requireSupabase()
  const { data, error } = await supabase
    .from("feature_memos")
    .select("*")
    .eq("feature_id", featureId)
    .order("created_at", { ascending: true })

  if (error) throw error
  return (data || []).map((row) => normalizeMemo(row))
}

export async function publishMap(mapId, options = {}) {
  const user = await requireUser()
  const supabase = requireSupabase()
  const now = new Date().toISOString()
  const slug = options.slug || createSlugCandidate(options.title || options.caption || mapId)

  const { data: mapRow, error: mapError } = await supabase
    .from("maps")
    .update({
      slug: slug || null,
      visibility: options.visibility || "unlisted",
      is_published: true,
      published_at: now,
      updated_at: now,
    })
    .eq("id", mapId)
    .eq("user_id", user.id)
    .select("*")
    .single()

  if (mapError) throw mapError

  const { data: publicationRow, error: publicationError } = await supabase
    .from("map_publications")
    .upsert(
      {
        map_id: mapId,
        caption: options.caption || "",
        likes_count: options.likes || 0,
        saves_count: options.saves || 0,
        published_at: now,
      },
      { onConflict: "map_id" },
    )
    .select("*")
    .single()

  if (publicationError) throw publicationError

  return {
    map: normalizeMap(mapRow, normalizePublication(publicationRow)),
    publication: normalizePublication(publicationRow),
  }
}

export async function unpublishMap(mapId) {
  const user = await requireUser()
  const supabase = requireSupabase()
  const now = new Date().toISOString()

  const [mapRes, publicationRes] = await Promise.all([
    supabase
      .from("maps")
      .update({
        is_published: false,
        visibility: "private",
        slug: null,
        updated_at: now,
      })
      .eq("id", mapId)
      .eq("user_id", user.id),
    supabase.from("map_publications").delete().eq("map_id", mapId),
  ])

  if (mapRes.error) throw mapRes.error
  if (publicationRes.error) throw publicationRes.error
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

export async function updateProfile(userId, updates = {}) {
  const user = await requireUser()
  if (user.id !== userId) throw new Error("자신의 프로필만 수정할 수 있습니다.")
  const supabase = requireSupabase()
  const { data, error } = await supabase
    .from("profiles")
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId)
    .select("*")
    .single()

  if (error) throw error
  return data
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

export async function followUser(targetUserId) {
  const user = await requireUser()
  const supabase = requireSupabase()
  const { error } = await supabase
    .from("follows")
    .insert({
      follower_id: user.id,
      following_id: targetUserId,
    })

  if (error) throw error
}

export async function unfollowUser(targetUserId) {
  const user = await requireUser()
  const supabase = requireSupabase()
  const { error } = await supabase
    .from("follows")
    .delete()
    .eq("follower_id", user.id)
    .eq("following_id", targetUserId)

  if (error) throw error
}

export async function logMapView(mapId, source = "link") {
  const supabase = requireSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { error } = await supabase.from("view_logs").insert({
    map_id: mapId,
    viewer_id: user?.id || null,
    source,
  })

  if (error) throw error
}
