import { findPixelArt, pixelArtToSvgString } from "../lib/pixelEmojiCatalog"
import { getFeatureStyleColor } from "../lib/featureStyle"
import { getDefaultMarkerEmojiForFeature, resolvePlaceMarkerEmoji } from "./FeatureEmoji"

// ============================================================
// 지도 마커 HTML 빌더 (2026-07 피처 가시성 리디자인)
// KakaoMap / GoogleMap 이 공유한다. 스타일은 map-labels.css 의
// .loca-badge-marker / .loca-feature-tag / .loca-route-endpoint 참조.
// - 장소: 이모지 배지 핀 (흰 테두리 + 피처색 링), 꼬리표 없이 좌표 중심 앵커
// - 길/영역 라벨: 피처색 배지 태그
// - 길 시작점(흰 채움)·끝점(색 채움) 마커 (DESIGN.md §0.5)
// ============================================================

const BADGE_EMOJI_SIZE = 22

export const escapeMarkerHtml = (str) => {
  if (!str) return ""
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

const isEmojiCodePoint = (codePoint) => (
  (codePoint >= 0x1F000 && codePoint <= 0x1FAFF) ||
  (codePoint >= 0x2600 && codePoint <= 0x27BF)
)

export const stripEmojiFromLabel = (value, fallback = "이름 없음") => {
  let stripped = ""
  for (const char of String(value || "")) {
    const codePoint = char.codePointAt(0)
    if (codePoint === 0x200D || codePoint === 0xFE0E || codePoint === 0xFE0F) continue
    if (isEmojiCodePoint(codePoint)) continue
    stripped += char
  }
  const text = stripped.replace(/\s+/g, " ").trim()
  return text || fallback
}

const getBadgeEmojiHtml = (feature) => {
  const descriptor = resolvePlaceMarkerEmoji(feature)
  if (descriptor.kind === "pixel") {
    const art = findPixelArt(descriptor.value)
    if (art) {
      return `<span class="loca-badge-marker__pixel">${pixelArtToSvgString(art, BADGE_EMOJI_SIZE)}</span>`
    }
    return `<span class="loca-badge-marker__emoji">${escapeMarkerHtml(getDefaultMarkerEmojiForFeature(feature))}</span>`
  }
  if (descriptor.kind === "photo") {
    const safeUrl = escapeMarkerHtml(descriptor.value || "")
    if (safeUrl) {
      return `<img class="loca-badge-marker__photo" src="${safeUrl}" alt=""/>`
    }
    return `<span class="loca-badge-marker__emoji">${escapeMarkerHtml(getDefaultMarkerEmojiForFeature(feature))}</span>`
  }
  return `<span class="loca-badge-marker__emoji">${escapeMarkerHtml(descriptor.value || getDefaultMarkerEmojiForFeature(feature))}</span>`
}

// 장소 배지 핀. 앵커 요소(.loca-badge-anchor)가 배지 크기와 같으므로
// 오버레이 앵커를 (0.5, 0.5)로 두면 배지 중심 = 좌표가 된다. (꼬리표 없음)
export const createBadgePlaceMarkerContent = ({ feature, isSelected, shouldShowLabel }) => {
  const color = getFeatureStyleColor(feature, "pin")
  const classNames = [
    "loca-badge-marker",
    isSelected ? "loca-badge-marker--selected" : "",
    shouldShowLabel ? "" : "loca-badge-marker--label-hidden",
  ].filter(Boolean).join(" ")
  const title = escapeMarkerHtml(feature.title || "장소")

  return (
    `<div class="loca-badge-anchor">`
      + `<div class="${classNames}" role="button" aria-label="${title}" style="--pin-c:${escapeMarkerHtml(color)}">`
        + `<div class="loca-badge-marker__badge" aria-hidden="true">${getBadgeEmojiHtml(feature)}</div>`
        + `<div class="loca-badge-marker__label">${title}</div>`
      + `</div>`
    + `</div>`
  )
}

// 길/영역 이름 태그 — 피처색 배지 필 (metaText: 길 거리 등 보조 정보 병기)
export const createFeatureTagContent = ({ feature, type, color, isSelected = false, metaText = "" }) => {
  const fallback = type === "area" ? "영역" : "길"
  const classNames = [
    "loca-feature-tag",
    `loca-feature-tag--${type}`,
    isSelected ? "is-selected" : "",
  ].filter(Boolean).join(" ")
  const metaHtml = metaText
    ? `<em class="loca-feature-tag__meta">${escapeMarkerHtml(metaText)}</em>`
    : ""
  return (
    `<div class="loca-map-label-anchor">`
      + `<div class="${classNames}" style="--tag-c:${escapeMarkerHtml(color)}">`
        + `<span>${escapeMarkerHtml(stripEmojiFromLabel(feature.title, fallback))}</span>`
        + metaHtml
      + `</div>`
    + `</div>`
  )
}

// 길 시작점(흰 채움) / 끝점(색 채움) 마커
export const createRouteEndpointContent = ({ color, kind }) => (
  `<div class="loca-route-endpoint loca-route-endpoint--${kind}" style="--ep-c:${escapeMarkerHtml(color)}" aria-hidden="true"></div>`
)
