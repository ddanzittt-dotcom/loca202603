import { getPublicMarkerIconKey } from "../utils/publicMapMarkers"

export const LOCA_SITE_NAME = "LOCA"
export const PUBLIC_OG_FALLBACK_IMAGE = "/icons/icon-512.png"

const DEFAULT_COMMUNITY_DESCRIPTION = "사람들이 남긴 장소와 길을 지도에서 찾아보세요."
const DEFAULT_RECOMMEND_DESCRIPTION = "릴스에서 소개한 추천지도를 모아두는 지도 검색 코너"

function absoluteUrl(value, origin = "") {
  if (!value) return ""
  if (/^https?:\/\//iu.test(value)) return value
  const resolvedOrigin = origin || (typeof window !== "undefined" ? window.location.origin : "")
  if (!resolvedOrigin) return value
  return `${resolvedOrigin}${value.startsWith("/") ? value : `/${value}`}`
}

function compactText(value, fallback = "") {
  const text = String(value || "").replace(/\s+/gu, " ").trim()
  return text || fallback
}

function getCurrentUrl() {
  if (typeof window === "undefined") return ""
  return `${window.location.origin}${window.location.pathname}${window.location.search}`
}

function upsertMeta(selector, attributeName, attributeValue, content) {
  if (typeof document === "undefined" || !content) return
  let element = document.head.querySelector(selector)
  if (!element) {
    element = document.createElement("meta")
    element.setAttribute(attributeName, attributeValue)
    document.head.appendChild(element)
  }
  element.setAttribute("content", content)
}

// canonical 갱신 — index.html 의 canonical 은 홈("https://loca.im/")으로 고정돼 있어,
// SPA 로 열린 하위 페이지(발행 지도 등)가 그대로 두면 "홈의 중복"으로 선언되어 색인에서 빠진다.
// 쿼리스트링(utm_source 등)은 제거한 경로만 canonical 로 쓴다.
function upsertCanonical(url) {
  if (typeof document === "undefined" || !url) return
  const clean = url.split("?")[0].split("#")[0]
  let element = document.head.querySelector("link[rel='canonical']")
  if (!element) {
    element = document.createElement("link")
    element.setAttribute("rel", "canonical")
    document.head.appendChild(element)
  }
  element.setAttribute("href", clean)
}

export function buildPixelMarkerOgFallback(record = {}, origin = "") {
  const iconKey = record.pixel_icon_key || getPublicMarkerIconKey(record)
  const title = compactText(record.title, record.type === "route" ? "LOCA 길" : "LOCA 장소")
  return {
    image: absoluteUrl(PUBLIC_OG_FALLBACK_IMAGE, origin),
    rule: "photo_url이 없으면 pixel marker + 제목 기반 OG 카드 이미지를 생성한다.",
    dynamicImageTodo: `/api/og/public-record?title=${encodeURIComponent(title)}&icon=${encodeURIComponent(iconKey)}`,
    iconKey,
  }
}

export function getRecommendMapOgMeta(map = {}, origin = "") {
  const title = compactText(map.title, "추천할지도")
  const description = compactText(map.subtitle || map.description || map.reason, DEFAULT_RECOMMEND_DESCRIPTION)
  const image = absoluteUrl(map.cover_image_url || map.cover_image || PUBLIC_OG_FALLBACK_IMAGE, origin)
  const url = absoluteUrl(`/recommend/${encodeURIComponent(map.slug || "")}`, origin)
  return {
    title: `${title} | LOCA 추천할지도`,
    description,
    image,
    imageAlt: `${title} 추천지도 커버`,
    url,
    type: "article",
    siteName: LOCA_SITE_NAME,
  }
}

export function getRecordOgMeta(record = {}, origin = "") {
  const title = compactText(record.title, "이름 없는 기록")
  const description = compactText(record.intro || record.note || record.description, "사람들이 남긴 장소와 길을 지도에서 찾아보세요.")
  const fallback = buildPixelMarkerOgFallback(record, origin)
  return {
    title: `${title} | LOCA 모두의 지도`,
    description,
    image: absoluteUrl(record.photo_url, origin) || fallback.image,
    imageAlt: `${title} 기록 이미지`,
    url: record.public_url ? absoluteUrl(record.public_url, origin) : getCurrentUrl(),
    type: "article",
    siteName: LOCA_SITE_NAME,
    fallback,
  }
}

export function getCommunitySearchOgMeta(query = "", origin = "") {
  const normalizedQuery = compactText(query, "모두의 지도")
  return {
    title: `${normalizedQuery} | LOCA 모두의 지도`,
    description: DEFAULT_COMMUNITY_DESCRIPTION,
    image: absoluteUrl(PUBLIC_OG_FALLBACK_IMAGE, origin),
    imageAlt: "LOCA 모두의 지도",
    url: getCurrentUrl() || absoluteUrl("/community-web", origin),
    type: "website",
    siteName: LOCA_SITE_NAME,
  }
}

export function getRecommendSearchOgMeta(query = "", origin = "") {
  const normalizedQuery = compactText(query, "추천할지도")
  return {
    title: `${normalizedQuery} | LOCA 추천할지도`,
    description: DEFAULT_RECOMMEND_DESCRIPTION,
    image: absoluteUrl(PUBLIC_OG_FALLBACK_IMAGE, origin),
    imageAlt: "LOCA 추천할지도",
    url: getCurrentUrl() || absoluteUrl("/maps/search", origin),
    type: "website",
    siteName: LOCA_SITE_NAME,
  }
}

// 발행 지도(/s/:slug) 메타 — SPA 로 열렸을 때 제목·설명·canonical 을 지도별로 바꾼다.
// (검색봇은 api/og/[slug].js 가 서버에서 렌더한 HTML 을 받지만, JS 를 실행하는 크롤러와
//  브라우저 탭 제목·공유 시점의 메타를 위해 클라이언트에서도 맞춰 둔다)
export function getPublishedMapOgMeta(map = {}, featureCount = 0, origin = "") {
  const title = compactText(map.title, "LOCA 지도")
  const description = compactText(
    map.description,
    featureCount > 0 ? `좋아하는 곳 ${featureCount}곳을 모아 만든 지도예요.` : "좋아하는 곳을 모아 만든 지도예요."
  )
  const url = absoluteUrl(`/s/${encodeURIComponent(map.slug || "")}`, origin)
  return {
    title: `${title} - LOCA 로카`,
    description,
    image: absoluteUrl("/og-image.png", origin),
    imageAlt: `${title} 지도 커버`,
    url,
    canonical: url,
    type: "article",
    siteName: LOCA_SITE_NAME,
  }
}

export function applyPublicOgMeta(meta = {}) {
  if (typeof document === "undefined") return
  const title = compactText(meta.title, "LOCA")
  const description = compactText(meta.description, "좋아하는 곳을 카드로 모아 나만의 지도를 만들어요.")
  const image = meta.image || absoluteUrl(PUBLIC_OG_FALLBACK_IMAGE)
  const url = meta.url || getCurrentUrl()

  document.title = title
  upsertCanonical(meta.canonical || url)
  upsertMeta("meta[name='description']", "name", "description", description)
  upsertMeta("meta[property='og:type']", "property", "og:type", meta.type || "website")
  upsertMeta("meta[property='og:title']", "property", "og:title", title)
  upsertMeta("meta[property='og:description']", "property", "og:description", description)
  upsertMeta("meta[property='og:image']", "property", "og:image", image)
  upsertMeta("meta[property='og:image:alt']", "property", "og:image:alt", meta.imageAlt || title)
  upsertMeta("meta[property='og:url']", "property", "og:url", url)
  upsertMeta("meta[property='og:site_name']", "property", "og:site_name", meta.siteName || LOCA_SITE_NAME)
  upsertMeta("meta[name='twitter:card']", "name", "twitter:card", "summary_large_image")
  upsertMeta("meta[name='twitter:title']", "name", "twitter:title", title)
  upsertMeta("meta[name='twitter:description']", "name", "twitter:description", description)
  upsertMeta("meta[name='twitter:image']", "name", "twitter:image", image)
}
