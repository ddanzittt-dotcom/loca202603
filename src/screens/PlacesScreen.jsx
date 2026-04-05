import { useMemo, useState } from "react"
import { Search as SearchIcon, MapPin } from "lucide-react"
import { featureSort } from "../lib/appUtils"

const TYPE_ICON = {
  pin: (
    <div className="pl-type-icon pl-type-icon--pin">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="#FF6B35" stroke="none">
        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/>
        <circle cx="12" cy="10" r="2.5" fill="#FFF4EB"/>
      </svg>
    </div>
  ),
  route: (
    <div className="pl-type-icon pl-type-icon--route">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0F6E56" strokeWidth="1.8" strokeLinecap="round">
        <path d="M4 19L10 7L16 14L20 5"/>
      </svg>
    </div>
  ),
  area: (
    <div className="pl-type-icon pl-type-icon--area">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#854F0B" strokeWidth="1.8" strokeLinecap="round" strokeDasharray="3 2">
        <rect x="4" y="4" width="16" height="16" rx="3"/>
      </svg>
    </div>
  ),
}

const TYPE_LABEL = {
  pin: { text: "핀", className: "pl-badge--pin" },
  route: { text: "경로", className: "pl-badge--route" },
  area: { text: "구역", className: "pl-badge--area" },
}

export function PlacesScreen({ maps, features, onOpenFeature }) {
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState("all")

  const featureCounts = useMemo(() => {
    const counts = { all: features.length }
    for (const f of features) {
      counts[f.mapId] = (counts[f.mapId] || 0) + 1
    }
    return counts
  }, [features])

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
      <div className="pl-header">
        <h1 className="pl-header__title">장소 목록</h1>
        <p className="pl-header__sub">저장한 핀과 경로를 빠르게 찾고 바로 열기</p>
      </div>

      <div className="pl-search">
        <SearchIcon size={14} color="#aaa" />
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="이름, 메모로 검색" />
      </div>

      <div className="pl-chips">
        <button className={`pl-chip${filter === "all" ? " is-active" : ""}`} type="button" onClick={() => setFilter("all")}>
          전체 <span className="pl-chip__count">{featureCounts.all || 0}</span>
        </button>
        {maps.map((map) => (
          <button key={map.id} className={`pl-chip${filter === map.id ? " is-active" : ""}`} type="button" onClick={() => setFilter(map.id)}>
            {map.title} <span className="pl-chip__count">{featureCounts[map.id] || 0}</span>
          </button>
        ))}
      </div>

      {features.length === 0 ? (
        <div className="pl-empty">
          <div className="pl-empty__icon">
            <MapPin size={24} color="#FF6B35" />
          </div>
          <p className="pl-empty__title">아직 저장한 장소가 없어요</p>
          <p className="pl-empty__desc">지도에서 핀을 찍거나 경로를 그려보세요</p>
        </div>
      ) : filteredFeatures.length === 0 ? (
        <div className="pl-empty">
          <p className="pl-empty__title">검색 결과가 없어요</p>
          <p className="pl-empty__desc">다른 단어로 다시 찾아보세요</p>
        </div>
      ) : (
        <div className="pl-list">
          {filteredFeatures.map((feature, idx) => {
            const map = maps.find((item) => item.id === feature.mapId)
            const badge = TYPE_LABEL[feature.type] || TYPE_LABEL.pin
            const sub = feature.type === "route"
              ? `${map?.title || ""} · ${feature.note || ""}`
              : `${map?.title || ""} · ${feature.note || ""}`
            return (
              <button key={feature.id} className={`pl-item${idx < filteredFeatures.length - 1 ? " pl-item--border" : ""}`} type="button" onClick={() => onOpenFeature(feature.id)}>
                {TYPE_ICON[feature.type] || TYPE_ICON.pin}
                <div className="pl-item__info">
                  <p className="pl-item__name">{feature.title}</p>
                  <p className="pl-item__sub">{map?.title || "지도"}</p>
                </div>
                <span className={`pl-badge ${badge.className}`}>{badge.text}</span>
              </button>
            )
          })}
        </div>
      )}
    </section>
  )
}
