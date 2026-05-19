import { useEffect, useMemo, useState } from "react"
import { ChevronDown, Lock, Search as SearchIcon } from "lucide-react"
import { EmptyState, SkeletonCard } from "../components/ui"
import { findPlacementForMap, getProfilePlacementState } from "../lib/mapPlacement"

const MAP_FILTERS = [
  { id: "all", label: "전체" },
  { id: "published", label: "발행" },
  { id: "draft", label: "작성 중" },
]

function renderMiniMapGrid() {
  const vertical = [40, 80, 120, 160].map((x) => `<line x1="${x}" y1="0" x2="${x}" y2="138"/>`).join("")
  const horizontal = [34, 69, 103].map((y) => `<line x1="0" y1="${y}" x2="200" y2="${y}"/>`).join("")
  return `<g stroke="#DDD0B3" stroke-width="0.6">${vertical}${horizontal}</g>`
}

function generateLocalMiniMapSvg(features) {
  const pins = features.filter((item) => (
    item.type === "pin"
    && Number.isFinite(Number(item.lat))
    && Number.isFinite(Number(item.lng))
  ))
  const bg = '<rect width="200" height="138" fill="#EFE7D4"/>'
  const grid = renderMiniMapGrid()

  if (pins.length === 0) {
    return `<svg viewBox="0 0 200 138" xmlns="http://www.w3.org/2000/svg">${bg}${grid}<text x="100" y="73" text-anchor="middle" font-family="Pretendard, sans-serif" font-size="10" font-weight="700" fill="#8B847A">장소 없음</text></svg>`
  }

  const coords = pins.map((pin) => ({ lat: Number(pin.lat), lng: Number(pin.lng) }))
  const minLat = Math.min(...coords.map((p) => p.lat))
  const maxLat = Math.max(...coords.map((p) => p.lat))
  const minLng = Math.min(...coords.map((p) => p.lng))
  const maxLng = Math.max(...coords.map((p) => p.lng))
  const latRange = maxLat - minLat
  const lngRange = maxLng - minLng

  if (latRange < 0.0005 && lngRange < 0.0005) {
    const countLabel = pins.length > 1 ? `<text x="100" y="102" text-anchor="middle" font-family="Pretendard, sans-serif" font-size="9" font-weight="700" fill="#4A453E">${pins.length}곳 한 지점</text>` : ""
    return `<svg viewBox="0 0 200 138" xmlns="http://www.w3.org/2000/svg">${bg}${grid}<circle cx="100" cy="69" r="14" fill="#FF6B35" opacity="0.15"/><circle cx="100" cy="69" r="8" fill="#FF6B35" opacity="0.3"/><circle cx="100" cy="69" r="6" fill="white" stroke="#C44518" stroke-width="1"/><circle cx="100" cy="69" r="3.5" fill="#FF6B35"/>${countLabel}</svg>`
  }

  const padding = 18
  const drawableW = 200 - padding * 2
  const drawableH = 138 - padding * 2
  const scale = Math.min(drawableW / lngRange, drawableH / latRange)
  const usedW = lngRange * scale
  const usedH = latRange * scale
  const offsetX = padding + (drawableW - usedW) / 2
  const offsetY = padding + (drawableH - usedH) / 2
  const points = coords.map((p) => ({
    x: offsetX + (p.lng - minLng) * scale,
    y: offsetY + (maxLat - p.lat) * scale,
  }))
  const radius = pins.length > 20 ? 3 : pins.length > 10 ? 3.5 : 4.5
  const dots = points.map((point) => {
    const x = point.x.toFixed(1)
    const y = point.y.toFixed(1)
    return `<circle cx="${x}" cy="${y}" r="${radius}" fill="white" stroke="#C44518" stroke-width="0.8"/><circle cx="${x}" cy="${y}" r="${(radius * 0.62).toFixed(1)}" fill="#FF6B35"/>`
  }).join("")

  return `<svg viewBox="0 0 200 138" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">${bg}${grid}<g>${dots}</g></svg>`
}

function formatRelativeDate(dateStr) {
  if (!dateStr) return "최근 수정"
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000)
  if (diff <= 0) return "오늘"
  if (diff === 1) return "어제"
  if (diff < 7) return `${diff}일 전`
  if (diff < 30) return `${Math.floor(diff / 7)}주 전`
  const date = new Date(dateStr)
  if (Number.isNaN(date.getTime())) return "최근 수정"
  return `${date.getMonth() + 1}월 ${date.getDate()}일`
}

function getMapStatus(map, placement) {
  if (placement.isDraft) return "draft"
  if (!placement.isPublished || map?.visibility === "private" || map?.privacy === "private") return "private"
  const collabCount = Number(map.collabCount ?? map.collab_count ?? map.collaboratorCount ?? map.collaborator_count ?? 0)
  if (collabCount > 0 || (map.userRole && map.userRole !== "owner")) return "collab"
  return "published"
}

function getCollabCount(map) {
  return Number(map.collabCount ?? map.collab_count ?? map.collaboratorCount ?? map.collaborator_count ?? 1)
}

