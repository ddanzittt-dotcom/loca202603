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

function isMissingColumn(error, columnName = "") {
  if (!error) return false
  const message = `${error.message || ""}`.toLowerCase()
  const column = `${columnName || ""}`.toLowerCase()
  return error.code === "42703" && (!column || message.includes(column))
}

function isMissingStyleColumn(error) {
  if (!error) return false
  if (error.code === "42703") return true
  const message = `${error.message || ""}`.toLowerCase()
  return message.includes("style") && message.includes("column")
}

// migration 031 적용 전 환경 대응: emoji_kind/emoji_pixel_id/emoji_photo_url 컬럼이 없을 때.
function isMissingEmojiKindColumn(error) {
  if (!error) return false
  if (error.code !== "42703") return false
  const message = `${error.message || ""}`.toLowerCase()
  return message.includes("emoji_kind") || message.includes("emoji_pixel_id") || message.includes("emoji_photo_url")
}

function stripEmojiKindFromPayload(payload) {
  if (!payload || typeof payload !== "object") return payload
  const { emoji_kind, emoji_pixel_id, emoji_photo_url, ...rest } = payload
  void emoji_kind; void emoji_pixel_id; void emoji_photo_url
  return rest
}

function stripStyleFromPayload(payload) {
  if (!payload || typeof payload !== "object") return payload
  const { style, ...rest } = payload
  void style
  return rest
}

function stripUnsupportedFeatureColumns(payload, error) {
  const column = getMissingColumnName(error)
  if (column && Object.prototype.hasOwnProperty.call(payload || {}, column)) {
    if (column === "emoji_kind" || column === "emoji_pixel_id" || column === "emoji_photo_url") {
      return stripEmojiKindFromPayload(payload)
    }
    const { [column]: _missing, ...rest } = payload
    void _missing
    return rest
  }
  if (isMissingEmojiKindColumn(error)) return stripEmojiKindFromPayload(payload)
  if (isMissingStyleColumn(error)) return stripStyleFromPayload(payload)
  return payload
}

function getMissingColumnName(error) {
  if (!error) return null
  if (error.code !== "42703" && error.code !== "PGRST204") return null
  const message = `${error.message || ""}`
  return message.match(/'([^']+)'\s+column/i)?.[1]
    || message.match(/column\s+"([^"]+)"/i)?.[1]
    || null
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
  const user = await requireUser()
  const supabase = requireSupabase()
  let featurePayload = {
    map_id: mapId,
    ...toFeatureInsert(featureData, featureData.type || "pin"),
    // 보안: 작성자는 서버에서 인증된 사용자로 강제 (클라이언트가 보낸 createdBy 위조 차단)
    created_by: user.id,
  }
  let data = null
  let error = null

  // migration 031 (emoji_kind 등) 미적용 환경 폴백: 새 컬럼 제거 후 재시도.
  for (let attempt = 0; attempt < 8; attempt += 1) {
    ;({ data, error } = await supabase
      .from("map_features")
      .insert(featurePayload)
      .select("*")
      .single())
    if (!error) break

    const nextPayload = stripUnsupportedFeatureColumns(featurePayload, error)
    if (Object.keys(nextPayload).length === Object.keys(featurePayload).length) break
    featurePayload = nextPayload
  }

  if (error) throw error

  // 채집-우선 구조(050): 지도-기록 배치를 M:N 테이블에 이중 기록
  // (050 미적용 환경에서는 조용히 건너뜀 — C단계에서 조회 기준이 placements 로 전환됨)
  if (mapId && data?.id) {
    try {
      const { error: placementError } = await supabase
        .from("map_feature_placements")
        .insert({
          map_id: mapId,
          feature_id: data.id,
          sort_order: data.sort_order || 0,
          added_by: user?.id || null,
        })
      if (placementError) console.warn("placement dual-write skipped:", placementError.message)
    } catch {
      // 배치 테이블이 없어도 기록 생성은 성공으로 처리
    }
  }

  // 동네(region_name) 태깅 — 좌표로 역지오코딩해 DB에 기록 (best-effort, 저장·반환에 영향 없음).
  // 대시보드 "동네 도감"이 이 값을 쓴다. 없으면 동네가 안 잡힘.
  const gcLat = Number(data?.lat)
  const gcLng = Number(data?.lng)
  if (data?.id && Number.isFinite(gcLat) && Number.isFinite(gcLng) && (gcLat !== 0 || gcLng !== 0)) {
    reverseGeocodeAndTag(supabase, data.id, gcLat, gcLng).catch(() => {})
  }

  await touchMapRecord(mapId)
  return normalizeFeature(data)
}

