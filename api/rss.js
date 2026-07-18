// RSS 2.0 피드 — 최신 공개 발행 지도. /rss.xml → 이 함수 (vercel.json rewrite).
// 네이버 서치어드바이저 RSS 제출용(사이트맵과 별도의 신규 콘텐츠 발견 채널).
// 작성자 정보(닉네임 포함)는 싣지 않는다 — 최소 노출 원칙.
import { fetchPublicPublishedMaps, escapeXml, SITE_URL } from "./_lib/publishedMaps.js"

const FEED_LIMIT = 50
const DESC_MAX = 300

export default async function handler(req, res) {
  let maps = []
  try {
    maps = await fetchPublicPublishedMaps({
      columns: "slug, title, description, published_at, updated_at",
      limit: FEED_LIMIT,
    })
  } catch (err) {
    console.error("rss: published maps fetch failed:", err.message)
  }

  const items = maps.map((m) => {
    const link = `${SITE_URL}/s/${encodeURIComponent(m.slug)}`
    const pubDate = toRfc822(m.published_at || m.updated_at)
    const description = truncate(m.description || "", DESC_MAX)
    return [
      "    <item>",
      `      <title>${escapeXml(m.title || "LOCA 지도")}</title>`,
      `      <link>${link}</link>`,
      `      <guid isPermaLink="true">${link}</guid>`,
      pubDate ? `      <pubDate>${pubDate}</pubDate>` : null,
      description ? `      <description>${escapeXml(description)}</description>` : null,
      "    </item>",
    ]
      .filter(Boolean)
      .join("\n")
  })

  const lastBuild = toRfc822(maps[0]?.published_at || maps[0]?.updated_at) || new Date().toUTCString()
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>LOCA · 새로 발행된 지도</title>
    <link>${SITE_URL}</link>
    <atom:link href="${SITE_URL}/rss.xml" rel="self" type="application/rss+xml" />
    <description>내 동네를 기록하는 로컬 큐레이션 지도 — 방금 발행된 공개 지도들</description>
    <language>ko</language>
    <lastBuildDate>${lastBuild}</lastBuildDate>
${items.join("\n")}
  </channel>
</rss>
`

  res.setHeader("Content-Type", "application/rss+xml; charset=utf-8")
  res.setHeader("Cache-Control", "public, s-maxage=1800, stale-while-revalidate=86400")
  res.status(200).send(xml)
}

function toRfc822(value) {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d.toUTCString()
}

function truncate(text, max) {
  const t = String(text).trim()
  return t.length > max ? `${t.slice(0, max - 1)}…` : t
}
