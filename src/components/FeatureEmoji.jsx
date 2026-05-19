/* eslint-disable react-refresh/only-export-components */
// ?μ냼(feature) ?대え吏瑜?醫낅쪟 臾닿??섍쾶 ?뚮뜑留곹븯???⑥씪 而댄룷?뚰듃.
//
// ?낅젰 ?뺥깭:
//   1) emoji prop 媛앹껜 {kind, value} ??沅뚯옣
//   2) ?덇굅???명솚: 臾몄옄??emoji prop ??kind='unicode' 濡?媛꾩＜
//   3) feature prop ??feature.emojiKind/emojiPixelId/emojiPhotoUrl/emoji 濡??먮룞 ?댁꽍
//
// kind:
//   - 'unicode': value = ?대え吏 臾몄옄 (?? '?뜔')
//   - 'pixel':   value = PIXEL_ART id (?? 'px-heart')
//   - 'photo':   value = public URL (?뺤궗媛??대?吏 沅뚯옣)

import { findPixelArt, pixelArtToSvgString } from "../lib/pixelEmojiCatalog"

/**
 * feature 媛앹껜?먯꽌 emoji descriptor {kind, value} 瑜?戮묒븘?몃떎.
 * normalize ?⑥닔媛 ?꾩쭅 ??而щ읆??諛섏쁺?섏? 紐삵븳 寃쎌슦?먮룄 ?숈옉?섎룄濡??대갚 泥섎━.
 */
export function resolveFeatureEmoji(featureOrEmoji) {
  if (!featureOrEmoji) return { kind: "unicode", value: "?뱧" }

  // ?대? descriptor ?뺥깭濡??꾨떖??寃쎌슦
  if (typeof featureOrEmoji === "object" && "kind" in featureOrEmoji && "value" in featureOrEmoji) {
    return featureOrEmoji
  }

  // ?⑥닚 臾몄옄??(?덇굅??
  if (typeof featureOrEmoji === "string") {
    return { kind: "unicode", value: featureOrEmoji }
  }

  // feature 媛앹껜
  const f = featureOrEmoji
  // ?뺢퇋?붾맂 ?뺥깭 (normalizeFeature 媛 emoji 瑜?媛앹껜濡?留뚮뱺 寃쎌슦)
  if (f.emoji && typeof f.emoji === "object" && "kind" in f.emoji) return f.emoji

  // ??而щ읆 ?곗꽑
  const kind = f.emojiKind || f.emoji_kind
  if (kind === "pixel") {
    const value = f.emojiPixelId || f.emoji_pixel_id
    if (value) return { kind: "pixel", value }
  }
  if (kind === "photo") {
    const value = f.emojiPhotoUrl || f.emoji_photo_url
    if (value) return { kind: "photo", value }
  }

  // unicode ?대갚
  const fallback = (typeof f.emoji === "string" ? f.emoji : "") || "?뱧"
  return { kind: "unicode", value: fallback }
}

/**
 * 醫낅쪟 臾닿? ?뚮뜑留?
 * - unicode: <span> ?덉뿉 湲?? * - pixel: inline SVG (image-rendering: pixelated)
 * - photo: <img> ?먰삎 ?щ∼
 *
 * size ??px (?뺤궗媛?. 湲곕낯 28.
 * unicodeFontSize 媛 二쇱뼱吏硫?unicode 湲???ш린瑜?蹂꾨룄 吏??
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
          ?뱧
        </span>
      )
    }
    const svg = pixelArtToSvgString(art, size)
    return (
      <span
        className={`loca-feature-emoji is-pixel ${className}`}
        style={baseStyle}
        aria-label={ariaLabel || art.label}
        // svg 臾몄옄?댁? ?대? ?듭젣 移댄깉濡쒓렇?먯꽌留???(?ъ슜???낅젰 ?놁쓬)
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
        aria-label={ariaLabel || "?ъ쭊 ?대え吏"}
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
 * innerHTML ??(NaverMap 留덉빱 ??. 醫낅쪟蹂꾨줈 HTML 臾몄옄?댁쓣 諛섑솚?쒕떎.
 * size ??px. unicode ??遺紐⑥뿉???ъ씠利?寃곗젙?쒕떎怨?媛?뺥븯怨?湲?먮쭔 諛섑솚.
 */
export function emojiToHtmlString(descriptor, { size = 24 } = {}) {
  const d = resolveFeatureEmoji(descriptor)
  if (d.kind === "pixel") {
    const art = findPixelArt(d.value)
    if (!art) return "?뱧"
    return pixelArtToSvgString(art, size)
  }
  if (d.kind === "photo") {
    const safeUrl = typeof d.value === "string" ? d.value.replace(/"/g, "&quot;") : ""
    return `<img src="${safeUrl}" width="${size}" height="${size}" style="width:${size}px;height:${size}px;object-fit:cover;border-radius:50%;display:block" alt=""/>`
  }
  return d.value || "?뱧"
}

/**
 * descriptor 媛 unicode ?대㈃ emoji 臾몄옄, pixel ?대㈃ ?쇰꺼, photo ?대㈃ '???ъ쭊' ??諛섑솚.
 * ?쒖떆??fallback ?띿뒪?멸? ?꾩슂??怨녹뿉???ъ슜.
 */
export function descriptorToDisplayText(descriptor) {
  const d = resolveFeatureEmoji(descriptor)
  if (d.kind === "unicode") return d.value
  if (d.kind === "pixel") {
    const art = findPixelArt(d.value)
    return art ? art.label : "?꾪듃 ?대え吏"
  }
  if (d.kind === "photo") return "???ъ쭊"
  return ""
}