/**
 * 기존 카드 동네 백필 — region_name 없는 좌표 카드를 역지오코딩해 DB·로컬에 태깅.
 * 지오코더 배려로 순차 처리 + 딜레이, max 개 상한. onTagged(id, regionName, regionCode) 콜백으로 로컬 반영.
 */
export async function backfillRegionNames(features, { onTagged, max = 30, delayMs = 220 } = {}) {
  let supabase
  try { supabase = requireSupabase() } catch { return 0 }
  const targets = (Array.isArray(features) ? features : []).filter((f) => {
    const lat = Number(f?.lat)
    const lng = Number(f?.lng)
    return f?.id && !f?.regionName && Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0)
  }).slice(0, max)
  let tagged = 0
  for (const f of targets) {
    const res = await reverseGeocodeAndTag(supabase, f.id, Number(f.lat), Number(f.lng)).catch(() => null)
    if (res?.regionName) { tagged += 1; onTagged?.(f.id, res.regionName, res.regionCode || null, res.updatedAt || null) }
    if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs))
  }
  return tagged
}

// 배치 테이블(050) 자체가 없는 환경만 하위호환으로 무시한다.
// RLS 거부 등 나머지 에러는 호출부까지 올려 사용자에게 실패를 알린다.
function isMissingPlacementsTable(error) {
  if (!error) return false
  return error.code === "42P01" || error.code === "PGRST205"
}

// 채집한 기록(대개 지도 없이 도감에 쌓인 것)을 지도에 담는다 — C단계 빌더용.
// 050 적용 후: M:N 배치(map_feature_placements)로 기록. 한 카드가 여러 지도에 담길 수 있다.
// 050 미적용/하위호환: 배치 테이블이 없으면 건너뛰고, 소속 지도가 없는 기록의 map_id 만 채운다.
// 카드 수와 무관하게 요청 3회(다음 순번 조회 + bulk upsert + map_id 보정)로 처리한다.
export async function placeFeaturesInMap(mapId, featureIds) {
  const user = await requireUser()
  const supabase = requireSupabase()
  const ids = (Array.isArray(featureIds) ? featureIds : [featureIds]).filter(Boolean)
  if (!mapId || ids.length === 0) return

  // 대상 지도의 기존 배치 뒤에 이어붙인다 — 기존 카드들과 sort_order 충돌 방지
  let placementsSupported = true
  let nextSortOrder = 0
  const { data: lastRows, error: lastError } = await supabase
    .from("map_feature_placements")
    .select("sort_order")
    .eq("map_id", mapId)
    .order("sort_order", { ascending: false })
    .limit(1)
  if (lastError) {
    if (!isMissingPlacementsTable(lastError)) throw lastError
    placementsSupported = false
  } else if (lastRows?.length) {
    nextSortOrder = (Number(lastRows[0].sort_order) || 0) + 1
  }

  if (placementsSupported) {
    // 이미 담긴 카드(UNIQUE 충돌)는 정상으로 취급 — ignoreDuplicates 로 건너뛴다
    const { error } = await supabase
      .from("map_feature_placements")
      .upsert(
        ids.map((featureId, index) => ({
          map_id: mapId,
          feature_id: featureId,
          sort_order: nextSortOrder + index,
          added_by: user?.id || null,
        })),
        { onConflict: "map_id,feature_id", ignoreDuplicates: true },
      )
    if (error) throw error
  }

  // 하위호환 보정: 아직 소속 지도가 없는 기록이면 map_id 도 채워 기존 조회에 노출
  const { error: legacyError } = await supabase
    .from("map_features")
    .update({ map_id: mapId })
    .in("id", ids)
    .is("map_id", null)
  if (legacyError) throw legacyError

  await touchMapRecord(mapId)
}

