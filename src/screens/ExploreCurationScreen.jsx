import { useCallback, useEffect, useMemo, useState } from "react"
import { CalendarRange, ChevronRight, Footprints, Landmark, MapPin, Plus } from "lucide-react"
import {
  DEFAULT_EXPLORE_LOCATION,
  EXPLORE_LOCATION_KEY,
  curationSourceLabel,
  dedupeWalkItems,
  eventDdayBadge,
  eventTimeKey,
  eventToPrefill,
  fetchNearbyEvents,
  fetchNearbyPlaces,
  fetchNearbyWildlife,
  formatDistanceKm,
  formatEventPeriod,
  formatObservedAgo,
  formatRouteMeta,
  interleaveByKind,
  placeToPrefill,
  routeToPrefill,
  wildlifeSortKey,
  wildlifeToPrefill,
} from "../lib/exploreCuration"
import { fetchCatalogItems } from "../lib/exploreCatalog"
import { CurationDetailSheet } from "../components/sheets/CurationDetailSheet"
import { PixelRadar } from "../components/explore/PixelRadar"
import { fetchRealTerrain } from "../lib/realTerrain"
import { spriteForRadarItem } from "../lib/radarSprites"

// 탐색 — 좌측 큰 지도(레이더) + 우측 목록. 칩 = 카테고리 4 + 전체 (스펙 v3.3 T1).
// 전체 = 카테고리별 섹션 캐러셀(T2, 모바일 가로 스크롤/데스크톱 세로 변형),
// 카테고리 탭 = 그 칸만 깊게 보는 정렬 뷰(칸마다 정렬축 다름).
// 탭 선택 = 지도 도트도 그 종류만 필터. 카드/상세 CTA [+ 등록] → CollectSheet 프리필 → 바인더.

// 레이더 도트 → 카드 앵커 id (스크롤·선택용)
function cardAnchorId(type, id) {
  return `xc-card-${type}-${id}`
}

// 시급성은 탭 이름이 아니라 정렬+배지로 표현. 칩에 개수 배지는 달지 않는다(스펙 v3.3 §5).
const TABS = [
  { key: "all", label: "전체" },
  { key: "enjoy", label: "즐기기" },
  { key: "learn", label: "배우기" },
  { key: "walk", label: "걷기·머물기" },
  { key: "nature", label: "자연" },
]

// 전체 탭 섹션 순서 = 행동·시급 → 잔잔·상시 (T2). 빈 섹션은 접는다.
const SECTIONS = [
  { key: "enjoy", label: "즐기기", hint: "마감 임박 순" },
  { key: "learn", label: "배우기", hint: "가까운 순 · 접수중 우선" },
  { key: "walk", label: "걷기·머물기", hint: "가까운 순" },
  { key: "nature", label: "자연", hint: "가까운 순 · 최근 관측" },
]

const CAROUSEL_CAP = 6
const LEARN_LIBRARY_CAP = 12 // 배우기 도서관 상한 — 동네 인프라라 목록 잠식 방지(박물관·강좌 노출 우선)
const NO_ENTRIES = []

const eventEntry = (item) => ({ item, type: "event" })
const placeEntry = (item) => ({ item, type: "place" })
const wildEntry = (item) => ({ item, type: "wildlife" })

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

