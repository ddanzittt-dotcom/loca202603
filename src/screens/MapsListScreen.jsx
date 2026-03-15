import { useMemo, useState } from "react"
import { MapCard } from "../components/ui"

export function MapsListScreen({ maps, features, onCreate, onEdit, onOpen }) {
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
        <button className="button button--primary" type="button" onClick={onCreate}>
          새 지도
        </button>
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
        {filteredMaps.length === 0 ? (
          <article className="empty-card">
            <strong>검색 결과가 없어요</strong>
            <p>새 지도를 만들거나 다른 단어로 다시 찾아보세요.</p>
          </article>
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
