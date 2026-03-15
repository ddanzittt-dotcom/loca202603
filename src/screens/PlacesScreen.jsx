import { useMemo, useState } from "react"
import { featureSort } from "../lib/appUtils"

export function PlacesScreen({ maps, features, onOpenFeature }) {
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState("all")

  const filteredFeatures = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return [...features].sort(featureSort).filter((feature) => {
      const matchesMap = filter === "all" || feature.mapId === filter
      const haystack = [feature.title, feature.note, ...(feature.tags || [])].join(" ").toLowerCase()
      return matchesMap && (!normalized || haystack.includes(normalized))
    })
  }, [features, filter, query])

  return (
    <section className="screen screen--scroll">
      <div className="section-head">
        <div>
          <h1 className="section-head__title">장소 목록</h1>
          <p className="section-head__subtitle">저장한 핀과 경로를 빠르게 찾고 바로 열기</p>
        </div>
      </div>

      <label className="search-box">
        <span aria-hidden="true">🔎</span>
        <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="이름, 태그, 메모 검색" />
      </label>

      <div className="chips-row">
        <button className={`chip${filter === "all" ? " chip--active" : ""}`} type="button" onClick={() => setFilter("all")}>전체</button>
        {maps.map((map) => (
          <button key={map.id} className={`chip${filter === map.id ? " chip--active" : ""}`} type="button" onClick={() => setFilter(map.id)}>{map.title}</button>
        ))}
      </div>

      <div className="card-list">
        {filteredFeatures.length === 0 ? (
          <article className="empty-card">
            <strong>저장된 장소가 없어요.</strong>
            <p>지도에서 핀을 추가하면 이 목록에도 자동으로 표시돼요.</p>
          </article>
        ) : (
          filteredFeatures.map((feature) => {
            const map = maps.find((item) => item.id === feature.mapId)
            return (
              <button key={feature.id} className="place-row" type="button" onClick={() => onOpenFeature(feature.id)}>
                <span className="place-row__emoji">{feature.emoji}</span>
                <span className="place-row__text">
                  <strong>{feature.title}</strong>
                  <small>{feature.note || map?.title || "메모 없음"}</small>
                </span>
                <span className="place-row__type">{feature.type === "pin" ? "핀" : feature.type === "area" ? "범위" : "경로"}</span>
              </button>
            )
          })
        )}
      </div>
    </section>
  )
}