// 종류별 목록 행 — 좁은 우측 열에 맞춘 컴팩트 가로 행(썸네일·본문·거리/출처/등록).
function ListRow({ item, type, onRegister, onOpen, anchorId }) {
  const distance = formatDistanceKm(item.distKm)
  const source = curationSourceLabel(type, item)

  let thumb = null
  let badge = null
  let meta = null
  let registerLabel = "카드로 담기"
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
    const isRoute = item.group === "route"
    // 걷기길(trail)은 포인트 카드지만 총길이·소요시간을 표기한다 (스펙 D4-A)
    const routeMeta = isRoute || item.routeDistanceKm ? formatRouteMeta(item) : ""
    thumb = item.image
      ? <img src={item.image} alt="" loading="lazy" />
      : (
        <span className="xc-row__fallback">
          {isRoute ? <Footprints size={20} strokeWidth={1.6} /> : <Landmark size={20} strokeWidth={1.6} />}
        </span>
      )
    // 상태 배지 우선(오늘 장 > 마감 임박 > 접수중), 없으면 카테고리 라벨 (스펙 v3.3 §5)
    badge = item.marketToday
      ? <span className="xc-row__tag xc-row__tag--market">오늘 장</span>
      : item.applyClosing
        ? <span className="xc-row__tag xc-row__tag--closing">마감 임박</span>
        : item.applyOpen
          ? <span className="xc-row__tag xc-row__tag--open">접수중</span>
          : item.category ? <span className="xc-row__tag xc-row__tag--place">{item.category}</span> : null
    meta = (
      <span className="xc-row__meta">
        {routeMeta ? <em>{routeMeta}</em> : null}
        {!routeMeta && item.coursePeriod ? <em>{item.coursePeriod}</em> : null}
        {!routeMeta && !item.coursePeriod && item.marketCycle ? <em>장날 {item.marketCycle}</em> : null}
        {shortAddress(item.addr) ? <span>{shortAddress(item.addr)}</span> : null}
      </span>
    )
    registerLabel = isRoute ? "길 카드로 담기" : "카드로 담기"
    prefill = isRoute ? routeToPrefill(item) : placeToPrefill(item)
  } else {
    const observed = formatObservedAgo(item)
    thumb = item.photo
      ? <img src={item.photo} alt="" loading="lazy" />
      : <span className="xc-row__emoji">{item.emoji || "✨"}</span>
    badge = <span className="xc-row__tag xc-row__tag--wild">{item.emoji} {item.category}</span>
    meta = (
      <span className="xc-row__meta">
        {observed ? (observed.recent ? <em>{observed.label}</em> : <span>{observed.label}</span>) : null}
        {item.place ? <span>{String(item.place).split(",")[0]}</span> : null}
      </span>
    )
    registerLabel = "발견 장소"
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
        <span className="xc-row__facts">
          {distance ? (
            <span className="xc-row__dist">
              <MapPin size={11} strokeWidth={2.4} aria-hidden="true" />
              {distance}
            </span>
          ) : null}
          {source ? <span className="xc-row__src">{source}</span> : null}
        </span>
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

// 전체 탭 캐러셀용 컴팩트 카드 — 클릭하면 상세 시트(등록 CTA는 시트 안).
function MiniCard({ item, type, onOpen }) {
  const distance = formatDistanceKm(item.distKm)

  let thumb = null
  let badge = null
  if (type === "event") {
    const dday = eventDdayBadge(item)
    thumb = item.image
      ? <img src={item.image} alt="" loading="lazy" />
      : <span className="xc-mini__fallback"><CalendarRange size={20} strokeWidth={1.6} /></span>
    badge = dday ? <span className={`xc-row__tag xc-row__tag--${dday.kind}`}>{dday.label}</span> : null
  } else if (type === "place") {
    thumb = item.image
      ? <img src={item.image} alt="" loading="lazy" />
      : (
        <span className="xc-mini__fallback">
          {item.group === "route" ? <Footprints size={18} strokeWidth={1.6} /> : <Landmark size={18} strokeWidth={1.6} />}
        </span>
      )
    badge = item.marketToday
      ? <span className="xc-row__tag xc-row__tag--market">오늘 장</span>
      : item.applyClosing
        ? <span className="xc-row__tag xc-row__tag--closing">마감 임박</span>
        : item.applyOpen
          ? <span className="xc-row__tag xc-row__tag--open">접수중</span>
          : item.category ? <span className="xc-row__tag xc-row__tag--place">{item.category}</span> : null
  } else {
    thumb = item.photo
      ? <img src={item.photo} alt="" loading="lazy" />
      : <span className="xc-mini__emoji">{item.emoji || "✨"}</span>
    badge = <span className="xc-row__tag xc-row__tag--wild">{item.emoji} {item.category}</span>
  }

  return (
    <article
      className="xc-mini"
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
      <div className="xc-mini__thumb" aria-hidden="true">
        {thumb}
        {badge}
      </div>
      <div className="xc-mini__body">
        <strong className="xc-mini__title">{item.title}</strong>
        {distance ? (
          <span className="xc-mini__dist">
            <MapPin size={10} strokeWidth={2.4} aria-hidden="true" />
            {distance}
          </span>
        ) : null}
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
  // 사전 적재 카탈로그 — Supabase 직접 조회, 실패해도 빈 목록 (스펙 v3.3 §3.5)
  const [walkCatalog, setWalkCatalog] = useState({ key: null, items: [] }) // ③ 공원·시장·둘레길
  const [learnCatalog, setLearnCatalog] = useState({ key: null, items: [] }) // ② 강좌·도서관·체험마을

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

  useEffect(() => {
    let cancelled = false
    fetchCatalogItems("walk", effectiveLocation)
      .then((items) => { if (!cancelled) setWalkCatalog({ key: requestKey, items }) })
      .catch(() => { if (!cancelled) setWalkCatalog({ key: requestKey, items: [] }) })
    return () => { cancelled = true }
  }, [effectiveLocation, requestKey])

  useEffect(() => {
    let cancelled = false
    fetchCatalogItems("learn", effectiveLocation)
      .then((items) => { if (!cancelled) setLearnCatalog({ key: requestKey, items }) })
      .catch(() => { if (!cancelled) setLearnCatalog({ key: requestKey, items: [] }) })
    return () => { cancelled = true }
  }, [effectiveLocation, requestKey])

  const loading = result.key !== requestKey
  const events = loading ? null : result.items
  const error = loading ? "" : result.error

  const placesLoading = placesResult.key !== requestKey
  const placesError = placesLoading ? "" : placesResult.error
  const visiblePlaces = placesLoading ? NO_ENTRIES : placesResult.items

  const wildLoading = wildResult.key !== requestKey
  const wildError = wildLoading ? "" : wildResult.error
  const visibleWildlife = wildLoading ? NO_ENTRIES : wildResult.items

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

  // ① 즐기기 — 시간순(마감 임박 먼저). 날짜 판정 불가 항목은 기존처럼 제외.
  const enjoyEntries = useMemo(() => {
    const list = Array.isArray(events) ? events.filter((event) => eventDdayBadge(event)) : []
    return list.map(eventEntry).sort((a, b) => eventTimeKey(a.item) - eventTimeKey(b.item))
  }, [events])

  // ② 배우기 — 카탈로그(도서관·강좌·박물관) + TourAPI 전시(박물관·미술관·전시관) 병합.
  // 접수중(강좌) 우선 → 마감 임박 먼저 → 거리순, 마지막에 같은 종류 연속 2개 제한(도서관 도배 방지).
  const learnEntries = useMemo(() => {
    // 체험마을(farmvillage)은 "배우는 프로그램"이 아니라 제외
    const raw = (learnCatalog.key === requestKey ? learnCatalog.items : [])
      .filter((item) => item.source !== "farmvillage")
    // 도서관은 "동네 인프라"라 목록을 잠식(성정동 40/60) — 가까운 순 상한을 둬 박물관·강좌를 띄운다
    const libraries = raw
      .filter((item) => item.source === "library")
      .sort((a, b) => (a.distKm ?? Infinity) - (b.distKm ?? Infinity))
      .slice(0, LEARN_LIBRARY_CAP)
    const catalogItems = [...raw.filter((item) => item.source !== "library"), ...libraries]
    // 전시(exhibit)는 TourAPI 공간에서 배우기로 이동 — 박물관 카탈로그와 제목·근접 중복 제거
    const exhibitPlaces = visiblePlaces.filter((place) => place.kind === "exhibit")
    const applyRank = (item) => (item.applyClosing ? 0 : item.applyOpen ? 1 : 2)
    const sorted = dedupeWalkItems([...catalogItems, ...exhibitPlaces])
      .map(placeEntry)
      .sort((a, b) => {
        const openDiff = applyRank(a.item) - applyRank(b.item)
        if (openDiff !== 0) return openDiff
        return (a.item.distKm ?? Infinity) - (b.item.distKm ?? Infinity)
      })
    return interleaveByKind(sorted, (entry) => entry.item.kind || entry.item.source || "etc", 2)
  }, [learnCatalog, visiblePlaces, requestKey])

  // ③ 걷기·머물기 — 거리순. TourAPI 공간(자연/역사/공원) + 카탈로그(공원·시장·둘레길·문화재) 병합.
  // 전시(exhibit)는 배우기로 이동했으므로 제외. 제목+근접(500m) 중복 제거(이미지 있는 쪽 우선).
  // 마지막에 같은 종류 연속 2개 제한 — 도심 근린공원 도배 방지 (거리순 골격 유지)
  const walkEntries = useMemo(() => {
    const catalogItems = walkCatalog.key === requestKey ? walkCatalog.items : []
    const walkPlaces = visiblePlaces.filter((place) => place.kind !== "exhibit")
    const sorted = dedupeWalkItems([...walkPlaces, ...catalogItems])
      .map(placeEntry)
      .sort((a, b) => (a.item.distKm ?? Infinity) - (b.item.distKm ?? Infinity))
    return interleaveByKind(sorted, (entry) => entry.item.kind || entry.item.source || "etc", 2)
  }, [visiblePlaces, walkCatalog, requestKey])

  // ④ 자연 — 거리순 + 최근 관측 가중
  const natureEntries = useMemo(
    () => visibleWildlife.map(wildEntry)
      .sort((a, b) => wildlifeSortKey(a.item) - wildlifeSortKey(b.item)),
    [visibleWildlife],
  )

  // 전체 = 레이더용 병합(거리순). 목록 UI는 섹션 캐러셀이 담당.
  const allEntries = useMemo(
    () => [...enjoyEntries, ...learnEntries, ...walkEntries, ...natureEntries]
      .sort((a, b) => (a.item.distKm ?? Infinity) - (b.item.distKm ?? Infinity)),
    [enjoyEntries, learnEntries, walkEntries, natureEntries],
  )

  const allLoading = loading && placesLoading && wildLoading
  const allError = !allLoading && allEntries.length === 0 && (error || placesError || wildError)
    ? "주변 정보를 일부 불러오지 못했어요."
    : ""

  // 탭별 데이터/상태 묶음 — ② 배우기는 소스 연동 전이라 "준비 중" 빈 상태 (스펙 v3.3 부록 1단계)
  const tabState = {
    all: { loading: allLoading, error: allError, entries: allEntries, emptyTitle: "주변에 표시할 항목이 없어요", emptySub: "위치를 바꾸거나 새로고침(↻)을 눌러보세요." },
    enjoy: { loading, error, entries: enjoyEntries, emptyTitle: "지금 즐길 행사를 찾지 못했어요", emptySub: "위치를 바꾸거나 새로고침(↻)을 눌러보세요." },
    // ②는 전부 카탈로그 소스 — 로딩·빈 상태만 구분 (fail-soft 라 에러 상태 없음)
    learn: {
      loading: learnCatalog.key !== requestKey && learnEntries.length === 0,
      error: "",
      entries: learnEntries,
      emptyTitle: "주변에서 배울 거리를 찾지 못했어요",
      emptySub: "동네 강좌·도서관·체험마을이 이 칸에 모여요. 위치를 바꾸거나 새로고침(↻)을 눌러보세요.",
    },
    // ③은 카탈로그(Supabase 직접 조회)가 병합되므로 TourAPI 실패·로딩 중이어도
    // 카탈로그 항목이 있으면 목록을 우선한다 (dev의 /api 부재·프로덕션 장애 시에도 공원·시장은 뜸)
    walk: {
      loading: placesLoading && walkEntries.length === 0,
      error: walkEntries.length > 0 ? "" : placesError,
      entries: walkEntries,
      emptyTitle: "주변에서 걷고 머물 곳을 찾지 못했어요",
      emptySub: "위치를 바꾸거나 새로고침(↻)을 눌러보세요.",
    },
    nature: { loading: wildLoading, error: wildError, entries: natureEntries, emptyTitle: "주변 관측 기록이 아직 없어요", emptySub: "위치를 바꾸거나 새로고침(↻)을 눌러보세요." },
  }

  // 레이더 도트 = 활성 탭 항목 (탭 = 지도 필터). '전체'는 전 종류.
  const activeEntries = tabState[activeTab].loading ? NO_ENTRIES : tabState[activeTab].entries
  const radarItems = useMemo(() => {
    return activeEntries
      .map(({ item, type }) => ({
        id: `${type}-${item.id}`, type, title: item.title, sprite: spriteForRadarItem(type, item),
        lat: Number(item.lat), lng: Number(item.lng),
        distKm: item.distKm, category: item.category, data: item,
      }))
      .filter((dot) => Number.isFinite(dot.lat) && Number.isFinite(dot.lng))
      .slice(0, 80)
  }, [activeEntries])

  // 도트 [카드 보기] → 상세 카드 오픈
  const handleRadarSelect = useCallback((item) => {
    setDetailItem({ type: item.type, data: item.data })
  }, [])

  const active = tabState[activeTab]
  const openDetail = (type) => (data) => setDetailItem({ type, data })

  // 전체 탭 섹션 — 로딩 중이면 스켈레톤, 로딩 끝났는데 비면 접기(T2)
  const visibleSections = SECTIONS
    .map((section) => ({ ...section, state: tabState[section.key] }))
    .filter((section) => section.state.loading || section.state.entries.length > 0)

  return (
    <div className="xc-view">
      {/* 왼쪽: 지도(레이더) — 데스크톱에선 크게 고정(2행 span) */}
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

      {/* 우상단: 필터탭 (데스크톱에선 목록 위 별도 셀 — 목록 세로 공간 확보) */}
      <div className="xc-tabs" role="tablist" aria-label="탐색 필터">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={isActive}
              className={`xc-tab${isActive ? " is-active" : ""}`}
              onClick={() => setActiveTab(tab.key)}
            >
              <span className="xc-tab__label">{tab.label}</span>
            </button>
          )
        })}
      </div>

      {/* 오른쪽: 목록 — 전체는 섹션 캐러셀, 카테고리 탭은 세로 목록 */}
      <div className="xc-view__feed">
        <div className="xc-list" role="tabpanel" aria-label={TABS.find((t) => t.key === activeTab)?.label}>
          {activeTab === "all" ? (
            allLoading ? (
              <div className="xc-list__skeleton" aria-hidden="true">
                {Array.from({ length: 6 }, (_, index) => (
                  <div className="xc-row xc-row--skeleton" key={index} />
                ))}
              </div>
            ) : allError ? (
              <div className="xc-empty">
                <strong>정보를 불러오지 못했어요</strong>
                <span>{allError}</span>
                <button type="button" onClick={() => setReloadKey((value) => value + 1)}>다시 시도</button>
              </div>
            ) : allEntries.length === 0 ? (
              <div className="xc-empty">
                <strong>{tabState.all.emptyTitle}</strong>
                <span>{tabState.all.emptySub}</span>
              </div>
            ) : (
              <div className="xc-secs">
                {visibleSections.map((section) => (
                  <section className="xc-sec" key={section.key}>
                    <div className="xc-sec__head">
                      <strong>{section.label}</strong>
                      {section.hint ? <span className="xc-sec__hint">{section.hint}</span> : null}
                      <button type="button" className="xc-sec__more" onClick={() => setActiveTab(section.key)}>
                        더보기
                        <ChevronRight size={12} strokeWidth={2.6} aria-hidden="true" />
                      </button>
                    </div>
                    <div className="xc-sec__scroller">
                      {section.state.loading
                        ? Array.from({ length: 3 }, (_, index) => (
                          <div className="xc-mini xc-mini--skeleton" key={index} aria-hidden="true" />
                        ))
                        : section.state.entries.slice(0, CAROUSEL_CAP).map(({ item, type }) => (
                          <MiniCard
                            key={`${type}-${item.id}`}
                            item={item}
                            type={type}
                            onOpen={openDetail(type)}
                          />
                        ))}
                    </div>
                  </section>
                ))}
              </div>
            )
          ) : active.loading ? (
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
            active.entries.slice(0, activeTab === "nature" ? 80 : 60).map(({ item, type }) => (
              <ListRow
                key={`${type}-${item.id}`}
                item={item}
                type={type}
                anchorId={cardAnchorId(type, item.id)}
                onRegister={onRegister}
                onOpen={openDetail(type)}
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
