import { useEffect, useMemo, useState } from "react"
import { Search as SearchIcon } from "lucide-react"
import { featureSort } from "../lib/appUtils"
import { getPlaceType } from "../lib/placeTypes"
import { PlaceCardFront } from "../components/binder/PlaceFlipCard"

// 카드 바인더 — 내 장소. 장소 하나 = 카드 한 장.
// 필터 칩 없이 검색만 제공한다 (리디자인 §1). 페이지당 장수는 조정 가능.

const PAGE_SIZE_OPTIONS = [6, 9, 12, 20, 40]
const PAGE_SIZE_KEY = "loca.binder_page_size"

function initialPageSize() {
  const stored = Number(localStorage.getItem(PAGE_SIZE_KEY))
  return PAGE_SIZE_OPTIONS.includes(stored) ? stored : 9
}

function isPersonalRecordType(feature) {
  return ["pin", "route", "area"].includes(feature?.type)
}

export function PlacesScreen({
  maps,
  features,
  onOpenFeature,
  onCreateRecord,
  embedded = false,
  title = "장소",
  subtitle = "저장한 장소와 길을 빠르게 찾기",
  initialQuery = null, // 대시보드 동네 도감 → 동네명으로 진입
}) {
  const [query, setQuery] = useState("")
  const [page, setPage] = useState(0)
  const [pageAnim, setPageAnim] = useState(0)
  const [pageSize, setPageSize] = useState(initialPageSize)

  // 외부에서 검색어를 주입하면(동네 타일 클릭 등) 반영
  useEffect(() => {
    if (initialQuery != null) setQuery(initialQuery)
  }, [initialQuery])

  const personalMaps = maps
  const personalMapIds = useMemo(
    () => new Set(personalMaps.map((map) => map.id)),
    [personalMaps],
  )
  const mapTitleById = useMemo(
    () => new Map(personalMaps.map((map) => [map.id, map.title])),
    [personalMaps],
  )

  const recordFeatures = useMemo(
    () => features.filter((feature) => isPersonalRecordType(feature) && (!feature.mapId || personalMapIds.has(feature.mapId))),
    [features, personalMapIds],
  )

  // 카드 번호: 오래된 기록부터 순번 부여 — 검색과 무관하게 고정
  const dexNoByFeatureId = useMemo(() => {
    const ordered = [...recordFeatures].sort((a, b) => featureSort(b, a))
    const info = new Map()
    ordered.forEach((feature, index) => info.set(feature.id, String(index + 1).padStart(3, "0")))
    return info
  }, [recordFeatures])

  const filteredFeatures = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    const sorted = [...recordFeatures].sort((a, b) => featureSort(b, a))
    if (!normalized) return sorted
    return sorted.filter((feature) => {
      const memoTexts = (feature.memos || []).map((memo) => memo.text || "")
      const typeLabel = getPlaceType(feature)?.label || ""
      // regionName(동네 태그)도 검색 대상 — 대시보드 "동네 도감" 타일 클릭이 동네명으로 진입한다
      const haystack = [feature.title, feature.note, feature.regionName, typeLabel, ...(feature.tags || []), ...memoTexts]
        .join(" ")
        .toLowerCase()
      return haystack.includes(normalized)
    })
  }, [query, recordFeatures])

  const pageCount = Math.max(1, Math.ceil(filteredFeatures.length / pageSize))
  const safePage = Math.min(page, pageCount - 1)
  const pageFeatures = filteredFeatures.slice(safePage * pageSize, safePage * pageSize + pageSize)
  const sleeveCount = Math.max(0, pageSize - pageFeatures.length)

  const changePageSize = (next) => {
    setPageSize(next)
    setPage(0)
    try { localStorage.setItem(PAGE_SIZE_KEY, String(next)) } catch { /* ignore */ }
  }

  const goPage = (next) => {
    const clamped = Math.max(0, Math.min(pageCount - 1, next))
    if (clamped === safePage) return
    setPage(clamped)
    setPageAnim((v) => v + 1)
  }

  // 검색이 바뀌면 1페이지로
  useEffect(() => { setPage(0) }, [query])

  // 키보드 ← → 페이지 이동
  useEffect(() => {
    const handleKey = (event) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return
      if (event.key === "ArrowLeft") goPage(safePage - 1)
      if (event.key === "ArrowRight") goPage(safePage + 1)
    }
    window.addEventListener("keydown", handleKey)
    return () => window.removeEventListener("keydown", handleKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safePage, pageCount])

  const Wrapper = embedded ? "div" : "section"
  const searching = query.trim().length > 0

  return (
    <Wrapper className={embedded ? "pl-screen pl-screen--embedded" : "screen screen--scroll pl-screen"}>
      {embedded ? null : (
        <div className="pl-header">
          <h1 className="pl-header__title">{title === "장소" ? `내 장소 / ${recordFeatures.length}` : title}</h1>
          <p className="pl-header__sub">{subtitle}</p>
        </div>
      )}

      <div className="bd-search">
        <SearchIcon size={15} strokeWidth={2.4} aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="이름 · 메모 · 주소 · 타입 검색"
          aria-label="장소 검색"
        />
      </div>

      {recordFeatures.length === 0 ? (
        <div className="pl-empty">
          <p className="pl-empty__title">아직 등록한 장소가 없어요</p>
          <p className="pl-empty__desc">첫 장소를 등록하면 카드가 되어 여기 꽂혀요</p>
          {onCreateRecord ? (
            <button className="pl-empty__action" type="button" onClick={onCreateRecord}>
              + 등록하기
            </button>
          ) : null}
        </div>
      ) : (
        <div className="bd-binder">
          <div className="bd-binderhead">
            <span className="bd-bindertt">
              {searching ? `검색 "${query.trim()}" ${filteredFeatures.length}장` : `카드 ${recordFeatures.length}장`}
            </span>
            <label className="bd-pagesize">
              <span>페이지당</span>
              <select value={pageSize} onChange={(event) => changePageSize(Number(event.target.value))} aria-label="페이지당 카드 수">
                {PAGE_SIZE_OPTIONS.map((option) => (
                  <option key={option} value={option}>{option}장</option>
                ))}
              </select>
            </label>
            <div className="bd-pager" aria-label="바인더 페이지">
              <button type="button" onClick={() => goPage(safePage - 1)} disabled={safePage === 0} aria-label="이전 페이지">◀</button>
              <span className="bd-pg">{safePage + 1} / {pageCount}</span>
              <button type="button" onClick={() => goPage(safePage + 1)} disabled={safePage >= pageCount - 1} aria-label="다음 페이지">▶</button>
            </div>
          </div>

          {filteredFeatures.length === 0 ? (
            <div className="bd-sleeve bd-sleeve--wide">
              <span>{`"${query.trim()}" 결과 없음`}</span>
              <span>다른 단어로 찾아보세요</span>
            </div>
          ) : (
            <div key={pageAnim} className="bd-grid bd-grid--flip">
              {pageFeatures.map((feature) => (
                <button
                  key={feature.id}
                  type="button"
                  className="bd-card"
                  onClick={() => onOpenFeature(feature.id)}
                  aria-label={`${(feature.title || "").trim() || "이름 없는 장소"} 카드 열기`}
                >
                  <span className="bd-shine" aria-hidden="true" />
                  <PlaceCardFront
                    feature={feature}
                    dexNo={dexNoByFeatureId.get(feature.id)}
                    mapTitle={mapTitleById.get(feature.mapId) || null}
                  />
                </button>
              ))}
              {Array.from({ length: sleeveCount }).map((_, index) => (
                <div key={`sleeve-${index}`} className="bd-sleeve" aria-hidden="true">
                  <span>빈 슬롯</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Wrapper>
  )
}
