import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  ArrowLeft,
  X,
  MapPin,
  Search as SearchIcon,
  ChevronDown,
  ChevronRight,
  Clock,
  Map as MapGlyph,
  Users as UsersIcon,
} from "lucide-react"
import { hasSupabaseEnv } from "../lib/supabase"
import { useLocalStorageState } from "../hooks/useAppState"
import { BrandLogo } from "../components/BrandLogo"
import { PhotoBlock } from "../components/visuals/PhotoBlock"

// ─────────────────────────────────────────────────────────
// 검색 진입 추천 fallback. 실제 에디터/추천 지도가 적을 때만 보강한다.

const SEARCH_EDITOR_FALLBACKS = [
  {
    id: "editor-loca",
    name: "LOCA 에디터",
    handle: "@loca.editor",
    meta: "추천지도 4개",
    bio: "동네에서 바로 써먹기 좋은 지도를 고르고 있어요.",
    tone: "#FFE2D4",
    query: "추천",
  },
  {
    id: "editor-walk",
    name: "산책 편집부",
    handle: "@walk.note",
    meta: "산책 코스 중심",
    bio: "천천히 걷기 좋은 길과 쉬어갈 곳을 모아요.",
    tone: "#DDF0DF",
    query: "산책",
  },
  {
    id: "editor-local",
    name: "로컬 큐레이터",
    handle: "@local.picks",
    meta: "카페 · 책방 · 골목",
    bio: "작지만 다시 가고 싶은 장소를 추천해요.",
    tone: "#F7E6BD",
    query: "카페",
  },
]

// ─────────────────────────────────────────────────────────
// 검색 매칭 유틸

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function highlight(text, query) {
  if (!query) return [{ match: false, text }]
  const normalized = String(text || "")
  const escaped = escapeRegex(query)
  const regex = new RegExp(`(${escaped})`, "ig")
  const parts = normalized.split(regex)
  return parts.filter((part) => part !== "").map((part) => ({
    match: part.toLowerCase() === query.toLowerCase(),
    text: part,
  }))
}

function HighlightedText({ text, query }) {
  const parts = highlight(text, query)
  return (
    <>
      {parts.map((part, idx) => part.match ? <mark key={idx}>{part.text}</mark> : <span key={idx}>{part.text}</span>)}
    </>
  )
}

function toMapSearchText(item) {
  const placeNames = Array.isArray(item.placeNames) ? item.placeNames : []
  const places = Array.isArray(item.places)
    ? item.places.map((place) => (typeof place === "string" ? place : place?.title || place?.name))
    : []
  return [
    item.title,
    item.description,
    item.caption,
    item.creator,
    item.creatorName,
    ...(item.tags || []),
    ...placeNames,
    ...places,
  ].filter(Boolean).join(" ").toLowerCase()
}

function toEditorSearchText(user) {
  return [user.name, user.handle, user.bio].filter(Boolean).join(" ").toLowerCase()
}

// ─────────────────────────────────────────────────────────
// 이벤트 상태 분류 (D-N / 진행중 / 곧 시작)

function getEventStatus(startDate, endDate) {
  if (!startDate || !endDate) return null
  const now = new Date()
  const todayNum = parseInt(`${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`)
  const start = parseInt(startDate)
  const end = parseInt(endDate)
  if (Number.isNaN(start) || Number.isNaN(end)) return null
  if (todayNum >= start && todayNum <= end) return { kind: "live", label: "진행중" }
  if (start > todayNum) {
    const startObj = new Date(parseInt(startDate.slice(0, 4)), parseInt(startDate.slice(4, 6)) - 1, parseInt(startDate.slice(6, 8)))
    const diff = Math.max(1, Math.ceil((startObj - now) / (1000 * 60 * 60 * 24)))
    if (diff <= 7) return { kind: "upcoming", label: "곧 시작" }
    if (diff <= 30) return { kind: "dday", label: `D-${diff}` }
    return { kind: "dday", label: `D-${diff}` }
  }
  return null
}

function formatEventPeriod(startDate, endDate) {
  if (!startDate || !endDate || startDate.length !== 8 || endDate.length !== 8) return ""
  const fmt = (s) => `${parseInt(s.slice(4, 6))}.${parseInt(s.slice(6, 8))}`
  return `${fmt(startDate)} — ${fmt(endDate)}`
}

const EVENT_THUMB_GRADIENTS = [
  "linear-gradient(135deg, #E8BCAD 0%, #D4836B 100%)",
  "linear-gradient(135deg, #C2D6B8 0%, #7A9E6B 100%)",
  "linear-gradient(135deg, #FAEEDA 0%, #D4A06A 100%)",
  "linear-gradient(135deg, #ABC6DC 0%, #5B7EA5 100%)",
  "linear-gradient(135deg, #E6F1FB 0%, #0C447C 100%)",
]
const EVENT_THUMB_EMOJIS = ["🌸", "🎡", "🍞", "🎨", "🎪", "📸", "🍃"]
const MORE_INITIAL_COUNT = 30
const MORE_PAGE_SIZE = 20
const PLACE_THUMB_BY_KIND = {
  culture: { gradient: "linear-gradient(135deg, #A1C4FD 0%, #C2E9FB 100%)", emoji: "🎨" },
  attraction: { gradient: "linear-gradient(135deg, #D4FC79 0%, #96E6A1 100%)", emoji: "📍" },
  cafe: { gradient: "linear-gradient(135deg, #FAD7A1 0%, #D08C45 100%)", emoji: "☕" },
  leisure: { gradient: "linear-gradient(135deg, #A8E6CF 0%, #3E9B75 100%)", emoji: "🚲" },
  shopping: { gradient: "linear-gradient(135deg, #FBC2EB 0%, #A18CD1 100%)", emoji: "🛍️" },
  place: { gradient: "linear-gradient(135deg, #E0C3FC 0%, #8EC5FC 100%)", emoji: "📌" },
}

function pickEventThumb(seed) {
  const code = String(seed || "").split("").reduce((acc, c) => acc + c.charCodeAt(0), 0)
  return {
    gradient: EVENT_THUMB_GRADIENTS[code % EVENT_THUMB_GRADIENTS.length],
    emoji: EVENT_THUMB_EMOJIS[code % EVENT_THUMB_EMOJIS.length],
  }
}

function pickPlaceThumb(kind) {
  return PLACE_THUMB_BY_KIND[kind] || PLACE_THUMB_BY_KIND.place
}

