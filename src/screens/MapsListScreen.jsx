import { useMemo, useState } from "react"
import { Plus, Download, Search as SearchIcon } from "lucide-react"
import { MapCard, EmptyState, SkeletonCard } from "../components/ui"

export function MapsListScreen({ maps, features, onCreate, onImport, onEdit, onOpen, onDelete, loading = false }) {
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
    <section className="screen screen--scroll">
      <div className="section-head">
        <div>
          <h1 className="section-head__title">내 지도</h1>
        </div>
        <div className="section-head__actions">
          <button className="button button--ghost" type="button" onClick={onImport}>
            <Download size={15} /> 발행 불러오기
          </button>
          <button className="button button--primary" type="button" onClick={onCreate}>
            <Plus size={15} /> 새 지도
          </button>
        </div>
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
            icon="🗺"
            title="첫 번째 지도를 만들어보세요"
            description="나만의 장소를 기록하고 필요하면 발행할 수 있어요."
            action="새 지도 만들기"
            onAction={onCreate}
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon="🔍"
            title="검색 결과가 없어요"
            description="다른 단어로 다시 찾아보세요."
          />
        ) : (
          filtered.map((map) => (
            <MapCard
              key={map.id}
              map={map}
              features={features.filter((feature) => feature.mapId === map.id)}
              onOpen={onOpen}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))
        )}
      </div>
    </section>
  )
}
