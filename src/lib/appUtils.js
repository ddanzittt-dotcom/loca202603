export const themePalette = ["#635BFF", "#12B981", "#F97316", "#EF4444", "#0EA5E9"]
export const placeEmojis = ["📍", "☕", "🍽️", "🌳", "🏖️", "🛍️"]

export function createId(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`
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
