// 동적 사이트맵 — 정적 페이지 + 공개 발행 지도(/s/:slug).
// /sitemap.xml → 이 함수 (vercel.json rewrite. public/sitemap.xml 정적 파일은 제거됨 —
// Vercel 은 filesystem 이 rewrite 보다 우선이라 정적 파일이 남아 있으면 이 함수가 실행되지 않는다).
// Supabase 조회 실패 시에도 정적 URL만으로 200 응답한다 (사이트맵 5xx 는 색인에 악영향).
import { fetchPublicPublishedMaps, SITE_URL } from "./_lib/publishedMaps.js"

const STATIC_URLS = [
  { path: "/", changefreq: "daily", priority: "1.0" },
  { path: "/community-web", changefreq: "daily", priority: "0.8" },
  { path: "/terms", changefreq: "monthly", priority: "0.3" },
  { path: "/privacy", changefreq: "monthly", priority: "0.3" },
]

export default async function handler(req, res) {
  let maps = []
  try {
    maps = await fetchPublicPublishedMaps({ columns: "slug, published_at, updated_at", limit: 5000 })
  } catch (err) {
    console.error("sitemap: published maps fetch failed:", err.message)
  }

  const entries = [
    ...STATIC_URLS.map(
      (u) => `  <url><loc>${SITE_URL}${u.path}</loc><changefreq>${u.changefreq}</changefreq><priority>${u.priority}</priority></url>`
    ),
    ...maps.map((m) => {
      const lastmod = toDateOnly(m.updated_at || m.published_at)
      return `  <url><loc>${SITE_URL}/s/${encodeURIComponent(m.slug)}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ""}</url>`
    }),
  ]

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join("\n")}\n</urlset>\n`

  res.setHeader("Content-Type", "application/xml; charset=utf-8")
  res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400")
  res.status(200).send(xml)
}

function toDateOnly(value) {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
}
