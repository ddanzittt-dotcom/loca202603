// RSS 2.0 피드 — /rss.xml → 이 함수 (vercel.json rewrite).
// 네이버 서치어드바이저에 제출된 신규 콘텐츠 발견 채널.
//
// ⚠️ 정책(2026-07-23): **사용자가 만든 지도(/s/:slug)는 싣지 않는다.**
//    RSS 제출은 사실상 색인 요청이므로, 검열되지 않은 사용자 콘텐츠를 외부로
//    내보내지 않는다는 사이트맵과 동일한 원칙을 따른다(api/sitemap.js 주석 참조).
//    현재는 서비스가 직접 책임지는 공개 표면만 싣는다. 승인제를 도입하면
//    "admin 이 색인 허용한 지도"만 여기에 추가할 것.
import { escapeXml, SITE_URL } from "./_lib/publishedMaps.js"

const FEED_ENTRIES = [
  {
    path: "/",
    title: "LOCA 로카 — 나만의 지도 만들기",
    description: "좋아하는 장소를 기록하고, 카드로 모아 나만의 지도를 만들어 보세요.",
  },
  {
    path: "/community-web",
    title: "모두의 지도 — 사람들이 남긴 장소와 길",
    description: "사람들이 남긴 장소와 길을 지도에서 찾아보세요.",
  },
]

export default function handler(req, res) {
  const buildDate = new Date().toUTCString()

  const items = FEED_ENTRIES.map((entry) => {
    const link = `${SITE_URL}${entry.path}`
    return [
      "    <item>",
      `      <title>${escapeXml(entry.title)}</title>`,
      `      <link>${link}</link>`,
      `      <guid isPermaLink="true">${link}</guid>`,
      `      <description>${escapeXml(entry.description)}</description>`,
      "    </item>",
    ].join("\n")
  })

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>LOCA · 로컬 큐레이션 지도</title>
    <link>${SITE_URL}</link>
    <atom:link href="${SITE_URL}/rss.xml" rel="self" type="application/rss+xml" />
    <description>좋아하는 장소를 기록해 나만의 지도를 만드는 서비스</description>
    <language>ko</language>
    <lastBuildDate>${buildDate}</lastBuildDate>
${items.join("\n")}
  </channel>
</rss>
`

  res.setHeader("Content-Type", "application/rss+xml; charset=utf-8")
  res.setHeader("Cache-Control", "public, s-maxage=1800, stale-while-revalidate=86400")
  res.status(200).send(xml)
}
