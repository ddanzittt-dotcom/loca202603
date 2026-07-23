// 동적 사이트맵 — 서비스가 직접 책임지는 페이지만 싣는다.
// /sitemap.xml → 이 함수 (vercel.json rewrite. public/sitemap.xml 정적 파일은 제거됨 —
// Vercel 은 filesystem 이 rewrite 보다 우선이라 정적 파일이 남아 있으면 이 함수가 실행되지 않는다).
//
// ⚠️ 정책(2026-07-23): **사용자가 만든 지도(/s/:slug)는 사이트맵에 싣지 않는다.**
//    "검색·탐색에 공개" 토글은 앱 안(탐색·모두의 지도) 노출까지만을 뜻하며,
//    검열되지 않은 사용자 콘텐츠를 외부 검색엔진으로 영구 유출시키지 않는다.
//    (검색엔진 캐시는 원본을 지워도 남는다) 검색봇에는 api/og/[slug].js 가 noindex 를 준다.
//    나중에 승인제(admin 이 허용한 지도만 색인)로 열 경우 이 파일과 og 핸들러를 함께 바꿀 것.
import { SITE_URL } from "./_lib/publishedMaps.js"

// /community-web(모두의 지도)은 2026-07-23 철거됨 — 데이터 0행·진입 경로 없음.
const STATIC_URLS = [
  { path: "/", changefreq: "daily", priority: "1.0" },
  { path: "/terms", changefreq: "monthly", priority: "0.3" },
  { path: "/privacy", changefreq: "monthly", priority: "0.3" },
]

export default async function handler(req, res) {
  const entries = STATIC_URLS.map(
    (u) => `  <url><loc>${SITE_URL}${u.path}</loc><changefreq>${u.changefreq}</changefreq><priority>${u.priority}</priority></url>`
  )

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join("\n")}\n</urlset>\n`

  res.setHeader("Content-Type", "application/xml; charset=utf-8")
  res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400")
  res.status(200).send(xml)
}
