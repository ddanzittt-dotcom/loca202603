import { createClient } from "@supabase/supabase-js"

const THEME_COLORS = {
  "#635BFF": { bg: "#635BFF", text: "#fff" },
  "#12B981": { bg: "#12B981", text: "#fff" },
  "#F97316": { bg: "#F97316", text: "#fff" },
  "#EF4444": { bg: "#EF4444", text: "#fff" },
  "#0EA5E9": { bg: "#0EA5E9", text: "#fff" },
}

function escapeXml(str) {
  return (str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;")
}

export default async function handler(req, res) {
  const { slug } = req.query
  let title = "LOCA 지도"
  let themeColor = "#635BFF"
  let pinCount = 0

  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY

  if (supabaseUrl && supabaseKey) {
    try {
      const supabase = createClient(supabaseUrl, supabaseKey)
      const { data: mapRow } = await supabase
        .from("maps")
        .select("id, title, theme")
        .eq("slug", slug)
        .maybeSingle()

      if (mapRow) {
        title = mapRow.title || title
        themeColor = mapRow.theme || themeColor

        const { count } = await supabase
          .from("map_features")
          .select("id", { count: "exact", head: true })
          .eq("map_id", mapRow.id)

        pinCount = count || 0
      }
    } catch { /* use defaults */ }
  }

  const theme = THEME_COLORS[themeColor] || THEME_COLORS["#635BFF"]
  const subtitle = pinCount > 0 ? `${pinCount}개의 장소` : "LOCA 지도"

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
  <rect width="1200" height="630" fill="${theme.bg}"/>
  <text x="600" y="220" fill="${theme.text}" font-family="Arial,sans-serif" font-size="100" text-anchor="middle" opacity="0.25">🗺</text>
  <text x="600" y="360" fill="${theme.text}" font-family="Arial,sans-serif" font-size="52" font-weight="bold" text-anchor="middle">${escapeXml(title.slice(0, 30))}</text>
  <text x="600" y="420" fill="${theme.text}" font-family="Arial,sans-serif" font-size="28" text-anchor="middle" opacity="0.7">${escapeXml(subtitle)}</text>
  <text x="600" y="560" fill="${theme.text}" font-family="Arial,sans-serif" font-size="32" font-weight="bold" text-anchor="middle" opacity="0.4">LOCA</text>
</svg>`

  res.setHeader("Content-Type", "image/svg+xml")
  res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=86400")
  res.status(200).send(svg)
}
