import { useMemo, useState } from "react"
import { Plus, Download, Search as SearchIcon } from "lucide-react"
import { MapCard, EmptyState, SkeletonCard } from "../components/ui"
import { findPlacementForMap } from "../lib/mapPlacement"

export function MapsListScreen({
  maps,
  features,
  shares = [],
  characterImage,
  onCreate,
  onImport,
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

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return maps.filter((map) =>
      normalized
        ? map.title.toLowerCase().includes(normalized) || (map.description || "").toLowerCase().includes(normalized)
        : true,
    )
  }, [maps, query])

  return (
    <div className="maps-list-view">
      <div className="maps-list-toolbar">
        <button className="button button--ghost" type="button" onClick={onImport}>
          <Download size={15} /> 지도 가져오기
        </button>
        <button className="button button--primary" type="button" onClick={onCreate}>
          <Plus size={15} /> 새 지도 만들기
        </button>
      </div>

      {maps.length > 3 ? (
        <label className="search-box">
          <SearchIcon size={16} aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="지도 검색"
          />
        </label>
      ) : null}

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
          filtered.map((map) => (
            <MapCard
              key={map.id}
              map={map}
              features={features.filter((feature) => feature.mapId === map.id)}
              placementRow={findPlacementForMap(map.id, shares)}
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
