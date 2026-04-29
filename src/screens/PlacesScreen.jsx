import { useMemo, useState } from "react"
import { Search as SearchIcon, ChevronRight, FileText, Camera, Mic } from "lucide-react"
import { featureSort } from "../lib/appUtils"

const TYPE_FILTERS = [
  { id: "all", label: "전체", dot: null },
  { id: "pin", label: "장소", dot: "pin" },
  { id: "route", label: "경로", dot: "route" },
  { id: "area", label: "영역", dot: "area" },
]

const CONTENT_FILTERS = [
  { id: "photo", label: "사진 있음" },
  { id: "memory", label: "메모 있음" },
  { id: "voice", label: "음성 있음" },
]

function getFeaturePhotos(feature) {
  const ownPhotos = Array.isArray(feature.photos) ? feature.photos : []
  const memoPhotos = (feature.memos || []).flatMap((memo) => Array.isArray(memo.photos) ? memo.photos : [])
  return [...ownPhotos, ...memoPhotos].filter(Boolean)
}

function hasFeatureMemo(feature) {
  return Boolean(
    feature.note?.trim()
    || (feature.memos || []).some((memo) => memo.text?.trim()),
  )
}

function hasFeatureVoice(feature) {
  return (feature.voices || []).length > 0
}

const RouteIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 19L10 7L16 14L20 5" />
  </svg>
)

const AreaIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="3 2" aria-hidden="true">
    <rect x="4" y="4" width="16" height="16" rx="3" />
  </svg>
)

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
    memory: features.filter(hasFeatureMemo).length,
    voice: features.filter(hasFeatureVoice).length,
  }), [features])

  const filteredFeatures = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return [...features].sort(featureSort).filter((feature) => {
      const matchesMap = mapFilter === "all" || feature.mapId === mapFilter
      const matchesType = typeFilter === "all" || feature.type === typeFilter
      const matchesPhoto = !contentFilters.includes("photo") || getFeaturePhotos(feature).length > 0
      const matchesMemory = !contentFilters.includes("memory") || hasFeatureMemo(feature)
      const matchesVoice = !contentFilters.includes("voice") || hasFeatureVoice(feature)
      const memoTexts = (feature.memos || []).map((memo) => memo.text || "")
      const haystack = [feature.title, feature.note, ...(feature.tags || []), ...memoTexts].join(" ").toLowerCase()
      return matchesMap && matchesType && matchesPhoto && matchesMemory && matchesVoice && (!normalized || haystack.includes(normalized))
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
        <SearchIcon size={13} color="#aaa" />
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="이름, 메모로 검색" />
      </div>

      <div className="pl-filter-stack">
        <div className="pl-filter-row" aria-label="지도별 필터">
          <span className="pl-filter-label">지도</span>
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
          <span className="pl-filter-label">타입</span>
          {TYPE_FILTERS.map((filterItem) => (
            <button
              key={filterItem.id}
              className={`pl-chip${typeFilter === filterItem.id ? " is-active" : ""}`}
              type="button"
              onClick={() => setTypeFilter(filterItem.id)}
            >
              {filterItem.dot ? <span className={`pl-chip__dot pl-chip__dot--${filterItem.dot}`} /> : null}
              {filterItem.label} <span className="pl-chip__count">{typeCounts[filterItem.id] || 0}</span>
            </button>
          ))}
        </div>

        <div className="pl-filter-row" aria-label="기록 내용 필터">
          <span className="pl-filter-label">기록</span>
          {CONTENT_FILTERS.map((filterItem) => {
            const isActive = contentFilters.includes(filterItem.id)
            const count = contentCounts[filterItem.id] || 0
            const isEmpty = count === 0 && !isActive
            return (
              <button
                key={filterItem.id}
                className={`pl-chip${isActive ? " is-active" : ""}${isEmpty ? " pl-chip--empty" : ""}`}
                type="button"
                onClick={() => toggleContentFilter(filterItem.id)}
              >
                {filterItem.label} <span className="pl-chip__count">{count}</span>
              </button>
            )
          })}
        </div>
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
          {filteredFeatures.map((feature) => {
            const map = maps.find((item) => item.id === feature.mapId)
            const photoCount = getFeaturePhotos(feature).length
            const memoCount = (feature.note?.trim() ? 1 : 0) + (feature.memos || []).filter((memo) => memo.text?.trim()).length
            const voiceCount = (feature.voices || []).length
            const trimmedName = (feature.title || "").trim()
            const isEmptyName = !trimmedName
            const displayName = isEmptyName ? "이름 없는 장소 · 직접 입력하기" : trimmedName
            const emoji = feature.emoji || "📍"

            return (
              <button
                key={feature.id}
                className="pl-item"
                type="button"
                onClick={() => onOpenFeature(feature.id, isEmptyName ? { focusName: true } : undefined)}
              >
                <div className={`pl-item__icon pl-item__icon--${feature.type || "pin"}`}>
                  {feature.type === "route" ? (
                    <RouteIcon />
                  ) : feature.type === "area" ? (
                    <AreaIcon />
                  ) : (
                    <span className="pl-item__emoji">{emoji}</span>
                  )}
                </div>
                <div className="pl-item__info">
                  <p className={`pl-item__name${isEmptyName ? " pl-item__name--empty" : ""}`}>{displayName}</p>
                  <div className="pl-item__meta">
                    {map ? <span className="pl-item__map-name">{map.title}</span> : null}
                    {photoCount > 0 ? (
                      <>
                        <span className="pl-item__sep" aria-hidden="true" />
                        <span className="pl-item__media">
                          <Camera size={9} strokeWidth={1.8} aria-hidden="true" /> 사진 {photoCount}
                        </span>
                      </>
                    ) : null}
                    {memoCount > 0 ? (
                      <>
                        <span className="pl-item__sep" aria-hidden="true" />
                        <span className="pl-item__media">
                          <FileText size={9} strokeWidth={1.8} aria-hidden="true" /> 메모 {memoCount}
                        </span>
                      </>
                    ) : null}
                    {voiceCount > 0 ? (
                      <>
                        <span className="pl-item__sep" aria-hidden="true" />
                        <span className="pl-item__media">
                          <Mic size={9} strokeWidth={1.8} aria-hidden="true" /> 음성 {voiceCount}
                        </span>
                      </>
                    ) : null}
                  </div>
                </div>
                <span className="pl-item__arrow" aria-hidden="true">
                  <ChevronRight size={12} strokeWidth={2} />
                </span>
              </button>
            )
          })}
        </div>
      )}
    </Wrapper>
  )
}
