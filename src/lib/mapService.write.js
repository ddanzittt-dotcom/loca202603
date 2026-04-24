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
import { normalizeFeatureStyle } from "./featureStyle"

function parseRpcResult(data) {
  if (typeof data === "string") {
    try {
      return JSON.parse(data)
    } catch {
      return null
    }
  }
  return data || null
}

function buildFeatureConflictError() {
  const error = new Error("Feature was changed by another editor.")
  error.code = "LOCA_CONFLICT"
  return error
}

function isMissingRpc(error) {
  if (!error) return false
  return error.code === "42883" || error.code === "PGRST202"
}

function isMissingStyleColumn(error) {
  if (!error) return false
  if (error.code === "42703") return true
  const message = `${error.message || ""}`.toLowerCase()
  return message.includes("style") && message.includes("column")
}

async function applyFeatureStyleFromRequestPayload(supabase, featureId, payload) {
  if (!featureId) return
  if (!payload || typeof payload !== "object") return
  if (!Object.prototype.hasOwnProperty.call(payload, "style")) return
  const type = payload.type || "pin"
  const style = normalizeFeatureStyle(payload.style, type)
  const { error } = await supabase
    .from("map_features")
    .update({ style })
    .eq("id", featureId)
  if (error && !isMissingStyleColumn(error)) throw error
}

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
  const { error } = await supabase
    .from("maps")
    .delete()
    .eq("id", mapId)
    .eq("user_id", user.id)
  if (error) throw error
}

// ─── Feature CRUD ───

export async function createFeature(mapId, featureData) {
  await requireUser()
  const supabase = requireSupabase()
  const featurePayload = {
    map_id: mapId,
    ...toFeatureInsert(featureData, featureData.type || "pin"),
  }
  let { data, error } = await supabase
    .from("map_features")
    .insert(featurePayload)
    .select("*")
    .single()

  if (error && isMissingStyleColumn(error) && Object.prototype.hasOwnProperty.call(featurePayload, "style")) {
    const { style: _style, ...legacyPayload } = featurePayload
    ;({ data, error } = await supabase
      .from("map_features")
      .insert(legacyPayload)
      .select("*")
      .single())
  }

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
  const { mapId, lastKnownUpdatedAt, ...patchSource } = updates || {}

  const buildQuery = (patchPayload) => {
    let query = supabase
      .from("map_features")
      .update(patchPayload)
      .eq("id", featureId)
    if (lastKnownUpdatedAt) {
      query = query.eq("updated_at", lastKnownUpdatedAt)
    }
    return query.select("*")
  }

  const patchPayload = toFeaturePatch(patchSource)
  let { data, error } = await buildQuery(patchPayload)

  if (error && isMissingStyleColumn(error) && Object.prototype.hasOwnProperty.call(patchPayload, "style")) {
    const { style: _style, ...legacyPatch } = patchPayload
    ;({ data, error } = await buildQuery(legacyPatch))
  }

  if (error) throw error
  if (!Array.isArray(data) || data.length === 0) {
    throw buildFeatureConflictError()
  }

  const savedFeature = data[0]
  if (mapId) await touchMapRecord(mapId)
  if (("lat" in patchSource || "lng" in patchSource)
    && savedFeature.lat
    && savedFeature.lng
    && savedFeature.lat !== 0
    && savedFeature.lng !== 0) {
    reverseGeocodeAndTag(supabase, savedFeature.id, savedFeature.lat, savedFeature.lng).catch(() => {})
  }
  return normalizeFeature(savedFeature)
}

export async function deleteFeature(featureId, mapId, options = {}) {
  await requireUser()
  const supabase = requireSupabase()
  const { lastKnownUpdatedAt } = options || {}
  let query = supabase
    .from("map_features")
    .delete()
    .eq("id", featureId)
  if (lastKnownUpdatedAt) {
    query = query.eq("updated_at", lastKnownUpdatedAt)
  }
  const { data, error } = await query.select("id")
  if (error) throw error
  if (lastKnownUpdatedAt && (!Array.isArray(data) || data.length === 0)) {
    throw buildFeatureConflictError()
  }
  if (mapId) await touchMapRecord(mapId)
}

// ─── Memo ───

