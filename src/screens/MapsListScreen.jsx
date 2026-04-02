import { useMemo, useState } from "react"
import { MapCard, EmptyState, SkeletonCard } from "../components/ui"

export function MapsListScreen({ maps, features, onCreate, onImport, onEdit, onOpen, loading = false }) {
  const [query, setQuery] = useState("")

  const filteredMaps = useMemo(() => {
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
            가져오기
          </button>
          <button className="button button--primary" type="button" onClick={onCreate}>
            새 지도
          </button>
        </div>
      </div>

      <label className="search-box">
        <span aria-hidden="true">⌕</span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="지도 이름이나 설명 검색"
        />
      </label>

      <div className="card-list">
        {loading ? (
          <SkeletonCard count={3} />
        ) : maps.length === 0 ? (
          <EmptyState
            icon="🗺"
            title="첫 번째 지도를 만들어보세요"
            description="나만의 장소를 기록하고 공유할 수 있어요."
            action="새 지도 만들기"
            onAction={onCreate}
          />
        ) : filteredMaps.length === 0 ? (
          <EmptyState
            icon="🔍"
            title="검색 결과가 없어요"
            description="다른 단어로 다시 찾아보세요."
          />
        ) : (
          filteredMaps.map((map) => (
            <MapCard
              key={map.id}
              map={map}
              features={features.filter((feature) => feature.mapId === map.id)}
              onOpen={onOpen}
              onEdit={onEdit}
            />
          ))
        )}
      </div>
    </section>
  )
}