function formatDistance(value) {
  const km = Number(value)
  if (!Number.isFinite(km)) return ""
  if (km < 1) return `${Math.max(50, Math.round(km * 1000 / 50) * 50)}m`
  return `${km.toFixed(km >= 10 ? 0 : 1)}km`
}

function toEventSpot(event) {
  const status = getEventStatus(event.startDate, event.endDate)
  const period = formatEventPeriod(event.startDate, event.endDate)
  const thumb = pickEventThumb(event.id || event.title)
  return {
    id: `event-${event.id}`,
    _raw: event,
    group: "event",
    kind: "event",
    dateLabel: period,
    day: status?.label || "",
    urgent: status?.kind === "urgent" || status?.kind === "live",
    title: event.title,
    sub: event.contentTypeName || event.category || "행사",
    loc: event.addr || event.area || "",
    distance: formatDistance(event.distKm) || event.distance || "",
    image: event.image || "",
    thumb,
    score: 56 + (status?.kind === "live" ? 8 : 0),
  }
}

function toPlaceSpot(place) {
  return {
    id: place.id,
    _raw: place,
    group: place.group || "place",
    kind: place.kind || "place",
    title: place.title,
    sub: place.category || place.sourceLabel || "장소",
    loc: place.addr || "",
    distance: formatDistance(place.distKm),
    image: place.image || "",
    sourceLabel: place.sourceLabel || "",
    sourceUrl: place.sourceUrl || "",
    thumb: pickPlaceThumb(place.kind),
    score: Number(place.score) || 50,
  }
}

function isFoodPlace(place) {
  return place?.kind === "food"
    || place?.contentTypeId === 39
    || String(place?.category || "").includes("음식점")
}

function filterSpotItems(spots, filter) {
  if (filter === "장소") return spots.filter((spot) => spot.group === "place")
  if (filter === "행사") return spots.filter((spot) => spot.group === "event")
  return spots
}

// 미니맵 마커 위치 (정적)
const MINIMAP_PINS = [
  { top: "22%", left: "38%", kind: "primary" },
  { top: "48%", left: "62%", kind: "primary" },
  { top: "62%", left: "30%", kind: "mint" },
  { top: "35%", left: "74%", kind: "primary" },
  { top: "70%", left: "55%", kind: "amber" },
  { top: "58%", left: "42%", kind: "primary" },
  { top: "80%", left: "25%", kind: "primary" },
  { top: "42%", left: "48%", kind: "mint" },
]

const EDITOR_PICK_FALLBACK_MAP = {
  id: "editor-pick-seongsu",
  mapId: "demo-seongsu",
  title: "성수 감성카페 7곳",
  creator: "@seongsu_lover",
  placeCount: 3,
  gradient: ["#FFE987", "#F59E0B"],
  tags: ["카페", "성수", "감성"],
  placeNames: ["대림창고", "센터커피", "오르에르"],
}

const EDITOR_RECOMMENDATION_FALLBACK_MAPS = [
  {
    id: "editor-rec-taste",
    mapId: "demo-ikseon",
    title: "익선동 골목 맛집",
    creator: "@hanok_walk",
    placeCount: 4,
    gradient: ["#F6D7B8", "#C46A3B"],
    tags: ["한옥", "맛집", "골목"],
    placeNames: ["온천집", "청수당", "살라댕방콕"],
  },
  {
    id: "editor-rec-nearby",
    mapId: "demo-hangang",
    title: "한강 노을 산책 코스",
    creator: "@river_evening",
    placeCount: 4,
    gradient: ["#B7D8E8", "#2E7D90"],
    tags: ["산책", "노을", "근처"],
    placeNames: ["반포 달빛무지개분수", "잠원 한강공원", "세빛섬"],
  },
  {
    id: "editor-rec-weekend",
    mapId: "demo-yeonnam",
    title: "연남동 주말 산책",
    creator: "@weekend_stroll",
    placeCount: 5,
    gradient: ["#CDE7C6", "#5F8E68"],
    tags: ["소품샵", "카페", "주말"],
    placeNames: ["경의선숲길", "독립서점", "오브젝트"],
  },
]

const EDITOR_RECOMMENDATION_SLOTS = [
  { id: "taste", label: "내 취향 추천지도", note: "카페와 골목 기록을 좋아한다면" },
  { id: "nearby", label: "내 근처 추천지도", note: "가볍게 들르기 좋은 가까운 코스" },
  { id: "weekend", label: "주말 산책 추천지도", note: "천천히 걷고 기록하기 좋은 곳" },
]

// ─────────────────────────────────────────────────────────