export async function addFeatureMemo(featureId, text, userNameOverride = "", photoUrls = []) {
  const user = await requireUser()
  const supabase = requireSupabase()
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("nickname")
    .eq("id", user.id)
    .maybeSingle()

  if (profileError) throw profileError

  const normalizedPhotoUrls = Array.isArray(photoUrls)
    ? photoUrls.map((url) => `${url || ""}`.trim()).filter(Boolean).slice(0, 4)
    : []
  const payload = {
    feature_id: featureId,
    user_id: user.id,
    user_name: userNameOverride || profile?.nickname || "익명 사용자",
    text: text.trim(),
  }
  if (normalizedPhotoUrls.length > 0) {
    payload.photo_urls = normalizedPhotoUrls
  }
  let { data, error } = await supabase
    .from("feature_memos")
    .insert(payload)
    .select("*")
    .single()

  const shouldFallbackWithoutPhotoColumn = Boolean(error)
    && normalizedPhotoUrls.length > 0
    && (
      error.code === "42703"
      || `${error.message || ""}`.toLowerCase().includes("photo_urls")
    )
  if (shouldFallbackWithoutPhotoColumn) {
    const fallback = await supabase
      .from("feature_memos")
      .insert({
        feature_id: featureId,
        user_id: user.id,
        user_name: userNameOverride || profile?.nickname || "익명 사용자",
        text: text.trim(),
      })
      .select("*")
      .single()
    data = fallback.data
    error = fallback.error
  }

  if (error) throw error
  const memo = normalizeMemo(data)
  if (normalizedPhotoUrls.length > 0 && (!memo.photos || memo.photos.length === 0)) {
    return { ...memo, photos: normalizedPhotoUrls }
  }
  return memo
}

