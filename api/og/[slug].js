// 발행 지도(/s/:slug) 봇 응답 — 메신저 링크 미리보기 + 검색엔진 색인 차단.
//
// 흐름 (vercel.json rewrite 가 봇 UA 일 때만 이 함수로 보낸다):
//   일반 브라우저 → 302 로 SPA(/s/:slug) 복귀
//   메신저 봇(카카오톡 등) → OG 메타로 링크 카드 구성
//   검색 봇(구글·네이버 Yeti 등) → 같은 HTML + **noindex**
//
// ⚠️ 정책(2026-07-23): **사용자가 만든 지도는 외부 검색에 색인하지 않는다.**
//    "검색·탐색에 공개"(visibility=public)는 앱 안 노출까지만을 뜻한다. 검열되지 않은
//    사용자 콘텐츠가 구글·네이버에 영구 박제되지 않도록, 공개 여부와 무관하게 noindex 다.
//    robots.txt 로 막지 않고 **크롤은 허용하되 noindex** 를 주는 이유: 크롤이 차단되면
//    봇이 noindex 를 읽지 못해 링크만으로 색인될 수 있다.
//    → 승인제로 열 때는 이 파일의 INDEXABLE 판정과 api/sitemap.js·api/rss.js 를 함께 바꿀 것.
// ⚠️ 데이터 소스는 **발행 스냅샷(map_publication_revisions.status='live')** 이다.
//    live map_features 를 읽으면 아직 발행하지 않은 수정분이 유출된다(072 참조).
// ⚠️ 사진·메모·장소 목록은 출력하지 않는다 — 링크 카드에 필요한 제목·설명까지만.
import { createClient } from "@supabase/supabase-js"

// 링크 미리보기 봇 (OG 메타만 읽는다)
const MESSENGER_BOT_PATTERN = /kakaotalk|facebookexternalhit|facebot|twitterbot|slackbot|linkedinbot|discordbot|telegrambot|whatsapp|line\//i
// 검색엔진 크롤러 (noindex 를 읽히기 위해 여기로 받는다). yeti=네이버, daumoa=다음, slurp=야후
const SEARCH_BOT_PATTERN = /googlebot|google-inspectiontool|bingbot|yeti|naverbot|daum(oa)?|duckduckbot|applebot|slurp|baiduspider|petalbot/i

const DEFAULT_DESCRIPTION = "좋아하는 곳을 모아 만든 지도예요."

export default async function handler(req, res) {
  const { slug } = req.query
  const userAgent = req.headers["user-agent"] || ""
  const isMessengerBot = MESSENGER_BOT_PATTERN.test(userAgent)
  const isSearchBot = SEARCH_BOT_PATTERN.test(userAgent)

  // 일반 브라우저 → SPA로 리다이렉트 (utm_source 보존)
  if (!isMessengerBot && !isSearchBot) {
    const utmSource = req.query.utm_source
    const qs = utmSource ? `?utm_source=${encodeURIComponent(utmSource)}` : ""
    res.setHeader("Location", `/s/${encodeURIComponent(slug)}${qs}`)
    res.status(302).end()
    return
  }

  const snapshot = await loadPublishedSnapshot(slug)

  const title = snapshot?.title || "LOCA 지도"
  const features = snapshot?.features || []
  const pinCount = features.length
  const description = snapshot?.description
    || (pinCount > 0 ? `좋아하는 곳 ${pinCount}곳을 모아 만든 지도예요.` : DEFAULT_DESCRIPTION)

  const host = req.headers.host || "loca.im"
  const canonicalUrl = `https://${host}/s/${encodeURIComponent(slug)}`
  // OG 이미지: 카카오톡/페이스북은 SVG 를 렌더하지 못하므로 정적 PNG 를 쓴다.
  const ogImageUrl = `https://${host}/og-image.png`

  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)} - LOCA 로카</title>
  <meta name="description" content="${escapeHtml(description)}" />
  <link rel="canonical" href="${canonicalUrl}" />
  <meta name="robots" content="noindex, follow" />
  <meta property="og:type" content="article" />
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta property="og:url" content="${canonicalUrl}" />
  <meta property="og:image" content="${ogImageUrl}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:site_name" content="LOCA" />
  <meta property="og:locale" content="ko_KR" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeHtml(title)}" />
  <meta name="twitter:description" content="${escapeHtml(description)}" />
  <meta name="twitter:image" content="${ogImageUrl}" />
</head>
<body>
  <main>
    <h1>${escapeHtml(title)}</h1>
    <p>${escapeHtml(description)}</p>
    ${pinCount > 0 ? `<p>장소 ${pinCount}곳</p>` : ""}
    <p><a href="${canonicalUrl}">LOCA에서 이 지도 보기</a></p>
    <p><a href="https://${host}/">LOCA 로카 — 나만의 지도 만들기</a></p>
  </main>
</body>
</html>`

  res.setHeader("Content-Type", "text/html; charset=utf-8")
  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600")
  res.setHeader("X-Robots-Tag", "noindex")
  res.status(200).send(html)
}

// 발행 스냅샷 로드 — 실패해도 던지지 않는다(링크 미리보기가 500 이 되면 안 된다).
async function loadPublishedSnapshot(slug) {
  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseKey || !slug) return null

  try {
    const supabase = createClient(supabaseUrl, supabaseKey)
    const { data: revision } = await supabase
      .from("map_publication_revisions")
      .select("snapshot,published_at")
      .eq("slug", slug)
      .eq("status", "live")
      .order("revision_no", { ascending: false })
      .limit(1)
      .maybeSingle()

    const snapMap = revision?.snapshot?.map
    if (snapMap) {
      const rows = Array.isArray(revision.snapshot?.features) ? revision.snapshot.features : []
      return {
        title: snapMap.title || "",
        description: snapMap.description || "",
        visibility: snapMap.visibility || "public",
        publishedAt: revision.published_at || snapMap.updated_at || null,
        // 장소 목록은 싣지 않는다(noindex 정책) — 개수만 쓴다
        features: rows.filter((row) => row && typeof row === "object"),
      }
    }

    // 레거시 폴백 — 스냅샷 이전에 발행된 지도(제목/설명/공개범위만, 장소 목록 없음)
    const { data: mapRow } = await supabase
      .from("maps")
      .select("title, description, visibility, is_published, published_at")
      .eq("slug", slug)
      .maybeSingle()
    if (!mapRow?.is_published) return null
    return {
      title: mapRow.title || "",
      description: mapRow.description || "",
      visibility: mapRow.visibility || "public",
      publishedAt: mapRow.published_at || null,
      features: [],
    }
  } catch (err) {
    console.error("OG meta fetch failed:", err.message)
    return null
  }
}

function escapeHtml(str) {
  return String(str ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}
