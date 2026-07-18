import { requireSupabase } from "./supabase"
import { normalizeFeatureStyle } from "./featureStyle"

/**
 * Supabase 에러를 사용자 친화적 메시지로 변환한다.
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
const LEGACY_EMOJI_PREFIX = "loca-emoji:"

function encodeLegacyEmojiDescriptor(kind, value, type) {
  if (kind === "pixel" && value) return `${LEGACY_EMOJI_PREFIX}pixel:${value}`
  if (kind === "photo" && value) return `${LEGACY_EMOJI_PREFIX}photo:${value}`
  return getDefaultEmoji(type)
}

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

// 공유 링크용 짧은 랜덤 slug (loca.im/s/xxxxxxx).
// 제목 기반 한글 slug 는 URL 인코딩으로 3배 길어져 공유 링크에는 쓰지 않는다.
// 혼동되기 쉬운 문자(l·1·o·0·i)는 제외 — 구두로 불러줄 때 오타 방지.
export function createShortShareSlug(length = 7) {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789"
  const bytes = new Uint8Array(length)
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes)
  } else {
    for (let i = 0; i < length; i += 1) bytes[i] = Math.floor(Math.random() * 256)
  }
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("")
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
  const userRole = row.user_role || (row.user_id ? "owner" : null)
  const collabCount = Number(
    row.collab_count
    ?? row.collabCount
    ?? row.collaborator_count
    ?? row.collaboratorCount
    ?? 0,
  )
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
    ownerId: row.user_id || null,
    userRole,
    collabCount,
    collaboratorCount: collabCount,
    canManage: !userRole || userRole === "owner",
    canEditFeatures: userRole !== "viewer",
    isCommunity: row.slug === "community-map" || row.config?.community === true,
    publication,
  }
}

export function normalizeMemo(row) {
  const rawPhotos = row?.photo_urls
  const parsedPhotos = Array.isArray(rawPhotos)
    ? rawPhotos
    : typeof rawPhotos === "string"
      ? (() => {
        try {
          const parsed = JSON.parse(rawPhotos)
          return Array.isArray(parsed) ? parsed : []
        } catch {
          return []
        }
      })()
      : []
  const photos = parsedPhotos
    .map((url) => `${url || ""}`.trim())
    .filter(Boolean)
  return {
    id: row.id,
    userId: row.user_id,
    userName: row.user_name,
    date: row.created_at,
    text: row.text,
    photos,
    recordId: row.record_id || null,
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
    recordId: row.record_id || null,
  }
}

export function normalizeFeature(row, memos = [], photos = []) {
  // 새 컬럼 (emoji_kind/emoji_pixel_id/emoji_photo_url) 우선,
  // 없으면 레거시 emoji 문자열을 unicode 로 폴백.
  const rawKind = row.emoji_kind || null
  const emojiKind = rawKind === "pixel" || rawKind === "photo" ? rawKind : "unicode"
  const unicodeEmoji = row.emoji || getDefaultEmoji(row.type)
  const base = {
    id: row.id,
    mapId: row.map_id,
    type: row.type,
    title: row.title || DEFAULT_FEATURE_TITLE,
    emoji: unicodeEmoji,
    emojiKind,
    emojiPixelId: row.emoji_pixel_id || null,
    emojiPhotoUrl: row.emoji_photo_url || null,
    tags: row.tags || [],
    note: row.note || "",
    highlight: Boolean(row.highlight),
    updatedAt: row.updated_at || row.created_at,
    createdBy: row.created_by || null,
    createdByName: row.created_by_name || null,
    isSample: Boolean(row.is_sample),
    sampleBatch: row.sample_batch || null,
    sampleKey: row.sample_key || null,
    regionCode: row.region_code || null,
    regionName: row.region_name || null,
    style: normalizeFeatureStyle(row.style, row.type),
    memos,
    photos,
  }

  if (row.type === "pin") {
    return { ...base, lat: row.lat, lng: row.lng }
  }

  return { ...base, points: normalizePoints(row.points) }
}

export function toFeatureInsert(feature = {}, fallbackType = "pin") {
  const type = feature.type || fallbackType
  const kindRaw = feature.emojiKind
  const emojiKind = kindRaw === "pixel" || kindRaw === "photo" ? kindRaw : "unicode"
  // emoji TEXT 컬럼: unicode 종류일 때만 의미, 그 외에는 기본 폴백 글자(레거시 클라이언트 대응).
  const emojiText = emojiKind === "unicode"
    ? (feature.emoji || getDefaultEmoji(type))
    : encodeLegacyEmojiDescriptor(emojiKind, emojiKind === "pixel" ? feature.emojiPixelId : feature.emojiPhotoUrl, type)
  const payload = {
    type,
    title: feature.title?.trim() || DEFAULT_FEATURE_TITLE,
    emoji: emojiText,
    emoji_kind: emojiKind,
    emoji_pixel_id: emojiKind === "pixel" ? (feature.emojiPixelId || null) : null,
    emoji_photo_url: emojiKind === "photo" ? (feature.emojiPhotoUrl || null) : null,
    tags: feature.tags || [],
    note: feature.note || "",
    highlight: Boolean(feature.highlight),
    sort_order: feature.sortOrder || 0,
    created_by: feature.createdBy || null,
    created_by_name: feature.createdByName || null,
    style: normalizeFeatureStyle(feature.style, type),
    updated_at: new Date().toISOString(),
  }

  if ("isSample" in feature) payload.is_sample = Boolean(feature.isSample)
  if ("sampleBatch" in feature) payload.sample_batch = feature.sampleBatch || null
  if ("sampleKey" in feature) payload.sample_key = feature.sampleKey || null

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

  // 이모지 3종 필드는 묶음으로 처리 — kind 가 명시되면 전체를 동기화.
  if ("emojiKind" in updates || "emojiPixelId" in updates || "emojiPhotoUrl" in updates || "emoji" in updates) {
    const kindRaw = updates.emojiKind
    const kind = kindRaw === "pixel" || kindRaw === "photo" ? kindRaw : "unicode"
    payload.emoji_kind = kind
    payload.emoji_pixel_id = kind === "pixel" ? (updates.emojiPixelId || null) : null
    payload.emoji_photo_url = kind === "photo" ? (updates.emojiPhotoUrl || null) : null
    payload.emoji = kind === "unicode"
      ? (updates.emoji || getDefaultEmoji(updates.type))
      : encodeLegacyEmojiDescriptor(kind, kind === "pixel" ? updates.emojiPixelId : updates.emojiPhotoUrl, updates.type)
  }

  if ("tags" in updates) payload.tags = updates.tags || []
  if ("note" in updates) payload.note = updates.note || ""
  if ("highlight" in updates) payload.highlight = Boolean(updates.highlight)
  if ("sortOrder" in updates) payload.sort_order = updates.sortOrder || 0
  if ("createdBy" in updates) payload.created_by = updates.createdBy
  if ("createdByName" in updates) payload.created_by_name = updates.createdByName
  if ("isSample" in updates) payload.is_sample = Boolean(updates.isSample)
  if ("sampleBatch" in updates) payload.sample_batch = updates.sampleBatch || null
  if ("sampleKey" in updates) payload.sample_key = updates.sampleKey || null
  if ("style" in updates) payload.style = normalizeFeatureStyle(updates.style, updates.type || "pin")
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

  // 카카오 지오코더 우선 (앱이 카카오맵 사용, services 라이브러리 로드됨)
  try {
    if (window.kakao?.maps?.services?.Geocoder) {
      const geocoder = new window.kakao.maps.services.Geocoder()
      const result = await new Promise((resolve, reject) => {
        geocoder.coord2regioncode(lng, lat, (res, status) => {
          if (status !== window.kakao.maps.services.Status.OK || !Array.isArray(res) || !res.length) {
            return reject(new Error("kakao rg fail"))
          }
          resolve(res)
        })
      })
      const item = result.find((r) => r.region_type === "B") || result[0]
      if (item) {
        regionName = [item.region_1depth_name, item.region_2depth_name, item.region_3depth_name]
          .filter(Boolean).join(" ")
        regionCode = item.code || null
      }
    }
  } catch { /* 카카오 실패 시 네이버/Nominatim fallback */ }

  try {
    if (!regionName && window.naver?.maps?.Service) {
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
    // 카카오/네이버 클라이언트 지오코더가 안 되면 서버 프록시(/api/reverse-geocode)로.
    // 브라우저에서 nominatim 을 직접 부르면 CORS + 429 가 나므로 서버에서 카카오 REST 로 조회한다.
    try {
      const res = await fetch(`/api/reverse-geocode?lat=${lat}&lng=${lng}`)
      if (res.ok) {
        const json = await res.json()
        if (json?.regionName) {
          regionName = json.regionName
          regionCode = regionCode || json.regionCode || null
        }
      }
    } catch { /* 무시 */ }
  }

  if (!regionName) return null

  // region 쓰기는 트리거로 updated_at 을 갱신한다. 갱신된 값을 함께 돌려줘야
  // 호출부(App)가 클라이언트 캐시의 updatedAt 을 맞춰, 이후 편집 저장이
  // 낙관적 잠금에 걸려 "다른 사용자가 먼저 수정했어요" 로 오판되지 않는다.
  let updatedAt = null
  try {
    const { data, error } = await supabase
      .from("map_features")
      .update({ region_name: regionName, region_code: regionCode })
      .eq("id", featureId)
      .select("updated_at")
      .maybeSingle()
    if (error) {
      const msg = `${error.message || ""}`.toLowerCase()
      if (!msg.includes("region_name") && !msg.includes("region_code") && error.code !== "42703" && error.code !== "PGRST204") {
        throw error
      }
    } else {
      updatedAt = data?.updated_at || null
    }
  } catch {
    // Region tagging is best-effort and must never affect feature saves.
  }
  return { regionName, regionCode, updatedAt }
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
  // 채집-우선(050): 지도 없이 만든 mapless 기록은 갱신할 지도가 없다.
  // 가드 없으면 .eq("id", null) 이 에러를 던져 insert 성공 후에도 "등록 실패"로 보인다.
  if (!mapId) return
  const supabase = requireSupabase()
  const { error } = await supabase
    .from("maps")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", mapId)

  if (!error) return

  const denied = error.code === "42501" || `${error.message || ""}`.toLowerCase().includes("permission")
  if (denied) {
    const rpcRes = await supabase.rpc("touch_personal_map_updated_at", { p_map_id: mapId })
    if (!rpcRes.error) return
    const missingRpc = rpcRes.error.code === "42883" || rpcRes.error.code === "PGRST202"
    if (!missingRpc) throw rpcRes.error
  }

  throw error
}

export function mergeFeaturesWithMemos(featureRows, memoRows, mediaRows = []) {
  const memosByFeatureId = memoRows.reduce((acc, row) => {
    const current = acc.get(row.feature_id) || []
    current.push(normalizeMemo(row))
    acc.set(row.feature_id, current)
    return acc
  }, new Map())

  const photosByFeatureId = new Map()
  for (const row of mediaRows) {
    const m = normalizeMedia(row)
    const entry = { id: m.id, date: m.date, url: m.url, storagePath: m.storagePath, recordId: m.recordId }
    if (m.type === "photo") {
      const arr = photosByFeatureId.get(row.feature_id) || []
      arr.push(entry)
      photosByFeatureId.set(row.feature_id, arr)
    }
  }

  return featureRows.map((row) => normalizeFeature(
    row,
    memosByFeatureId.get(row.id) || [],
    photosByFeatureId.get(row.id) || [],
  ))
}