function StatusBadge({ status, collabCount }) {
  if (status === "published") return null
  if (status === "draft") return <span className="maps-v3-status maps-v3-status--draft">작성 중</span>
  if (status === "private") {
    return (
      <span className="maps-v3-status maps-v3-status--private">
        <Lock size={8} strokeWidth={2.8} aria-hidden="true" />
        비공개
      </span>
    )
  }
  return <span className="maps-v3-status maps-v3-status--collab">함께 {collabCount}</span>
}

function MapsV3Card({ item, onOpen }) {
  return (
    <button className="maps-v3-card" type="button" onClick={() => onOpen(item.map.id)}>
      <span className="maps-v3-card__preview" dangerouslySetInnerHTML={{ __html: item.previewSvg }} />
      <StatusBadge status={item.status} collabCount={item.collabCount} />
      <span className="maps-v3-card__info">
        <strong className="maps-v3-card__title">{item.map.title || "이름 없는 지도"}</strong>
        <span className="maps-v3-card__meta">
          <span>{item.placeCount} 장소</span>
          <i aria-hidden="true" />
          <span>{item.updatedLabel}</span>
        </span>
      </span>
    </button>
  )
}

export function MapsListScreen({
  maps,
  features,
  shares = [],
  characterImage,
  onCreate,
  onOpen,
  loading = false,
}) {
  const [query, setQuery] = useState("")
  const [debouncedQuery, setDebouncedQuery] = useState("")
  const [filter, setFilter] = useState("all")

  useEffect(() => {
    if (!query.trim()) {
      setDebouncedQuery("")
      return undefined
    }
    const timer = window.setTimeout(() => setDebouncedQuery(query), 300)
    return () => window.clearTimeout(timer)
  }, [query])

  const mapEntries = useMemo(() => (
    maps.map((map) => {
      const placementRow = findPlacementForMap(map.id, shares)
      const placement = getProfilePlacementState(map, placementRow)
      const mapFeatures = features.filter((feature) => feature.mapId === map.id)
      const status = getMapStatus(map, placement)
      return {
        map,
        placement,
        status,
        collabCount: getCollabCount(map),
        placeCount: mapFeatures.length,
        updatedLabel: formatRelativeDate(map.updatedAt || map.updated_at || map.modifiedAt || map.modified_at),
        previewSvg: map.previewSvg || map.preview_svg || generateLocalMiniMapSvg(mapFeatures),
        searchable: [
          map.title,
          map.description,
          map.region,
          map.location,
          ...(Array.isArray(map.tags) ? map.tags : []),
        ].filter(Boolean).join(" ").toLowerCase(),
      }
    })
  ), [features, maps, shares])

  const counts = useMemo(() => ({
    all: mapEntries.length,
    published: mapEntries.filter((entry) => entry.status === "published" || entry.status === "collab").length,
    draft: mapEntries.filter((entry) => entry.status === "draft").length,
  }), [mapEntries])

  const filtered = useMemo(() => {
    const normalized = debouncedQuery.trim().toLowerCase()
    return mapEntries
      .filter((entry) => {
        if (filter === "published" && !(entry.status === "published" || entry.status === "collab")) return false
        if (filter === "draft" && entry.status !== "draft") return false
        return normalized ? entry.searchable.includes(normalized) : true
      })
      .sort((a, b) => new Date(b.map.updatedAt || b.map.updated_at || 0) - new Date(a.map.updatedAt || a.map.updated_at || 0))
  }, [debouncedQuery, filter, mapEntries])

  return (
    <div className="maps-v3-view">
      <label className="archive-search maps-v3-search">
        <SearchIcon size={14} aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="이름, 지역, 태그로 검색"
        />
      </label>

      <div className="maps-v3-filter-row" aria-label="지도 보기 옵션">
        <div className="maps-v3-chips" role="radiogroup" aria-label="지도 상태 필터">
          {MAP_FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`maps-v3-chip${filter === item.id ? " is-active" : ""}`}
              aria-pressed={filter === item.id}
              onClick={() => setFilter(item.id)}
            >
              {item.label}
              <span className="num">{counts[item.id] || 0}</span>
            </button>
          ))}
        </div>
        <button className="maps-v3-sort" type="button" onClick={() => {}}>
          최신순
          <ChevronDown size={10} strokeWidth={2.4} aria-hidden="true" />
        </button>
      </div>

      <div className="maps-v3-grid">
        {loading ? (
          <SkeletonCard count={4} />
        ) : maps.length === 0 ? (
          <EmptyState
            variant="character"
            characterImage={characterImage || "/characters/cloud_lv1.svg"}
            title="첫 지도를 만들어볼까요"
            description="가봤던 곳, 좋았던 곳을 지도에 모아보세요"
            action="새 지도 만들기"
            onAction={onCreate}
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<SearchIcon size={22} color="#FF6B35" />}
            title={debouncedQuery ? `"${debouncedQuery}"에 대한 결과가 없어요` : "조건에 맞는 지도가 없어요"}
            description="다른 검색어나 필터로 다시 찾아보세요"
          />
        ) : (
          filtered.map((item) => (
            <MapsV3Card key={item.map.id} item={item} onOpen={onOpen} />
          ))
        )}
      </div>
    </div>
  )
}
