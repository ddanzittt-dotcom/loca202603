import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { CalendarRange, ChevronRight, Landmark, MapPin, PawPrint, Plus } from "lucide-react"
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

// 레이더 도트 → 카드 앵커 id (스크롤·선택용)
function cardAnchorId(type, id) {
  return `xc-card-${type}-${id}`
}

// 공간 카테고리별 레이더 도트 이모지 (자연/역사/공원/전시)
const PLACE_KIND_EMOJI = {
  nature: "⛰️",
  history: "🏛️",
  park: "🌳",
  exhibit: "🖼️",
}

function prefersReduced() {
  return typeof window !== "undefined"
    && window.matchMedia
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

// 가로 한 줄 레일 — 오른쪽 화살표로 한 페이지씩 넘기고, 끝에서 처음으로 순환
function CardRail({ children }) {
  const railRef = useRef(null)
  const [atEnd, setAtEnd] = useState(false)

  const update = useCallback(() => {
    const el = railRef.current
    if (!el) return
    setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 8)
  }, [])

  const advance = () => {
    const el = railRef.current
    if (!el) return
    if (el.scrollLeft + el.clientWidth >= el.scrollWidth - 8) {
      el.scrollTo({ left: 0, behavior: prefersReduced() ? "auto" : "smooth" })
    } else {
      el.scrollBy({ left: el.clientWidth * 0.85, behavior: prefersReduced() ? "auto" : "smooth" })
    }
  }

  return (
    <div className="xc-railwrap">
      <div className="xc-rail" ref={railRef} onScroll={update}>
        {children}
      </div>
      <button
        type="button"
        className={`xc-rail__arrow${atEnd ? " is-end" : ""}`}
        onClick={advance}
        aria-label={atEnd ? "처음으로" : "다음 보기"}
      >
        <ChevronRight size={18} strokeWidth={2.6} />
      </button>
    </div>
  )
}

// 탐색 — 내 위치 주변에서 기록할만한 행사/축제 + 공간 큐레이션.
// 공개 지도 검색(ExplorePublicScreen)은 데이터가 쌓일 때까지 진입점을 숨긴다.
// 카드 CTA [+ 카드로 등록] → CollectSheet 프리필 → 바인더에 꽂힌다.

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

function EventCard({ event, onRegister, onOpen, anchorId }) {
  const badge = eventDdayBadge(event)
  const period = formatEventPeriod(event)
  const distance = formatDistanceKm(event.distKm)
  const shortAddr = (event.addr || "").split(" ").slice(0, 3).join(" ")

  return (
    <article
      id={anchorId}
      className="xc-card xc-card--tappable"
      role="button"
      tabIndex={0}
      onClick={() => onOpen?.(event)}
      onKeyDown={(keyEvent) => {
        if (keyEvent.key === "Enter" || keyEvent.key === " ") {
          keyEvent.preventDefault()
          onOpen?.(event)
        }
      }}
    >
      <div className="xc-card__art" aria-hidden="true">
        {event.image ? (
          <img src={event.image} alt="" loading="lazy" />
        ) : (
          <span className="xc-card__art-fallback">
            <CalendarRange size={28} strokeWidth={1.6} />
          </span>
        )}
        {badge ? (
          <span className={`xc-card__dday xc-card__dday--${badge.kind}`}>{badge.label}</span>
        ) : null}
      </div>
      <div className="xc-card__body">
        <strong className="xc-card__title">{event.title}</strong>
        <span className="xc-card__meta">
          {period ? <em>{period}</em> : null}
          {shortAddr ? <span>{shortAddr}</span> : null}
        </span>
      </div>
      <div className="xc-card__foot">
        {distance ? (
          <span className="xc-card__dist">
            <MapPin size={11} strokeWidth={2.4} aria-hidden="true" />
            {distance}
          </span>
        ) : <span />}
        <button
          type="button"
          className="xc-card__register"
          onClick={(clickEvent) => {
            clickEvent.stopPropagation()
            onRegister?.(eventToPrefill(event))
          }}
        >
          <Plus size={13} strokeWidth={2.6} aria-hidden="true" />
          카드로 등록
        </button>
      </div>
    </article>
  )
}

