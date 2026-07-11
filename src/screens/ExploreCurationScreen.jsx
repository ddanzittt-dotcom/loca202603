import { useCallback, useEffect, useMemo, useState } from "react"
import { CalendarRange, Landmark, MapPin, Plus } from "lucide-react"
import {
  DEFAULT_EXPLORE_LOCATION,
  EXPLORE_LOCATION_KEY,
  eventDdayBadge,
  eventToPrefill,
  fetchNearbyEvents,
  fetchNearbyPlaces,
  fetchNearbyWildlife,
  formatDistanceKm,
  formatEventPeriod,
  placeToPrefill,
  wildlifeToPrefill,
} from "../lib/exploreCuration"
import { CurationDetailSheet } from "../components/sheets/CurationDetailSheet"
import { PixelRadar } from "../components/explore/PixelRadar"
import { fetchRealTerrain } from "../lib/realTerrain"
import { spriteForRadarItem } from "../lib/radarSprites"

// 탐색 — 좌측 큰 지도(레이더) + 우측 세로 목록(매물목록형). 상단 필터탭으로 한 종류씩.
// 탭 선택 = 지도 도트도 그 종류만 필터. 카드 CTA [+ 등록] → CollectSheet 프리필 → 바인더.

// 레이더 도트 → 카드 앵커 id (스크롤·선택용)
function cardAnchorId(type, id) {
  return `xc-card-${type}-${id}`
}

const TABS = [
  { key: "all", label: "전체" },
  { key: "ongoing", label: "진행중인 행사" },
  { key: "upcoming", label: "곧 시작하는 행사" },
  { key: "places", label: "가볼만한 공간" },
  { key: "wildlife", label: "이 동네 생물" },
]

function readStoredLocation() {
  try {
    const raw = localStorage.getItem(EXPLORE_LOCATION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!Number.isFinite(parsed?.lat) || !Number.isFinite(parsed?.lng)) return null
    return { lat: parsed.lat, lng: parsed.lng, label: parsed.label || "내 위치 주변" }
  } catch {
    return null
  }
}

function shortAddress(value) {
  return String(value || "").split(" ").slice(0, 3).join(" ")
}

// 종류별 목록 행 — 좁은 우측 열에 맞춘 컴팩트 가로 행(썸네일·본문·거리/등록).
function ListRow({ item, type, onRegister, onOpen, anchorId }) {
  const distance = formatDistanceKm(item.distKm)

  let thumb = null
  let badge = null
  let meta = null
  let registerLabel = "카드로 등록"
  let prefill = null

  if (type === "event") {
    const dday = eventDdayBadge(item)
    const period = formatEventPeriod(item)
    thumb = item.image
      ? <img src={item.image} alt="" loading="lazy" />
      : <span className="xc-row__fallback"><CalendarRange size={22} strokeWidth={1.6} /></span>
    badge = dday ? <span className={`xc-row__tag xc-row__tag--${dday.kind}`}>{dday.label}</span> : null
    meta = (
      <span className="xc-row__meta">
        {period ? <em>{period}</em> : null}
        {shortAddress(item.addr) ? <span>{shortAddress(item.addr)}</span> : null}
      </span>
    )
    prefill = eventToPrefill(item)
  } else if (type === "place") {
    thumb = item.image
      ? <img src={item.image} alt="" loading="lazy" />
      : <span className="xc-row__fallback"><Landmark size={20} strokeWidth={1.6} /></span>
    badge = item.category ? <span className="xc-row__tag xc-row__tag--place">{item.category}</span> : null
    meta = (
      <span className="xc-row__meta">
        {shortAddress(item.addr) ? <span>{shortAddress(item.addr)}</span> : null}
      </span>
    )
    prefill = placeToPrefill(item)
  } else {
    thumb = item.photo
      ? <img src={item.photo} alt="" loading="lazy" />
      : <span className="xc-row__emoji">{item.emoji || "✨"}</span>
    badge = <span className="xc-row__tag xc-row__tag--wild">{item.emoji} {item.category}</span>
    meta = (
      <span className="xc-row__meta">
        {item.place ? <span>{String(item.place).split(",")[0]}</span> : null}
      </span>
    )
    registerLabel = "발견 기록"
    prefill = wildlifeToPrefill(item)
  }

  return (
    <article
      id={anchorId}
      className="xc-row"
      role="button"
      tabIndex={0}
      onClick={() => onOpen?.(item)}
      onKeyDown={(keyEvent) => {
        if (keyEvent.key === "Enter" || keyEvent.key === " ") {
          keyEvent.preventDefault()
          onOpen?.(item)
        }
      }}
    >
      <div className="xc-row__thumb" aria-hidden="true">
        {thumb}
        {badge}
      </div>
      <div className="xc-row__body">
        <strong className="xc-row__title">{item.title}</strong>
        {meta}
      </div>
      <div className="xc-row__foot">
        {distance ? (
          <span className="xc-row__dist">
            <MapPin size={11} strokeWidth={2.4} aria-hidden="true" />
            {distance}
          </span>
        ) : <span />}
        <button
          type="button"
          className="xc-row__register"
          onClick={(clickEvent) => {
            clickEvent.stopPropagation()
            onRegister?.(prefill)
          }}
        >
          <Plus size={13} strokeWidth={2.6} aria-hidden="true" />
          {registerLabel}
        </button>
      </div>
    </article>
  )
}

