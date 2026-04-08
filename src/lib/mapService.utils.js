import { requireSupabase } from "./supabase"

/**
 * Supabase 에러를 ���용자 친화적 메시지로 변환한다.
 */
export function friendlySupabaseError(error) {
  if (!error) return "알 수 없는 오류가 발생했어요."
  const msg = (error.message || "").toLowerCase()
  const code = error.code || ""

  if (msg.includes("fetch") || msg.includes("network") || msg.includes("failed to fetch")) {
    return "네트워크 연결을 확인해주세요."
  }
  if (code === "42501" || msg.includes("permission") || msg.includes("policy")) {
    return "이 작업을 수행할 권한이 없어요."
  }
  if (code === "PGRST301" || msg.includes("jwt") || msg.includes("token")) {
    return "로그인이 만료되었어요. 다시 로그인해주세요."
  }
  if (code === "23505" || msg.includes("duplicate") || msg.includes("unique")) {
    return "이미 존재하는 데이터예요."
  }
  if (code === "PGRST116" || msg.includes("not found")) {
    return "요청한 데이터를 찾을 수 없어요."
  }
  if (msg.includes("500") || msg.includes("internal")) {
    return "서버에 문제가 생겼어요. 잠시 후 다시 시도해주세요."
  }
  return error.message || "알 수 없는 오류가 발생했어요."
}

export const DEFAULT_MAP_THEME = "#4F46E5"
export const DEFAULT_FEATURE_TITLE = "새 항목"

export function createSlugCandidate(value = "") {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-_\uAC00-\uD7AF\u3131-\u318E]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
  // slug가 비어있으면 랜덤 ID 생성
  return slug || `map-${Date.now().toString(36)}`
}

export function getDefaultEmoji(type) {
  if (type === "route") return "🛣️"
  if (type === "area") return "🟩"
  return "📍"
}

export function normalizePoints(points) {
  if (!Array.isArray(points)) return []
  return points
    .map((point) => {
      if (Array.isArray(point) && point.length >= 2) return [Number(point[0]), Number(point[1])]
      if (point && typeof point === "object") return [Number(point.lng), Number(point.lat)]
      return null
    })
    .filter((point) => point && Number.isFinite(point[0]) && Number.isFinite(point[1]))
}

export function normalizePublication(row) {
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

export function normalizeMap(row, publication = null) {
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

export function normalizeMemo(row) {
  return {
    id: row.id,
    userId: row.user_id,
    userName: row.user_name,
    date: row.created_at,
    text: row.text,
  }
}

export function normalizeMedia(row) {
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

export function normalizeFeature(row, memos = [], photos = [], voices = []) {
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
    return { ...base, lat: row.lat, lng: row.lng }
  }

  return { ...base, points: normalizePoints(row.points) }
}

export function toFeatureInsert(feature = {}, fallbackType = "pin") {
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

export function toFeaturePatch(updates = {}) {
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
export async function reverseGeocodeAndTag(supabase, featureId, lat, lng) {
  let regionName = null
  let regionCode = null

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

export async function requireUser() {
  const supabase = requireSupabase()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()
  if (error) throw error
  if (!user) throw new Error("Authentication is required.")
  return user
}

export async function touchMapRecord(mapId) {
  const supabase = requireSupabase()
  const { error } = await supabase
    .from("maps")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", mapId)

  if (error) throw error
}

export function mergeFeaturesWithMemos(featureRows, memoRows, mediaRows = []) {
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