export function ExploreScreen({
  recommendedMaps = [],
  onOpenMap,
  onOpenCommunityEditor,
  onAddEventToMap,
  users = [],
  followed = [],
  onSelectUser,
  embedded = false,
  section = "all",
  searchRequestId = 0,
}) {
  const [searchMode, setSearchMode] = useState("idle")
  const [query, setQuery] = useState("")
  const [recentQueries, setRecentQueries] = useLocalStorageState("loca:explore_recent_queries", [])

  const [editorResults, setEditorResults] = useState([])
  const [editorSearching, setEditorSearching] = useState(false)
  const debounceRef = useRef(null)

  const trimmed = query.trim()
  const normalizedQuery = trimmed.toLowerCase()
  const showAllSections = section === "all"
  const showCommunitySection = section === "community"
  const showEventsSection = section === "all" || section === "events"
  const handledSearchRequestRef = useRef(0)
  const exploreRecommendationMaps = useMemo(() => {
    const baseMaps = recommendedMaps.length > 0 ? recommendedMaps : [EDITOR_PICK_FALLBACK_MAP]
    const existingIds = new Set(baseMaps.map((item) => item.mapId || item.id))
    const fallbackMaps = EDITOR_RECOMMENDATION_FALLBACK_MAPS
      .filter((item) => !existingIds.has(item.mapId || item.id))
    return [...baseMaps, ...fallbackMaps]
  }, [recommendedMaps])
  const editorRecommendationItems = useMemo(() => {
    return EDITOR_RECOMMENDATION_SLOTS.map((slot, index) => ({
      ...slot,
      map: EDITOR_RECOMMENDATION_FALLBACK_MAPS[index],
    })).filter((item) => item.map)
  }, [])
  const searchRecommendedMaps = useMemo(() => exploreRecommendationMaps.slice(0, 3), [exploreRecommendationMaps])
  const searchRecommendedEditors = useMemo(() => {
    const seen = new Set()
    const fromMaps = exploreRecommendationMaps
      .map((map, index) => {
        const rawName = map.recommender_name || map.recommender || map.creator || ""
        const handle = map.recommender_instagram || (String(rawName).startsWith("@") ? rawName : "")
        const name = String(rawName || handle || "").replace(/^@/, "").trim()
        if (!name) return null
        const key = String(handle || name).toLowerCase()
        if (seen.has(key)) return null
        seen.add(key)
        return {
          id: `map-editor-${index}-${key}`,
          name,
          handle: handle || `@${name.replace(/\s+/g, ".").toLowerCase()}`,
          meta: `${map.placeCount || map.items?.length || 0}곳 추천`,
          bio: map.description || map.reason || "에디터가 고른 추천지도를 볼 수 있어요.",
          tone: map.cover_tone || map.gradient?.[0] || "#FFE2D4",
          query: name,
        }
      })
      .filter(Boolean)
    const fromUsers = users
      .filter((user) => user?.id)
      .map((user) => {
        const handle = user.handle ? `@${String(user.handle).replace(/^@/, "")}` : ""
        const key = String(handle || user.id || user.name).toLowerCase()
        if (seen.has(key)) return null
        seen.add(key)
        return {
          id: `user-editor-${user.id}`,
          name: user.name || handle || "LOCA 유저",
          handle,
          meta: typeof user.mapCount === "number"
            ? `지도 ${user.mapCount}개`
            : followed.includes(user.id)
              ? "팔로잉 중"
              : "추천 에디터",
          bio: user.bio || "공개 지도를 둘러볼 수 있어요.",
          tone: user.avatarColor || "#DDF0DF",
          user,
        }
      })
      .filter(Boolean)
    return [...fromMaps, ...fromUsers, ...SEARCH_EDITOR_FALLBACKS].slice(0, 3)
  }, [exploreRecommendationMaps, followed, users])

  useEffect(() => {
    if (!showAllSections || searchRequestId <= handledSearchRequestRef.current) return
    handledSearchRequestRef.current = searchRequestId
    setSearchMode("active")
    setQuery("")
    setEditorResults([])
  }, [searchRequestId, showAllSections])

  const pushRecentQuery = (raw) => {
    const next = String(raw || "").trim()
    if (!next) return
    setRecentQueries((current) => {
      const filtered = (Array.isArray(current) ? current : []).filter((item) => item !== next)
      return [next, ...filtered].slice(0, 6)
    })
  }

  const submitQuery = (text) => {
    const next = String(text || "").trim()
    setQuery(next)
    setSearchMode("active")
    if (next) pushRecentQuery(next)
  }

  const cancelSearch = () => {
    setSearchMode("idle")
    setQuery("")
    setEditorResults([])
  }

  const clearQuery = () => {
    setQuery("")
    setEditorResults([])
  }

  const removeRecent = (text) => {
    setRecentQueries((current) => (Array.isArray(current) ? current : []).filter((item) => item !== text))
  }

  const clearAllRecent = () => {
    setRecentQueries([])
  }

  // 입력 중 → 지도/에디터 검색 (debounce 200ms)
  const filteredMaps = useMemo(() => {
    if (!normalizedQuery) return []
    return exploreRecommendationMaps.filter((item) => toMapSearchText(item).includes(normalizedQuery))
  }, [exploreRecommendationMaps, normalizedQuery])

  const localEditorMatches = useMemo(() => {
    if (!normalizedQuery) return []
    return users.filter((user) => toEditorSearchText(user).includes(normalizedQuery))
  }, [normalizedQuery, users])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!normalizedQuery) {
      setEditorResults([])
      setEditorSearching(false)
      return
    }
    debounceRef.current = setTimeout(async () => {
      if (!hasSupabaseEnv) {
        setEditorResults(localEditorMatches)
        return
      }
      setEditorSearching(true)
      try {
        const { searchProfiles } = await import("../lib/mapService")
        const results = await searchProfiles(normalizedQuery)
        setEditorResults(results.length > 0 ? results : localEditorMatches)
      } catch {
        setEditorResults(localEditorMatches)
      } finally {
        setEditorSearching(false)
      }
    }, 200)
    return () => debounceRef.current && clearTimeout(debounceRef.current)
  }, [normalizedQuery, localEditorMatches])

  // ── 이벤트 데이터 ──
  const [events, setEvents] = useState([])
  const [eventsLoading, setEventsLoading] = useState(showEventsSection)
  const [eventsError, setEventsError] = useState("")
  const [places, setPlaces] = useState([])
  const [placesLoading, setPlacesLoading] = useState(showEventsSection)
  const [placesError, setPlacesError] = useState("")
  const [showEventList, setShowEventList] = useState(false)
  const [visibleSpotCount, setVisibleSpotCount] = useState(MORE_INITIAL_COUNT)
  // 가볼만한 곳 필터 — 행사/장소
  const [spotFilter, setSpotFilter] = useState("행사")
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [eventDetail, setEventDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState("")
  const [overviewExpanded, setOverviewExpanded] = useState(false)
  const [eventLocation, setEventLocation] = useState(null)
  const [eventLocationStatus, setEventLocationStatus] = useState("idle")
  const [eventLocationError, setEventLocationError] = useState("")
  const eventsRequestRef = useRef(0)
  const placesRequestRef = useRef(0)
  const detailAbortRef = useRef(null)
  const eventListBodyRef = useRef(null)
  const eventListSentinelRef = useRef(null)

  const fetchEvents = async (location = null) => {
    const params = new URLSearchParams({ _t: String(Date.now()) })
    if (Number.isFinite(location?.lat) && Number.isFinite(location?.lng)) {
      params.set("lat", String(location.lat))
      params.set("lng", String(location.lng))
    }
    const url = `/api/events?${params.toString()}`
    const resp = await fetch(url, { cache: "no-store" })
    const data = await resp.json().catch(() => ({}))
    if (!resp.ok) {
      throw new Error(typeof data?.error === "string" ? data.error : "행사를 불러오지 못했어요.")
    }
    return data
  }

  const fetchPlaces = async (location = null) => {
    const params = new URLSearchParams({ _t: String(Date.now()) })
    if (Number.isFinite(location?.lat) && Number.isFinite(location?.lng)) {
      params.set("lat", String(location.lat))
      params.set("lng", String(location.lng))
    }
    const url = `/api/places?${params.toString()}`
    const resp = await fetch(url, { cache: "no-store" })
    const data = await resp.json().catch(() => ({}))
    if (!resp.ok) {
      throw new Error(typeof data?.error === "string" ? data.error : "장소를 불러오지 못했어요.")
    }
    return data
  }

  const requestEventLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setEventLocationStatus("error")
      setEventLocationError("이 기기에서는 위치를 확인할 수 없어요.")
      return
    }
    setEventLocationStatus("locating")
    setEventLocationError("")
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = Number(position.coords.latitude)
        const lng = Number(position.coords.longitude)
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
          setEventLocationStatus("error")
          setEventLocationError("위치 값을 읽지 못했어요. 다시 시도해보세요.")
          return
        }
        setEventLocation({ lat, lng })
        setEventLocationStatus("allowed")
      },
      (error) => {
        setEventLocationStatus("error")
        setEventLocationError(error?.code === error?.PERMISSION_DENIED
          ? "위치 권한을 허용하면 가까운 순으로 볼 수 있어요."
          : "현재 위치를 확인하지 못했어요. 다시 시도해보세요.")
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    )
  }, [])

  useEffect(() => {
    if (!showEventsSection) {
      setEvents([])
      setEventsError("")
      setEventsLoading(false)
      setShowEventList(false)
      setSelectedEvent(null)
      return undefined
    }
    let cancelled = false
    const requestId = ++eventsRequestRef.current
    setEventsLoading(true)
    fetchEvents(eventLocation)
      .then((data) => {
        if (!cancelled && requestId === eventsRequestRef.current) {
          setEvents(data.items?.length > 0 ? data.items : [])
          setEventsError("")
        }
      })
      .catch((error) => {
        if (!cancelled && requestId === eventsRequestRef.current) {
          setEvents([])
          setEventsError(error?.message || "행사를 불러오지 못했어요.")
        }
      })
      .finally(() => {
        if (!cancelled && requestId === eventsRequestRef.current) setEventsLoading(false)
      })
    return () => { cancelled = true }
  }, [eventLocation, showEventsSection])

  useEffect(() => {
    if (!showEventsSection) {
      setPlaces([])
      setPlacesError("")
      setPlacesLoading(false)
      return undefined
    }
    let cancelled = false
    const requestId = ++placesRequestRef.current
    setPlacesLoading(true)
    fetchPlaces(eventLocation)
      .then((data) => {
        if (!cancelled && requestId === placesRequestRef.current) {
          const nextItems = Array.isArray(data.items) ? data.items.filter((item) => !isFoodPlace(item)) : []
          setPlaces(nextItems)
          setPlacesError("")
        }
      })
      .catch((error) => {
        if (!cancelled && requestId === placesRequestRef.current) {
          setPlaces([])
          setPlacesError(error?.message || "장소를 불러오지 못했어요.")
        }
      })
      .finally(() => {
        if (!cancelled && requestId === placesRequestRef.current) setPlacesLoading(false)
      })
    return () => { cancelled = true }
  }, [eventLocation, showEventsSection])

  const formatEventDate = (dateStr) => {
    if (!dateStr || dateStr.length !== 8) return ""
    return `${parseInt(dateStr.slice(4, 6))}.${parseInt(dateStr.slice(6, 8))}`
  }

  const openEventDetail = useCallback(async (event) => {
    detailAbortRef.current?.abort?.()
    const controller = new AbortController()
    detailAbortRef.current = controller
    setSelectedEvent(event)
    setEventDetail(null)
    setDetailLoading(true)
    setDetailError("")
    setOverviewExpanded(false)
    try {
      const typeParam = event.contentTypeId ? `&contentTypeId=${event.contentTypeId}` : ""
      const resp = await fetch(`/api/event-detail?contentId=${event.id}${typeParam}`, { signal: controller.signal })
      const data = await resp.json().catch(() => ({}))
      if (!resp.ok) {
        throw new Error(typeof data?.error === "string" ? data.error : "상세 정보를 불러오지 못했어요.")
      }
      if (detailAbortRef.current !== controller) return
      if (data.detail) setEventDetail(data.detail)
      else setDetailError("상세 정보가 비어 있어 기본 정보만 보여줄게요.")
    } catch (error) {
      if (error?.name === "AbortError") return
      if (detailAbortRef.current === controller) {
        setDetailError(error?.message || "상세 정보를 불러오지 못했어요.")
      }
    } finally {
      if (detailAbortRef.current === controller) {
        setDetailLoading(false)
        detailAbortRef.current = null
      }
    }
  }, [])

  useEffect(() => () => {
    detailAbortRef.current?.abort?.()
  }, [])

  const handleAddSelectedEventToMap = useCallback(() => {
    if (!selectedEvent || typeof onAddEventToMap !== "function") return
    const mergedEvent = {
      ...selectedEvent,
      ...(eventDetail || {}),
      id: eventDetail?.id || selectedEvent.id,
      title: eventDetail?.title || selectedEvent.title,
      image: eventDetail?.image || selectedEvent.image,
      addr: eventDetail?.addr || selectedEvent.addr,
      addrDetail: eventDetail?.addrDetail || "",
      tel: eventDetail?.tel || selectedEvent.tel,
      lat: eventDetail?.lat ?? selectedEvent.lat,
      lng: eventDetail?.lng ?? selectedEvent.lng,
      startDate: eventDetail?.eventStartDate || selectedEvent.startDate,
      endDate: eventDetail?.eventEndDate || selectedEvent.endDate,
      contentTypeId: eventDetail?.contentTypeId || selectedEvent.contentTypeId,
    }
    onAddEventToMap(mergedEvent)
  }, [eventDetail, onAddEventToMap, selectedEvent])

  const canAddSelectedEventToMap = Boolean(
    onAddEventToMap
    && selectedEvent
    && Number.isFinite(Number(eventDetail?.lat ?? selectedEvent?.lat))
    && Number.isFinite(Number(eventDetail?.lng ?? selectedEvent?.lng)),
  )
  const selectedEventAddressText = [
    eventDetail?.addr || selectedEvent?.addr,
    eventDetail?.addrDetail,
  ].filter(Boolean).join(" ").trim()

  const spotItems = useMemo(() => {
    const next = [
      ...events.map(toEventSpot),
      ...places.map(toPlaceSpot),
    ]
    return next.sort((a, b) => (b.score || 0) - (a.score || 0))
  }, [events, places])
  const filteredSpotItems = useMemo(
    () => filterSpotItems(spotItems, spotFilter),
    [spotFilter, spotItems],
  )
  const spotLoading = spotFilter === "장소" ? placesLoading : eventsLoading
  const spotError = spotFilter === "장소" ? placesError : eventsError
  const spotListTitle = spotFilter === "장소" ? "기록해볼 만한 장소" : "근처에서 기록해볼 만한 행사"
  const visibleSpotItems = useMemo(
    () => filteredSpotItems.slice(0, visibleSpotCount),
    [filteredSpotItems, visibleSpotCount],
  )
  const hasMoreSpotItems = visibleSpotCount < filteredSpotItems.length
  const revealMoreSpots = useCallback(() => {
    setVisibleSpotCount((current) => Math.min(current + MORE_PAGE_SIZE, filteredSpotItems.length))
  }, [filteredSpotItems.length])
  const handleEventListScroll = useCallback((event) => {
    const el = event.currentTarget
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 180) revealMoreSpots()
  }, [revealMoreSpots])
  const handleOpenSpot = useCallback((spot) => {
    if (!spot) return
    if (spot.group === "event") {
      openEventDetail(spot._raw)
      return
    }
    if (spot.sourceUrl) {
      window.open(spot.sourceUrl, "_blank", "noopener,noreferrer")
    }
  }, [openEventDetail])

  useEffect(() => {
    if (showEventList) setVisibleSpotCount(MORE_INITIAL_COUNT)
  }, [showEventList, spotFilter])

  useEffect(() => {
    if (!showEventList || !hasMoreSpotItems || !eventListSentinelRef.current) return undefined
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) revealMoreSpots()
    }, {
      root: eventListBodyRef.current,
      rootMargin: "180px 0px",
      threshold: 0,
    })
    observer.observe(eventListSentinelRef.current)
    return () => observer.disconnect()
  }, [hasMoreSpotItems, revealMoreSpots, showEventList, visibleSpotItems.length])

  // v2 modifier — Cream & Ember 리톤. 기존 클래스 보존하고 그 위에 추가.
  const sectionClassName = embedded
    ? "explore-screen explore-screen--embedded explore-screen--v2"
    : "screen screen--scroll explore-screen explore-screen--v2"

  // ─────────────────────────────────────
  // 검색 활성 모드 (B/C 화면)
  if (showAllSections && searchMode === "active") {
    return (
      <section className="screen screen--scroll explore-screen explore-screen--v2 explore-screen--search">
        <div className="ex-search-active-bar">
          <div className="ex-search-active-input">
            <SearchIcon size={16} className="ex-search-ico" />
            <input
              autoFocus
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onBlur={() => { if (trimmed) pushRecentQuery(trimmed) }}
              placeholder="지도, 에디터 검색"
            />
            {query.length > 0 ? (
              <button type="button" className="ex-clear-btn" aria-label="지우기" onClick={clearQuery}>
                <X size={9} strokeWidth={3} />
              </button>
            ) : null}
          </div>
          <button type="button" className="ex-cancel-btn" onClick={cancelSearch}>취소</button>
        </div>

        {trimmed.length === 0 ? (
          <>
            {recentQueries.length > 0 ? (
              <div className="ex-recent-block">
                <div className="ex-recent-head">
                  <span className="ex-recent-head-label">최근 검색</span>
                  <button type="button" className="ex-recent-clear-all" onClick={clearAllRecent}>모두 지우기</button>
                </div>
                <div className="ex-recent-list">
                  {recentQueries.map((text) => (
                    <div key={text} className="ex-recent-item">
                      <button
                        type="button"
                        className="ex-recent-item__hit"
                        onClick={() => submitQuery(text)}
                      >
                        <span className="ex-recent-ico"><Clock size={13} strokeWidth={2} /></span>
                        <span className="ex-recent-text">{text}</span>
                      </button>
                      <button
                        type="button"
                        className="ex-recent-remove"
                        aria-label="삭제"
                        onClick={() => removeRecent(text)}
                      >
                        <X size={11} strokeWidth={2.2} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="ex-search-recommend">
              <div className="ex-search-recommend__head">
                <div>
                  <span className="ex-search-recommend__eyebrow">추천 지도</span>
                  <strong>바로 열어볼 만한 지도</strong>
                </div>
                <span className="ex-search-recommend__badge">EDITOR PICK</span>
              </div>

              <div className="ex-search-map-list">
                {searchRecommendedMaps.map((item, idx) => {
                  const gradStart = item.gradient?.[0] || item.cover_tone || ["#F8C7B1", "#CDE7C6", "#F4D68F"][idx % 3]
                  const gradEnd = item.gradient?.[1] || ["#E86536", "#5D8A65", "#B97A24"][idx % 3]
                  const tags = (item.tags || item.keywords || []).slice(0, 2)
                  const creator = item.creator || item.recommender_name || item.recommender || "LOCA"
                  return (
                    <button
                      key={item.id || item.mapId}
                      type="button"
                      className="ex-search-map-card"
                      onClick={() => onOpenMap?.(item.mapId || item.id)}
                    >
                      <span
                        className="ex-search-map-card__cover"
                        style={{ background: `linear-gradient(135deg, ${gradStart} 0%, ${gradEnd} 100%)` }}
                        aria-hidden="true"
                      >
                        <MapGlyph size={18} strokeWidth={2.1} />
                      </span>
                      <span className="ex-search-map-card__body">
                        <span className="ex-search-map-card__kicker">{creator}</span>
                        <strong>{item.title}</strong>
                        <small>
                          {(item.placeCount || item.items?.length || 0) > 0 ? `${item.placeCount || item.items?.length}곳` : "추천지도"}
                          {tags.length > 0 ? ` · ${tags.join(" · ")}` : ""}
                        </small>
                      </span>
                      <ChevronRight size={15} strokeWidth={2.3} aria-hidden="true" />
                    </button>
                  )
                })}
              </div>

              <div className="ex-search-editor-panel">
                <div className="ex-search-editor-panel__head">
                  <span>추천 에디터</span>
                  <small>취향이 맞는 지도를 더 빠르게 찾기</small>
                </div>
                <div className="ex-search-editor-row">
                  {searchRecommendedEditors.map((editor) => (
                    <button
                      key={editor.id}
                      type="button"
                      className="ex-search-editor-card"
                      onClick={() => {
                        if (editor.user) {
                          onSelectUser?.(editor.user)
                          return
                        }
                        submitQuery(editor.query || editor.handle || editor.name)
                      }}
                    >
                      <span
                        className="ex-search-editor-card__avatar"
                        style={{ background: editor.tone }}
                        aria-hidden="true"
                      >
                        {String(editor.name || "L").slice(0, 1)}
                      </span>
                      <span className="ex-search-editor-card__body">
                        <strong>{editor.name}</strong>
                        <small>{editor.handle || editor.meta}</small>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </>
        ) : (
          // C 화면: 지도 + 에디터 결과
          <>
            {filteredMaps.length === 0 && editorResults.length === 0 && !editorSearching ? (
              <div className="ex-empty-results">
                <div className="ex-empty-results__icon">
                  <SearchIcon size={20} color="#FF6B35" />
                </div>
                <p className="ex-empty-results__title">{`"${trimmed}"에 대한 결과가 없어요`}</p>
                <p className="ex-empty-results__hint">다른 키워드로 검색해보세요</p>
              </div>
            ) : (
              <>
                {filteredMaps.length > 0 ? (
                  <div className="ex-results-section">
                    <div className="ex-results-head">
                      <span className="ex-results-cat-icon ex-results-cat-icon--maps">
                        <MapGlyph size={13} strokeWidth={1.8} />
                      </span>
                      <span className="ex-results-cat-label">지도</span>
                      <span className="ex-results-cat-count">{filteredMaps.length}개</span>
                    </div>
                    <div className="ex-result-list">
                      {filteredMaps.slice(0, 4).map((item) => {
                        const gradStart = item.gradient?.[0] || "#E8BCAD"
                        const gradEnd = item.gradient?.[1] || "#D4836B"
                        return (
                          <button
                            key={item.id}
                            type="button"
                            className="ex-result-row"
                            onClick={() => {
                              pushRecentQuery(trimmed)
                              onOpenMap?.(item.mapId || item.id)
                            }}
                          >
                            <div
                              className="ex-result-thumb"
                              style={{ background: `linear-gradient(135deg, ${gradStart} 0%, ${gradEnd} 100%)` }}
                            />
                            <div className="ex-result-info">
                              <div className="ex-result-title">
                                <HighlightedText text={item.title || ""} query={trimmed} />
                              </div>
                              <div className="ex-result-meta">
                                {item.creator ? <>@{item.creator}</> : null}
                                {item.creator && (item.placeCount || 0) > 0 ? " · " : null}
                                {(item.placeCount || 0) > 0 ? `장소 ${item.placeCount}` : null}
                              </div>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ) : null}

                {editorResults.length > 0 ? (
                  <div className="ex-results-section">
                    <div className="ex-results-head">
                      <span className="ex-results-cat-icon ex-results-cat-icon--editors">
                        <UsersIcon size={13} strokeWidth={1.8} />
                      </span>
                      <span className="ex-results-cat-label">에디터</span>
                      <span className="ex-results-cat-count">{editorResults.length}명</span>
                    </div>
                    <div className="ex-result-list">
                      {editorResults.slice(0, 4).map((user) => {
                        const avatarText = user.handle || user.name || ""
                        const titleText = user.handle ? `@${user.handle.replace(/^@/, "")}` : user.name
                        return (
                          <button
                            key={user.id}
                            type="button"
                            className="ex-result-row"
                            onClick={() => {
                              pushRecentQuery(trimmed)
                              onSelectUser?.(user)
                            }}
                          >
                            <div className="ex-result-thumb ex-result-thumb--editor">👤</div>
                            <div className="ex-result-info">
                              <div className="ex-result-title">
                                <HighlightedText text={titleText || avatarText || ""} query={trimmed} />
                              </div>
                              <div className="ex-result-meta">
                                {typeof user.followerCount === "number" ? `팔로워 ${user.followerCount}` : (followed.includes(user.id) ? "팔로잉 중" : "팔로우하지 않음")}
                                {typeof user.mapCount === "number" ? ` · 지도 ${user.mapCount}` : null}
                              </div>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ) : null}
              </>
            )}
          </>
        )}
      </section>
    )
  }

  // ─────────────────────────────────────
  // A 화면: 기본 상태
  return (
    <section className={sectionClassName}>
      {showAllSections ? (
        <>
          <div className="ex-h-row">
            <BrandLogo className="ex-brand" dotClassName="ex-brand__dot" />
          </div>

          {/* Editor's Pick — 큐레이션된 추천 지도 (recommendedMaps[0]) */}
          {exploreRecommendationMaps.length > 0 ? (
            <EditorsPickCard
              map={exploreRecommendationMaps[0]}
              recommendations={editorRecommendationItems}
              onOpen={onOpenMap}
              onSearch={() => setSearchMode("active")}
            />
          ) : null}
        </>
      ) : null}

      {showCommunitySection ? (
        <>
          <div className="ex-sec-h">
            <div>
              <span className="ex-sec-tag">TOGETHER</span>
              <h2 className="ex-sec-title">모두의 지도</h2>
              <p className="ex-sec-sub">동네 사람들이 함께 만들어가는 지도</p>
            </div>
          </div>

          <div className="ex-together-card">
            <div className="ex-together-blob" aria-hidden="true" />
            <div className="ex-minimap" aria-hidden="true">
              <div className="ex-minimap__streets" />
              <div className="ex-minimap__river" />
              {MINIMAP_PINS.map((pin, idx) => (
                <span
                  key={idx}
                  className={`ex-minimap__pin ex-minimap__pin--${pin.kind}`}
                  style={{ top: pin.top, left: pin.left }}
                />
              ))}
              <div className="ex-minimap__overlay">
                <MapPin size={9} fill="currentColor" stroke="none" />
                <strong>내 동네</strong>
                <span> · 지난 주 새로 기록됨</span>
              </div>
            </div>

            <div className="ex-together-actions">
              <button type="button" className="ex-together-btn" onClick={onOpenCommunityEditor}>
                <MapPin size={13} strokeWidth={2.4} />
                모두의 지도 둘러보기
              </button>
            </div>
          </div>
        </>
      ) : null}

      {showEventsSection ? (
        <SpotsSection
          spots={filteredSpotItems}
          loading={spotLoading}
          error={filteredSpotItems.length === 0 ? spotError : ""}
          spotFilter={spotFilter}
          onSpotFilterChange={setSpotFilter}
          onOpenSpot={handleOpenSpot}
          onSeeMore={() => setShowEventList(true)}
          locationStatus={eventLocationStatus}
          locationError={eventLocationError}
          hasLocation={Boolean(eventLocation)}
          onLocate={requestEventLocation}
        />
      ) : null}

      <div style={{ height: 18 }} />

      {showEventsSection && showEventList ? (
        <div className="event-list-screen">
          <div className="event-list-screen__header">
            <button className="event-list-screen__back" type="button" onClick={() => setShowEventList(false)} aria-label="뒤로가기"><ArrowLeft size={20} /></button>
            <h2>{spotListTitle}</h2>
            <span className="event-list-screen__count">{filteredSpotItems.length}건</span>
          </div>
          <div className="event-list-screen__body" ref={eventListBodyRef} onScroll={handleEventListScroll}>
            {visibleSpotItems.map((spot) => (
              <SpotCard
                key={spot.id}
                spot={spot}
                onClick={() => {
                  setShowEventList(false)
                  handleOpenSpot(spot)
                }}
              />
            ))}
            {hasMoreSpotItems ? (
              <div className="event-list-screen__loader" ref={eventListSentinelRef}>
                더 불러오는 중...
              </div>
            ) : filteredSpotItems.length > MORE_INITIAL_COUNT ? (
              <div className="event-list-screen__loader is-done">마지막 추천이에요</div>
            ) : null}
          </div>
        </div>
      ) : null}

      {showEventsSection && selectedEvent ? (
        <div className="event-detail-overlay" onClick={() => setSelectedEvent(null)}>
          <div className="event-detail-sheet" onClick={(e) => e.stopPropagation()}>
            <button className="event-detail-sheet__close" type="button" onClick={() => setSelectedEvent(null)} aria-label="닫기"><X size={18} /></button>
            {(eventDetail?.image || selectedEvent.image) ? (
              <div className="event-detail-sheet__hero" style={{ backgroundImage: `url(${eventDetail?.image || selectedEvent.image})` }} />
            ) : (
              <div className="event-detail-sheet__hero event-detail-sheet__hero--empty">🎪</div>
            )}

            <div className="event-detail-sheet__body">
              <h2 className="event-detail-sheet__title">{eventDetail?.title || selectedEvent.title}</h2>

              {detailLoading ? (
                <p className="event-detail-sheet__loading">정보를 불러오는 중...</p>
              ) : detailError ? (
                <p className="event-detail-sheet__loading">{detailError}</p>
              ) : eventDetail ? (
                <>
                  <div className="event-detail-sheet__info-grid">
                    {eventDetail.eventStartDate ? (
                      <div className="event-detail-sheet__info-row">
                        <span className="event-detail-sheet__label">📅 기간</span>
                        <span>{formatEventDate(eventDetail.eventStartDate)} ~ {formatEventDate(eventDetail.eventEndDate)}</span>
                      </div>
                    ) : null}
                    {eventDetail.eventPlace ? (
                      <div className="event-detail-sheet__info-row">
                        <span className="event-detail-sheet__label">📍 장소</span>
                        <span>{eventDetail.eventPlace}</span>
                      </div>
                    ) : null}
                    {selectedEventAddressText ? (
                      <div className="event-detail-sheet__info-row event-detail-sheet__info-row--address">
                        <span className="event-detail-sheet__label">🗺 주소</span>
                        <span className="event-detail-sheet__value">{selectedEventAddressText}</span>
                        {canAddSelectedEventToMap ? (
                          <button className="event-detail-sheet__add-map-btn" type="button" onClick={handleAddSelectedEventToMap}>
                            <MapGlyph size={13} strokeWidth={2.2} />
                            내 지도에 추가
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                    {eventDetail.playTime ? (
                      <div className="event-detail-sheet__info-row">
                        <span className="event-detail-sheet__label">⏰ 시간</span>
                        <span>{eventDetail.playTime}</span>
                      </div>
                    ) : null}
                    {eventDetail.useTimeFestival ? (
                      <div className="event-detail-sheet__info-row">
                        <span className="event-detail-sheet__label">💰 이용요금</span>
                        <span>{eventDetail.useTimeFestival}</span>
                      </div>
                    ) : null}
                    {eventDetail.ageLimit ? (
                      <div className="event-detail-sheet__info-row">
                        <span className="event-detail-sheet__label">👤 이용대상</span>
                        <span>{eventDetail.ageLimit}</span>
                      </div>
                    ) : null}
                    {eventDetail.sponsor ? (
                      <div className="event-detail-sheet__info-row">
                        <span className="event-detail-sheet__label">🏢 주최</span>
                        <span>{eventDetail.sponsor}</span>
                      </div>
                    ) : null}
                    {eventDetail.tel || eventDetail.sponsorTel ? (
                      <div className="event-detail-sheet__info-row">
                        <span className="event-detail-sheet__label">📞 연락처</span>
                        <span>{eventDetail.tel || eventDetail.sponsorTel}</span>
                      </div>
                    ) : null}
                  </div>

                  {eventDetail.program ? (
                    <div className="event-detail-sheet__section">
                      <h3>프로그램</h3>
                      <p>{eventDetail.program}</p>
                    </div>
                  ) : null}

                  {eventDetail.overview ? (
                    <div className="event-detail-sheet__section">
                      <h3>소개</h3>
                      <p className={overviewExpanded ? "" : "event-detail-sheet__overview-clamp"}>{eventDetail.overview}</p>
                      {eventDetail.overview.length > 120 ? (
                        <button className="event-detail-sheet__more-btn" type="button" onClick={() => setOverviewExpanded(!overviewExpanded)}>
                          {overviewExpanded ? "접기" : "더보기"}
                        </button>
                      ) : null}
                    </div>
                  ) : null}

                  {eventDetail.homepage ? (
                    <a className="event-detail-sheet__link" href={eventDetail.homepage} target="_blank" rel="noopener noreferrer">
                      🔗 홈페이지 바로가기
                    </a>
                  ) : null}
                </>
              ) : (
                <div className="event-detail-sheet__info-grid">
                  {selectedEvent.startDate ? (
                    <div className="event-detail-sheet__info-row">
                      <span className="event-detail-sheet__label">📅 기간</span>
                      <span>{formatEventDate(selectedEvent.startDate)} ~ {formatEventDate(selectedEvent.endDate)}</span>
                    </div>
                  ) : null}
                  {selectedEventAddressText ? (
                    <div className="event-detail-sheet__info-row event-detail-sheet__info-row--address">
                      <span className="event-detail-sheet__label">🗺 주소</span>
                      <span className="event-detail-sheet__value">{selectedEventAddressText}</span>
                      {canAddSelectedEventToMap ? (
                        <button className="event-detail-sheet__add-map-btn" type="button" onClick={handleAddSelectedEventToMap}>
                          <MapGlyph size={13} strokeWidth={2.2} />
                          내 지도에 추가
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                  {selectedEvent.tel ? (
                    <div className="event-detail-sheet__info-row">
                      <span className="event-detail-sheet__label">📞 연락처</span>
                      <span>{selectedEvent.tel}</span>
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}

// ─────────────────────────────────────────────────────────
// 가볼만한 곳 섹션 — 헤더 + 내 위치 칩 + 필터칩 + SpotCard 리스트
// 참고: 참고자료/design-source/screen-explore.jsx ('가볼만한 곳')
// ─────────────────────────────────────────────────────────
function SpotsSection({
  spots,
  loading,
  error,
  spotFilter,
  onSpotFilterChange,
  onOpenSpot,
  onSeeMore,
  locationStatus = "idle",
  locationError = "",
  hasLocation = false,
  onLocate,
}) {
  return (
    <section className="ex-spots">
      <div className="ex-spots__head">
        <div>
          <h2 className="ex-spots__title">가볼만한 곳</h2>
          <p className="ex-spots__sub">가까운 행사 · 기록할 만한 장소</p>
        </div>
        <button
          type="button"
          className={`ex-pill-btn ex-spots__loc${hasLocation ? " is-active" : ""}`}
          onClick={onLocate}
          disabled={locationStatus === "locating"}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
            <circle cx="12" cy="12" r="5" />
            <circle cx="12" cy="12" r="1.5" fill="var(--accent)" stroke="none" />
          </svg>
          {locationStatus === "locating" ? "확인 중" : "내 위치"}
          <span style={{ color: "var(--ink-mute)", fontWeight: 700 }}>{hasLocation ? "· 근처" : "· 찾기"}</span>
        </button>
      </div>
      {locationError ? <p className="ex-spots__hint">{locationError}</p> : null}

      <div className="ex-spots__chips">
        {["행사", "장소"].map((f) => (
          <button
            key={f}
            type="button"
            className={`ex-filter-chip${spotFilter === f ? " is-active" : ""}`}
            onClick={() => onSpotFilterChange(f)}
          >
            {f}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="ex-spots__empty">
          {spotFilter === "행사" ? "행사를 불러오는 중..." : "추천 장소를 불러오는 중..."}
        </div>
      ) : error ? (
        <div className="ex-spots__empty">{error}</div>
      ) : spots.length === 0 ? (
        <div className="ex-spots__empty">
          {spotFilter === "행사" ? "근처에서 열리는 행사가 없어요" : "추천할 장소를 준비 중이에요"}
        </div>
      ) : (
        <>
          <div className="ex-spots__list">
            {spots.slice(0, 3).map((spot) => (
              <SpotCard key={spot.id} spot={spot} onClick={() => onOpenSpot(spot)} />
            ))}
          </div>
          {spots.length > 3 ? (
            <button type="button" className="ex-spots__more" onClick={onSeeMore}>
              더보기 <span className="ex-spots__more-num">{spots.length}개</span> →
            </button>
          ) : null}
        </>
      )}
    </section>
  )
}

// SpotCard — 100px 좌측 이미지 + 우측 정보. kind 별 뱃지 변형.
function SpotCard({ spot, onClick }) {
  const isEvent = spot.group === "event"
  const isPlace = spot.group === "place"
  const thumb = spot.thumb || {}
  const image = spot.image || spot._raw?.image || ""
  return (
    <button type="button" className="ex-spot-card" onClick={onClick}>
      <div className="ex-spot-card__thumb" style={thumb.gradient ? { background: thumb.gradient } : undefined}>
        {image ? (
          <span className="ex-spot-card__img" style={{ backgroundImage: `url(${image})` }} />
        ) : (
          <span className="ex-spot-card__ico">{thumb.emoji || "🎫"}</span>
        )}
        {isEvent && spot.day ? (
          <span className={`ex-spot-card__day${spot.urgent ? " is-urgent" : ""}`}>{spot.day}</span>
        ) : null}
      </div>
      <div className="ex-spot-card__body">
        <div className="ex-spot-card__tags">
          {isEvent ? (
            <span className="ex-spot-card__kicker">
              EVENT{spot.dateLabel ? ` · ${spot.dateLabel}` : ""}
            </span>
          ) : isPlace ? (
            <span className="ex-spot-card__kicker">장소{spot.sourceLabel ? ` · ${spot.sourceLabel}` : ""}</span>
          ) : null}
        </div>
        <div className="ex-spot-card__title">{spot.title}</div>
        {spot.sub ? <div className="ex-spot-card__sub">{spot.sub}</div> : null}
        <div className="ex-spot-card__foot">
          <MapPin size={10} strokeWidth={2} />
          <span className="ex-spot-card__loc">
            {spot.distance ? `${spot.distance} · ` : ""}{spot.loc}
          </span>
        </div>
      </div>
    </button>
  )
}

// ─────────────────────────────────────────────────────────
// Editor's Pick 2:1 큰 카드 — recommendedMaps[0] 사용
// 어두운 그라데이션 + 흰 타이틀 + "다른 지도 찾기" 흰 필 버튼
// ─────────────────────────────────────────────────────────
function EditorsPickCard({ map, recommendations = [], onOpen, onSearch }) {
  if (!map) return null
  return (
    <div className="ex-editor-section">
      <div className="ex-editor-head">
        <div>
          <span className="ex-editor-kicker">Editor&rsquo;s Pick</span>
          <h2 className="ex-editor-title">이번 주 추천</h2>
        </div>
        <button type="button" className="ex-pill-btn ex-editor-search" onClick={onSearch}>
          <SearchIcon size={12} strokeWidth={2} />
          다른 지도 찾기
        </button>
      </div>

      {recommendations.length > 0 ? (
        <div className="ex-editor-recs" aria-label="추천 지도">
          {recommendations.slice(0, 3).map((item) => {
            const recMap = item.map
            const recTitle = recMap.title || "추천 지도"
            const recCreator = recMap.creator ? `@${String(recMap.creator).replace(/^@/, "")}` : "LOCA"
            const recMeta = `${recCreator} · ${recMap.placeCount || 0}곳`
            const recGradient = Array.isArray(recMap.gradient) && recMap.gradient.length >= 2
              ? `linear-gradient(135deg, ${recMap.gradient[0]}, ${recMap.gradient[1]})`
              : undefined
            return (
              <button
                key={item.id}
                type="button"
                className="ex-editor-rec"
                onClick={() => onOpen?.(recMap.mapId || recMap.id)}
                aria-label={`${item.label} ${recTitle} 열기`}
              >
                <span className="ex-editor-rec__thumb" aria-hidden="true">
                  <PhotoBlock
                    tone="b"
                    width="100%"
                    height="100%"
                    radius={12}
                    style={recGradient ? { background: recGradient } : undefined}
                  />
                </span>
                <span className="ex-editor-rec__body">
                  <span className="ex-editor-rec__label">{item.label}</span>
                  <strong className="ex-editor-rec__title">{recTitle}</strong>
                  <span className="ex-editor-rec__meta">{item.note} · {recMeta}</span>
                </span>
                <ChevronRight className="ex-editor-rec__chevron" size={17} strokeWidth={2.2} aria-hidden="true" />
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
