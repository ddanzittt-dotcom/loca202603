import { useEffect, useMemo, useState } from "react"
import { MapPin, Search } from "lucide-react"
import { getPublishedMaps, listPublicMapFeatureSummaries } from "../lib/mapService"
import { hasSupabaseEnv } from "../lib/supabase"
import { generateMiniMapSvg } from "../lib/miniMapPreview"
import { FeatureEmoji } from "../components/FeatureEmoji"
import { MapCoverThumb } from "../components/MapCoverThumb"

// 탐색 — 발행된 공개 지도를 로그인 없이 검색·열람하는 화면.
// 카드는 지도 목록과 같은 미니맵 프리뷰 + 핀 이모지 스티커로 지도의 분위기를 보여준다.
// visibility가 'public'인 지도만 노출한다 ('링크 공개'는 링크로만 접근).

function formatDate(value) {
  const date = new Date(value || NaN)
  if (Number.isNaN(date.getTime())) return null
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")}`
}

export function ExplorePublicScreen({ onOpenMap }) {
  const [publishedMaps, setPublishedMaps] = useState([])
  const [featuresByMapId, setFeaturesByMapId] = useState(() => new Map())
  const [loading, setLoading] = useState(hasSupabaseEnv)
  const [error, setError] = useState("")
  const [query, setQuery] = useState("")

  useEffect(() => {
    if (!hasSupabaseEnv) return undefined
    let cancelled = false
    getPublishedMaps(60)
      .then(async (rows) => {
        if (cancelled) return
        const visible = (rows || []).filter((mapItem) => mapItem.visibility === "public" && mapItem.slug)
        setPublishedMaps(visible)
        setLoading(false)

        // 카드 미니맵/스티커용 피처 요약은 뒤이어 로드 (없어도 카드는 뜬다)
        try {
          const summaries = await listPublicMapFeatureSummaries(visible.map((mapItem) => mapItem.id))
          if (cancelled) return
          const grouped = new Map()
          for (const row of summaries) {
            const list = grouped.get(row.map_id)
            if (list) list.push(row)
            else grouped.set(row.map_id, [row])
          }
          setFeaturesByMapId(grouped)
        } catch {
          // 미니맵 없이 기본 커버로 노출
        }
      })
      .catch(() => {
        if (cancelled) return
        setError("공개 지도를 불러오지 못했어요. 잠시 후 다시 시도해주세요.")
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  const filteredMaps = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    if (!keyword) return publishedMaps
    return publishedMaps.filter((mapItem) => {
      const haystack = [
        mapItem.title || "",
        mapItem.description || "",
        ...(Array.isArray(mapItem.tags) ? mapItem.tags : []),
      ].join(" ").toLowerCase()
      return haystack.includes(keyword)
    })
  }, [publishedMaps, query])

  const cards = useMemo(() => (
    filteredMaps.map((mapItem) => {
      const features = featuresByMapId.get(mapItem.id) || []
      const pins = features.filter((feature) => feature.type === "pin")
      const stickerEmojis = pins
        .map((feature) => feature.emoji)
        .filter(Boolean)
        .filter((emoji, index, list) => list.indexOf(emoji) === index)
        .slice(0, 3)
      return {
        map: mapItem,
        placeCount: pins.length,
        stickerEmojis,
        previewSvg: generateMiniMapSvg(features, { theme: mapItem.theme, emptyLabel: "구경하러 가기" }),
        dateLabel: formatDate(mapItem.publishedAt || mapItem.updatedAt),
        tags: (Array.isArray(mapItem.tags) ? mapItem.tags : []).filter(Boolean).slice(0, 3),
      }
    })
  ), [filteredMaps, featuresByMapId])

  return (
    <div className="explore-public">
      <label className="explore-public__search">
        <Search size={16} strokeWidth={2.1} aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="지도 제목, 설명, 태그 검색"
          aria-label="공개 지도 검색"
        />
      </label>

      {loading ? <p className="explore-public__status">공개 지도를 불러오는 중…</p> : null}
      {error ? <p className="explore-public__status">{error}</p> : null}
      {!hasSupabaseEnv ? <p className="explore-public__status">서버 연결 후 이용할 수 있어요.</p> : null}

      {!loading && !error ? (
        <div className="explore-public__grid">
          {cards.map(({ map: mapItem, placeCount, stickerEmojis, previewSvg, dateLabel, tags }, cardIndex) => (
            <button
              key={mapItem.slug}
              type="button"
              className="explore-public__card"
              onClick={() => onOpenMap?.(mapItem.slug)}
            >
              <span className="explore-public__no" aria-hidden="true">No.{String(cardIndex + 1).padStart(3, "0")}</span>
              <span className="explore-public__cover">
                <MapCoverThumb
                  mapId={mapItem.id}
                  version={mapItem.publishedAt || mapItem.updatedAt}
                  fallbackSvg={previewSvg}
                  className="explore-public__minimap"
                />
                {stickerEmojis.length ? (
                  <span className="explore-public__stickers" aria-hidden="true">
                    {stickerEmojis.map((emoji, index) => (
                      <span key={`${emoji}-${index}`} className="explore-public__sticker">
                        <FeatureEmoji emoji={emoji} size={24} unicodeFontSize={15} />
                      </span>
                    ))}
                  </span>
                ) : null}
                {placeCount > 0 ? (
                  <span className="explore-public__count">
                    <MapPin size={11} strokeWidth={2.4} aria-hidden="true" />
                    {placeCount}곳
                  </span>
                ) : null}
              </span>
              <span className="explore-public__body">
                <strong>{mapItem.title || "이름 없는 지도"}</strong>
                {mapItem.description ? <small>{mapItem.description}</small> : null}
                {tags.length ? (
                  <span className="explore-public__tags">
                    {tags.map((tag) => <em key={tag}>#{tag}</em>)}
                  </span>
                ) : null}
                {dateLabel ? <time>{dateLabel}</time> : null}
              </span>
            </button>
          ))}
          {!cards.length ? (
            <p className="explore-public__status">
              {query.trim() ? "검색 결과가 없어요. 다른 키워드로 찾아보세요." : "아직 공개된 지도가 없어요."}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
