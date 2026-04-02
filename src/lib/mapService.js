import { requireSupabase } from "./supabase"
import { getSessionId } from "./analytics"

/**
 * Supabase 에러를 사용자 친화적 메시지로 변환한다.
 */
export function friendlySupabaseError(error) {
  if (!error) return "알 수 없는 오류가 발생했어요."
  const msg = (error.message || "").toLowerCase()
  const code = error.code || ""

  // 네트워크 에러
  if (msg.includes("fetch") || msg.includes("network") || msg.includes("failed to fetch")) {
    return "네트워크 연결을 확인해주세요."
  }
  // 권한 에러
  if (code === "42501" || msg.includes("permission") || msg.includes("policy")) {
    return "이 작업을 수행할 권한이 없어요."
  }
  // 인증 만료
  if (code === "PGRST301" || msg.includes("jwt") || msg.includes("token")) {
    return "로그인이 만료되었어요. 다시 로그인해주세요."
  }
  // 중복
  if (code === "23505" || msg.includes("duplicate") || msg.includes("unique")) {
    return "이미 존재하는 데이터예요."
  }
  // 찾을 수 없음
  if (code === "PGRST116" || msg.includes("not found")) {
    return "요청한 데이터를 찾을 수 없어요."
  }
  // 서버 에러
  if (msg.includes("500") || msg.includes("internal")) {
    return "서버에 문제가 생겼어요. 잠시 후 다시 시도해주세요."
  }
  return error.message || "알 수 없는 오류가 발생했어요."
}

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

