import { useMemo, useState } from "react"
import { Search as SearchIcon } from "lucide-react"
import { MapCard, EmptyState, SkeletonCard } from "../components/ui"
import { findPlacementForMap, getProfilePlacementState, isEventMap } from "../lib/mapPlacement"

const MAP_FILTERS = [
  { id: "all", label: "전체" },
  { id: "published", label: "발행" },
  { id: "draft", label: "초안" },
  { id: "event", label: "이벤트" },
]

export function MapsListScreen({
  maps,
  features,
  shares = [],
  characterImage,
  onCreate,
  onEdit,
  onOpen,
  onDelete,
  onShare,
  onPublish,
  onUnpublish,
  onAddToProfile,
  onRemoveFromProfile,
  loading = false,
}) {
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState("all")

  const mapEntries = useMemo(() => (
    maps.map((map) => {
      const placementRow = findPlacementForMap(map.id, shares)
      return {
        map,
        placementRow,
        placement: getProfilePlacementState(map, placementRow),
        isEvent: isEventMap(map),
      }
    })
  ), [maps, shares])

  const filterCounts = useMemo(() => (
    mapEntries.reduce((counts, entry) => {
      counts.all += 1
      if (entry.placement.isPublished) counts.published += 1
      if (entry.placement.isDraft) counts.draft += 1
      if (entry.isEvent) counts.event += 1
      return counts
    }, { all: 0, published: 0, draft: 0, event: 0 })
  ), [mapEntries])

  const visibleFilters = useMemo(
    () => MAP_FILTERS.filter((item) => item.id !== "event" || filterCounts.event > 0),
    [filterCounts.event],
  )

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return mapEntries.filter(({ map, placement, isEvent }) => {
      const matchesQuery = normalized
        ? map.title.toLowerCase().includes(normalized) || (map.description || "").toLowerCase().includes(normalized)
        : true
      const matchesFilter = filter === "all"
        || (filter === "published" && placement.isPublished)
        || (filter === "draft" && placement.isDraft)
        || (filter === "event" && isEvent)
      return matchesQuery && matchesFilter
    })
  }, [filter, mapEntries, query])

  return (
    <div className="maps-list-view">
      <div className="maps-list-meta" aria-label={`내 지도 ${filtered.length}개`}>
        <span>MY MAPS</span>
        <strong>{filtered.length}</strong>
      </div>

      {maps.length > 3 ? (
        <label className="archive-search">
          <SearchIcon size={13} aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="이름, 지역, 태그로 검색"
          />
        </label>
      ) : null}

      <div className="maps-filter-row" aria-label="지도 상태 필터">
        {visibleFilters.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`maps-filter-chip${filter === item.id ? " is-active" : ""}`}
            onClick={() => setFilter(item.id)}
          >
            {item.label}
            <span>{filterCounts[item.id] || 0}</span>
          </button>
        ))}
      </div>

      <div className="card-list card-list--maps">
        {loading ? (
          <SkeletonCard count={3} />
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
            title={`"${query}"에 대한 결과가 없어요`}
            description="다른 단어로 다시 찾아보세요"
          />
        ) : (
          filtered.map(({ map, placementRow }) => (
            <MapCard
              key={map.id}
              map={map}
              features={features.filter((feature) => feature.mapId === map.id)}
              placementRow={placementRow}
              onOpen={onOpen}
              onEdit={onEdit}
              onDelete={onDelete}
              onShare={onShare}
              onPublish={onPublish}
              onUnpublish={onUnpublish}
              onAddToProfile={onAddToProfile}
              onRemoveFromProfile={onRemoveFromProfile}
            />
          ))
        )}
      </div>
    </div>
  )
}
