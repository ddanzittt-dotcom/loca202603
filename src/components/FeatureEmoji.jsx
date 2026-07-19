/* eslint-disable react-refresh/only-export-components */
import { findPixelArt, pixelArtToSvgString } from "../lib/pixelEmojiCatalog"
import { categoryToEmoji } from "../data/pinIcons"
import { getPublicPlaceEmojiOptionLabel, getPublicRecommendedPixelId } from "../utils/publicMapMarkers"

const LEGACY_EMOJI_PREFIX = "loca-emoji:"
const MARKER_DEFAULT_EMOJI = "\u2728"
const MARKER_ROUTE_EMOJI = "\uD83D\uDEE3\uFE0F"
const MARKER_AREA_EMOJI = "\uD83D\uDFE9"
const UNICODE_TO_PIXEL_ID = {
  "\u2615": "px-coffee",
  "\uD83C\uDF75": "px-tea",
  "\uD83C\uDF5C": "px-noodle",
  "\uD83C\uDF5A": "px-rice",
  "\uD83C\uDF59": "px-kimbap",
  "\uD83C\uDF54": "px-burger",
  "\uD83C\uDF55": "px-pizza",
  "\uD83C\uDF5E": "px-bread",
  "\uD83C\uDF70": "px-cake",
  "\uD83C\uDF66": "px-icecream",
  "\uD83C\uDF7A": "px-beer",
  "\uD83C\uDF33": "px-tree",
  "\uD83C\uDF32": "px-tree",
  "\uD83C\uDF38": "px-flower",
  "\uD83C\uDF3C": "px-flower",
  "\uD83C\uDFDE\uFE0F": "px-park",
  "\u26F0\uFE0F": "px-mountain",
  "\uD83C\uDF0A": "px-beach",
  "\uD83D\uDC36": "px-dog",
  "\uD83D\uDCF7": "px-camera",
  "\uD83D\uDCF8": "px-camera",
  "\uD83D\uDCDA": "px-book",
  "\uD83C\uDFA8": "px-gallery",
  "\uD83C\uDFB5": "px-music",
  "\uD83C\uDFB6": "px-music",
  "\uD83C\uDFE5": "px-hospital",
  "\uD83D\uDC8A": "px-pharmacy",
  "\uD83C\uDD7F\uFE0F": "px-parking",
  "\uD83C\uDFEA": "px-convenience",
  "\uD83C\uDFE6": "px-bank",
  "\uD83C\uDFE8": "px-hotel",
  "\uD83C\uDFEB": "px-school",
  "\uD83D\uDE8C": "px-bus",
  "\uD83D\uDE87": "px-subway",
  "\uD83D\uDEB2": "px-bike",
  "\uD83D\uDE97": "px-car",
  "\u2764\uFE0F": "px-heart",
  "\u2665\uFE0F": "px-heart",
  "\u2B50": "px-star",
  "\u2600\uFE0F": "px-sun",
  "\uD83D\uDD25": "px-fire",
  "\u2728": "px-star",
}

const isPinLikeEmoji = (emoji) => emoji === "\uD83D\uDCCD" || emoji === "\uD83D\uDCCC"

const getCategoryEmoji = (feature) => {
  const category = typeof feature?.category === "string" ? feature.category.trim() : ""
  if (!category) return ""
  const emoji = categoryToEmoji(category)
  return isPinLikeEmoji(emoji) ? "" : emoji
}

export function getDefaultMarkerEmojiForFeature(feature) {
  if (feature?.type === "route") return MARKER_ROUTE_EMOJI
  if (feature?.type === "area") return MARKER_AREA_EMOJI
  return MARKER_DEFAULT_EMOJI
}
const DEFAULT_UNICODE_EMOJI = "📍"

function parseLegacyEmojiDescriptor(value) {
  if (typeof value !== "string" || !value.startsWith(LEGACY_EMOJI_PREFIX)) return null
  const rest = value.slice(LEGACY_EMOJI_PREFIX.length)
  const divider = rest.indexOf(":")
  if (divider <= 0) return null
  const kind = rest.slice(0, divider)
  const descriptorValue = rest.slice(divider + 1)
  if ((kind === "pixel" || kind === "photo") && descriptorValue) {
    return { kind, value: descriptorValue }
  }
  return null
}

export function resolveFeatureEmoji(featureOrEmoji) {
  if (!featureOrEmoji) return { kind: "unicode", value: DEFAULT_UNICODE_EMOJI }

  if (typeof featureOrEmoji === "object" && "kind" in featureOrEmoji && "value" in featureOrEmoji) {
    return featureOrEmoji
  }

  if (typeof featureOrEmoji === "string") {
    const legacyDescriptor = parseLegacyEmojiDescriptor(featureOrEmoji)
    if (legacyDescriptor) return legacyDescriptor
    return { kind: "unicode", value: featureOrEmoji }
  }

  const f = featureOrEmoji
  if (f.emoji && typeof f.emoji === "object" && "kind" in f.emoji) return f.emoji

  const legacyDescriptor = parseLegacyEmojiDescriptor(f.emoji)
  if (legacyDescriptor) return legacyDescriptor

  const kind = f.emojiKind || f.emoji_kind
  if (kind === "pixel") {
    const value = f.emojiPixelId || f.emoji_pixel_id
    if (value) return { kind: "pixel", value }
  }
  if (kind === "photo") {
    const value = f.emojiPhotoUrl || f.emoji_photo_url
    if (value) return { kind: "photo", value }
  }

  const fallback = (typeof f.emoji === "string" ? f.emoji : "") || DEFAULT_UNICODE_EMOJI
  return { kind: "unicode", value: fallback }
}