export async function saveFeatureOperatorNote(featureId, note = "") {
  if (!featureId) return null
  const user = await requireUser()
  const supabase = requireSupabase()
  const normalizedNote = `${note || ""}`.slice(0, 4000)

  const rpcRes = await supabase.rpc("upsert_feature_operator_note", {
    p_feature_id: featureId,
    p_note: normalizedNote,
  })
  const parsedRpcData = parseRpcResult(rpcRes.data)
  const rpcSuccess = (
    !rpcRes.error
    && (!parsedRpcData || typeof parsedRpcData !== "object" || !("success" in parsedRpcData) || parsedRpcData.success === true)
  )
  if (rpcSuccess) {
    return parsedRpcData || { success: true, feature_id: featureId }
  }

  const shouldFallback = (
    (!rpcRes.error && parsedRpcData?.success === false)
    || rpcRes.error?.code === "42883"
    || rpcRes.error?.code === "42P01"
    || rpcRes.error?.code === "42501"
  )
  if (!shouldFallback) {
    throw rpcRes.error || new Error(parsedRpcData?.error || "운영자 메모 저장에 실패했습니다.")
  }

  const mapRes = await supabase
    .from("map_features")
    .select("map_id")
    .eq("id", featureId)
    .maybeSingle()
  if (mapRes.error) throw mapRes.error
  if (!mapRes.data?.map_id) return null

  const fallbackRes = await supabase
    .from("feature_operator_notes")
    .upsert(
      {
        feature_id: featureId,
        map_id: mapRes.data.map_id,
        note: normalizedNote,
        updated_by: user.id,
      },
      { onConflict: "feature_id" },
    )
  if (fallbackRes.error) throw fallbackRes.error
  return { success: true, feature_id: featureId, map_id: mapRes.data.map_id }
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

export async function incrementLike(mapId) {
  const supabase = requireSupabase()
  const rpcRes = await supabase.rpc("increment_map_publication_like", {
    p_map_id: mapId,
  })
  if (!rpcRes.error) {
    if (rpcRes.data == null) return null
    return { likesCount: Number(rpcRes.data) || 0 }
  }
  if (!isMissingRpc(rpcRes.error)) {
    throw rpcRes.error
  }

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

export async function addCollaborator(mapId, userId, role = "editor") {
  const supabase = requireSupabase()
  const user = await requireUser()
  const normalizedRole = ["operator", "editor", "viewer"].includes(role) ? role : "editor"
  const { data, error } = await supabase
    .from("map_collaborators")
    .insert({ map_id: mapId, user_id: userId, role: normalizedRole, invited_by: user.id })
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

export async function createFeatureChangeRequest(mapId, action, featureId = null, payload = {}) {
  const user = await requireUser()
  const supabase = requireSupabase()
  const { data, error } = await supabase
    .from("feature_change_requests")
    .insert({
      map_id: mapId,
      feature_id: featureId,
      action,
      payload: payload || {},
      status: "pending",
      requested_by: user.id,
    })
    .select("id,map_id,feature_id,action,status,created_at")
    .single()

  if (error) throw error
  return data
}

export async function resolveFeatureChangeRequest(requestId, decision, reviewNote = "") {
  const user = await requireUser()
  const supabase = requireSupabase()
  const normalizedDecision = decision === "approved" ? "approved" : "rejected"
  const normalizedReviewNote = `${reviewNote || ""}`.slice(0, 2000)

  const rpcRes = await supabase.rpc("resolve_feature_change_request_tx", {
    p_request_id: requestId,
    p_decision: normalizedDecision,
    p_review_note: normalizedReviewNote,
  })

  if (!rpcRes.error) {
    const parsed = parseRpcResult(rpcRes.data)
    if (!parsed || typeof parsed !== "object" || !("success" in parsed) || parsed.success === true) {
      if (normalizedDecision === "approved") {
        try {
          const requestMetaRes = await supabase
            .from("feature_change_requests")
            .select("action,payload")
            .eq("id", requestId)
            .maybeSingle()
          const requestMeta = requestMetaRes.data
          if (!requestMetaRes.error && requestMeta && (requestMeta.action === "insert" || requestMeta.action === "update")) {
            await applyFeatureStyleFromRequestPayload(
              supabase,
              parsed?.feature_id || null,
              requestMeta.payload && typeof requestMeta.payload === "object" ? requestMeta.payload : {},
            )
          }
        } catch (styleError) {
          console.warn("Failed to apply style after RPC resolve:", styleError)
        }
      }
      return parsed || { success: true, id: requestId, status: normalizedDecision }
    }
    const err = new Error(parsed.error || "승인 요청 처리에 실패했습니다.")
    err.code = "LOCA_REQUEST_RESOLVE_FAILED"
    err.details = parsed
    throw err
  }
  if (!isMissingRpc(rpcRes.error)) {
    throw rpcRes.error
  }

  // Legacy fallback when transactional RPC is unavailable.
  const requestRes = await supabase
    .from("feature_change_requests")
    .select("id,map_id,feature_id,action,payload,status")
    .eq("id", requestId)
    .single()
  if (requestRes.error) throw requestRes.error
  const request = requestRes.data
  if (!request || request.status !== "pending") {
    const err = new Error("이미 처리된 요청입니다.")
    err.code = "LOCA_REQUEST_ALREADY_REVIEWED"
    throw err
  }

  const payload = request.payload && typeof request.payload === "object" ? request.payload : {}
  let appliedFeatureId = request.feature_id

  if (normalizedDecision === "approved") {
    if (request.action === "insert") {
      const insertRes = await supabase
        .from("map_features")
        .insert({
          map_id: request.map_id,
          ...toFeatureInsert(payload, payload.type || "pin"),
        })
        .select("id")
        .single()
      if (insertRes.error) throw insertRes.error
      appliedFeatureId = insertRes.data.id
    } else if (request.action === "update") {
      if (!request.feature_id) throw new Error("수정 요청에 feature_id가 없습니다.")
      const updateRes = await supabase
        .from("map_features")
        .update(toFeaturePatch(payload))
        .eq("id", request.feature_id)
        .eq("map_id", request.map_id)
        .select("id")
      if (updateRes.error) throw updateRes.error
      if (!Array.isArray(updateRes.data) || updateRes.data.length === 0) {
        throw new Error("수정 대상 항목을 찾을 수 없습니다.")
      }
      appliedFeatureId = updateRes.data[0].id
    } else if (request.action === "delete") {
      if (!request.feature_id) throw new Error("삭제 요청에 feature_id가 없습니다.")
      const deleteRes = await supabase
        .from("map_features")
        .delete()
        .eq("id", request.feature_id)
        .eq("map_id", request.map_id)
        .select("id")
      if (deleteRes.error) throw deleteRes.error
      if (!Array.isArray(deleteRes.data) || deleteRes.data.length === 0) {
        throw new Error("삭제 대상 항목을 찾을 수 없습니다.")
      }
      appliedFeatureId = request.feature_id
    } else {
      throw new Error("지원하지 않는 요청 유형입니다.")
    }

    if (request.action === "insert" || request.action === "update") {
      await applyFeatureStyleFromRequestPayload(supabase, appliedFeatureId, payload)
    }

    if ((request.action === "insert" || request.action === "update") && Object.prototype.hasOwnProperty.call(payload, "operatorNote")) {
      await saveFeatureOperatorNote(appliedFeatureId, `${payload.operatorNote || ""}`)
    }
    await touchMapRecord(request.map_id)
  }

  const now = new Date().toISOString()
  const resolveRes = await supabase
    .from("feature_change_requests")
    .update({
      status: normalizedDecision,
      reviewed_by: user.id,
      review_note: normalizedReviewNote,
      reviewed_at: now,
      feature_id: appliedFeatureId || request.feature_id || null,
      updated_at: now,
    })
    .eq("id", request.id)
    .eq("status", "pending")
    .select("id,status,reviewed_at,review_note,feature_id")

  if (resolveRes.error) throw resolveRes.error
  if (!Array.isArray(resolveRes.data) || resolveRes.data.length === 0) {
    const err = new Error("이미 처리된 요청입니다.")
    err.code = "LOCA_REQUEST_ALREADY_REVIEWED"
    throw err
  }
  return { success: true, ...resolveRes.data[0] }
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
  return parseRpcResult(data)
}