function normalizeFeature(row, memos = [], photos = [], voices = []) {
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
    regionCode: row.region_code || null,
    regionName: row.region_name || null,
    memos,
    photos,
    voices,
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

/**
 * 역지오코딩으로 행정구역 정보를 가져와 DB에 태깅한다.
 * 네이버 지도 API 우선, 실패 시 Nominatim fallback.
 * 실패해도 핀 저장에 영향 없음 (fire-and-forget).
 */
async function reverseGeocodeAndTag(supabase, featureId, lat, lng) {
  let regionName = null
  let regionCode = null

  // 1) 네이버 역지오코딩 시도
  try {
    if (window.naver?.maps?.Service) {
      const result = await new Promise((resolve, reject) => {
        window.naver.maps.Service.reverseGeocode(
          { coords: new window.naver.maps.LatLng(lat, lng), orders: "legalcode,addr" },
          (status, response) => {
            if (status !== window.naver.maps.Service.Status.OK) return reject(new Error("naver rg fail"))
            resolve(response)
          },
        )
      })
      const items = result?.v2?.results || []
      const legalItem = items.find((i) => i.name === "legalcode") || items[0]
      if (legalItem) {
        const r = legalItem.region
        regionName = [r.area1?.name, r.area2?.name, r.area3?.name, r.area4?.name]
          .filter(Boolean).join(" ")
        regionCode = legalItem.code?.id || null
      }
    }
  } catch { /* 네이버 실패 시 Nominatim fallback */ }

  // 2) Nominatim fallback
  if (!regionName) {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=ko&zoom=16`,
        { headers: { "User-Agent": "LOCA-App/1.0" } },
      )
      if (res.ok) {
        const json = await res.json()
        const addr = json.address || {}
        regionName = [addr.city || addr.state, addr.borough || addr.county, addr.suburb || addr.neighbourhood || addr.quarter]
          .filter(Boolean).join(" ")
      }
    } catch { /* 무시 */ }
  }

  if (!regionName) return

  await supabase
    .from("map_features")
    .update({ region_name: regionName, region_code: regionCode })
    .eq("id", featureId)
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
    .eq("status", "visible")
    .order("created_at", { ascending: true })

  if (error) throw error
  return data || []
}

function mergeFeaturesWithMemos(featureRows, memoRows, mediaRows = []) {
  const memosByFeatureId = memoRows.reduce((acc, row) => {
    const current = acc.get(row.feature_id) || []
    current.push(normalizeMemo(row))
    acc.set(row.feature_id, current)
    return acc
  }, new Map())

  const photosByFeatureId = new Map()
  const voicesByFeatureId = new Map()
  for (const row of mediaRows) {
    const m = normalizeMedia(row)
    const entry = { id: m.id, date: m.date, url: m.url, storagePath: m.storagePath }
    if (m.type === "photo") {
      const arr = photosByFeatureId.get(row.feature_id) || []
      arr.push(entry)
      photosByFeatureId.set(row.feature_id, arr)
    } else if (m.type === "voice") {
      const arr = voicesByFeatureId.get(row.feature_id) || []
      arr.push({ ...entry, duration: m.duration })
      voicesByFeatureId.set(row.feature_id, arr)
    }
  }

  return featureRows.map((row) => normalizeFeature(
    row,
    memosByFeatureId.get(row.id) || [],
    photosByFeatureId.get(row.id) || [],
    voicesByFeatureId.get(row.id) || [],
  ))
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
  // 핀이면 행정구역 비동기 태깅 (실패해도 무시)
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
  // 위치가 바뀌었으면 행정구역 재태깅
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

// ─── Feature Media ───

function normalizeMedia(row) {
  return {
    id: row.id,
    featureId: row.feature_id,
    type: row.media_type,
    url: row.public_url,
    storagePath: row.storage_path,
    mimeType: row.mime_type,
    ext: row.file_ext,
    sizeBytes: row.size_bytes,
    duration: row.duration_sec ?? null,
    date: row.created_at,
  }
}

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

// ─── B2B/B2G 초대코드 ───

export async function redeemInvitationCode(codeText) {
  const supabase = requireSupabase()
  const { data, error } = await supabase.rpc("redeem_invitation_code", {
    code_text: codeText.trim(),
  })
  if (error) throw error
  return data // { success: boolean, error?: string }
}

export async function checkB2BAccess() {
  const supabase = requireSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return false

  const { data, error } = await supabase
    .from("invitation_redemptions")
    .select("id")
    .eq("user_id", user.id)
    .limit(1)

  if (error) return false
  return data.length > 0
}

export async function checkAdminRole() {
  // profiles 테이블에 role 컬럼이 없으므로 비활성화
  return false
}

// ─── 공지사항 ───

export async function getActiveAnnouncements(mapId) {
  const supabase = requireSupabase()
  const { data, error } = await supabase
    .from("announcements")
    .select("id, title, body, created_at")
    .eq("map_id", mapId)
    .eq("is_active", true)
    .order("created_at", { ascending: false })

  if (error) throw error
  return data || []
}

export async function getAllAnnouncements(mapId) {
  const supabase = requireSupabase()
  const { data, error } = await supabase
    .from("announcements")
    .select("id, title, body, is_active, created_at, updated_at")
    .eq("map_id", mapId)
    .order("created_at", { ascending: false })

  if (error) throw error
  return data || []
}

export async function createAnnouncement(mapId, { title, body }) {
  const supabase = requireSupabase()
  const { data, error } = await supabase
    .from("announcements")
    .insert({ map_id: mapId, title: title.trim(), body: (body || "").trim() })
    .select("*")
    .single()

  if (error) throw error
  return data
}

export async function updateAnnouncement(announcementId, { title, body }) {
  const supabase = requireSupabase()
  const { data, error } = await supabase
    .from("announcements")
    .update({ title: title.trim(), body: (body || "").trim() })
    .eq("id", announcementId)
    .select("*")
    .single()

  if (error) throw error
  return data
}

export async function toggleAnnouncementActive(announcementId, isActive) {
  const supabase = requireSupabase()
  const { error } = await supabase
    .from("announcements")
    .update({ is_active: isActive })
    .eq("id", announcementId)

  if (error) throw error
}

export async function deleteAnnouncement(announcementId) {
  const supabase = requireSupabase()
  const { error } = await supabase
    .from("announcements")
    .delete()
    .eq("id", announcementId)

  if (error) throw error
}

// ─── 협업자 ───

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

// ─── 유저 통계 (게이미피케이션) ───

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

export async function upsertUserStats(stats) {
  const supabase = requireSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const { error } = await supabase
    .from("user_stats")
    .upsert({
      user_id: user.id,
      xp: stats.xp || 0,
      level: stats.level || 1,
      checkins: stats.checkins || 0,
      completions: stats.completions || 0,
      memos: stats.memos || 0,
      imports: stats.imports || 0,
      publishes: stats.publishes || 0,
      streak_days: stats.streak || 0,
      regions: stats.regions || 0,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" })

  if (error) throw error
}

export async function updateStreak() {
  const supabase = requireSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  await supabase.rpc("update_user_streak", { p_user_id: user.id }).catch(() => {})
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

export async function awardBadge(badgeId) {
  const supabase = requireSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data, error } = await supabase
    .from("user_badges")
    .upsert({ user_id: user.id, badge_id: badgeId }, { onConflict: "user_id,badge_id" })
    .select("badge_id, earned_at")
    .single()

  if (error && error.code !== "23505") throw error // 중복 무시
  return data
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

// ─── 설문 ───

export async function submitSurveyResponse(mapId, { rating, comment }) {
  const supabase = requireSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { error } = await supabase.from("survey_responses").insert({
    map_id: mapId,
    session_id: getSessionId(),
    user_id: user?.id || null,
    rating,
    comment: comment || "",
    answers: {},
  })

  if (error) throw error
}