export function resolvePlaceMarkerEmoji(feature) {
  const descriptor = resolveFeatureEmoji(feature)
  const fallback = getDefaultMarkerEmojiForFeature(feature)

  if (descriptor.kind === "pixel") {
    return findPixelArt(descriptor.value)
      ? descriptor
      : { kind: "unicode", value: fallback }
  }

  if (descriptor.kind === "photo") {
    return descriptor.value
      ? descriptor
      : { kind: "unicode", value: fallback }
  }

  // 사용자가 고른 유니코드 이모지는 지도에서도 그대로 보여준다.
  const emoji = typeof descriptor.value === "string" ? descriptor.value.trim() : ""
  if (emoji && !isPinLikeEmoji(emoji)) {
    return { kind: "unicode", value: emoji }
  }

  // 이모지 미선택(기본 핀)일 때만 카테고리/키워드 기반 픽셀 추천 폴백.
  const fallbackEmoji = getCategoryEmoji(feature) || fallback
  const pixelId = UNICODE_TO_PIXEL_ID[fallbackEmoji] || getPublicRecommendedPixelId(feature)

  return pixelId && findPixelArt(pixelId)
    ? { kind: "pixel", value: pixelId }
    : { kind: "unicode", value: fallbackEmoji }
}

export function FeatureEmoji({
  emoji,
  feature,
  size = 28,
  unicodeFontSize,
  className = "",
  style,
  ringColor = "rgba(255,107,53,.4)",
  ariaLabel,
}) {
  const descriptor = resolveFeatureEmoji(emoji !== undefined ? emoji : feature)
  const baseStyle = {
    width: size,
    height: size,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    lineHeight: 1,
    ...style,
  }

  if (descriptor.kind === "pixel") {
    const art = findPixelArt(descriptor.value)
    if (!art) {
      return (
        <span className={`loca-feature-emoji is-unicode ${className}`} style={baseStyle} aria-label={ariaLabel}>
          {DEFAULT_UNICODE_EMOJI}
        </span>
      )
    }
    return (
      <span
        className={`loca-feature-emoji is-pixel ${className}`}
        style={baseStyle}
        aria-label={ariaLabel || art.label}
        dangerouslySetInnerHTML={{ __html: pixelArtToSvgString(art, size) }}
      />
    )
  }

  if (descriptor.kind === "photo") {
    return (
      <span
        className={`loca-feature-emoji is-photo ${className}`}
        style={{
          ...baseStyle,
          borderRadius: "50%",
          overflow: "hidden",
          boxShadow: `0 0 0 1.5px #fff, 0 0 0 2.5px ${ringColor}`,
        }}
        aria-label={ariaLabel || "사진 이모지"}
      >
        <img
          src={descriptor.value}
          alt=""
          width={size}
          height={size}
          style={{ width: size, height: size, objectFit: "cover", display: "block" }}
          loading="lazy"
        />
      </span>
    )
  }

  return (
    <span
      className={`loca-feature-emoji is-unicode ${className}`}
      style={{
        ...baseStyle,
        fontSize: unicodeFontSize || Math.round(size * 0.78),
      }}
      aria-label={ariaLabel || descriptor.value}
    >
      {descriptor.value}
    </span>
  )
}

export function emojiToHtmlString(descriptor, { size = 24 } = {}) {
  const d = resolveFeatureEmoji(descriptor)
  if (d.kind === "pixel") {
    const art = findPixelArt(d.value)
    if (!art) return DEFAULT_UNICODE_EMOJI
    return pixelArtToSvgString(art, size)
  }
  if (d.kind === "photo") {
    const safeUrl = typeof d.value === "string" ? d.value.replace(/"/g, "&quot;") : ""
    return `<img src="${safeUrl}" width="${size}" height="${size}" style="width:${size}px;height:${size}px;object-fit:cover;border-radius:50%;display:block" alt=""/>`
  }
  return d.value || DEFAULT_UNICODE_EMOJI
}

export function descriptorToDisplayText(descriptor) {
  const d = resolveFeatureEmoji(descriptor)
  if (d.kind === "unicode") return d.value
  if (d.kind === "pixel") {
    const art = findPixelArt(d.value)
    return (art && art.label) || getPublicPlaceEmojiOptionLabel(d.value) || "도트 이모지"
  }
  if (d.kind === "photo") return "내 사진"
  return ""
}