export function ExploreCurationScreen({ onRegister, showToast }) {
  const [location, setLocation] = useState(() => readStoredLocation())
  const [locating, setLocating] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [detailItem, setDetailItem] = useState(null) // {type: "event"|"place"|"wildlife", data}
  const [activeTab, setActiveTab] = useState("all")
  // 결과를 요청 키와 함께 저장 — 키가 다르면 로딩 중 (effect 내 동기 setState 회피)
  const [result, setResult] = useState({ key: null, items: [], error: "" })
  const [placesResult, setPlacesResult] = useState({ key: null, items: [], error: "" })
  const [wildResult, setWildResult] = useState({ key: null, items: [], error: "" })

  const effectiveLocation = location || DEFAULT_EXPLORE_LOCATION
  const requestKey = `${effectiveLocation.lat},${effectiveLocation.lng}|${reloadKey}`

  // 실제 지형(OSM) — 레이더 오버월드 배경용. 실패하면 null → 절차 생성 필드 폴백
  const [terrain, setTerrain] = useState(null)
  const terrainKey = `${Number(effectiveLocation.lat).toFixed(2)},${Number(effectiveLocation.lng).toFixed(2)}`
  useEffect(() => {
    let cancelled = false
    fetchRealTerrain(effectiveLocation.lat, effectiveLocation.lng)
      .then((data) => { if (!cancelled) setTerrain(data) })
      .catch(() => { if (!cancelled) setTerrain(null) })
    return () => { cancelled = true }
    // 위치 그리드(~1.1km) 단위로만 재요청
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terrainKey])

  useEffect(() => {
    let cancelled = false
    fetchNearbyEvents(effectiveLocation)
      .then((items) => { if (!cancelled) setResult({ key: requestKey, items, error: "" }) })
      .catch(() => {
        if (cancelled) return
        setResult({ key: requestKey, items: [], error: "주변 행사를 불러오지 못했어요. 잠시 후 다시 시도해주세요." })
      })
    return () => { cancelled = true }
  }, [effectiveLocation, requestKey])

  useEffect(() => {
    let cancelled = false
    fetchNearbyPlaces(effectiveLocation)
      .then((items) => { if (!cancelled) setPlacesResult({ key: requestKey, items, error: "" }) })
      .catch(() => {
        if (cancelled) return
        setPlacesResult({ key: requestKey, items: [], error: "주변 공간을 불러오지 못했어요." })
      })
    return () => { cancelled = true }
  }, [effectiveLocation, requestKey])

  useEffect(() => {
    let cancelled = false
    fetchNearbyWildlife(effectiveLocation)
      .then((items) => { if (!cancelled) setWildResult({ key: requestKey, items, error: "" }) })
      .catch(() => {
        if (cancelled) return
        setWildResult({ key: requestKey, items: [], error: "주변 생물을 불러오지 못했어요." })
      })
    return () => { cancelled = true }
  }, [effectiveLocation, requestKey])

  const loading = result.key !== requestKey
  const events = loading ? null : result.items
  const error = loading ? "" : result.error

  const placesLoading = placesResult.key !== requestKey
  const placesError = placesLoading ? "" : placesResult.error
  const visiblePlaces = placesLoading ? [] : placesResult.items

  const wildLoading = wildResult.key !== requestKey
  const wildError = wildLoading ? "" : wildResult.error
  const visibleWildlife = wildLoading ? [] : wildResult.items

  const locateMe = useCallback(() => {
    if (!navigator.geolocation) {
      showToast?.("이 브라우저는 위치를 지원하지 않아요.")
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const next = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          label: "내 위치 주변",
        }
        setLocation(next)
        setLocating(false)
        try { localStorage.setItem(EXPLORE_LOCATION_KEY, JSON.stringify(next)) } catch { /* 무시 */ }
      },
      () => {
        setLocating(false)
        showToast?.("위치를 가져오지 못했어요. 위치 권한을 확인해주세요.")
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 5 * 60 * 1000 },
    )
  }, [showToast])

  const { ongoing, upcoming } = useMemo(() => {
    const list = Array.isArray(events) ? events : []
    const split = { ongoing: [], upcoming: [] }
    for (const event of list) {
      const badge = eventDdayBadge(event)
      if (!badge) continue
      if (badge.kind === "ongoing") split.ongoing.push(event)
      else split.upcoming.push(event)
    }
    return split
  }, [events])

  // 탭별 항목 = {item, type} 배열. '전체'는 준비된 소스를 거리순으로 합친다.
  const eventEntry = (item) => ({ item, type: "event" })
  const placeEntry = (item) => ({ item, type: "place" })
  const wildEntry = (item) => ({ item, type: "wildlife" })

  const allLoading = loading && placesLoading && wildLoading
  const allEntries = [
    ...(loading ? [] : ongoing.map(eventEntry)),
    ...(loading ? [] : upcoming.map(eventEntry)),
    ...(placesLoading ? [] : visiblePlaces.map(placeEntry)),
    ...(wildLoading ? [] : visibleWildlife.map(wildEntry)),
  ].sort((a, b) => (a.item.distKm ?? Infinity) - (b.item.distKm ?? Infinity))
  const allError = !allLoading && allEntries.length === 0 && (error || placesError || wildError)
    ? "주변 정보를 일부 불러오지 못했어요."
    : ""

  // 탭별 데이터/상태 묶음
  const tabState = {
    all: { loading: allLoading, error: allError, entries: allEntries, emptyTitle: "주변에 표시할 항목이 없어요", emptySub: "위치를 바꾸거나 새로고침(↻)을 눌러보세요." },
    ongoing: { loading, error, entries: ongoing.map(eventEntry), emptyTitle: "지금 진행중인 행사가 없어요", emptySub: "위치를 바꾸거나, 곧 시작하는 행사를 기다려보세요." },
    upcoming: { loading, error, entries: upcoming.map(eventEntry), emptyTitle: "곧 시작하는 행사가 없어요", emptySub: "위치를 바꾸거나 새로고침(↻)을 눌러보세요." },
    places: { loading: placesLoading, error: placesError, entries: visiblePlaces.map(placeEntry), emptyTitle: "주변에서 가볼만한 공간을 찾지 못했어요", emptySub: "위치를 바꾸거나 새로고침(↻)을 눌러보세요." },
    wildlife: { loading: wildLoading, error: wildError, entries: visibleWildlife.map(wildEntry), emptyTitle: "주변 관측 기록이 아직 없어요", emptySub: "위치를 바꾸거나 새로고침(↻)을 눌러보세요." },
  }

  const tabCount = (key) => {
    const state = tabState[key]
    return state.loading ? null : state.entries.length
  }

  // 레이더 도트 = 활성 탭 항목 (탭 = 지도 필터). '전체'는 전 종류.
  const radarItems = useMemo(() => {
    const state = tabState[activeTab]
    const entries = state.loading ? [] : state.entries
    return entries
      .map(({ item, type }) => ({
        id: `${type}-${item.id}`, type, title: item.title, sprite: spriteForRadarItem(type, item),
        lat: Number(item.lat), lng: Number(item.lng),
        distKm: item.distKm, category: item.category, data: item,
      }))
      .filter((dot) => Number.isFinite(dot.lat) && Number.isFinite(dot.lng))
      .slice(0, 80)
    // tabState 는 매 렌더 새 객체지만, 실제 의존은 아래 값들
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, ongoing, upcoming, visiblePlaces, visibleWildlife, loading, placesLoading, wildLoading])

  // 도트 [카드 보기] → 상세 카드 오픈
  const handleRadarSelect = useCallback((item) => {
    setDetailItem({ type: item.type, data: item.data })
  }, [])

  const active = tabState[activeTab]

  return (
    <div className="xc-view">
      {/* 왼쪽: 지도(레이더) — 데스크톱에선 sticky로 크게 고정 */}
      <div className="xc-view__map">
        <PixelRadar
          items={radarItems}
          location={effectiveLocation}
          terrain={terrain}
          label={effectiveLocation.label}
          hasLocation={Boolean(location)}
          locating={locating}
          maxDots={80}
          onLocate={locateMe}
          onReload={() => setReloadKey((value) => value + 1)}
          onSelect={handleRadarSelect}
        />
      </div>

      {/* 오른쪽: 필터탭 + 세로 목록 */}
      <div className="xc-view__feed">
        <div className="xc-tabs" role="tablist" aria-label="탐색 필터">
          {TABS.map((tab) => {
            const count = tabCount(tab.key)
            const isActive = activeTab === tab.key
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={isActive}
                className={`xc-tab${isActive ? " is-active" : ""}${count === 0 ? " is-empty" : ""}`}
                onClick={() => setActiveTab(tab.key)}
              >
                <span className="xc-tab__label">{tab.label}</span>
                {count != null && count > 0 ? <span className="xc-tab__count">{count}</span> : null}
              </button>
            )
          })}
        </div>

        <div className="xc-list" role="tabpanel" aria-label={TABS.find((t) => t.key === activeTab)?.label}>
          {active.loading ? (
            <div className="xc-list__skeleton" aria-hidden="true">
              {Array.from({ length: 6 }, (_, index) => (
                <div className="xc-row xc-row--skeleton" key={index} />
              ))}
            </div>
          ) : active.error ? (
            <div className="xc-empty">
              <strong>정보를 불러오지 못했어요</strong>
              <span>{active.error}</span>
              <button type="button" onClick={() => setReloadKey((value) => value + 1)}>다시 시도</button>
            </div>
          ) : active.entries.length === 0 ? (
            <div className="xc-empty">
              <strong>{active.emptyTitle}</strong>
              <span>{active.emptySub}</span>
            </div>
          ) : (
            active.entries.slice(0, 60).map(({ item, type }) => (
              <ListRow
                key={`${type}-${item.id}`}
                item={item}
                type={type}
                anchorId={cardAnchorId(type, item.id)}
                onRegister={onRegister}
                onOpen={(data) => setDetailItem({ type, data })}
              />
            ))
          )}
        </div>
      </div>

      {detailItem ? (
        <CurationDetailSheet
          item={detailItem}
          onClose={() => setDetailItem(null)}
          onRegister={(prefillCandidate) => {
            setDetailItem(null)
            onRegister?.(prefillCandidate)
          }}
        />
      ) : null}
    </div>
  )
}
