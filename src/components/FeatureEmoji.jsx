/* eslint-disable react-refresh/only-export-components */
// 장소(feature) 이모지를 종류 무관하게 렌더링하는 단일 컴포넌트.
//
// 입력 형태:
//   1) emoji prop 객체 {kind, value} — 권장
//   2) 레거시 호환: 문자열 emoji prop — kind='unicode' 로 간주
//   3) feature prop — feature.emojiKind/emojiPixelId/emojiPhotoUrl/emoji 로 자동 해석
//
// kind:
//   - 'unicode': value = 이모지 문자 (예: '🍗')
//   - 'pixel':   value = PIXEL_ART id (예: 'px-heart')
//   - 'photo':   value = public URL (정사각 이미지 권장)

import { findPixelArt, pixelArtToSvgString } from "../lib/pixelEmojiCatalog"

/**
 * feature 객체에서 emoji descriptor {kind, value} 를 뽑아낸다.
 * normalize 함수가 아직 새 컬럼을 반영하지 못한 경우에도 동작하도록 폴백 처리.
 */
export function resolveFeatureEmoji(featureOrEmoji) {
  if (!featureOrEmoji) return { kind: "unicode", value: "📍" }

  // 이미 descriptor 형태로 전달된 경우
  if (typeof featureOrEmoji === "object" && "kind" in featureOrEmoji && "value" in featureOrEmoji) {
    return featureOrEmoji
  }

  // 단순 문자열 (레거시)
  if (typeof featureOrEmoji === "string") {
    return { kind: "unicode", value: featureOrEmoji }
  }

  // feature 객체
  const f = featureOrEmoji
  // 정규화된 형태 (normalizeFeature 가 emoji 를 객체로 만든 경우)
  if (f.emoji && typeof f.emoji === "object" && "kind" in f.emoji) return f.emoji

  // 새 컬럼 우선
  const kind = f.emojiKind || f.emoji_kind
  if (kind === "pixel") {
    const value = f.emojiPixelId || f.emoji_pixel_id
    if (value) return { kind: "pixel", value }
  }
  if (kind === "photo") {
    const value = f.emojiPhotoUrl || f.emoji_photo_url
    if (value) return { kind: "photo", value }
  }

  // unicode 폴백
  const fallback = (typeof f.emoji === "string" ? f.emoji : "") || "📍"
  return { kind: "unicode", value: fallback }
}

/**
 * 종류 무관 렌더링.
 * - unicode: <span> 안에 글자
 * - pixel: inline SVG (image-rendering: pixelated)
 * - photo: <img> 원형 크롭
 *
 * size 는 px (정사각). 기본 28.
 * unicodeFontSize 가 주어지면 unicode 글자 크기를 별도 지정.
 */
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
          📍
        </span>
      )
    }
    const svg = pixelArtToSvgString(art, size)
    return (
      <span
        className={`loca-feature-emoji is-pixel ${className}`}
        style={baseStyle}
        aria-label={ariaLabel || art.label}
        // svg 문자열은 내부 통제 카탈로그에서만 옴 (사용자 입력 없음)
        dangerouslySetInnerHTML={{ __html: svg }}
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

  // unicode
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

/**
 * innerHTML 용 (NaverMap 마커 등). 종류별로 HTML 문자열을 반환한다.
 * size 는 px. unicode 는 부모에서 사이즈 결정한다고 가정하고 글자만 반환.
 */
export function emojiToHtmlString(descriptor, { size = 24 } = {}) {
  const d = resolveFeatureEmoji(descriptor)
  if (d.kind === "pixel") {
    const art = findPixelArt(d.value)
    if (!art) return "📍"
    return pixelArtToSvgString(art, size)
  }
  if (d.kind === "photo") {
    const safeUrl = typeof d.value === "string" ? d.value.replace(/"/g, "&quot;") : ""
    return `<img src="${safeUrl}" width="${size}" height="${size}" style="width:${size}px;height:${size}px;object-fit:cover;border-radius:50%;display:block" alt=""/>`
  }
  return d.value || "📍"
}

/**
 * descriptor 가 unicode 이면 emoji 문자, pixel 이면 라벨, photo 이면 '내 사진' 을 반환.
 * 표시용 fallback 텍스트가 필요한 곳에서 사용.
 */
export function descriptorToDisplayText(descriptor) {
  const d = resolveFeatureEmoji(descriptor)
  if (d.kind === "unicode") return d.value
  if (d.kind === "pixel") {
    const art = findPixelArt(d.value)
    return art ? art.label : "도트 이모지"
  }
  if (d.kind === "photo") return "내 사진"
  return ""
}
