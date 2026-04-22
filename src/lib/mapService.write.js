import { requireSupabase } from "./supabase"
import {
  DEFAULT_MAP_THEME,
  requireUser,
  normalizeMap,
  normalizeFeature,
  normalizeMemo,
  normalizeMedia,
  toFeatureInsert,
  toFeaturePatch,
  touchMapRecord,
  reverseGeocodeAndTag,
} from "./mapService.utils"

// ─── Map CRUD ───

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

/**
 * Ensure the shared community map record exists.
 * - Fixed slug: community-map
 * - Return existing row if present, create once otherwise.
 */
export async function ensureCommunityMap() {
  const user = await requireUser()
  const supabase = requireSupabase()

  const existingRes = await supabase
    .from("maps")
    .select("*")
    .eq("slug", "community-map")
    .maybeSingle()

  if (existingRes.error) throw existingRes.error
  if (existingRes.data) {
    return normalizeMap({
      ...existingRes.data,
      user_role: existingRes.data.user_id === user.id ? "owner" : "viewer",
    })
  }

  const now = new Date().toISOString()
  const createRes = await supabase
    .from("maps")
    .insert({
      user_id: user.id,
      title: "모두의 지도",
      description: "모두가 함께 만드는 지도",
      theme: "#4F46E5",
      visibility: "public",
      slug: "community-map",
      tags: ["community"],
      category: "personal",
      config: { community: true },
      is_published: true,
      published_at: now,
    })
    .select("*")
    .single()

  if (createRes.error) {
    // Race: another user created the same slug first.
    if (createRes.error.code === "23505") {
      const refetch = await supabase
        .from("maps")
        .select("*")
        .eq("slug", "community-map")
        .maybeSingle()
      if (refetch.error) throw refetch.error
      if (refetch.data) {
        return normalizeMap({
          ...refetch.data,
          user_role: refetch.data.user_id === user.id ? "owner" : "viewer",
        })
      }
    }
    throw createRes.error
  }

  return normalizeMap({ ...createRes.data, user_role: "owner" })
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

// ─── Feature CRUD ───

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
  if (data.type === "pin" && data.lat && data.lng && data.lat !== 0 && data.lng !== 0) {
    reverseGeocodeAndTag(supabase, data.id, data.lat, data.lng).catch(() => {})
  }
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
  if (("lat" in updates || "lng" in updates) && data.lat && data.lng && data.lat !== 0 && data.lng !== 0) {
    reverseGeocodeAndTag(supabase, data.id, data.lat, data.lng).catch(() => {})
  }
  return normalizeFeature(data)
}

export async function deleteFeature(featureId, mapId) {
  await requireUser()
  const supabase = requireSupabase()
  const { error } = await supabase.from("map_features").delete().eq("id", featureId)
  if (error) throw error
  if (mapId) await touchMapRecord(mapId)
}

// ─── Memo ───

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
      user_name: userNameOverride || profile?.nickname || "익명 사용자",
      text: text.trim(),
    })
    .select("*")
    .single()

  if (error) throw error
  return normalizeMemo(data)
}

// ─── Media ───

export async function createMediaRecord(featureId, { storagePath, publicUrl, mimeType, fileExt, sizeBytes, mediaType, duration }) {
  const supabase = requireSupabase()
  const { data, error } = await supabase
    .from("feature_media")
    .insert({
      feature_id: featureId,
      media_type: mediaType,
      storage_path: storagePath,
      public_url: publicUrl,
      mime_type: mimeType,
      file_ext: fileExt,
      size_bytes: sizeBytes || 0,
      duration_sec: duration ?? null,
    })
    .select("*")
    .single()
  if (error) throw error
  return normalizeMedia(data)
}

export async function deleteMediaRecord(mediaId) {
  const supabase = requireSupabase()
  const { data, error } = await supabase
    .from("feature_media")
    .delete()
    .eq("id", mediaId)
    .select("storage_path")
    .maybeSingle()
  if (error) throw error
  return data?.storage_path || null
}

// ─── Profile ───

export async function uploadAvatar(userId, file) {
  const supabase = requireSupabase()
  const ext = (file.name || "avatar.jpg").split(".").pop() || "jpg"
  const path = `avatars/${userId}_${Date.now()}.${ext}`
  const { error } = await supabase.storage.from("media").upload(path, file, { upsert: true })
  if (error) throw error
  const { data } = supabase.storage.from("media").getPublicUrl(path)
  return data.publicUrl
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

// ─── Follow ───

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

// ─── Likes ───

/**
 * 발행 지도 좋아요 증가.
 * map_publications.likes_count를 +1 increment한다.
 * publicationId는 map_publications.id (또는 map_id로 조회).
 */
export async function incrementLike(mapId) {
  const supabase = requireSupabase()
  // map_publications에서 map_id로 찾아서 likes_count +1
  const { data: pub, error: findErr } = await supabase
    .from("map_publications")
    .select("id, likes_count")
    .eq("map_id", mapId)
    .single()

  if (findErr || !pub) return null

  const { error } = await supabase
    .from("map_publications")
    .update({ likes_count: (pub.likes_count || 0) + 1 })
    .eq("id", pub.id)

  if (error) throw error
  return { likesCount: (pub.likes_count || 0) + 1 }
}

// ─── Collaborators ───

export async function getCollaborators(mapId) {
  const supabase = requireSupabase()
  const { data, error } = await supabase
    .from("map_collaborators")
    .select("id, user_id, role, created_at, profiles:user_id(nickname, emoji)")
    .eq("map_id", mapId)
    .order("created_at", { ascending: true })

  if (error) throw error
  return (data || []).map((row) => ({
    id: row.id,
    userId: row.user_id,
    role: row.role,
    nickname: row.profiles?.nickname || "사용자",
    emoji: row.profiles?.emoji || "😀",
    createdAt: row.created_at,
  }))
}

export async function addCollaborator(mapId, userId) {
  const supabase = requireSupabase()
  const user = await requireUser()
  const { data, error } = await supabase
    .from("map_collaborators")
    .insert({ map_id: mapId, user_id: userId, role: "editor", invited_by: user.id })
    .select("id, user_id, role, created_at")
    .single()

  if (error) throw error
  return data
}

export async function removeCollaborator(collaboratorId) {
  const supabase = requireSupabase()
  const { error } = await supabase
    .from("map_collaborators")
    .delete()
    .eq("id", collaboratorId)

  if (error) throw error
}

// ─── Lineage ───

export async function linkMapLineage(parentMapId, childMapId, relationType = "import") {
  const supabase = requireSupabase()
  const { data, error } = await supabase.rpc("link_map_lineage", {
    p_parent_map_id: parentMapId,
    p_child_map_id: childMapId,
    p_relation_type: relationType,
  })
  if (error) throw error
  return typeof data === "string" ? JSON.parse(data) : data
}
