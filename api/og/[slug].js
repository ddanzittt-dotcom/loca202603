import { createClient } from "@supabase/supabase-js"

const BOT_UA_PATTERN = /kakaotalk|facebookexternalhit|facebot|twitterbot|slackbot|linkedinbot|discordbot|telegrambot|whatsapp|line\//i

function isBot(userAgent) {
  return BOT_UA_PATTERN.test(userAgent || "")
}

export default async function handler(req, res) {
  const { slug } = req.query
  const userAgent = req.headers["user-agent"] || ""

  // 일반 브라우저 → SPA로 리다이렉트 (utm_source 보존)
  if (!isBot(userAgent)) {
    const utmSource = req.query.utm_source
    const qs = utmSource ? `?utm_source=${encodeURIComponent(utmSource)}` : ""
    const target = `/s/${encodeURIComponent(slug)}${qs}`
    res.setHeader("Location", target)
    res.status(302).end()
    return
  }

  // 봇 → OG 메타태그 HTML 반환
  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY

  let title = "LOCA 지도"
  let description = "로컬 큐레이션 지도를 확인해보세요."
  let pinCount = 0
  let category = "personal"

  if (supabaseUrl && supabaseKey) {
    try {
      const supabase = createClient(supabaseUrl, supabaseKey)

      const { data: mapRow } = await supabase
        .from("maps")
        .select("title, description, theme, category")
        .eq("slug", slug)
        .maybeSingle()

      if (mapRow) {
        title = mapRow.title || title
        description = mapRow.description || description
        category = mapRow.category || category
      }

      const { count } = await supabase
        .from("map_features")
        .select("id", { count: "exact", head: true })
        .eq("map_id", (await supabase.from("maps").select("id").eq("slug", slug).maybeSingle()).data?.id)

      pinCount = count || 0
    } catch (err) {
      console.error("OG meta fetch failed:", err.message)
    }
  }

  const ogDescription = description !== "로컬 큐레이션 지도를 확인해보세요."
    ? description
    : `${pinCount > 0 ? `${pinCount}개의 장소가 등록된 ` : ""}${category === "event" ? "이벤트 " : ""}지도를 확인해보세요.`
  const canonicalUrl = `https://${req.headers.host}/s/${encodeURIComponent(slug)}`

  // OG 이미지: 카카오톡/페이스북은 SVG 를 렌더하지 못하므로 정적 PNG 를 쓴다.
  // (제목·설명은 아래 메타에서 지도별로 동적 표기 → 카드 텍스트는 지도마다 다르게 뜬다)
  const ogImageUrl = `https://${req.headers.host}/og-image.png`

  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(title)} - LOCA</title>
  <meta property="og:type" content="website" />
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(ogDescription)}" />
  <meta property="og:url" content="${canonicalUrl}" />
  <meta property="og:image" content="${ogImageUrl}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:site_name" content="LOCA" />
  <meta property="og:locale" content="ko_KR" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeHtml(title)}" />
  <meta name="twitter:description" content="${escapeHtml(ogDescription)}" />
  <meta name="twitter:image" content="${ogImageUrl}" />
</head>
<body></body>
</html>`

  res.setHeader("Content-Type", "text/html; charset=utf-8")
  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600")
  res.status(200).send(html)
}

function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}
