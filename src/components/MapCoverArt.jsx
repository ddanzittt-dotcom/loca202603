import { useMemo } from "react"
import { FeatureEmoji } from "./FeatureEmoji"

/**
 * MapCoverArt — 지도 카드 커버.
 * 콘텐츠가 커버가 된다 (핀터레스트/스포티파이 문법):
 *   1) 지도 안 장소들에 사진이 있으면 → 사진 콜라주 (1장: 풀, 2장: 반반, 3장+: 큰 1 + 작은 2)
 *   2) 사진이 없으면 → 테마색 컬러 커버 + 대표 픽셀 이모지 크게
 */

function sanitizeHexColor(value) {
  return typeof value === "string" && /^#[0-9a-fA-F]{3,8}$/u.test(value.trim()) ? value.trim() : null
}

function resolvePhotoUrl(photo) {
  if (typeof photo === "string") return /^https?:/u.test(photo) ? photo : ""
  const src = photo?.url || photo?.thumbnail || photo?.cloudUrl || photo?.src || ""
  return /^https?:/u.test(src) ? src : ""
}

function pickPhotoUrls(features = [], limit = 3) {
  const urls = []
  for (const feature of features) {
    for (const photo of (feature?.photos || [])) {
      const src = resolvePhotoUrl(photo)
      if (src && !urls.includes(src)) urls.push(src)
      if (urls.length >= limit) return urls
    }
  }
  return urls
}

function pickTopEmoji(features = []) {
  const counts = new Map()
  for (const feature of features) {
    if (feature?.type && feature.type !== "pin") continue
    const emoji = feature?.emoji
    if (!emoji) continue
    counts.set(emoji, (counts.get(emoji) || 0) + 1)
  }
  let best = null
  let bestCount = 0
  for (const [emoji, count] of counts) {
    if (count > bestCount) {
      best = emoji
      bestCount = count
    }
  }
  return best
}

export function MapCoverArt({ map, features = [], emoji = null, className = "" }) {
  const photos = useMemo(() => pickPhotoUrls(features), [features])
  const coverEmoji = emoji || pickTopEmoji(features) || "📍"
  const theme = sanitizeHexColor(map?.theme) || "#FF6B35"

  if (photos.length >= 3) {
    return (
      <span className={`mca mca--collage ${className}`.trim()} aria-hidden="true">
        <img className="mca__main" src={photos[0]} alt="" loading="lazy" />
        <span className="mca__side">
          <img src={photos[1]} alt="" loading="lazy" />
          <img src={photos[2]} alt="" loading="lazy" />
        </span>
      </span>
    )
  }

  if (photos.length === 2) {
    return (
      <span className={`mca mca--duo ${className}`.trim()} aria-hidden="true">
        <img src={photos[0]} alt="" loading="lazy" />
        <img src={photos[1]} alt="" loading="lazy" />
      </span>
    )
  }

  if (photos.length === 1) {
    return (
      <span className={`mca mca--single ${className}`.trim()} aria-hidden="true">
        <img src={photos[0]} alt="" loading="lazy" />
      </span>
    )
  }

  // 사진 없음 → 컬러 커버 (테마색 + 대표 이모지)
  return (
    <span
      className={`mca mca--color ${className}`.trim()}
      style={{ background: theme }}
      aria-hidden="true"
    >
      <span className="mca__tint" />
      <span className="mca__emoji">
        <FeatureEmoji emoji={coverEmoji} size={64} unicodeFontSize={44} />
      </span>
    </span>
  )
}