// 카드를 지도에서만 뺀다 — Place(카드)는 바인더에 남는다 (지도에서 빼기).
// 배치(map_feature_placements) 행 삭제 + 이 지도가 legacy map_id 였으면 null 로 되돌려
// 지도 조회에서 사라지게 한다. 다른 지도 배치는 그대로 유지된다.
export async function removeFeatureFromMap(mapId, featureId) {
  await requireUser()
  const supabase = requireSupabase()
  if (!mapId || !featureId) return

  const { error } = await supabase
    .from("map_feature_placements")
    .delete()
    .eq("map_id", mapId)
    .eq("feature_id", featureId)
  // 배치 테이블(050) 미적용 환경만 건너뛰고, 나머지 실패는 호출부로 올린다
  if (error && !isMissingPlacementsTable(error)) throw error

  const { error: legacyError } = await supabase
    .from("map_features")
    .update({ map_id: null })
    .eq("id", featureId)
    .eq("map_id", mapId)
  if (legacyError) throw legacyError

  await touchMapRecord(mapId)
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

  let patchPayload = toFeaturePatch(patchSource)
  let data = null
  let error = null

  for (let attempt = 0; attempt < 8; attempt += 1) {
    ;({ data, error } = await buildQuery(patchPayload))
    if (!error) break

    const nextPayload = stripUnsupportedFeatureColumns(patchPayload, error)
    if (Object.keys(nextPayload).length === Object.keys(patchPayload).length) break
    patchPayload = nextPayload
  }

  if (error) throw error
  if (!Array.isArray(data) || data.length === 0) {
    throw buildFeatureConflictError()
  }

  const savedFeature = data[0]
  if (mapId) await touchMapRecord(mapId)
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

export async function addFeatureMemo(featureId, text, userNameOverride = "", photoUrls = [], options = {}) {
  const user = await requireUser()
  const supabase = requireSupabase()
  const recordId = `${options?.recordId || ""}`.trim()
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
  if (recordId) {
    payload.record_id = recordId
  }
  if (normalizedPhotoUrls.length > 0) {
    payload.photo_urls = normalizedPhotoUrls
  }
  let { data, error } = await supabase
    .from("feature_memos")
    .insert(payload)
    .select("*")
    .single()

  let recordIdUnsupported = false
  if (error && getMissingColumnName(error) === "record_id") {
    recordIdUnsupported = true
    const { record_id, ...fallbackPayload } = payload
    void record_id
    ;({ data, error } = await supabase
      .from("feature_memos")
      .insert(fallbackPayload)
      .select("*")
      .single())
  }

  const shouldFallbackWithoutPhotoColumn = Boolean(error)
    && normalizedPhotoUrls.length > 0
    && (
      error.code === "42703"
      || `${error.message || ""}`.toLowerCase().includes("photo_urls")
    )
  if (shouldFallbackWithoutPhotoColumn) {
    const fallbackPayload = {
      feature_id: featureId,
      user_id: user.id,
      user_name: userNameOverride || profile?.nickname || "익명 사용자",
      text: text.trim(),
    }
    if (recordId && !recordIdUnsupported) {
      fallbackPayload.record_id = recordId
    }
    const fallback = await supabase
      .from("feature_memos")
      .insert(fallbackPayload)
      .select("*")
      .single()
    data = fallback.data
    error = fallback.error
    if (error && getMissingColumnName(error) === "record_id") {
      const { record_id, ...withoutRecordId } = fallbackPayload
      void record_id
      const retry = await supabase
        .from("feature_memos")
        .insert(withoutRecordId)
        .select("*")
        .single()
      data = retry.data
      error = retry.error
    }
  }

  if (error) throw error
  const memo = normalizeMemo(data)
  const memoWithRecordId = recordId && !memo.recordId ? { ...memo, recordId } : memo
  if (normalizedPhotoUrls.length > 0 && (!memo.photos || memo.photos.length === 0)) {
    return { ...memoWithRecordId, photos: normalizedPhotoUrls }
  }
  return memoWithRecordId
}

export async function updateFeatureMemo(memoId, text = "", options = {}) {
  await requireUser()
  const supabase = requireSupabase()
  const recordId = `${options?.recordId || ""}`.trim()
  const payload = { text: `${text || ""}`.trim() }
  if (recordId) {
    payload.record_id = recordId
  }
  let { data, error } = await supabase
    .from("feature_memos")
    .update(payload)
    .eq("id", memoId)
    .select("*")
    .single()

  if (error && getMissingColumnName(error) === "record_id") {
    const { record_id, ...fallbackPayload } = payload
    void record_id
    ;({ data, error } = await supabase
      .from("feature_memos")
      .update(fallbackPayload)
      .eq("id", memoId)
      .select("*")
      .single())
  }

  if (error) throw error
  const memo = normalizeMemo(data)
  return recordId && !memo.recordId ? { ...memo, recordId } : memo
}

export async function deleteFeatureMemo(memoId) {
  await requireUser()
  if (!memoId) return false
  const supabase = requireSupabase()
  const { error } = await supabase
    .from("feature_memos")
    .delete()
    .eq("id", memoId)

  if (error) throw error
  return true
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
        throw rpcRes.error || new Error(parsedRpcData?.error || "메모 저장에 실패했습니다.")
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

export async function createMediaRecord(featureId, { storagePath, publicUrl, mimeType, fileExt, sizeBytes, mediaType, duration, recordId }) {
  const supabase = requireSupabase()
  const payload = {
    feature_id: featureId,
    media_type: mediaType,
    storage_path: storagePath,
    public_url: publicUrl,
    mime_type: mimeType,
    file_ext: fileExt,
    size_bytes: sizeBytes || 0,
    duration_sec: duration ?? null,
  }
  if (recordId) {
    payload.record_id = recordId
  }

  let { data, error } = await supabase
    .from("feature_media")
    .insert(payload)
    .select("*")
    .single()

  if (error && getMissingColumnName(error) === "record_id") {
    const { record_id, ...fallbackPayload } = payload
    void record_id
    ;({ data, error } = await supabase
      .from("feature_media")
      .insert(fallbackPayload)
      .select("*")
      .single())
  }

  if (error) throw error
  const media = normalizeMedia(data)
  return recordId && !media.recordId ? { ...media, recordId } : media
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

function stripUnsupportedProfileColumns(payload, error) {
  const column = getMissingColumnName(error)
  if (!column || !Object.prototype.hasOwnProperty.call(payload || {}, column)) return payload
  const { [column]: _missing, ...rest } = payload
  void _missing
  return rest
}

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
  let payload = {
    ...updates,
    updated_at: new Date().toISOString(),
  }
  let data = null
  let error = null

  for (let attempt = 0; attempt < 8; attempt += 1) {
    ;({ data, error } = await supabase
      .from("profiles")
      .update(payload)
      .eq("id", userId)
      .select("*")
      .single())

    if (!error) break

    const nextPayload = stripUnsupportedProfileColumns(payload, error)
    if (Object.keys(nextPayload).length === Object.keys(payload).length) break
    payload = nextPayload
  }

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
  let { data, error } = await supabase
    .from("map_collaborators")
    .select("id, user_id, role, status, created_at, responded_at, profiles:user_id(nickname, avatar_url, slug)")
    .eq("map_id", mapId)
    .order("created_at", { ascending: true })

  if (error && isMissingColumn(error, "status")) {
    ;({ data, error } = await supabase
      .from("map_collaborators")
      .select("id, user_id, role, created_at, profiles:user_id(nickname, avatar_url, slug)")
      .eq("map_id", mapId)
      .order("created_at", { ascending: true }))
  }

  if (error) throw error
  return (data || []).map((row) => {
    const avatarValue = row.profiles?.avatar_url || ""
    const hasImageAvatar = avatarValue.startsWith("http") || avatarValue.startsWith("data:")
    const nickname = row.profiles?.nickname || "LOCA 사용자"
    return {
      id: row.id,
      userId: row.user_id,
      role: row.role,
      status: row.status || "accepted",
      nickname,
      handle: row.profiles?.slug ? `@${row.profiles.slug}` : "",
      avatarUrl: hasImageAvatar ? avatarValue : null,
      emoji: hasImageAvatar ? nickname.slice(0, 1) : (avatarValue || nickname.slice(0, 1) || "U"),
      createdAt: row.created_at,
      respondedAt: row.responded_at || null,
    }
  })
}

export async function addCollaborator(mapId, userId, role = "editor") {
  const supabase = requireSupabase()
  const user = await requireUser()
  const normalizedRole = ["editor", "viewer"].includes(role) ? role : "editor"
  const insertInvite = () => supabase
    .from("map_collaborators")
    .insert({ map_id: mapId, user_id: userId, role: normalizedRole, invited_by: user.id, status: "pending" })
    .select("id, user_id, role, status, created_at")
    .single()

  let { data, error } = await insertInvite()
  if (error && isMissingColumn(error, "status")) {
    throw new Error("초대 수락 기능을 사용하려면 Supabase 협업 초대 마이그레이션이 먼저 필요해요.")
  }
  if (error?.code === "23505") {
    const existingRes = await supabase
      .from("map_collaborators")
      .select("id, status")
      .eq("map_id", mapId)
      .eq("user_id", userId)
      .maybeSingle()
    if (!existingRes.error && existingRes.data?.id && existingRes.data.status !== "accepted") {
      await removeCollaborator(existingRes.data.id)
      ;({ data, error } = await insertInvite())
    }
  }
  if (error) throw error
  return data
}

export async function respondCollaborationInvite(inviteId, decision) {
  const supabase = requireSupabase()
  const normalizedDecision = decision === "accepted" ? "accepted" : "rejected"
  const { data, error } = await supabase.rpc("respond_map_collaboration_invite", {
    p_collaborator_id: inviteId,
    p_decision: normalizedDecision,
  })
  if (error) {
    if (isMissingRpc(error)) {
      throw new Error("초대 수락/거절 기능을 사용하려면 Supabase 협업 초대 마이그레이션이 먼저 필요해요.")
    }
    throw error
  }
  return Array.isArray(data) ? data[0] : data
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