function PlaceSpotCard({ place, onRegister, onOpen, anchorId }) {
  const distance = formatDistanceKm(place.distKm)
  const shortAddr = (place.addr || "").split(" ").slice(0, 3).join(" ")

  return (
    <article
      id={anchorId}
      className="xc-card xc-card--tappable"
      role="button"
      tabIndex={0}
      onClick={() => onOpen?.(place)}
      onKeyDown={(keyEvent) => {
        if (keyEvent.key === "Enter" || keyEvent.key === " ") {
          keyEvent.preventDefault()
          onOpen?.(place)
        }
      }}
    >
      <div className="xc-card__art xc-card__art--place" aria-hidden="true">
        {place.image ? (
          <img src={place.image} alt="" loading="lazy" />
        ) : (
          <span className="xc-card__art-fallback">
            <Landmark size={26} strokeWidth={1.6} />
          </span>
        )}
        {place.category ? (
          <span className="xc-card__dday xc-card__dday--place">{place.category}</span>
        ) : null}
      </div>
      <div className="xc-card__body">
        <strong className="xc-card__title">{place.title}</strong>
        <span className="xc-card__meta">
          {shortAddr ? <span>{shortAddr}</span> : null}
        </span>
      </div>
      <div className="xc-card__foot">
        {distance ? (
          <span className="xc-card__dist">
            <MapPin size={11} strokeWidth={2.4} aria-hidden="true" />
            {distance}
          </span>
        ) : <span />}
        <button
          type="button"
          className="xc-card__register"
          onClick={(clickEvent) => {
            clickEvent.stopPropagation()
            onRegister?.(placeToPrefill(place))
          }}
        >
          <Plus size={13} strokeWidth={2.6} aria-hidden="true" />
          카드로 등록
        </button>
      </div>
    </article>
  )
}

function WildlifeCard({ item, onRegister, onOpen, anchorId }) {
  const distance = formatDistanceKm(item.distKm)

  return (
    <article
      id={anchorId}
      className="xc-card xc-card--tappable xc-card--wild"
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
      <div className="xc-card__art xc-card__art--wild" aria-hidden="true">
        {item.photo ? (
          <img src={item.photo} alt="" loading="lazy" />
        ) : (
          <span className="xc-card__art-emoji">{item.emoji || "✨"}</span>
        )}
        <span className="xc-card__dday xc-card__dday--wild">{item.emoji} {item.category}</span>
      </div>
      <div className="xc-card__body">
        <strong className="xc-card__title">{item.title}</strong>
        <span className="xc-card__meta">
          {item.place ? <span>{item.place.split(",")[0]}</span> : null}
        </span>
      </div>
      <div className="xc-card__foot">
        {distance ? (
          <span className="xc-card__dist">
            <MapPin size={11} strokeWidth={2.4} aria-hidden="true" />
            {distance}
          </span>
        ) : <span />}
        <button
          type="button"
          className="xc-card__register"
          onClick={(clickEvent) => {
            clickEvent.stopPropagation()
            onRegister?.(wildlifeToPrefill(item))
          }}
        >
          <Plus size={13} strokeWidth={2.6} aria-hidden="true" />
          발견 기록
        </button>
      </div>
    </article>
  )
}

