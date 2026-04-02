import { gzipSync, gunzipSync } from "fflate"

export const themePalette = ["#635BFF", "#12B981", "#F97316", "#EF4444", "#0EA5E9"]
export const placeEmojis = [
  "📍", "☕", "🍽️", "🌳", "🏖️", "🛍️",
  "🏠", "🏢", "🏫", "🏥", "⛪", "🏛️",
  "🎵", "🎨", "📸", "🎭", "🎬", "📚",
  "⭐", "❤️", "🔥", "💎", "🎁", "🏆",
  "🍕", "🍜", "🍰", "🍺", "🧁", "🍣",
  "✈️", "🚂", "🚌", "⛽", "🅿️", "🚉",
  "⚽", "🏊", "🎣", "🏋️", "⛷️", "🏄",
  "🌸", "🌺", "🌻", "🍁", "❄️", "🌙",
]

export function createId(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`
}

// --- 좌표 최적화 ---

export function roundCoord(value) {
  return Math.round(value * 1e6) / 1e6
}

function perpendicularDistance(point, lineStart, lineEnd) {
  const [x, y] = point
  const [x1, y1] = lineStart
  const [x2, y2] = lineEnd
  const dx = x2 - x1
  const dy = y2 - y1
  if (dx === 0 && dy === 0) return Math.sqrt((x - x1) ** 2 + (y - y1) ** 2)
  const t = ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)
  const cx = x1 + t * dx
  const cy = y1 + t * dy
  return Math.sqrt((x - cx) ** 2 + (y - cy) ** 2)
}

export function simplifyPoints(points, epsilon = 0.00001) {
  if (!points || points.length <= 2) return points
  let maxDist = 0
  let maxIdx = 0
  const first = points[0]
  const last = points[points.length - 1]
  for (let i = 1; i < points.length - 1; i++) {
    const d = perpendicularDistance(points[i], first, last)
    if (d > maxDist) { maxDist = d; maxIdx = i }
  }
  if (maxDist > epsilon) {
    const left = simplifyPoints(points.slice(0, maxIdx + 1), epsilon)
    const right = simplifyPoints(points.slice(maxIdx), epsilon)
    return [...left.slice(0, -1), ...right]
  }
  return [first, last]
}

export function sanitizePoints(points) {
  if (!points || !Array.isArray(points)) return points
  const rounded = points.map(([lng, lat]) => [roundCoord(lng), roundCoord(lat)])
  return simplifyPoints(rounded)
}

export function sanitizeCoord(lat, lng) {
  return { lat: roundCoord(lat), lng: roundCoord(lng) }
}

const decodeBase64Url = (value) => {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/")
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4))
  const binary = atob(`${normalized}${padding}`)
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

export function formatShortDate(value) {
  if (!value) return "방금 수정"
  return new Intl.DateTimeFormat("ko-KR", { month: "short", day: "numeric" }).format(new Date(value))
}

export function formatFeedDate(value) {
  return new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric" }).format(new Date(value))
}

export function mapThemeGradient(theme) {
  switch (theme) {
    case "#12B981":
      return ["#43e97b", "#38f9d7"]
    case "#F97316":
      return ["#fdba74", "#f97316"]
    case "#EF4444":
      return ["#fda4af", "#ef4444"]
    case "#0EA5E9":
      return ["#93c5fd", "#0ea5e9"]
    default:
      return ["#667eea", "#764ba2"]
  }
}

export function featureSort(a, b) {
  if (a.type !== b.type) return a.type === "pin" ? -1 : 1
  return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
}

export function tagsToText(tags) {
  return (tags || []).join(", ")
}

export function collectTopTags(features) {
  const set = new Set()
  features.forEach((feature) => {
    ;(feature.tags || []).forEach((tag) => set.add(tag))
  })
  return [...set].slice(0, 4)
}

export function exportBackup(maps, features, shares, followed) {
  const payload = { version: 2, exportedAt: new Date().toISOString(), maps, features, shares, followed }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = `loca-backup-${new Date().toISOString().slice(0, 10)}.json`
  link.click()
  URL.revokeObjectURL(url)
}

export function importBackup(payload, fallbackFollowed) {
  if (!payload || typeof payload !== "object") throw new Error("잘못된 파일 형식입니다.")
  if (!Array.isArray(payload.maps) || !Array.isArray(payload.features)) throw new Error("maps 또는 features 배열이 없습니다.")
  return {
    maps: payload.maps,
    features: payload.features,
    shares: Array.isArray(payload.shares) ? payload.shares : [],
    followed: Array.isArray(payload.followed) ? payload.followed : fallbackFollowed,
  }
}

export function createMapSharePayload(map, features) {
  if (!map || typeof map !== "object") throw new Error("공유할 지도 정보가 없습니다.")
  // 공유 URL에는 지도 구조만 포함, 개인 기록(memos/photos/voices)은 제외
  const safeFeatures = (Array.isArray(features) ? features : []).map((f) => ({
    id: f.id,
    mapId: f.mapId,
    type: f.type,
    title: f.title,
    emoji: f.emoji,
    tags: f.tags,
    note: f.note || "",
    highlight: f.highlight,
    lat: f.lat,
    lng: f.lng,
    points: f.points,
  }))
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    map: {
      id: map.id,
      title: map.title || "공유 지도",
      description: map.description || "",
      theme: map.theme || themePalette[0],
      updatedAt: map.updatedAt || new Date().toISOString(),
    },
    features: safeFeatures,
  }
}

export function serializeMapSharePayload(map, features) {
  const json = JSON.stringify(createMapSharePayload(map, features))
  const compressed = gzipSync(new TextEncoder().encode(json))
  let binary = ""
  compressed.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })
  return "v2:" + btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, "")
}

const MAX_COMPRESSED_SIZE = 1 * 1024 * 1024 // 1MB
const MAX_DECOMPRESSED_SIZE = 5 * 1024 * 1024 // 5MB
const MAX_FEATURES_PER_SHARE = 2000

export function parseMapSharePayload(encodedPayload) {
  if (!encodedPayload) throw new Error("공유 데이터가 비어 있습니다.")
  if (encodedPayload.length > MAX_COMPRESSED_SIZE * 1.4) throw new Error("공유 데이터가 너무 큽니다.")
  let payload
  if (encodedPayload.startsWith("v2:")) {
    const b64 = encodedPayload.slice(3)
    const normalized = b64.replace(/-/g, "+").replace(/_/g, "/")
    const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4))
    const binary = atob(`${normalized}${padding}`)
    if (binary.length > MAX_COMPRESSED_SIZE) throw new Error("공유 데이터가 너무 큽니다.")
    const compressed = Uint8Array.from(binary, (char) => char.charCodeAt(0))
    const decompressed = gunzipSync(compressed)
    if (decompressed.length > MAX_DECOMPRESSED_SIZE) throw new Error("공유 데이터가 너무 큽니다.")
    payload = JSON.parse(new TextDecoder().decode(decompressed))
  } else {
    const decoded = decodeBase64Url(encodedPayload)
    if (decoded.length > MAX_DECOMPRESSED_SIZE) throw new Error("공유 데이터가 너무 큽니다.")
    payload = JSON.parse(decoded)
  }
  if (!payload || typeof payload !== "object" || payload.constructor !== Object) throw new Error("공유 데이터 형식이 올바르지 않습니다.")
  if (!payload.map || typeof payload.map !== "object") throw new Error("공유 데이터 형식이 올바르지 않습니다.")
  if (!Array.isArray(payload.features)) throw new Error("공유 데이터 형식이 올바르지 않습니다.")
  if (payload.features.length > MAX_FEATURES_PER_SHARE) throw new Error("공유 피처가 너무 많습니다.")

  const mapId = payload.map.id || createId("shared")
  const normalizedMap = {
    id: mapId,
    title: payload.map.title || "공유 지도",
    description: payload.map.description || "",
    theme: payload.map.theme || themePalette[0],
    updatedAt: payload.map.updatedAt || payload.exportedAt || new Date().toISOString(),
  }

  const normalizedFeatures = payload.features.map((feature) => ({
    ...feature,
    id: feature.id || createId("feat"),
    mapId,
    type: feature.type || "pin",
    title: feature.title || "장소",
    emoji: feature.emoji || "📍",
    tags: Array.isArray(feature.tags) ? feature.tags : [],
    note: feature.note || "",
    updatedAt: feature.updatedAt || normalizedMap.updatedAt,
  }))

  return { map: normalizedMap, features: normalizedFeatures }
}

export function buildMapRoutePath(mapId) {
  return `/map/${encodeURIComponent(mapId)}`
}

export function buildMapSharePath(map, features) {
  const encodedPayload = serializeMapSharePayload(map, features)
  return `/shared?data=${encodeURIComponent(encodedPayload)}`
}

export function buildMapShareUrl(map, features, origin = window.location.origin) {
  let safeOrigin = origin
  if (!safeOrigin.startsWith("https://") && !safeOrigin.startsWith("http://localhost")) {
    safeOrigin = safeOrigin.replace(/^http:/, "https:")
  }
  return `${safeOrigin}${buildMapSharePath(map, features)}`
}

/**
 * 발행된 지도의 슬러그 기반 공유 URL을 생성한다.
 * utm_source 파라미터를 포함한다.
 * @param {string} slug
 * @param {'link'|'kakao'|'qr'} source
 */
export function buildSlugShareUrl(slug, source = "link", origin = window.location.origin) {
  if (!slug) return ""
  let safeOrigin = origin
  if (!safeOrigin.startsWith("https://") && !safeOrigin.startsWith("http://localhost")) {
    safeOrigin = safeOrigin.replace(/^http:/, "https:")
  }
  return `${safeOrigin}/s/${encodeURIComponent(slug)}?utm_source=${source}`
}

export function parseSharedMapUrl(text) {
  if (!text || typeof text !== "string") return null
  const lines = text.trim().split(/\n/).map((l) => l.trim()).filter(Boolean)

  // Extract title: first line that doesn't look like a URL
  let title = ""
  for (const line of lines) {
    if (!/^https?:\/\//.test(line)) {
      title = line
      break
    }
  }

  // Find a map URL in the text
  const urlMatch = text.match(/https?:\/\/[^\s]+/g)
  if (!urlMatch || urlMatch.length === 0) {
    // No URL found; if we have a title, return it as unknown
    return title ? { title, lat: null, lng: null, source: "unknown" } : null
  }

  for (const rawUrl of urlMatch) {
    try {
      const url = new URL(rawUrl)
      const hostname = url.hostname

      // --- Kakao Map ---
      // https://map.kakao.com/link/map/장소명,37.123,127.456
      // https://map.kakao.com/link/to/장소명,37.123,127.456
      if (hostname === "map.kakao.com" && /^\/link\/(map|to)\//.test(url.pathname)) {
        const pathParts = decodeURIComponent(url.pathname).split("/")
        // pathParts: ['', 'link', 'map'|'to', '장소명,37.123,127.456']
        const lastPart = pathParts[pathParts.length - 1] || ""
        const commaIdx = lastPart.lastIndexOf(",")
        if (commaIdx > 0) {
          const commaIdx2 = lastPart.lastIndexOf(",", commaIdx - 1)
          if (commaIdx2 > 0) {
            const name = lastPart.slice(0, commaIdx2)
            const lat = parseFloat(lastPart.slice(commaIdx2 + 1, commaIdx))
            const lng = parseFloat(lastPart.slice(commaIdx + 1))
            if (!isNaN(lat) && !isNaN(lng)) {
              return { title: title || name, lat, lng, source: "kakao" }
            }
          }
        }
      }

      // https://place.map.kakao.com/1234567 — place ID only
      if (hostname === "place.map.kakao.com") {
        return { title: title || "카카오맵 장소", lat: null, lng: null, source: "kakao" }
      }

      // --- Google Maps ---
      // https://www.google.com/maps/place/.../@37.123,127.456,...
      if ((hostname === "www.google.com" || hostname === "maps.google.com" || hostname === "google.com") && url.pathname.includes("/maps")) {
        // Try @lat,lng pattern
        const atMatch = url.pathname.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)/)
        if (atMatch) {
          const lat = parseFloat(atMatch[1])
          const lng = parseFloat(atMatch[2])
          if (!isNaN(lat) && !isNaN(lng)) {
            return { title: title || "Google Maps 장소", lat, lng, source: "google" }
          }
        }
        // Try ?q=lat,lng
        const q = url.searchParams.get("q")
        if (q) {
          const qMatch = q.match(/^(-?\d+\.?\d*),\s*(-?\d+\.?\d*)$/)
          if (qMatch) {
            return { title: title || "Google Maps 장소", lat: parseFloat(qMatch[1]), lng: parseFloat(qMatch[2]), source: "google" }
          }
        }
        // Google Maps URL but no extractable coords
        return { title: title || "Google Maps 장소", lat: null, lng: null, source: "google" }
      }

      // https://maps.app.goo.gl/xxxxx — short URL
      if (hostname === "maps.app.goo.gl") {
        return { title: title || "Google Maps 장소", lat: null, lng: null, source: "google" }
      }

      // --- Naver Maps ---
      if (hostname === "map.naver.com" || hostname === "m.map.naver.com") {
        // Try to extract coords from search params
        const lat = url.searchParams.get("lat") || url.searchParams.get("y")
        const lng = url.searchParams.get("lng") || url.searchParams.get("x")
        if (lat && lng) {
          const parsedLat = parseFloat(lat)
          const parsedLng = parseFloat(lng)
          if (!isNaN(parsedLat) && !isNaN(parsedLng)) {
            return { title: title || "네이버 지도 장소", lat: parsedLat, lng: parsedLng, source: "naver" }
          }
        }
        return { title: title || "네이버 지도 장소", lat: null, lng: null, source: "naver" }
      }

      // https://naver.me/xxxxx — short URL
      if (hostname === "naver.me") {
        return { title: title || "네이버 지도 장소", lat: null, lng: null, source: "naver" }
      }
    } catch {
      // Invalid URL, continue
    }
  }

  // If no recognized map URL but we have a title
  return title ? { title, lat: null, lng: null, source: "unknown" } : null
}

export function parseAppLocation(locationLike = window.location) {
  const pathname = (locationLike.pathname || "/").replace(/\/+$/u, "") || "/"
  if (pathname === "/share-target") {
    const params = new URLSearchParams(locationLike.search || "")
    const title = params.get("title") || ""
    const text = params.get("text") || ""
    const url = params.get("url") || ""
    const combined = [title, text, url].filter(Boolean).join("\n")
    const parsed = parseSharedMapUrl(combined)
    if (parsed) return { type: "share-target", place: parsed }
    return null
  }

  if (pathname === "/shared") {
    const params = new URLSearchParams(locationLike.search || "")
    const encodedPayload = params.get("data")
    if (!encodedPayload) return null
    return { type: "shared", payload: parseMapSharePayload(encodedPayload) }
  }

  if (pathname.startsWith("/s/")) {
    const slug = decodeURIComponent(pathname.slice(3))
    if (!slug || slug.length > 128) return null
    return { type: "slug", slug }
  }

  if (pathname.startsWith("/map/")) {
    const mapId = decodeURIComponent(pathname.slice(5))
    if (!mapId || mapId.length > 128) return null
    return { type: "map", mapId }
  }

  return null
}

export function buildOwnPosts(shares, maps, features, me) {
  return shares
    .map((share) => {
      const map = maps.find((item) => item.id === share.mapId)
      if (!map) return null
      const relatedFeatures = features.filter((item) => item.mapId === share.mapId)
      return {
        source: "own",
        id: share.id,
        mapId: share.mapId,
        user: me,
        title: map.title,
        description: map.description,
        caption: share.caption || map.description || "내 지도를 프로필에 올렸어요.",
        date: share.date,
        likes: share.likes,
        saves: share.saves,
        placeCount: relatedFeatures.filter((item) => item.type === "pin").length,
        tags: collectTopTags(relatedFeatures),
        emojis: relatedFeatures.filter((item) => item.type === "pin").map((item) => item.emoji),
        theme: map.theme,
        gradient: null,
      }
    })
    .filter(Boolean)
}

export function buildCommunityPosts(posts, usersById) {
  return posts
    .map((post) => {
      const user = usersById[post.userId]
      if (!user) return null
      return { source: "community", id: post.id, mapId: post.mapId, user, title: post.title, description: post.description, caption: post.caption, date: post.date, likes: post.likes, saves: post.saves, placeCount: post.placeCount, tags: post.tags, emojis: post.emojis, gradient: post.gradient, theme: null }
    })
    .filter(Boolean)
}
