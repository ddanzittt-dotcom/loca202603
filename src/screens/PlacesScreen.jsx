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
  pin: { text: "장소", className: "pl-badge--pin" },
  route: { text: "길·코스", className: "pl-badge--route" },
  area: { text: "구역", className: "pl-badge--area" },
}

const TYPE_FILTERS = [
  { id: "all", label: "전체" },
  { id: "pin", label: "장소" },
  { id: "route", label: "길·코스" },
  { id: "area", label: "구역" },
]

const CONTENT_FILTERS = [
  { id: "photo", label: "사진 있음" },
  { id: "memory", label: "기억 있음" },
]

function getFeaturePhotos(feature) {
  const ownPhotos = Array.isArray(feature.photos) ? feature.photos : []
  const memoPhotos = (feature.memos || []).flatMap((memo) => Array.isArray(memo.photos) ? memo.photos : [])
  return [...ownPhotos, ...memoPhotos].filter(Boolean)
}

function hasFeatureMemory(feature) {
  return Boolean(
    feature.note?.trim()
    || (feature.memos || []).some((memo) => memo.text?.trim() || (memo.photos || []).length > 0)
    || (feature.voices || []).length > 0,
  )
}

export function PlacesScreen({
  maps,
  features,
  characterImage,
  onOpenFeature,
  onCreateRecord,
  embedded = false,
  title = "장소",
  subtitle = "저장한 장소와 길·코스를 빠르게 찾기",
}) {
  const [query, setQuery] = useState("")
  const [mapFilter, setMapFilter] = useState("all")
  const [typeFilter, setTypeFilter] = useState("all")
  const [contentFilters, setContentFilters] = useState([])

  const featureCounts = useMemo(() => {
    const counts = { all: features.length }
    for (const f of features) {
      counts[f.mapId] = (counts[f.mapId] || 0) + 1
    }
    return counts
  }, [features])

  const typeCounts = useMemo(() => {
    const counts = { all: features.length, pin: 0, route: 0, area: 0 }
    for (const feature of features) {
      counts[feature.type] = (counts[feature.type] || 0) + 1
    }
    return counts
  }, [features])

  const contentCounts = useMemo(() => ({
    photo: features.filter((feature) => getFeaturePhotos(feature).length > 0).length,
    memory: features.filter(hasFeatureMemory).length,
  }), [features])

  const filteredFeatures = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return [...features].sort(featureSort).filter((feature) => {
      const matchesMap = mapFilter === "all" || feature.mapId === mapFilter
      const matchesType = typeFilter === "all" || feature.type === typeFilter
      const matchesPhoto = !contentFilters.includes("photo") || getFeaturePhotos(feature).length > 0
      const matchesMemory = !contentFilters.includes("memory") || hasFeatureMemory(feature)
      const memoTexts = (feature.memos || []).map((memo) => memo.text || "")
      const haystack = [feature.title, feature.note, ...(feature.tags || []), ...memoTexts].join(" ").toLowerCase()
      return matchesMap && matchesType && matchesPhoto && matchesMemory && (!normalized || haystack.includes(normalized))
    })
  }, [contentFilters, features, mapFilter, query, typeFilter])

  const toggleContentFilter = (filterId) => {
    setContentFilters((current) => (
      current.includes(filterId)
        ? current.filter((item) => item !== filterId)
        : [...current, filterId]
    ))
  }

  const Wrapper = embedded ? "div" : "section"

  return (
    <Wrapper className={embedded ? "pl-screen pl-screen--embedded" : "screen screen--scroll pl-screen"}>
      <div className="pl-header">
        <h1 className="pl-header__title">{title}</h1>
        <p className="pl-header__sub">{subtitle}</p>
      </div>

      <div className="pl-search">
        <SearchIcon size={14} color="#aaa" />
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="이름, 메모로 검색" />
      </div>

      <div className="pl-chips">
        <button className={`pl-chip${mapFilter === "all" ? " is-active" : ""}`} type="button" onClick={() => setMapFilter("all")}>
          전체 <span className="pl-chip__count">{featureCounts.all || 0}</span>
        </button>
        {maps.map((map) => (
          <button key={map.id} className={`pl-chip${mapFilter === map.id ? " is-active" : ""}`} type="button" onClick={() => setMapFilter(map.id)}>
            {map.title} <span className="pl-chip__count">{featureCounts[map.id] || 0}</span>
          </button>
        ))}
      </div>

      <div className="pl-filter-row" aria-label="기록 타입 필터">
        {TYPE_FILTERS.map((filterItem) => (
          <button
            key={filterItem.id}
            className={`pl-chip pl-chip--type${typeFilter === filterItem.id ? " is-active" : ""}`}
            type="button"
            onClick={() => setTypeFilter(filterItem.id)}
          >
            {filterItem.label} <span className="pl-chip__count">{typeCounts[filterItem.id] || 0}</span>
          </button>
        ))}
      </div>

      <div className="pl-filter-row" aria-label="기록 내용 필터">
        {CONTENT_FILTERS.map((filterItem) => (
          <button
            key={filterItem.id}
            className={`pl-chip pl-chip--soft${contentFilters.includes(filterItem.id) ? " is-active" : ""}`}
            type="button"
            onClick={() => toggleContentFilter(filterItem.id)}
          >
            {filterItem.label} <span className="pl-chip__count">{contentCounts[filterItem.id] || 0}</span>
          </button>
        ))}
      </div>

      {features.length === 0 ? (
        <div className="pl-empty">
          <img
            src={characterImage || "/characters/cloud_lv1.svg"}
            alt=""
            className="pl-empty__character"
          />
          <p className="pl-empty__title">아직 저장한 장소가 없어요</p>
          <p className="pl-empty__desc">지도에서 기록을 남기면 여기에 모여요</p>
          {onCreateRecord ? (
            <button className="pl-empty__action" type="button" onClick={onCreateRecord}>
              + 기록 시작하기
            </button>
          ) : (
            <span className="pl-empty__hint">+ 기록에서 장소를 추가해보세요</span>
          )}
        </div>
      ) : filteredFeatures.length === 0 ? (
        <div className="pl-empty">
          <div className="pl-empty__icon">
            <SearchIcon size={20} color="#FF6B35" />
          </div>
          <p className="pl-empty__title">{`"${query}"에 대한 결과가 없어요`}</p>
          <p className="pl-empty__desc">다른 단어로 다시 찾아보세요</p>
        </div>
      ) : (
        <div className="pl-list">
          {filteredFeatures.map((feature, idx) => {
            const map = maps.find((item) => item.id === feature.mapId)
            const badge = TYPE_LABEL[feature.type] || TYPE_LABEL.pin
            const photoCount = getFeaturePhotos(feature).length
            const memoryCount = (feature.note?.trim() ? 1 : 0) + (feature.memos || []).length + (feature.voices || []).length
            const meta = [
              map?.title || "지도",
              photoCount > 0 ? `사진 ${photoCount}` : null,
              memoryCount > 0 ? `기억 ${memoryCount}` : null,
            ].filter(Boolean).join(" · ")
            return (
              <button key={feature.id} className={`pl-item${idx < filteredFeatures.length - 1 ? " pl-item--border" : ""}`} type="button" onClick={() => onOpenFeature(feature.id)}>
                {TYPE_ICON[feature.type] || TYPE_ICON.pin}
                <div className="pl-item__info">
                  <p className="pl-item__name">{feature.title}</p>
                  <p className="pl-item__sub">{meta}</p>
                </div>
                <span className={`pl-badge ${badge.className}`}>{badge.text}</span>
              </button>
            )
          })}
        </div>
      )}
    </Wrapper>
  )
}