export function ExploreCurationScreen({ onRegister, showToast }) {
  const [location, setLocation] = useState(() => readStoredLocation())
  const [locating, setLocating] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [detailItem, setDetailItem] = useState(null) // {type: "event"|"place", data}
  const [radarExpanded, setRadarExpanded] = useState(false)
  // 결과를 요청 키와 함께 저장 — 키가 다르면 로딩 중 (effect 내 동기 setState 회피)
  const [result, setResult] = useState({ key: null, items: [], error: "" })
  const [placesResult, setPlacesResult] = useState({ key: null, items: [], error: "" })
  const [wildResult, setWildResult] = useState({ key: null, items: [], error: "" })

  const effectiveLocation = location || DEFAULT_EXPLORE_LOCATION
  const requestKey = `${effectiveLocation.lat},${effectiveLocation.lng}|${reloadKey}`

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
    const result = { ongoing: [], upcoming: [] }
    for (const event of list) {
      const badge = eventDdayBadge(event)
      if (!badge) continue
      if (badge.kind === "ongoing") result.ongoing.push(event)
      else result.upcoming.push(event)
    }
    return result
  }, [events])

  // 추천순 단일 리스트 — 칩 없이 서버 추천 점수 순서 그대로
  const visiblePlaces = placesLoading ? [] : placesResult.items

  // 레이더 도트 = 행사 + 공간 + 생물. 도트 이모지: 행사=동일 / 공간=카테고리별 / 생물=종별
  const radarItems = useMemo(() => {
    const dotEmoji = (raw, type) => {
      if (type === "event") return "🎪"
      if (type === "wildlife") return raw.emoji || "🐾"
      return PLACE_KIND_EMOJI[raw.kind] || "📍"
    }
    const toDot = (raw, type) => ({
      id: raw.id, type, title: raw.title, emoji: dotEmoji(raw, type),
      lat: Number(raw.lat), lng: Number(raw.lng),
      distKm: raw.distKm, category: raw.category, data: raw,
    })
    // 좌표 있는 것만, 카테고리별 상한(PER)으로. 인터리브해서 앞에서 잘라도(maxDots) 균형 유지.
    const PER = 24
    const withCoords = (arr) => arr.filter((d) => Number.isFinite(d.lat) && Number.isFinite(d.lng))
    const evts = withCoords((Array.isArray(events) ? events : []).map((e) => toDot(e, "event"))).slice(0, PER)
    const plcs = withCoords((placesLoading ? [] : placesResult.items).map((p) => toDot(p, "place"))).slice(0, PER)
    const wild = withCoords((wildLoading ? [] : wildResult.items).map((w) => toDot(w, "wildlife"))).slice(0, PER)
    const interleaved = []
    const maxLen = Math.max(evts.length, plcs.length, wild.length)
    for (let i = 0; i < maxLen; i += 1) {
      if (evts[i]) interleaved.push(evts[i])
      if (plcs[i]) interleaved.push(plcs[i])
      if (wild[i]) interleaved.push(wild[i])
    }
    return interleaved
  }, [events, placesLoading, placesResult.items, wildLoading, wildResult.items])

  // 도트 [카드 보기] → 해당 카드로 스크롤 + 펄스 + 상세 시트 오픈
  const handleRadarSelect = useCallback((item) => {
    const el = typeof document !== "undefined" && document.getElementById(cardAnchorId(item.type, item.id))
    if (el) {
      el.scrollIntoView({ behavior: prefersReduced() ? "auto" : "smooth", block: "center" })
      el.classList.remove("xc-card--pulse")
      void el.offsetWidth
      el.classList.add("xc-card--pulse")
    }
    setDetailItem({ type: item.type, data: item.data })
  }, [])

  return (
    <div className="xc-view">
      <PixelRadar
        items={radarItems}
        location={effectiveLocation}
        label={effectiveLocation.label}
        hasLocation={Boolean(location)}
        locating={locating}
        maxDots={24}
        onLocate={locateMe}
        onReload={() => setReloadKey((value) => value + 1)}
        onSelect={handleRadarSelect}
        onExpand={() => setRadarExpanded(true)}
      />

      <section className="xc-section" aria-label="지금 열린 행사">
        <header className="xc-section__head">
          <strong>지금 열린 행사</strong>
          {!loading && ongoing.length > 0 ? <span className="xc-section__count">{ongoing.length}</span> : null}
        </header>

        {loading ? (
          <div className="xc-grid" aria-hidden="true">
            {Array.from({ length: 6 }, (_, index) => (
              <div className="xc-card xc-card--skeleton" key={index} />
            ))}
          </div>
        ) : error ? (
          <div className="xc-empty">
            <strong>행사 정보를 불러오지 못했어요</strong>
            <span>{error}</span>
            <button type="button" onClick={() => setReloadKey((value) => value + 1)}>다시 시도</button>
          </div>
        ) : ongoing.length === 0 ? (
          <div className="xc-empty">
            <strong>지금 주변에 열린 행사가 없어요</strong>
            <span>위치를 바꾸거나, 곧 시작하는 행사를 기다려보세요.</span>
          </div>
        ) : (
          <CardRail>
            {ongoing.slice(0, 24).map((event) => (
              <EventCard key={event.id} event={event} anchorId={cardAnchorId("event", event.id)} onRegister={onRegister} onOpen={(data) => setDetailItem({ type: "event", data })} />
            ))}
          </CardRail>
        )}
      </section>

      {!loading && !error && upcoming.length > 0 ? (
        <section className="xc-section" aria-label="곧 시작하는 행사">
          <header className="xc-section__head">
            <strong>곧 시작해요</strong>
            <span className="xc-section__count">{upcoming.length}</span>
          </header>
          <CardRail>
            {upcoming.slice(0, 12).map((event) => (
              <EventCard key={event.id} event={event} anchorId={cardAnchorId("event", event.id)} onRegister={onRegister} onOpen={(data) => setDetailItem({ type: "event", data })} />
            ))}
          </CardRail>
        </section>
      ) : null}

      <section className="xc-section" aria-label="기록할만한 공간">
        <header className="xc-section__head">
          <strong>기록할만한 공간</strong>
          <span className="xc-section__hint">10km 안 가볼만한 곳</span>
        </header>

        {placesLoading ? (
          <div className="xc-grid" aria-hidden="true">
            {Array.from({ length: 6 }, (_, index) => (
              <div className="xc-card xc-card--skeleton" key={index} />
            ))}
          </div>
        ) : placesError ? (
          <div className="xc-empty">
            <strong>공간 정보를 불러오지 못했어요</strong>
            <span>{placesError}</span>
            <button type="button" onClick={() => setReloadKey((value) => value + 1)}>다시 시도</button>
          </div>
        ) : visiblePlaces.length === 0 ? (
          <div className="xc-empty">
            <strong>주변에서 추천할 공간을 찾지 못했어요</strong>
            <span>위치를 바꾸거나 새로고침(↻)을 눌러보세요.</span>
          </div>
        ) : (
          <CardRail>
            {visiblePlaces.slice(0, 24).map((place) => (
              <PlaceSpotCard key={place.id} place={place} anchorId={cardAnchorId("place", place.id)} onRegister={onRegister} onOpen={(data) => setDetailItem({ type: "place", data })} />
            ))}
          </CardRail>
        )}
      </section>

      <section className="xc-section" aria-label="요즘 이 동네 생물">
        <header className="xc-section__head">
          <strong>요즘 이 동네 생물</strong>
          <span className="xc-section__hint">
            <PawPrint size={11} strokeWidth={2.2} aria-hidden="true" /> 근처에서 관측된 동식물
          </span>
        </header>

        {wildLoading ? (
          <div className="xc-grid" aria-hidden="true">
            {Array.from({ length: 6 }, (_, index) => (
              <div className="xc-card xc-card--skeleton" key={index} />
            ))}
          </div>
        ) : wildError ? (
          <div className="xc-empty">
            <strong>생물 정보를 불러오지 못했어요</strong>
            <span>{wildError}</span>
            <button type="button" onClick={() => setReloadKey((value) => value + 1)}>다시 시도</button>
          </div>
        ) : visibleWildlife.length === 0 ? (
          <div className="xc-empty">
            <strong>주변 관측 기록이 아직 없어요</strong>
            <span>위치를 바꾸거나 새로고침(↻)을 눌러보세요.</span>
          </div>
        ) : (
          <CardRail>
            {visibleWildlife.slice(0, 24).map((item) => (
              <WildlifeCard key={item.id} item={item} anchorId={cardAnchorId("wildlife", item.id)} onRegister={onRegister} onOpen={(data) => setDetailItem({ type: "wildlife", data })} />
            ))}
          </CardRail>
        )}
      </section>

      {radarExpanded ? (
        <div className="xradar-modal" role="presentation" onClick={() => setRadarExpanded(false)}>
          <div className="xradar-modal__panel" onClick={(e) => e.stopPropagation()}>
            <p className="xradar-modal__title">📡 내 주변에 이만큼 있어요</p>
            <PixelRadar
              items={radarItems}
              location={effectiveLocation}
              label={effectiveLocation.label}
              hasLocation={Boolean(location)}
              locating={locating}
              maxDots={90}
              expanded
              onLocate={locateMe}
              onReload={() => setReloadKey((value) => value + 1)}
              onSelect={(item) => { setRadarExpanded(false); handleRadarSelect(item) }}
              onClose={() => setRadarExpanded(false)}
            />
          </div>
        </div>
      ) : null}

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
