import { useMemo, useState } from "react"
import {
  Search as SearchIcon,
  ChevronDown,
  ChevronRight,
  FileText,
  Camera,
  Mic,
  MapPin,
  SlidersHorizontal,
  X,
} from "lucide-react"
import { featureSort } from "../lib/appUtils"
import { isEventMap } from "../lib/mapPlacement"

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

function isPersonalRecordType(feature) {
  return ["pin", "route", "area"].includes(feature?.type)
}

function getTypeLabel(type) {
  if (type === "route") return "경로"
  if (type === "area") return "영역"
  return "장소"
}

function getFeatureDescription(feature) {
  const note = feature.note?.trim()
  if (note) return note
  const tags = Array.isArray(feature.tags) ? feature.tags.filter(Boolean).slice(0, 3) : []
  return tags.length > 0 ? tags.map((tag) => `#${tag}`).join(" ") : ""
}

function formatFeatureDate(feature) {
  const value = feature.updatedAt || feature.updated_at || feature.createdAt || feature.created_at
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  return date.toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit" }).replace(/\.$/u, "")
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
  subtitle = "저장한 장소와 길을 빠르게 찾기",
}) {
  const [query, setQuery] = useState("")
  const [mapFilter, setMapFilter] = useState("all")
  const [typeFilter, setTypeFilter] = useState("all")
  const [contentFilters, setContentFilters] = useState([])
  const [filterSheetOpen, setFilterSheetOpen] = useState(false)
  const [sortMode, setSortMode] = useState("latest")
  const personalMaps = useMemo(
    () => maps.filter((map) => !isEventMap(map)),
    [maps],
  )
  const personalMapIds = useMemo(
    () => new Set(personalMaps.map((map) => map.id)),
    [personalMaps],
  )

  const recordFeatures = useMemo(
    () => features.filter((feature) => isPersonalRecordType(feature) && personalMapIds.has(feature.mapId)),
    [features, personalMapIds],
  )

  const featureCounts = useMemo(() => {
    const counts = { all: recordFeatures.length }
    for (const f of recordFeatures) {
      counts[f.mapId] = (counts[f.mapId] || 0) + 1
    }
    return counts
  }, [recordFeatures])

  const typeCounts = useMemo(() => {
    const counts = { all: recordFeatures.length, pin: 0, route: 0, area: 0 }
    for (const feature of recordFeatures) {
      counts[feature.type] = (counts[feature.type] || 0) + 1
    }
    return counts
  }, [recordFeatures])

  const contentCounts = useMemo(() => ({
    photo: recordFeatures.filter((feature) => getFeaturePhotos(feature).length > 0).length,
    memory: recordFeatures.filter(hasFeatureMemo).length,
    voice: recordFeatures.filter(hasFeatureVoice).length,
  }), [recordFeatures])

  const filteredFeatures = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return [...recordFeatures].sort((a, b) => (
      sortMode === "oldest" ? featureSort(b, a) : featureSort(a, b)
    )).filter((feature) => {
      const matchesMap = mapFilter === "all" || feature.mapId === mapFilter
      const matchesType = typeFilter === "all" || feature.type === typeFilter
      const matchesPhoto = !contentFilters.includes("photo") || getFeaturePhotos(feature).length > 0
      const matchesMemory = !contentFilters.includes("memory") || hasFeatureMemo(feature)
      const matchesVoice = !contentFilters.includes("voice") || hasFeatureVoice(feature)
      const memoTexts = (feature.memos || []).map((memo) => memo.text || "")
      const haystack = [feature.title, feature.note, ...(feature.tags || []), ...memoTexts].join(" ").toLowerCase()
      return matchesMap && matchesType && matchesPhoto && matchesMemory && matchesVoice && (!normalized || haystack.includes(normalized))
    })
  }, [contentFilters, mapFilter, query, recordFeatures, sortMode, typeFilter])

  const activeFilterChips = useMemo(() => {
    const chips = []
    const map = personalMaps.find((item) => item.id === mapFilter)
    if (map) {
      chips.push({ id: `map-${map.id}`, kind: "map", label: map.title })
    }
    const type = TYPE_FILTERS.find((item) => item.id === typeFilter && item.id !== "all")
    if (type) {
      chips.push({ id: `type-${type.id}`, kind: "type", label: type.label })
    }
    for (const filterId of contentFilters) {
      const filterItem = CONTENT_FILTERS.find((item) => item.id === filterId)
      if (filterItem) chips.push({ id: `content-${filterItem.id}`, kind: "content", filterId, label: filterItem.label })
    }
    return chips
  }, [contentFilters, mapFilter, personalMaps, typeFilter])

  const activeFilterCount = activeFilterChips.length
  const sortLabel = sortMode === "oldest" ? "오래된순" : "최신순"

  const toggleContentFilter = (filterId) => {
    setContentFilters((current) => (
      current.includes(filterId)
        ? current.filter((item) => item !== filterId)
        : [...current, filterId]
    ))
  }

  const clearFilterChip = (chip) => {
    if (chip.kind === "map") setMapFilter("all")
    if (chip.kind === "type") setTypeFilter("all")
    if (chip.kind === "content") {
      setContentFilters((current) => current.filter((item) => item !== chip.filterId))
    }
  }

  const resetFilters = () => {
    setMapFilter("all")
    setTypeFilter("all")
    setContentFilters([])
  }

  const toggleSortMode = () => {
    setSortMode((current) => (current === "latest" ? "oldest" : "latest"))
  }

  const Wrapper = embedded ? "div" : "section"

  return (
    <Wrapper className={embedded ? "pl-screen pl-screen--embedded" : "screen screen--scroll pl-screen"}>
      <div className="pl-header">
        <h1 className="pl-header__title">{title === "장소" ? `PLACES / ${recordFeatures.length}` : title}</h1>
        <p className="pl-header__sub">{subtitle}</p>
      </div>

      <div className="pl-search">
        <SearchIcon size={13} color="#aaa" />
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="이름, 메모로 검색" />
      </div>

      <div className={`pl-filter-bar${activeFilterCount > 0 ? " has-active" : ""}`}>
        <div className="pl-filter-main">
          <button
            className={`pl-filter-button${activeFilterCount > 0 ? " is-active" : ""}`}
            type="button"
            onClick={() => setFilterSheetOpen(true)}
          >
            <SlidersHorizontal size={12} strokeWidth={2.2} aria-hidden="true" />
            필터
            {activeFilterCount > 0 ? <span className="pl-filter-button__count">{activeFilterCount}</span> : null}
          </button>
          {activeFilterChips.length > 0 ? (
            <div className="pl-active-filters" aria-label="적용된 필터">
              {activeFilterChips.map((chip) => (
                <button
                  key={chip.id}
                  className="pl-active-chip"
                  type="button"
                  onClick={() => clearFilterChip(chip)}
                  aria-label={`${chip.label} 필터 해제`}
                >
                  {chip.label}
                  <X size={10} strokeWidth={2.4} aria-hidden="true" />
                </button>
              ))}
            </div>
          ) : null}
        </div>
        {activeFilterCount === 0 ? (
          <button className="pl-sort-button" type="button" onClick={toggleSortMode}>
            {sortLabel}
            <ChevronDown size={11} strokeWidth={2.2} aria-hidden="true" />
          </button>
        ) : null}
      </div>

      {recordFeatures.length === 0 ? (
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
            const map = personalMaps.find((item) => item.id === feature.mapId)
            const photoCount = getFeaturePhotos(feature).length
            const memoCount = (feature.note?.trim() ? 1 : 0) + (feature.memos || []).filter((memo) => memo.text?.trim()).length
            const voiceCount = (feature.voices || []).length
            const trimmedName = (feature.title || "").trim()
            const isEmptyName = !trimmedName
            const displayName = isEmptyName ? "이름 없는 장소 · 직접 입력하기" : trimmedName
            const typeLabel = getTypeLabel(feature.type)
            const description = getFeatureDescription(feature)
            const dateLabel = formatFeatureDate(feature)
            const metaItems = []
            if (dateLabel) metaItems.push({ key: "date", content: <span>{dateLabel}</span> })
            if (photoCount > 0) {
              metaItems.push({
                key: "photo",
                content: <span className="pl-item__media"><Camera size={9} strokeWidth={1.8} aria-hidden="true" /> 사진 {photoCount}</span>,
              })
            }
            if (memoCount > 0) {
              metaItems.push({
                key: "memo",
                content: <span className="pl-item__media"><FileText size={9} strokeWidth={1.8} aria-hidden="true" /> 메모 {memoCount}</span>,
              })
            }
            if (voiceCount > 0) {
              metaItems.push({
                key: "voice",
                content: <span className="pl-item__media"><Mic size={9} strokeWidth={1.8} aria-hidden="true" /> 음성 {voiceCount}</span>,
              })
            }

            return (
              <button
                key={feature.id}
                className="pl-item"
                type="button"
                onClick={() => onOpenFeature(feature.id, isEmptyName ? { focusName: true } : undefined)}
              >
                <span className={`pl-item__bar pl-item__bar--${feature.type || "pin"}`} aria-hidden="true" />
                <div className={`pl-item__icon pl-item__icon--${feature.type || "pin"}`}>
                  {feature.type === "route" ? (
                    <RouteIcon />
                  ) : feature.type === "area" ? (
                    <AreaIcon />
                  ) : (
                    <MapPin size={17} fill="currentColor" stroke="none" aria-hidden="true" />
                  )}
                </div>
                <div className="pl-item__info">
                  <div className="pl-item__kicker">
                    <span className={`pl-item__type pl-item__type--${feature.type || "pin"}`}>{typeLabel}</span>
                    {map ? <span className="pl-item__map-name">{map.title}</span> : null}
                  </div>
                  <p className={`pl-item__name${isEmptyName ? " pl-item__name--empty" : ""}`}>{displayName}</p>
                  {description ? <p className="pl-item__desc">{description}</p> : null}
                  <div className="pl-item__meta">
                    {metaItems.length > 0 ? metaItems.map((item, index) => (
                      <span className="pl-item__meta-part" key={item.key}>
                        {index > 0 ? <span className="pl-item__sep" aria-hidden="true" /> : null}
                        {item.content}
                      </span>
                    )) : <span>기록</span>}
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

      {filterSheetOpen ? (
        <div className="pl-filter-overlay" onClick={() => setFilterSheetOpen(false)}>
          <section className="pl-filter-sheet" role="dialog" aria-modal="true" aria-label="장소 필터" onClick={(event) => event.stopPropagation()}>
            <span className="pl-filter-sheet__handle" aria-hidden="true" />
            <div className="pl-filter-sheet__head">
              <h2>필터</h2>
              <button type="button" onClick={resetFilters}>초기화</button>
            </div>

            <div className="pl-filter-sheet__group">
              <span className="pl-filter-sheet__label">소속 지도</span>
              <div className="pl-filter-sheet__chips">
                <button className={`pl-chip${mapFilter === "all" ? " is-active" : ""}`} type="button" onClick={() => setMapFilter("all")}>
                  전체 <span className="pl-chip__count">{featureCounts.all || 0}</span>
                </button>
                {personalMaps.map((map) => (
                  <button key={map.id} className={`pl-chip${mapFilter === map.id ? " is-active" : ""}`} type="button" onClick={() => setMapFilter(map.id)}>
                    {map.title} <span className="pl-chip__count">{featureCounts[map.id] || 0}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="pl-filter-sheet__group">
              <span className="pl-filter-sheet__label">유형</span>
              <div className="pl-filter-sheet__chips">
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
            </div>

            <div className="pl-filter-sheet__group">
              <span className="pl-filter-sheet__label">기록</span>
              <div className="pl-filter-sheet__chips">
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
                      {filterItem.label}
                    </button>
                  )
                })}
              </div>
            </div>

            <button className="pl-filter-sheet__submit" type="button" onClick={() => setFilterSheetOpen(false)}>
              {filteredFeatures.length}개 보기
            </button>
          </section>
        </div>
      ) : null}
    </Wrapper>
  )
}
