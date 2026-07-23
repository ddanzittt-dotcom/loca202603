import { useEffect, useMemo, useState } from "react"
import {
  Archive,
  Bookmark,
  CheckCircle2,
  Loader2,
  LocateFixed,
  Mail,
  MapPin,
  MessageCircle,
  Search,
  Share2,
  ShieldCheck,
  Undo2,
  X,
} from "lucide-react"
import { communityMapFeaturesSeed } from "../data/sampleData"
import { publicRecommendMaps, recommendKeywordChips } from "../data/publicRecommendMaps"
import { hasSupabaseEnv } from "../lib/supabase"
import { onAuthStateChange, signInWithKakao, signInWithMagicLink } from "../lib/auth"
import { getCommunityMapBundle } from "../lib/mapService"
import {
  createCommunityRecordAnonymous,
  requestCommunityRecordEditAnonymous,
  updateCommunityRecordAnonymous,
} from "../lib/publicCommunityRecords"
import {
  applyPublicOgMeta,
  getCommunitySearchOgMeta,
  getRecommendMapOgMeta,
  getRecommendSearchOgMeta,
} from "../lib/publicOgMeta"
import {
  deleteSavedRecommendMap,
  deleteSavedRecord,
  getPublicSavedBoxConnectionStatus,
  listPublicSavedItems,
  recordSavedBoxLead,
  savePublicRecommendMap,
  savePublicRecord,
} from "../lib/publicSavedItems"
import { BrandLogo } from "../components/BrandLogo"
import { CommunityRecordComments } from "../components/CommunityRecordComments"
import { KoreaMap } from "../components/koreaMap"
import { FeatureEmoji } from "../components/FeatureEmoji"
import {
  getPixelIdFromPublicEmojiValue,
  getPublicMarkerDescriptor,
  getPublicRecommendedPixelId,
  publicPixelEmojiValue,
} from "../utils/publicMapMarkers"

const ENABLE_AREA_MODE = false
const ENABLE_RECOMMEND_TAB = false
const CONNECTED_LEAD_USER_KEY = "loca.public.saved_box_connected_lead_user_id"
const MY_PUBLIC_RECORD_IDS_KEY = "loca.public.my_record_ids"

const POPULAR_KEYWORDS = [
  "🫘🍜 콩국수",
  "🌶️🐷 제육볶음",
  "🐶 강아지 산책",
  "🚻 공중화장실",
  "🪑 벤치",
  "📚 책방",
  "🧺 시장길",
]

const toPixelEmojiValue = publicPixelEmojiValue

const PLACE_EMOJI_OPTIONS = [
  { value: toPixelEmojiValue("px-pin"), label: "장소" },
  { value: toPixelEmojiValue("px-heart"), label: "단골" },
  { value: toPixelEmojiValue("px-star"), label: "추천" },
  { value: toPixelEmojiValue("px-sun"), label: "햇살" },
  { value: toPixelEmojiValue("px-noodle"), label: "국수" },
  { value: toPixelEmojiValue("px-spicy-pork"), label: "제육" },
  { value: toPixelEmojiValue("px-rice"), label: "밥집" },
  { value: toPixelEmojiValue("px-kimbap"), label: "김밥" },
  { value: toPixelEmojiValue("px-restaurant"), label: "맛집" },
  { value: toPixelEmojiValue("px-cafe"), label: "카페" },
  { value: toPixelEmojiValue("px-coffee"), label: "커피" },
  { value: toPixelEmojiValue("px-tea"), label: "차" },
  { value: toPixelEmojiValue("px-bread"), label: "빵집" },
  { value: toPixelEmojiValue("px-icecream"), label: "디저트" },
  { value: toPixelEmojiValue("px-beer"), label: "맥주" },
  { value: toPixelEmojiValue("px-market"), label: "시장" },
  { value: toPixelEmojiValue("px-tree"), label: "나무" },
  { value: toPixelEmojiValue("px-park"), label: "공원" },
  { value: toPixelEmojiValue("px-garden"), label: "정원" },
  { value: toPixelEmojiValue("px-flower"), label: "꽃" },
  { value: toPixelEmojiValue("px-mountain"), label: "산" },
  { value: toPixelEmojiValue("px-river"), label: "하천" },
  { value: toPixelEmojiValue("px-lake"), label: "호수" },
  { value: toPixelEmojiValue("px-beach"), label: "바다" },
  { value: toPixelEmojiValue("px-dog"), label: "강아지" },
  { value: toPixelEmojiValue("px-bench"), label: "벤치" },
  { value: toPixelEmojiValue("px-book"), label: "책방" },
  { value: toPixelEmojiValue("px-camera"), label: "사진" },
  { value: toPixelEmojiValue("px-toilet"), label: "화장실" },
  { value: toPixelEmojiValue("px-trash"), label: "쓰레기통" },
  { value: toPixelEmojiValue("px-water"), label: "음수대" },
  { value: toPixelEmojiValue("px-wifi"), label: "와이파이" },
  { value: toPixelEmojiValue("px-hospital"), label: "병원" },
  { value: toPixelEmojiValue("px-pharmacy"), label: "약국" },
  { value: toPixelEmojiValue("px-parking"), label: "주차" },
  { value: toPixelEmojiValue("px-convenience"), label: "편의점" },
  { value: toPixelEmojiValue("px-bank"), label: "은행" },
  { value: toPixelEmojiValue("px-post"), label: "우체국" },
  { value: toPixelEmojiValue("px-laundry"), label: "세탁" },
  { value: toPixelEmojiValue("px-hotel"), label: "숙소" },
  { value: toPixelEmojiValue("px-school"), label: "학교" },
  { value: toPixelEmojiValue("px-playground"), label: "놀이터" },
  { value: toPixelEmojiValue("px-gallery"), label: "전시" },
  { value: toPixelEmojiValue("px-music"), label: "음악" },
  { value: toPixelEmojiValue("px-gym"), label: "운동" },
  { value: toPixelEmojiValue("px-barber"), label: "미용" },
  { value: toPixelEmojiValue("px-bus"), label: "버스" },
  { value: toPixelEmojiValue("px-subway"), label: "지하철" },
  { value: toPixelEmojiValue("px-bike"), label: "자전거" },
  { value: toPixelEmojiValue("px-car"), label: "차량" },
  { value: toPixelEmojiValue("px-bridge"), label: "다리" },
  { value: toPixelEmojiValue("px-crosswalk"), label: "횡단보도" },
  { value: toPixelEmojiValue("px-stairs"), label: "계단" },
  { value: toPixelEmojiValue("px-alley"), label: "골목" },
]

const getComposerEmojiDescriptor = (value) => {
  const pixelId = getPixelIdFromPublicEmojiValue(value)
  if (pixelId) return { kind: "pixel", value: pixelId }
  return { kind: "unicode", value: value || "📍" }
}

const PLACE_CATEGORY_OPTIONS = [
  "카페",
  "맛집",
  "밥집",
  "분식",
  "국수",
  "디저트",
  "술집",
  "빵집",
  "산책",
  "쉼터",
  "공원",
  "책방",
  "시장",
  "사진",
  "화장실",
  "반려동물",
  "병원",
  "약국",
  "주차",
  "편의점",
  "은행",
  "우체국",
  "세탁",
  "숙소",
  "학교",
  "놀이터",
  "전시",
  "음악",
  "운동",
  "미용",
  "교통",
  "버스",
  "지하철",
  "자전거",
  "골목",
  "계단",
  "다리",
  "음수대",
  "쓰레기통",
  "와이파이",
  "기타",
]

const distanceKm = (a, b) => {
  if (!a || !b) return Infinity
  const toRad = (value) => (Number(value) * Math.PI) / 180
  const radius = 6371
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * radius * Math.asin(Math.sqrt(h))
}

const parseKeywords = (value) => value
  .split(/[,#\n]/u)
  .map((item) => item.trim())
  .filter(Boolean)
  .slice(0, 8)

const getPublicRecordId = (feature) => String(
  feature?.serverRecordId
    || feature?.record_id
    || feature?.recordId
    || feature?.id
    || "",
).trim()

const loadMyPublicRecordIds = () => {
  if (typeof window === "undefined") return []
  try {
    const parsed = JSON.parse(window.localStorage.getItem(MY_PUBLIC_RECORD_IDS_KEY) || "[]")
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : []
  } catch {
    return []
  }
}

const rememberMyPublicRecordId = (recordId) => {
  const normalizedId = String(recordId || "").trim()
  if (!normalizedId || typeof window === "undefined") return []
  const next = Array.from(new Set([normalizedId, ...loadMyPublicRecordIds()])).slice(0, 80)
  window.localStorage.setItem(MY_PUBLIC_RECORD_IDS_KEY, JSON.stringify(next))
  return next
}

const featureToEditDraft = (feature) => {
  const keywords = getFeatureKeywords(feature)
  const reason = feature?.reason || feature?.category || keywords[0] || ""
  const pixelId = feature?.pixel_icon_key || feature?.emojiPixelId || getPublicMarkerDescriptor(feature)?.pixelId || "px-pin"
  return {
    title: feature?.title || "",
    description: feature?.intro || feature?.note || feature?.description || "",
    reason,
    keywordText: keywords.filter((keyword) => keyword !== reason).join(", "),
    selectedEmoji: getFeatureKind(feature) === "route" ? toPixelEmojiValue("px-route") : toPixelEmojiValue(pixelId),
  }
}

const getRecommendedComposerPixelId = ({
  draftKind = "place",
  title = "",
  note = "",
  category = "",
  keywordText = "",
} = {}) => {
  const keywords = [category, ...parseKeywords(keywordText)].filter(Boolean)
  return getPublicRecommendedPixelId({
    type: draftKind === "route" ? "route" : "place",
    recordType: draftKind === "route" ? "route" : "place",
    title,
    description: note,
    note,
    category,
    keywords,
    tags: keywords,
    representative_keyword: category || keywords[0] || "",
  })
}

const getRecommendedComposerEmojiValue = (params) => (
  toPixelEmojiValue(getRecommendedComposerPixelId(params))
)

const stripEmojiPrefix = (value) => value.replace(/^[\p{Emoji_Presentation}\p{Extended_Pictographic}\uFE0F\s]+/gu, "").trim()

const searchPublicAddresses = (query) => new Promise((resolve, reject) => {
  const naverMaps = window.naver?.maps
  if (!naverMaps?.Service?.geocode) {
    reject(new Error("주소 검색을 아직 사용할 수 없어요."))
    return
  }
  naverMaps.Service.geocode({ query }, (status, response) => {
    if (status !== naverMaps.Service.Status.OK || !response?.v2?.addresses?.length) {
      resolve([])
      return
    }
    resolve(response.v2.addresses
      .map((address, index) => {
        const lat = Number(address.y)
        const lng = Number(address.x)
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
        const label = address.roadAddress || address.jibunAddress || query
        return {
          id: `${lat}-${lng}-${index}`,
          lat,
          lng,
          zoom: 16,
          label,
          subLabel: address.roadAddress && address.jibunAddress ? address.jibunAddress : "",
        }
      })
      .filter(Boolean)
      .slice(0, 5))
  })
})

const getSavedBoxRedirectTo = () => {
  if (typeof window === "undefined") return undefined
  return `${window.location.origin}/community-web?storage_connected=1`
}

const getFeatureKind = (feature) => {
  if (feature?.recordType === "route" || feature?.type === "route") return "route"
  if (feature?.type === "area" && ENABLE_AREA_MODE) return "area"
  return "place"
}

const getFeatureKindLabel = (feature) => getFeatureKind(feature) === "route" ? "길" : "장소"

const getFeatureEmojiDescriptor = (feature) => {
  const descriptor = getPublicMarkerDescriptor(feature)
  if (descriptor.pixelId) return { kind: "pixel", value: descriptor.pixelId }
  return {
    kind: "unicode",
    value: descriptor.fallback || (getFeatureKind(feature) === "route" ? "〰️" : "📍"),
  }
}

function PublicFeatureIcon({ feature, size = 22, className = "" }) {
  return (
    <FeatureEmoji
      emoji={getFeatureEmojiDescriptor(feature)}
      size={size}
      unicodeFontSize={Math.round(size * 0.78)}
      className={className}
    />
  )
}

const getFeatureRegion = (feature) => (
  feature?.region
  || feature?.district
  || feature?.neighborhood
  || feature?.address
  || "성수동"
)

const getFeatureKeywords = (feature) => {
  const keywordValues = [
    ...(Array.isArray(feature?.keywords) ? feature.keywords : []),
    ...(Array.isArray(feature?.tags) ? feature.tags : []),
  ]
  return Array.from(new Set(keywordValues.map((item) => String(item).trim()).filter(Boolean))).slice(0, 6)
}

const getFeatureSearchText = (feature) => {
  const kind = getFeatureKindLabel(feature)
  return [
    feature?.title,
    feature?.description,
    feature?.note,
    feature?.intro,
    getFeatureRegion(feature),
    feature?.author_name,
    feature?.authorName,
    feature?.createdByName,
    kind,
    feature?.type,
    ...getFeatureKeywords(feature),
  ].filter(Boolean).join(" ").toLowerCase()
}

const getRecommendMapCounts = (map) => {
  const place = map.items.filter((item) => item.item_type === "place").length
  const route = map.items.filter((item) => item.item_type === "route").length
  return { place, route, total: place + route }
}

const getRecommendMapRecommender = (map) => map.recommender_name || map.recommender || "추천자 없음"
const getRecommendMapCover = (map) => map.cover_image_url || map.cover_image || ""
const getRecommendMapReelLabel = (map) => map.reel_id || "LOCA PICK"

const getRecommendMapSearchText = (map) => [
  map.title,
  map.region,
  map.description,
  map.recommender_name,
  map.recommender,
  map.recommender_instagram,
  map.reel_id,
  ...(Array.isArray(map.keywords) ? map.keywords : []),
].filter(Boolean).join(" ").toLowerCase()

const recommendItemToFeature = (item, map) => {
  const location = item.representative_location || map.center
  const isRoute = item.item_type === "route"
  return {
    id: `recommend-${map.slug}-${item.id}`,
    mapId: map.id,
    type: isRoute ? "route" : "pin",
    recordType: isRoute ? "route" : "place",
    geometryType: item.geometry_type,
    title: item.title,
    note: item.intro,
    intro: item.intro,
    region: item.region || map.region,
    keywords: item.keywords || [],
    tags: item.keywords || [],
    representative_keyword: item.representative_keyword || item.keywords?.[0] || null,
    representativeLocation: location,
    lat: location.lat,
    lng: location.lng,
    points: isRoute ? [[location.lng, location.lat]] : undefined,
    sourceContext: map.source_context,
    reel_id: map.reel_id,
    record_id: item.record_id || item.id,
    updatedAt: new Date().toISOString(),
  }
}

const getRecommendMapFeatures = (map) => map.items.map((item) => recommendItemToFeature(item, map))

// 2026-07-23: 모두의 지도(/community-web) 철거 — 이 공개 웹은 추천할지도 전용 표면이 됐다.
// 탭 전환 UI 와 로고 링크에서 모두의 지도 진입을 제거한다(화면 내부 커뮤니티 코드는 미도달 상태로 잔존).
function PublicTopBar({ onSavedOpen }) {
  return (
    <header className="public-top">
      <a className="public-logo" href="/maps/search" aria-label="LOCA 추천할지도">
        <BrandLogo as="span" className="public-logo__brand" dotClassName="public-logo__dot" />
        <span className="public-logo__section">추천할지도</span>
      </a>
      <nav className="public-tabs public-tabs--single" aria-label="공개 지도 탭">
        <button type="button" className="is-active" aria-pressed="true">
          추천할지도
        </button>
      </nav>
      <button className="public-saved-button" type="button" onClick={onSavedOpen}>
        <Archive size={15} />
        저장함
      </button>
    </header>
  )
}

function PublicMapCanvas({ features, myLocation, selectedFeatureId, onFeatureTap, draftPoints = [], draftMode, onMapTap, focusPoint }) {
  const resolvedFocusPoint = focusPoint || (myLocation ? { ...myLocation, zoom: 15 } : { lat: 37.544, lng: 127.056, zoom: 14 })

  return (
    <div className="public-map__canvas">
      <KoreaMap
        features={features}
        selectedFeatureId={selectedFeatureId}
        draftPoints={draftPoints}
        draftMode={draftMode}
        focusPoint={resolvedFocusPoint}
        fitTrigger={features.length + draftPoints.length}
        onMapTap={onMapTap}
        onFeatureTap={onFeatureTap}
        showLabels
        myLocation={myLocation}
        markerStyle="pixel"
        showRouteBadge
      />
    </div>
  )
}

function NearbyLocationButton({ locationState, onOpen }) {
  return (
    <button className="public-nearby-button" type="button" onClick={onOpen}>
      <LocateFixed size={15} />
      {locationState === "allowed" ? "내 주변 켬" : "내 주변"}
    </button>
  )
}

function NearbyLocationModal({ open, locationState, onClose, onLocate }) {
  if (!open) return null
  return (
    <div className="public-light-modal" role="dialog" aria-modal="true" aria-label="내 주변 확인">
      <div className="public-light-modal__panel">
        <button type="button" onClick={onClose} aria-label="닫기">
          <X size={16} />
        </button>
        <span className="public-light-modal__icon">
          <ShieldCheck size={20} />
        </span>
        <h2>내 주변 기록을 볼까요?</h2>
        <p>내 주변 기록을 보려면 현재 위치를 확인할 수 있어요. 현재 위치는 서버에 저장하지 않습니다.</p>
        <div className="public-light-modal__actions">
          <button type="button" onClick={onLocate}>
            <LocateFixed size={15} />
            {locationState === "checking" ? "확인 중..." : "현재 위치 확인"}
          </button>
          <button type="button" onClick={onClose}>나중에</button>
        </div>
      </div>
    </div>
  )
}

function PinPlacementHint({ draftKind, setDraftKind, onClose }) {
  const isRoute = draftKind === "route"
  return (
    <div className="public-pin-hint" role="status">
      <span>
        {isRoute ? "〰️" : <MapPin size={16} />}
      </span>
      <div>
        <strong>지도에서 위치를 찍어주세요</strong>
        <p>{isRoute ? "길을 대표하는 위치를 찍어주세요. 한 번 누르면 작성창이 열립니다." : "저장하고 싶은 장소를 한 번 누르면 작성창이 열립니다."}</p>
        <div className="public-pin-hint__types" role="group" aria-label="남길 기록 유형">
          <button type="button" className={draftKind === "place" ? "is-active" : ""} onClick={() => setDraftKind("place")}>장소</button>
          <button type="button" className={draftKind === "route" ? "is-active" : ""} onClick={() => setDraftKind("route")}>길</button>
        </div>
      </div>
      <button type="button" onClick={onClose} aria-label="핀 찍기 취소">
        <X size={15} />
      </button>
    </div>
  )
}

function ComposerBottomSheet({
  draftKind,
  setDraftKind,
  title,
  setTitle,
  selectedEmoji,
  setSelectedEmoji,
  emojiTouched,
  setEmojiTouched,
  note,
  setNote,
  category,
  setCategory,
  keywordText,
  setKeywordText,
  myLocation,
  draftPin,
  message,
  canSave,
  submitting,
  onClose,
  onSave,
  onClear,
}) {
  const isRoute = draftKind === "route"
  const recommendEmoji = (overrides = {}) => getRecommendedComposerEmojiValue({
    draftKind,
    title,
    note,
    category,
    keywordText,
    ...overrides,
  })
  const syncRecommendedEmoji = (overrides = {}) => {
    if (isRoute || emojiTouched) return
    setSelectedEmoji(recommendEmoji(overrides))
  }
  const handleTitleChange = (value) => {
    setTitle(value)
    syncRecommendedEmoji({ title: value })
  }
  const handleNoteChange = (value) => {
    setNote(value)
    syncRecommendedEmoji({ note: value })
  }
  const handleCategoryChange = (value) => {
    setCategory(value)
    if (!isRoute) setSelectedEmoji(recommendEmoji({ category: value }))
    setEmojiTouched(false)
  }
  const handleKeywordChange = (value) => {
    setKeywordText(value)
    syncRecommendedEmoji({ keywordText: value })
  }
  const handleManualEmoji = (value) => {
    setSelectedEmoji(value)
    setEmojiTouched(true)
  }
  const handleAutoEmoji = () => {
    setSelectedEmoji(recommendEmoji())
    setEmojiTouched(false)
  }

  return (
    <aside className="public-composer public-composer--place" aria-label="장소와 길 남기기">
      <div className="public-composer__head">
        <span>장소·길 남기기</span>
        <strong>{isRoute ? "길에 기록하기" : "핀에 기록하기"}</strong>
        <button type="button" onClick={onClose} aria-label="닫기">
          <X size={16} />
        </button>
      </div>

      <div className="public-type-row public-type-row--compact" role="radiogroup" aria-label="기록 유형">
        <button
          type="button"
          className={draftKind === "place" ? "is-active" : ""}
          aria-pressed={draftKind === "place"}
          onClick={() => setDraftKind("place")}
        >
          <MapPin size={14} />
          장소
        </button>
        <button
          type="button"
          className={draftKind === "route" ? "is-active" : ""}
          aria-pressed={draftKind === "route"}
          onClick={() => setDraftKind("route")}
        >
          〰️
          길
        </button>
      </div>

      <div className="public-composer__pin-summary">
        <span>
          {isRoute ? (
            <PublicFeatureIcon feature={{ type: "route" }} size={28} />
          ) : (
            <FeatureEmoji emoji={getComposerEmojiDescriptor(selectedEmoji)} size={28} />
          )}
        </span>
        <div>
          <strong>{isRoute ? "길 대표 위치" : "선택한 핀 위치"}</strong>
          <p>{draftPin ? `${draftPin.lat.toFixed(5)}, ${draftPin.lng.toFixed(5)}` : isRoute ? "길을 대표하는 위치를 찍어주세요." : "지도에서 위치를 다시 찍어주세요."}</p>
        </div>
      </div>

      {!isRoute ? (
        <>
          <div className="public-emoji-picker__head">
            <span>픽셀 이모지</span>
            <button type="button" onClick={handleAutoEmoji}>자동 추천</button>
          </div>
          <div className="public-emoji-picker" role="radiogroup" aria-label="장소 이모지">
            {PLACE_EMOJI_OPTIONS.map((emoji) => (
              <button
                key={emoji.value}
                type="button"
                className={selectedEmoji === emoji.value ? "is-active" : ""}
                aria-label={emoji.label}
                aria-pressed={selectedEmoji === emoji.value}
                title={emoji.label}
                onClick={() => handleManualEmoji(emoji.value)}
              >
                <FeatureEmoji emoji={getComposerEmojiDescriptor(emoji.value)} size={24} />
              </button>
            ))}
          </div>
        </>
      ) : (
        <div className="public-route-note">
          길은 선을 그리지 않고 대표 위치 1개와 설명으로 남깁니다.
        </div>
      )}

      <label className="public-field">
        <span>{isRoute ? "길 이름" : "이름"}</span>
        <input value={title} onChange={(event) => handleTitleChange(event.target.value)} placeholder={isRoute ? "예: 저녁에 걷기 좋은 길" : "예: 조용한 카페, 산책길 입구"} />
      </label>

      <label className="public-field">
        <span>간단한 설명</span>
        <textarea value={note} onChange={(event) => handleNoteChange(event.target.value)} rows={2} placeholder={isRoute ? "어떤 생활 동선인지 한두 줄로 남겨주세요." : "어떤 곳인지 한두 줄로 남겨주세요."} />
      </label>

      <label className="public-field">
        <span>카테고리</span>
        <select value={category} onChange={(event) => handleCategoryChange(event.target.value)}>
          <option value="">선택 안 함</option>
          {PLACE_CATEGORY_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      </label>

      <label className="public-field">
        <span>태그</span>
        <input value={keywordText} onChange={(event) => handleKeywordChange(event.target.value)} placeholder="예: 조용함, 커피, 혼자 가기 좋음" />
      </label>

      <div className="public-composer__notice">
        <strong>{myLocation ? "내 주변 확인 완료" : "위치 확인 없이도 작성 가능"}</strong>
        <span>{isRoute ? "현재 위치는 서버에 저장하지 않고, 방금 찍은 길 대표 위치만 접수됩니다." : "현재 위치는 서버에 저장하지 않고, 방금 찍은 핀 위치만 접수됩니다."}</span>
      </div>

      <div className="public-draft-status">
        <span>핀 위치 선택됨</span>
        <div>
          <button type="button" onClick={onClear}>
            <Undo2 size={14} />
            핀 다시 찍기
          </button>
        </div>
      </div>

      {message ? <p className="public-composer__message">{message}</p> : null}

      <button className="public-primary" type="button" disabled={!canSave || submitting} onClick={onSave}>
        {submitting ? "접수 중..." : isRoute ? "길 남기기" : "장소 남기기"}
      </button>
    </aside>
  )
}

function RecordEditModal({ feature, mode, open, submitting, message, onClose, onSubmit }) {
  if (!open || !feature) return null

  const draft = featureToEditDraft(feature)
  const recordId = getPublicRecordId(feature) || feature.id || "record"
  return (
    <RecordEditModalContent
      key={`${recordId}-${mode}`}
      feature={feature}
      mode={mode}
      initialDraft={draft}
      submitting={submitting}
      message={message}
      onClose={onClose}
      onSubmit={onSubmit}
    />
  )
}

function RecordEditModalContent({ feature, mode, initialDraft, submitting, message, onClose, onSubmit }) {
  const [title, setTitle] = useState(initialDraft.title)
  const [description, setDescription] = useState(initialDraft.description)
  const [reason, setReason] = useState(initialDraft.reason)
  const [keywordText, setKeywordText] = useState(initialDraft.keywordText)
  const [selectedEmoji, setSelectedEmoji] = useState(initialDraft.selectedEmoji)
  const isRoute = getFeatureKind(feature) === "route"
  const isOwnEdit = mode === "edit"
  const submit = () => {
    const keywords = [reason, ...parseKeywords(keywordText)].filter(Boolean)
    onSubmit({
      type: isRoute ? "route" : "place",
      title: title.trim(),
      description: description.trim(),
      reason: reason.trim() || null,
      keywords,
      representative_keyword: reason.trim() || keywords[0] || null,
      pixel_icon_key: isRoute ? "px-route" : (getPixelIdFromPublicEmojiValue(selectedEmoji) || getRecommendedComposerPixelId({
        draftKind: "place",
        title,
        note: description,
        category: reason,
        keywordText,
      })),
      route_summary_text: isRoute ? description.trim() : null,
      selectedEmoji,
    })
  }

  return (
    <div className="public-light-modal public-record-edit-modal" role="dialog" aria-modal="true" aria-label={isOwnEdit ? "내 기록 수정" : "수정 요청"}>
      <div className="public-light-modal__panel public-record-edit-modal__panel">
        <button className="public-modal-close" type="button" onClick={onClose} aria-label="닫기">
          <X size={16} />
        </button>
        <span className="public-light-modal__icon">
          {isOwnEdit ? <CheckCircle2 size={20} /> : <MessageCircle size={20} />}
        </span>
        <h2>{isOwnEdit ? "내 기록을 수정할까요?" : "수정 요청하기"}</h2>
        <p>{isOwnEdit ? "내가 남긴 기록은 바로 수정할 수 있어요." : "다른 사람이 남긴 기록은 로카가 확인한 뒤 반영되도록 수정 요청으로 받아요."}</p>

        {!isRoute ? (
          <>
            <div className="public-emoji-picker__head">
              <span>픽셀 이모지</span>
            </div>
            <div className="public-emoji-picker public-emoji-picker--edit" role="radiogroup" aria-label="수정할 이모지">
              {PLACE_EMOJI_OPTIONS.slice(0, 24).map((emoji) => (
                <button
                  key={emoji.value}
                  type="button"
                  className={selectedEmoji === emoji.value ? "is-active" : ""}
                  aria-label={emoji.label}
                  aria-pressed={selectedEmoji === emoji.value}
                  title={emoji.label}
                  onClick={() => setSelectedEmoji(emoji.value)}
                >
                  <FeatureEmoji emoji={getComposerEmojiDescriptor(emoji.value)} size={22} />
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="public-route-note">길 기록은 대표 위치는 유지하고 이름과 설명을 수정합니다.</div>
        )}

        <label className="public-field">
          <span>{isRoute ? "길 이름" : "이름"}</span>
          <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder={isRoute ? "길 이름" : "장소 이름"} />
        </label>
        <label className="public-field">
          <span>간단한 설명</span>
          <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} placeholder="어떤 곳인지 한두 줄로 남겨주세요." />
        </label>
        <label className="public-field">
          <span>카테고리</span>
          <select value={reason} onChange={(event) => setReason(event.target.value)}>
            <option value="">선택 안 함</option>
            {PLACE_CATEGORY_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </label>
        <label className="public-field">
          <span>태그</span>
          <input value={keywordText} onChange={(event) => setKeywordText(event.target.value)} placeholder="예: 조용함, 커피, 혼자 가기 좋음" />
        </label>

        {message ? <p className="public-composer__message">{message}</p> : null}
        <button className="public-primary" type="button" disabled={submitting || !title.trim() || !description.trim()} onClick={submit}>
          {submitting ? "처리 중..." : isOwnEdit ? "수정 저장" : "수정 요청 보내기"}
        </button>
      </div>
    </div>
  )
}

function CommunityResultCard({ feature, onSave, onOpen }) {
  const kind = getFeatureKind(feature)
  const kindLabel = kind === "route" ? "길" : "장소"
  const region = getFeatureRegion(feature)
  const intro = feature?.intro || feature?.note || feature?.description || "아직 한 줄 소개가 없어요."
  const keywords = getFeatureKeywords(feature)

  return (
    <article className={`public-community-card public-community-card--${kind}`}>
      <div className="public-community-card__main">
        <strong>
          <PublicFeatureIcon feature={feature} size={18} />
          <span>{feature.title || `이름 없는 ${kindLabel}`}</span>
        </strong>
        <span>{region} · {kindLabel}</span>
        <p>{intro}</p>
        {keywords.length ? (
          <div className="public-community-card__tags">
            {keywords.map((keyword) => <em key={keyword}>{keyword}</em>)}
          </div>
        ) : null}
      </div>
      <div className="public-community-card__actions">
        <button type="button" onClick={() => onOpen?.(feature)}>자세히</button>
        <button type="button" onClick={() => onSave(feature)}>저장</button>
      </div>
    </article>
  )
}

function CommunityWebPage({ view, onOpenSubmit, onSaved }) {
  const [bundle, setBundle] = useState(null)
  const [query, setQuery] = useState("")
  const [searchMode, setSearchMode] = useState("record")
  const [selectedTerms, setSelectedTerms] = useState([])
  const [resultKind, setResultKind] = useState("all")
  const [draftKind, setDraftKind] = useState("place")
  const [title, setTitle] = useState("")
  const [selectedEmoji, setSelectedEmoji] = useState(toPixelEmojiValue("px-pin"))
  const [emojiTouched, setEmojiTouched] = useState(false)
  const [note, setNote] = useState("")
  const [category, setCategory] = useState("")
  const [keywordText, setKeywordText] = useState("")
  const [myLocation, setMyLocation] = useState(null)
  const [locationState, setLocationState] = useState("idle")
  const [selectedFeatureId, setSelectedFeatureId] = useState(null)
  const [localFeatures, setLocalFeatures] = useState([])
  const [draftPin, setDraftPin] = useState(null)
  const [draftPoints, setDraftPoints] = useState([])
  const [mappingMessage, setMappingMessage] = useState("")
  const [submissionMessage, setSubmissionMessage] = useState("")
  const [submittingRecord, setSubmittingRecord] = useState(false)
  const [myRecordIds, setMyRecordIds] = useState(() => loadMyPublicRecordIds())
  const [featureOverrides, setFeatureOverrides] = useState({})
  const [recordEditTarget, setRecordEditTarget] = useState(null)
  const [recordEditMode, setRecordEditMode] = useState("request")
  const [recordEditSubmitting, setRecordEditSubmitting] = useState(false)
  const [recordEditMessage, setRecordEditMessage] = useState("")
  const [nearbyModalOpen, setNearbyModalOpen] = useState(false)
  const [mapFocusPoint, setMapFocusPoint] = useState(null)
  const [searchNotice, setSearchNotice] = useState("")
  const [addressSearching, setAddressSearching] = useState(false)
  const [addressResults, setAddressResults] = useState([])

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        if (hasSupabaseEnv) {
          const communityBundle = await getCommunityMapBundle()
          if (!cancelled && communityBundle?.map) setBundle(communityBundle)
        }
      } catch (error) {
        console.warn("Failed to load community map bundle", error)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  const baseFeatures = bundle?.map ? (bundle.features || []) : communityMapFeaturesSeed
  const draftFeature = draftPin
    ? [{
      id: "public-draft-pin",
      mapId: "community-map",
      type: draftKind === "route" ? "route" : "pin",
      recordType: draftKind,
      title: title.trim() || (draftKind === "route" ? "새 길" : "새 장소"),
      emoji: draftKind === "route" ? toPixelEmojiValue("px-route") : selectedEmoji,
      pixel_icon_key: draftKind === "route"
        ? "px-route"
        : (getPixelIdFromPublicEmojiValue(selectedEmoji) || getRecommendedComposerPixelId({ draftKind, title, note, category, keywordText })),
      lat: draftPin.lat,
      lng: draftPin.lng,
      note,
      category,
      tags: [category, ...parseKeywords(keywordText)].filter(Boolean),
      keywords: [category, ...parseKeywords(keywordText)].filter(Boolean),
      representative_keyword: category || parseKeywords(keywordText)[0] || null,
      points: draftKind === "route" ? [[draftPin.lng, draftPin.lat]] : undefined,
      highlight: true,
      updatedAt: new Date().toISOString(),
    }]
    : []
  const pendingSubmissions = localFeatures.filter((feature) => feature.publicStatus === "pending")
  const visibleLocalFeatures = localFeatures.filter((feature) => feature.publicStatus !== "pending")
  const applyFeatureOverride = (feature) => {
    const recordId = getPublicRecordId(feature)
    const override = featureOverrides[recordId] || featureOverrides[feature?.id]
    return override ? { ...feature, ...override } : feature
  }
  const features = [...baseFeatures, ...visibleLocalFeatures, ...draftFeature].map(applyFeatureOverride)
  const queryTerm = query.trim()
  const activeTerms = useMemo(() => {
    if (searchMode !== "record") return []
    const terms = [...selectedTerms]
    if (searchMode === "record" && queryTerm && !terms.includes(queryTerm)) terms.push(queryTerm)
    return terms
  }, [queryTerm, searchMode, selectedTerms])
  useEffect(() => {
    applyPublicOgMeta(getCommunitySearchOgMeta(activeTerms.map((term) => stripEmojiPrefix(term) || term).join(", ")))
  }, [activeTerms])
  const baseSearchFeatures = useMemo(() => (
    features.filter((feature) => feature.id !== "public-draft-pin" && (ENABLE_AREA_MODE || feature.type !== "area"))
  ), [features])
  const filteredRecords = useMemo(() => {
    if (activeTerms.length === 0) return baseSearchFeatures
    return baseSearchFeatures.filter((feature) => {
      const text = getFeatureSearchText(feature)
      return activeTerms.every((term) => {
        const normalizedTerm = stripEmojiPrefix(term).toLowerCase()
        return normalizedTerm ? text.includes(normalizedTerm) : true
      })
    })
  }, [activeTerms, baseSearchFeatures])
  const resultCounts = useMemo(() => {
    const place = filteredRecords.filter((feature) => getFeatureKind(feature) === "place").length
    const route = filteredRecords.filter((feature) => getFeatureKind(feature) === "route").length
    return { all: filteredRecords.length, place, route }
  }, [filteredRecords])
  const visibleResults = useMemo(() => (
    resultKind === "all"
      ? filteredRecords
      : filteredRecords.filter((feature) => getFeatureKind(feature) === resultKind)
  ), [filteredRecords, resultKind])
  const isSearchMode = activeTerms.length > 0
  const hasMeaningfulIntro = (feature) => {
    const intro = (feature?.intro || feature?.note || feature?.description || "").trim()
    return Boolean(intro && intro !== "아직 한 줄 소개가 없어요.")
  }
  const defaultRecords = useMemo(() => (
    visibleResults.filter(hasMeaningfulIntro).slice(0, 3)
  ), [visibleResults])
  const listRecords = selectedFeatureId
    ? []
    : (isSearchMode ? visibleResults : defaultRecords)
  const filteredFeatures = [...visibleResults, ...draftFeature]

  const addSearchTerm = (term) => {
    const normalizedTerm = term.trim()
    if (!normalizedTerm) return
    setSearchNotice("")
    setAddressResults([])
    setSelectedTerms((current) => current.includes(normalizedTerm) ? current : [...current, normalizedTerm])
    setQuery("")
  }

  const selectSearchMode = (mode) => {
    setSearchMode(mode)
    setQuery("")
    setSearchNotice("")
    setAddressResults([])
    setAddressSearching(false)
  }

  const selectAddressResult = (result) => {
    setMapFocusPoint({ lat: result.lat, lng: result.lng, zoom: result.zoom })
    setSelectedFeatureId(null)
    setQuery(result.label)
    setAddressResults([])
    setSearchNotice(`${result.label}로 지도를 이동했어요.`)
  }

  const handleSearchSubmit = async () => {
    const normalizedQuery = query.trim()
    if (!normalizedQuery) return
    if (searchMode === "record") {
      addSearchTerm(normalizedQuery)
      return
    }

    setAddressSearching(true)
    setSearchNotice("")
    setAddressResults([])
    try {
      const results = await searchPublicAddresses(normalizedQuery)
      if (results.length === 1) {
        selectAddressResult(results[0])
        return
      }
      if (results.length > 1) {
        setAddressResults(results)
        setSearchNotice("정확한 위치를 선택해주세요.")
        return
      }
      setSearchNotice("주소 결과가 없어요. 도로명이나 지번을 조금 더 자세히 입력해주세요.")
    } catch (error) {
      setSearchNotice(error.message || "주소 검색을 불러오지 못했어요. 잠시 후 다시 시도해주세요.")
    } finally {
      setAddressSearching(false)
    }
  }

  const removeSearchTerm = (term) => {
    if (term === queryTerm) setQuery("")
    setSelectedTerms((current) => current.filter((item) => item !== term))
  }

  const checkNear = (points) => {
    if (!myLocation) return { ok: true, message: "" }
    const farPoint = points.find((point) => distanceKm(myLocation, point) > 2)
    if (!farPoint) return { ok: true, message: "" }
    return { ok: true, message: "현재 위치에서 조금 먼 곳이에요. 직접 다녀온 장소나 길이라면 계속 남길 수 있습니다." }
  }

  const handleMapTap = (point) => {
    setSelectedFeatureId(null)
    const near = checkNear([point])
    setMappingMessage(near.message)
    setDraftPin(point)
    setDraftPoints([])
  }

  const clearDraft = () => {
    setDraftPin(null)
    setDraftPoints([])
    setMappingMessage("")
  }

  const draftReady = (() => {
    if (!title.trim()) return false
    if (!note.trim()) return false
    return Boolean(draftPin)
  })()

  const saveDraft = async () => {
    const now = new Date().toISOString()
    const keywords = [category, ...parseKeywords(keywordText)].filter(Boolean)
    const nearPoints = [draftPin].filter(Boolean)
    const near = checkNear(nearPoints)
    if (!draftReady) {
      setMappingMessage("핀 위치, 이름, 간단한 설명을 먼저 채워주세요.")
      return
    }

    const representativeLocation = { lat: draftPin.lat, lng: draftPin.lng }

    const payload = {
      type: draftKind,
      title: title.trim(),
      description: note.trim(),
      reason: category || null,
      keywords,
      representative_keyword: category || keywords[0] || null,
      pixel_icon_key: draftKind === "route"
        ? "px-route"
        : (getPixelIdFromPublicEmojiValue(selectedEmoji) || getRecommendedComposerPixelId({ draftKind, title, note, category, keywordText })),
      lat: representativeLocation.lat,
      lng: representativeLocation.lng,
      route_summary_text: draftKind === "route" ? note.trim() : null,
    }

    setSubmittingRecord(true)
    setMappingMessage("")
    try {
      const result = await createCommunityRecordAnonymous(payload)
      const submittedRecord = result.data
      const submittedStatus = submittedRecord.status === "approved" ? "approved" : "pending"
      const submittedFeature = {
        id: `public-pending-${submittedRecord.id || Date.now()}`,
        serverRecordId: submittedRecord.id,
        mapId: "community-map",
        type: draftKind === "route" ? "route" : "pin",
        recordType: submittedRecord.type || payload.type,
        geometryType: "representative_point",
        title: submittedRecord.title || payload.title,
        note: submittedRecord.description || payload.description,
        intro: submittedRecord.description || payload.description,
        tags: submittedRecord.keywords || keywords,
        keywords: submittedRecord.keywords || keywords,
        representative_keyword: submittedRecord.representative_keyword || payload.representative_keyword,
        pixel_icon_key: submittedRecord.pixel_icon_key || payload.pixel_icon_key,
        reason: submittedRecord.reason || payload.reason,
        emoji: draftKind === "route" ? toPixelEmojiValue("px-route") : selectedEmoji,
        category,
        highlight: false,
        isMine: true,
        publicStatus: submittedStatus,
        status: submittedStatus,
        submitMode: result.mode,
        updatedAt: submittedRecord.updated_at || now,
        createdAt: submittedRecord.created_at || now,
        createdByName: submittedRecord.author_name || "익명",
        memos: [],
        sourceContext: "public_community_web",
        representativeLocation: {
          lat: submittedRecord.lat ?? payload.lat,
          lng: submittedRecord.lng ?? payload.lng,
        },
        lat: submittedRecord.lat ?? payload.lat,
        lng: submittedRecord.lng ?? payload.lng,
        points: draftKind === "route" ? [[submittedRecord.lng ?? payload.lng, submittedRecord.lat ?? payload.lat]] : undefined,
        publicSubmission: {
          version: 1,
          source: "community-web",
          inputMode: "representative_location",
          status: submittedStatus,
          reason: payload.reason,
          keywords,
        },
      }
      setMyRecordIds(rememberMyPublicRecordId(submittedRecord.id || submittedFeature.id))
      setLocalFeatures((current) => [submittedFeature, ...current])
      setSelectedFeatureId(submittedStatus === "approved" ? submittedFeature.id : null)
      setDraftKind("place")
      setTitle("")
      setSelectedEmoji(toPixelEmojiValue("px-pin"))
      setEmojiTouched(false)
      setNote("")
      setCategory("")
      setKeywordText("")
      clearDraft()
      onOpenSubmit(false)
      const doneCopy = submittedStatus === "approved"
        ? "기록이 공개되었어요. 모두의 지도에서 바로 볼 수 있어요."
        : "기록이 접수되었어요. 검수 후 모두의 지도에 공개됩니다."
      setSubmissionMessage(near.message ? `${doneCopy} ${near.message}` : doneCopy)
    } catch (error) {
      setMappingMessage(error.message || "기록을 접수하지 못했어요. 잠시 후 다시 시도해주세요.")
    } finally {
      setSubmittingRecord(false)
    }
  }

  const locate = () => {
    if (!navigator.geolocation) {
      setLocationState("blocked")
      return
    }
    setLocationState("checking")
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setMyLocation({ lat: position.coords.latitude, lng: position.coords.longitude })
        setLocationState("allowed")
        setNearbyModalOpen(false)
      },
      () => setLocationState("blocked"),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 },
    )
  }

  const openPinFlow = () => {
    setDraftKind("place")
    setTitle("")
    setSelectedEmoji(toPixelEmojiValue("px-pin"))
    setEmojiTouched(false)
    setNote("")
    setCategory("")
    setKeywordText("")
    clearDraft()
    setSelectedFeatureId(null)
    onOpenSubmit(true)
  }

  const handleSaveRecord = async (feature) => {
    try {
      const saved = await savePublicRecord(feature)
      onSaved({
        type: "record",
        title: saved.title || feature.title,
      })
    } catch (error) {
      onSaved({
        type: "error",
        title: "저장 실패",
        message: error.message || "서버 저장 중 문제가 생겼어요.",
      })
    }
  }

  const isMyPublicFeature = (feature) => {
    const recordId = getPublicRecordId(feature)
    return Boolean(
      feature?.isMine
        || feature?.publicSubmission?.isMine
        || (recordId && myRecordIds.includes(recordId))
        || localFeatures.some((item) => getPublicRecordId(item) === recordId),
    )
  }

  const openRecordEdit = (feature) => {
    setRecordEditTarget(feature)
    setRecordEditMode(isMyPublicFeature(feature) ? "edit" : "request")
    setRecordEditMessage("")
  }

  const closeRecordEdit = () => {
    setRecordEditTarget(null)
    setRecordEditMessage("")
  }

  const makeEditedFeaturePatch = (input, serverRecord = {}) => {
    const nextKeywords = serverRecord.keywords || input.keywords || []
    return {
      title: serverRecord.title || input.title,
      note: serverRecord.description || input.description,
      intro: serverRecord.description || input.description,
      description: serverRecord.description || input.description,
      reason: serverRecord.reason ?? input.reason,
      category: serverRecord.reason ?? input.reason,
      tags: nextKeywords,
      keywords: nextKeywords,
      representative_keyword: serverRecord.representative_keyword || input.representative_keyword,
      pixel_icon_key: serverRecord.pixel_icon_key || input.pixel_icon_key,
      emoji: input.selectedEmoji,
      updatedAt: serverRecord.updated_at || new Date().toISOString(),
    }
  }

  const submitRecordEdit = async (input) => {
    if (!recordEditTarget || recordEditSubmitting) return
    setRecordEditSubmitting(true)
    setRecordEditMessage("")
    try {
      if (recordEditMode === "edit") {
        const result = await updateCommunityRecordAnonymous(recordEditTarget, input)
        const recordId = getPublicRecordId(recordEditTarget)
        const editedPatch = makeEditedFeaturePatch(input, result.data)
        setFeatureOverrides((current) => ({
          ...current,
          [recordId || recordEditTarget.id]: editedPatch,
        }))
        setLocalFeatures((current) => current.map((feature) => (
          getPublicRecordId(feature) === recordId ? { ...feature, ...editedPatch } : feature
        )))
        setRecordEditMessage("수정했어요.")
        window.setTimeout(closeRecordEdit, 450)
      } else {
        await requestCommunityRecordEditAnonymous(recordEditTarget, input)
        setRecordEditMessage("수정 요청을 받았어요. 로카가 확인한 뒤 반영돼요.")
        window.setTimeout(closeRecordEdit, 750)
      }
    } catch (error) {
      setRecordEditMessage(error.message || "처리하지 못했어요. 잠시 후 다시 시도해주세요.")
    } finally {
      setRecordEditSubmitting(false)
    }
  }

  const selectedFeature = selectedFeatureId
    ? features.find((feature) => feature.id === selectedFeatureId && feature.id !== "public-draft-pin")
    : null

  return (
    <section className="public-workbench">
      <div className="public-map-shell">
        <div className="public-map-controls">
          <div className="public-community-search">
            <div className="public-search-mode" role="tablist" aria-label="검색 종류">
              <button
                type="button"
                className={searchMode === "record" ? "is-active" : ""}
                onClick={() => selectSearchMode("record")}
                role="tab"
                aria-selected={searchMode === "record"}
              >
                기록 검색
              </button>
              <button
                type="button"
                className={searchMode === "address" ? "is-active" : ""}
                onClick={() => selectSearchMode("address")}
                role="tab"
                aria-selected={searchMode === "address"}
              >
                주소 검색
              </button>
            </div>
            <label className="public-search">
              <Search size={16} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault()
                    handleSearchSubmit()
                  }
                }}
                placeholder={searchMode === "address" ? "도로명 또는 지번 주소 검색" : "콩국수, 산책길, 공중화장실 검색"}
              />
              {query ? (
                <button className="public-search-submit" type="button" onClick={handleSearchSubmit}>
                  {searchMode === "address" ? "찾기" : "검색"}
                </button>
              ) : null}
              {query ? (
                <button
                  type="button"
                  onClick={() => {
                    setQuery("")
                    setSearchNotice("")
                    setAddressResults([])
                  }}
                  aria-label="검색어 지우기"
                >
                  <X size={15} />
                </button>
              ) : null}
            </label>
            {addressSearching || searchNotice ? (
              <div className="public-search-notice" role="status">
                {addressSearching ? "주소를 찾고 있어요." : searchNotice}
              </div>
            ) : null}
            {addressResults.length ? (
              <div className="public-address-results" aria-label="주소 검색 결과">
                {addressResults.map((result) => (
                  <button key={result.id} type="button" onClick={() => selectAddressResult(result)}>
                    <MapPin size={14} />
                    <span>
                      <strong>{result.label}</strong>
                      {result.subLabel ? <em>{result.subLabel}</em> : null}
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
            {searchMode === "record" ? (
              <div className="public-keyword-row">
                <span>추천 키워드</span>
                <div className="public-popular-row" aria-label="추천 키워드">
                  {POPULAR_KEYWORDS.map((keyword) => (
                    <button key={keyword} type="button" onClick={() => addSearchTerm(keyword)}>
                      {keyword}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            {searchMode === "record" && activeTerms.length ? (
              <div className="public-active-terms" aria-label="적용된 검색어">
                {activeTerms.map((term) => (
                  <button key={term} type="button" onClick={() => removeSearchTerm(term)}>
                    {term} <X size={12} />
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <NearbyLocationButton locationState={locationState} onOpen={() => setNearbyModalOpen(true)} />
        </div>
        <div className="public-map-stage">
          <PublicMapCanvas
            features={filteredFeatures}
            myLocation={myLocation}
            selectedFeatureId={selectedFeatureId}
            onFeatureTap={setSelectedFeatureId}
            draftPoints={draftPoints}
            draftMode={view === "submit" ? "pin" : undefined}
            onMapTap={view === "submit" ? handleMapTap : undefined}
            focusPoint={mapFocusPoint}
          />
          {view !== "submit" && selectedFeature ? (
            <div className={`public-map-selection-card public-selected-record public-selected-record--${getFeatureKind(selectedFeature)}`}>
              <span className="public-selected-record__stamp">
                <PublicFeatureIcon feature={selectedFeature} size={30} />
              </span>
              <div className="public-selected-record__summary">
                <b>{selectedFeature.title || "이름 없는 기록"}</b>
                <em>{getFeatureRegion(selectedFeature)} · {getFeatureKindLabel(selectedFeature)}</em>
                <p>{selectedFeature.intro || selectedFeature.note || selectedFeature.description || "아직 한 줄 소개가 없어요."}</p>
              </div>
              <div className="public-selected-record__actions">
                <button className="public-selected-record__edit" type="button" onClick={() => openRecordEdit(selectedFeature)}>
                  {isMyPublicFeature(selectedFeature) ? "수정" : "수정 요청"}
                </button>
                <button className="public-selected-record__save" type="button" onClick={() => handleSaveRecord(selectedFeature)}>저장</button>
              </div>
              <button className="public-selected-record__close" type="button" onClick={() => setSelectedFeatureId(null)} aria-label="선택 닫기">
                <X size={14} />
              </button>
              <CommunityRecordComments feature={selectedFeature} />
            </div>
          ) : null}
          {view === "submit" && !draftPin ? (
            <PinPlacementHint draftKind={draftKind} setDraftKind={setDraftKind} onClose={() => onOpenSubmit(false)} />
          ) : null}
          {view === "submit" && draftPin ? (
            <ComposerBottomSheet
              draftKind={draftKind}
              setDraftKind={setDraftKind}
              title={title}
              setTitle={setTitle}
              selectedEmoji={selectedEmoji}
              setSelectedEmoji={setSelectedEmoji}
              emojiTouched={emojiTouched}
              setEmojiTouched={setEmojiTouched}
              note={note}
              setNote={setNote}
              category={category}
              setCategory={setCategory}
              keywordText={keywordText}
              setKeywordText={setKeywordText}
              myLocation={myLocation}
              draftPin={draftPin}
              message={mappingMessage}
              canSave={draftReady}
              submitting={submittingRecord}
              onClose={() => onOpenSubmit(false)}
              onSave={saveDraft}
              onClear={clearDraft}
            />
          ) : null}
          <RecordEditModal
            feature={recordEditTarget}
            mode={recordEditMode}
            open={Boolean(recordEditTarget)}
            submitting={recordEditSubmitting}
            message={recordEditMessage}
            onClose={closeRecordEdit}
            onSubmit={submitRecordEdit}
          />
          {view !== "submit" ? (
            <button className="public-submit-fab" type="button" onClick={openPinFlow}>
              <span aria-hidden="true">+</span>
              <b>장소·길 남기기</b>
              <em>남기기</em>
            </button>
          ) : null}
        </div>
        {view !== "submit" ? (
          <section className="public-results-dock" aria-label="모두의 지도 검색 결과">
            {isSearchMode ? (
              <div className="public-result-filters" role="group" aria-label="결과 보기">
                <button type="button" className={resultKind === "all" ? "is-active" : ""} onClick={() => setResultKind("all")}>
                  전체 {resultCounts.all}
                </button>
                <button type="button" className={resultKind === "place" ? "is-active" : ""} onClick={() => setResultKind("place")}>
                  📍 장소 {resultCounts.place}
                </button>
                <button type="button" className={resultKind === "route" ? "is-active" : ""} onClick={() => setResultKind("route")}>
                  〰️ 길 {resultCounts.route}
                </button>
              </div>
            ) : (
              <div className="public-results-dock__title">
                <strong>새로 올라온 기록</strong>
                <span>최대 3개</span>
              </div>
            )}
            {submissionMessage ? (
              <div className="public-submit-receipt">
                <strong>접수 완료</strong>
                <span>{submissionMessage}</span>
                <button type="button" onClick={() => setSubmissionMessage("")} aria-label="접수 안내 닫기">
                  <X size={13} />
                </button>
              </div>
            ) : null}
            {pendingSubmissions.length ? (
              <div className="public-pending-submissions" aria-label="검수 대기 기록">
                <strong>검수 대기 {pendingSubmissions.length}</strong>
                {pendingSubmissions.slice(0, 3).map((feature) => (
                  <article key={feature.id}>
                    <span>{feature.recordType === "route" ? "길" : "장소"}</span>
                    <b>{feature.title}</b>
                    <em>검수 후 모두의 지도에 공개됩니다.</em>
                  </article>
                ))}
              </div>
            ) : null}
            {listRecords.length ? (
              <div className="public-community-results">
                {listRecords.slice(0, isSearchMode ? 12 : 3).map((feature) => (
                  <CommunityResultCard
                    key={feature.id}
                    feature={feature}
                    onSave={handleSaveRecord}
                    onOpen={(nextFeature) => setSelectedFeatureId(nextFeature.id)}
                  />
                ))}
              </div>
            ) : isSearchMode ? (
              <div className="public-no-results">
                <strong>아직 ‘{activeTerms.map((term) => stripEmojiPrefix(term) || term).join(", ") || "이 검색어"}’ 기록이 없어요.</strong>
                <p>이 동네의 첫 장소나 길을 남겨볼까요?</p>
                <button type="button" onClick={openPinFlow}>첫 기록 남기기</button>
              </div>
            ) : !selectedFeature ? (
              <div className="public-empty-slim">검색하거나 지도에서 마커를 선택해 기록을 확인해보세요.</div>
            ) : null}
          </section>
        ) : null}
        <NearbyLocationModal
          open={nearbyModalOpen}
          locationState={locationState}
          onClose={() => setNearbyModalOpen(false)}
          onLocate={locate}
        />
      </div>
    </section>
  )
}

function RecommendMapCard({ map, onOpen, onSave }) {
  const counts = getRecommendMapCounts(map)
  const coverImage = getRecommendMapCover(map)
  return (
    <article className="public-recommend-map-card">
      <button className="public-recommend-cover" type="button" onClick={() => onOpen(map.slug)} style={{ "--cover-tone": map.cover_tone }}>
        {coverImage ? <img src={coverImage} alt="" /> : (
          <span>
            <strong>{map.reel_url ? "REELS" : "LOCA PICK"}</strong>
            <em>{map.region}</em>
          </span>
        )}
      </button>
      <div className="public-recommend-map-card__body">
        <strong>{map.title}</strong>
        <span>{getRecommendMapRecommender(map)}</span>
        <p>{counts.place} 장소 · {counts.route} 길</p>
        <div className="public-tag-row">
          {map.keywords.slice(0, 4).map((keyword) => <span key={keyword}>{keyword}</span>)}
        </div>
      </div>
      <div className="public-recommend-map-card__actions">
        <button type="button" onClick={() => onOpen(map.slug)}>지도 보기</button>
        <button type="button" onClick={() => onSave(map)}>
          <Bookmark size={14} />
          저장
        </button>
      </div>
    </article>
  )
}

function RecommendMapDetail({ map, onClose, onSaved }) {
  const [selectedFeatureId, setSelectedFeatureId] = useState(null)
  const [shareMessage, setShareMessage] = useState("")
  const counts = getRecommendMapCounts(map)
  const features = useMemo(() => getRecommendMapFeatures(map), [map])
  const shareUrl = `${window.location.origin}/recommend/${encodeURIComponent(map.slug)}`
  const coverImage = getRecommendMapCover(map)
  const recommenderName = getRecommendMapRecommender(map)

  useEffect(() => {
    applyPublicOgMeta(getRecommendMapOgMeta(map))
  }, [map])

  const handleShare = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: map.title, text: map.description, url: shareUrl })
        setShareMessage("공유창을 열었어요.")
        return
      }
      await navigator.clipboard?.writeText(shareUrl)
      setShareMessage("공유 링크를 복사했어요.")
    } catch {
      setShareMessage("공유 링크를 복사하지 못했어요.")
    }
  }

  const handleSaveMap = async () => {
    try {
      const saved = await savePublicRecommendMap(map)
      onSaved({
        type: "recommend_map",
        title: saved.title || map.title,
      })
    } catch (error) {
      onSaved({
        type: "error",
        title: "저장 실패",
        message: error.message || "서버 저장 중 문제가 생겼어요.",
      })
    }
  }

  const handleSaveRecord = async (item) => {
    try {
      const saved = await savePublicRecord(recommendItemToFeature(item, map), { recommendMapSlug: map.slug })
      onSaved({
        type: "record",
        title: saved.title || item.title,
      })
    } catch (error) {
      onSaved({
        type: "error",
        title: "저장 실패",
        message: error.message || "서버 저장 중 문제가 생겼어요.",
      })
    }
  }

  return (
    <section className="public-recommend-detail">
      <div className="public-recommend-detail__header">
        <button type="button" onClick={onClose} aria-label="추천지도 목록으로 돌아가기">
          <X size={16} />
        </button>
        <span className="public-kicker">recommended map</span>
        <h1>{map.title}</h1>
        <p>{recommenderName} · {map.region} · {counts.place} 장소 · {counts.route} 길</p>
      </div>

      <div className="public-recommend-detail__layout">
        <aside className="public-recommend-detail__meta">
          <div className="public-recommend-cover public-recommend-cover--large" style={{ "--cover-tone": map.cover_tone }}>
            {coverImage ? <img src={coverImage} alt="" /> : (
              <span>
                <strong>{getRecommendMapReelLabel(map)}</strong>
                <em>{map.recommender_instagram || recommenderName}</em>
              </span>
            )}
          </div>
          {map.reel_url ? (
            <a href={map.reel_url} target="_blank" rel="noreferrer">릴스 보기</a>
          ) : (
            <span className="public-recommend-detail__no-reel">릴스 준비 중</span>
          )}
          <p>{map.reason}</p>
          <div className="public-tag-row">
            {map.keywords.map((keyword) => <span key={keyword}>{keyword}</span>)}
          </div>
          <div className="public-recommend-detail__actions">
            <button type="button" onClick={handleSaveMap}>
              <Bookmark size={15} />
              이 추천지도 저장
            </button>
            <button type="button" onClick={handleShare}>
              <Share2 size={15} />
              공유하기
            </button>
          </div>
          {shareMessage ? <small>{shareMessage}</small> : null}
        </aside>

        <div className="public-recommend-detail__map">
          <PublicMapCanvas
            features={features}
            selectedFeatureId={selectedFeatureId}
            onFeatureTap={setSelectedFeatureId}
            focusPoint={map.center}
          />
        </div>

        <div className="public-recommend-items">
          <strong>포함된 장소와 길</strong>
          {map.items.map((item) => {
            const featureId = `recommend-${map.slug}-${item.id}`
            return (
              <article
                key={item.id}
                className={`public-recommend-item ${selectedFeatureId === featureId ? "is-active" : ""}`}
              >
                <button type="button" onClick={() => setSelectedFeatureId(featureId)}>
                  <span>{item.item_type === "route" ? "〰️" : "📍"}</span>
                  <div>
                    <b>{item.title}</b>
                    <em>{item.region} · {item.item_type === "route" ? "길" : "장소"}</em>
                    <p>{item.intro}</p>
                  </div>
                </button>
                <button type="button" onClick={() => handleSaveRecord(item)}>저장</button>
              </article>
            )
          })}
        </div>
      </div>
    </section>
  )
}

function RecommendWebPage({ initialSlug = "", searchOnly = false, onSaved }) {
  const [query, setQuery] = useState("")
  const [selectedSlug, setSelectedSlug] = useState(initialSlug)

  useEffect(() => {
    setSelectedSlug(initialSlug)
  }, [initialSlug])

  const filtered = useMemo(() => {
    const normalizedQuery = stripEmojiPrefix(query).toLowerCase()
    if (!normalizedQuery) return publicRecommendMaps
    return publicRecommendMaps.filter((map) => getRecommendMapSearchText(map).includes(normalizedQuery))
  }, [query])

  const selectedMap = publicRecommendMaps.find((map) => map.slug === selectedSlug)

  useEffect(() => {
    if (!selectedMap) applyPublicOgMeta(getRecommendSearchOgMeta(stripEmojiPrefix(query)))
  }, [query, selectedMap])

  const openDetail = (slug) => {
    setSelectedSlug(slug)
    window.history.pushState(null, "", `/recommend/${encodeURIComponent(slug)}`)
  }

  const closeDetail = () => {
    setSelectedSlug("")
    window.history.pushState(null, "", searchOnly ? "/maps/search" : "/community-web")
  }

  const handleSaveMap = async (map) => {
    try {
      const saved = await savePublicRecommendMap(map)
      onSaved({
        type: "recommend_map",
        title: saved.title || map.title,
      })
    } catch (error) {
      onSaved({
        type: "error",
        title: "저장 실패",
        message: error.message || "서버 저장 중 문제가 생겼어요.",
      })
    }
  }

  if (selectedMap) return <RecommendMapDetail map={selectedMap} onClose={closeDetail} onSaved={onSaved} />

  return (
    <section className="public-recommend">
      <div className="public-recommend__hero">
        <span className="public-kicker">recommended maps</span>
        <h1>추천할지도</h1>
        <p>릴스에서 소개한 추천지도를 모아두는 지도 검색 코너</p>
        <label className="public-recommend-search">
          <Search size={18} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="콩국수, 강아지 산책, 공중화장실 검색" />
          {query ? <button type="button" onClick={() => setQuery("")} aria-label="검색어 지우기"><X size={15} /></button> : null}
        </label>
        <div className="public-popular-row" aria-label="추천 키워드">
          {recommendKeywordChips.map((keyword) => (
            <button key={keyword} type="button" onClick={() => setQuery(stripEmojiPrefix(keyword))}>
              {keyword}
            </button>
          ))}
        </div>
      </div>

      {filtered.length ? (
        <div className="public-recommend-grid">
          {filtered.map((map) => (
            <RecommendMapCard key={map.id} map={map} onOpen={openDetail} onSave={handleSaveMap} />
          ))}
        </div>
      ) : (
        <p className="public-empty">검색 결과가 없어요.</p>
      )}
    </section>
  )
}

function StorageConnectModal({ open, onClose, onConnected }) {
  const [step, setStep] = useState("choice")
  const [email, setEmail] = useState("")
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState("")

  useEffect(() => {
    if (!open) return
    let active = true
    setMessage("")
    getPublicSavedBoxConnectionStatus()
      .then((nextStatus) => {
        if (!active) return
        setStatus(nextStatus)
        if (nextStatus.connected) setStep("connected")
      })
      .catch((error) => {
        if (!active) return
        setMessage(error.message || "저장함 연결 상태를 확인하지 못했어요.")
      })
    return () => {
      active = false
    }
  }, [open])

  if (!open) return null

  const handleEmailSubmit = async (event) => {
    event.preventDefault()
    const normalizedEmail = email.trim()
    if (!normalizedEmail) {
      setMessage("이메일을 입력해주세요.")
      return
    }
    setLoading(true)
    setMessage("")
    try {
      await recordSavedBoxLead({
        email: normalizedEmail,
        sourceContext: "public_saved_box_connect_magic_link",
        metadata: { method: "email_magic_link" },
      })
      await signInWithMagicLink(normalizedEmail, {
        redirectTo: getSavedBoxRedirectTo(),
        sourceContext: "public_saved_box_connect",
      })
      setStep("sent")
    } catch (error) {
      setMessage(error.message || "인증 메일을 보내지 못했어요.")
    } finally {
      setLoading(false)
    }
  }

  const handleKakaoConnect = async () => {
    setLoading(true)
    setMessage("")
    try {
      await recordSavedBoxLead({
        sourceContext: "public_saved_box_connect_kakao",
        metadata: { method: "kakao" },
      })
      await signInWithKakao({ redirectTo: getSavedBoxRedirectTo() })
    } catch (error) {
      setMessage(error.message || "카카오 연결을 시작하지 못했어요.")
      setLoading(false)
    }
  }

  const handleConnectedClose = () => {
    onConnected?.()
    onClose()
  }

  return (
    <div className="public-save-notice public-connect-modal" role="dialog" aria-modal="true" aria-label="저장함 연결">
      <div className="public-save-notice__panel public-connect-modal__panel">
        <button type="button" onClick={step === "connected" ? handleConnectedClose : onClose} aria-label="닫기">
          <X size={16} />
        </button>

        {step === "connected" ? (
          <>
            <span className="public-kicker">saved box connected</span>
            <h2>저장함 연결됨</h2>
            <p>{status?.email ? `${status.email}로 저장함이 연결됐어요.` : "저장함이 계정에 연결됐어요."}</p>
            <p>LOCA 앱이 준비되면 같은 계정으로 웹에서 저장한 지도를 확인할 수 있어요.</p>
            <div className="public-connect-modal__success">
              <CheckCircle2 size={18} />
              저장한 추천지도와 장소·길을 계정 저장함으로 이어두었습니다.
            </div>
            <div className="public-save-notice__actions">
              <button type="button" onClick={handleConnectedClose}>확인</button>
            </div>
          </>
        ) : step === "email" ? (
          <>
            <span className="public-kicker">email magic link</span>
            <h2>이메일로 연결</h2>
            <p>메일 안의 버튼을 누르면 저장함이 연결됩니다.</p>
            <form className="public-connect-form" onSubmit={handleEmailSubmit}>
              <label>
                <span>이메일</span>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="name@example.com"
                  autoComplete="email"
                  required
                />
              </label>
              {message ? <div className="public-connect-message">{message}</div> : null}
              <button className="public-primary public-primary--fit" type="submit" disabled={loading}>
                {loading ? <Loader2 size={15} className="public-spin" /> : <Mail size={15} />}
                인증 메일 받기
              </button>
            </form>
            <button className="public-connect-modal__back" type="button" onClick={() => setStep("choice")}>
              다른 방법 보기
            </button>
          </>
        ) : step === "sent" ? (
          <>
            <span className="public-kicker">check your email</span>
            <h2>이메일을 확인해주세요.</h2>
            <p>메일 안의 버튼을 누르면 저장함이 연결됩니다.</p>
            <p>지금 창은 닫아도 괜찮아요. 연결 후 다시 들어오면 저장함 연결됨 상태로 확인할 수 있습니다.</p>
            <div className="public-save-notice__actions">
              <button type="button" onClick={onClose}>계속 둘러보기</button>
            </div>
          </>
        ) : (
          <>
            <span className="public-kicker">connect saved box</span>
            <h2>저장함을 연결해 주세요.</h2>
            <p>지금 저장한 추천지도와 장소·길을 다른 기기와 앱에서도 이어볼 수 있습니다.</p>
            <p>LOCA 앱이 준비되면 같은 계정으로 웹에서 저장한 지도를 확인할 수 있어요.</p>
            <div className="public-connect-benefit">
              <span>웹에서는 발견·검색·저장·제보까지만 제공합니다.</span>
              <span>지도 편집·공유·협업·꾸미기는 앱에서 이어갈 예정이에요.</span>
            </div>
            {message ? <div className="public-connect-message">{message}</div> : null}
            <div className="public-save-notice__actions">
              <button type="button" onClick={() => setStep("email")} disabled={loading}>
                <Mail size={15} />
                이메일로 연결
              </button>
              <button type="button" onClick={handleKakaoConnect} disabled={loading}>
                {loading ? <Loader2 size={15} className="public-spin" /> : <MessageCircle size={15} />}
                카카오로 연결
              </button>
              <button type="button" onClick={onClose}>나중에 하기</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function SaveNoticeOverlay({ notice, onClose, onOpenSaved, onConnect }) {
  if (!notice) return null
  const isError = notice.type === "error"
  const isConnect = notice.type === "connect"

  return (
    <div className="public-save-notice" role="dialog" aria-modal="true" aria-label="저장 완료">
      <div className="public-save-notice__panel">
        <button type="button" onClick={onClose} aria-label="닫기">
          <X size={16} />
        </button>
        <span className="public-kicker">{isError ? "save failed" : isConnect ? "connect saved box" : "saved"}</span>
        {!isError && !isConnect ? (
          <div className="public-save-stamp" aria-hidden="true">
            <span>SAVED</span>
          </div>
        ) : null}
        <h2>{isError || isConnect ? notice.title : "저장했어요."}</h2>
        {isError || isConnect ? (
          <p>{notice.message}</p>
        ) : (
          <>
            <p>현재 브라우저에서 다시 볼 수 있습니다.</p>
            <p>저장함을 연결하면 나중에 앱에서도 이 추천지도를 이어볼 수 있어요.</p>
            <p>LOCA 앱에서는 저장한 장소와 길을 바탕으로 나만의 지도를 편집하고, 공유하고, 협업하고, 꾸밀 수 있게 준비하고 있어요.</p>
          </>
        )}
        <div className="public-save-notice__actions">
          {!isError && !isConnect ? <button type="button" onClick={onConnect}>저장함 연결하기</button> : null}
          {!isError ? <button type="button" onClick={onOpenSaved}>저장함 보기</button> : null}
          <button type="button" onClick={onClose}>{isError || isConnect ? "닫기" : "계속 둘러보기"}</button>
        </div>
      </div>
    </div>
  )
}

function SavedBoxView({ onClose, onConnect }) {
  const [savedItems, setSavedItems] = useState({ recommendMaps: [], records: [] })
  const [connectionStatus, setConnectionStatus] = useState(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState("")

  const loadSavedItems = async () => {
    setLoading(true)
    setMessage("")
    try {
      const result = await listPublicSavedItems()
      setSavedItems(result)
    } catch (error) {
      setMessage(error.message || "저장함을 불러오지 못했어요.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadSavedItems()
    getPublicSavedBoxConnectionStatus()
      .then(setConnectionStatus)
      .catch(() => setConnectionStatus(null))
  }, [])

  const handleDeleteRecommendMap = async (item) => {
    const ok = window.confirm("이 추천할지도를 내 저장함에서 삭제할까요? 추천할지도 코너에 공개된 원본 지도는 삭제되지 않습니다.")
    if (!ok) return
    try {
      await deleteSavedRecommendMap(item.id)
      await loadSavedItems()
    } catch (error) {
      setMessage(error.message || "삭제하지 못했어요.")
    }
  }

  const handleDeleteRecord = async (item) => {
    const ok = window.confirm("이 항목을 내 저장함에서 삭제할까요? 모두의 지도에 공개된 원본 기록은 삭제되지 않습니다.")
    if (!ok) return
    try {
      await deleteSavedRecord(item.id)
      await loadSavedItems()
    } catch (error) {
      setMessage(error.message || "삭제하지 못했어요.")
    }
  }

  return (
    <section className="public-view public-view--saved">
      <div className="public-view__panel">
        <span className="public-kicker">saved box</span>
        <h1>저장함</h1>
        <p>서버에 저장된 추천지도와 장소·길이에요. 저장함을 연결하면 나중에 앱에서도 이어볼 수 있게 준비합니다.</p>
        <div className={`public-saved-connection ${connectionStatus?.connected ? "is-connected" : ""}`}>
          <span>{connectionStatus?.connected ? "저장함 연결됨" : "현재 브라우저 저장함"}</span>
          {connectionStatus?.connected ? (
            <strong>{connectionStatus.email || "계정 연결 완료"}</strong>
          ) : (
            <button type="button" onClick={onConnect}>저장함 연결하기</button>
          )}
        </div>
        {message ? <div className="public-empty public-empty--inline">{message}</div> : null}
        {loading ? <div className="public-empty public-empty--inline">저장함을 불러오는 중이에요.</div> : null}
        {!loading && !savedItems.recommendMaps.length && !savedItems.records.length ? (
          <div className="public-empty public-empty--inline">아직 저장한 항목이 없어요.</div>
        ) : null}
        {!loading && savedItems.recommendMaps.length ? (
          <div className="public-saved-section">
            <strong>저장한 추천할지도</strong>
            {savedItems.recommendMaps.map((item) => (
              <article key={item.id} className="public-saved-sticker public-saved-sticker--recommend">
                <span className="public-saved-sticker__mark" aria-hidden="true">🗺️</span>
                <div>
                  <b>{item.title}</b>
                  <span>{item.region || "지역 없음"} · {item.recommender || "추천자 없음"}</span>
                </div>
                <a href={`/recommend/${encodeURIComponent(item.recommend_map_slug)}`}>보기</a>
                <button type="button" onClick={() => handleDeleteRecommendMap(item)}>삭제</button>
              </article>
            ))}
          </div>
        ) : null}
        {!loading && savedItems.records.length ? (
          <div className="public-saved-section">
            <strong>저장한 장소·길</strong>
            {savedItems.records.map((item) => (
              <article key={item.id} className={`public-saved-sticker public-saved-sticker--${item.record_type === "route" ? "route" : "place"}`}>
                <span className="public-saved-sticker__mark" aria-hidden="true">{item.record_type === "route" ? "〰️" : "📍"}</span>
                <div>
                  <b>{item.record_type === "route" ? "〰️" : "📍"} {item.title}</b>
                  <span>{item.region || "지역 없음"} · {item.record_type === "route" ? "길" : "장소"}</span>
                </div>
                <a href={item.recommend_map_slug ? `/recommend/${encodeURIComponent(item.recommend_map_slug)}` : "/community-web"}>보기</a>
                <button type="button" onClick={() => handleDeleteRecord(item)}>삭제</button>
              </article>
            ))}
          </div>
        ) : null}
        <button className="public-primary public-primary--fit" type="button" onClick={onClose}>
          지도로 돌아가기
        </button>
      </div>
    </section>
  )
}

// 2026-07-23 모두의 지도 철거 후: 이 화면은 추천할지도(/recommend/:slug, /maps/search) 전용이다.
// page 기본값을 "search" 로 바꿔, 라우트가 유실돼도 커뮤니티 탭으로 떨어지지 않게 한다.
export function PublicCommunityPage({ page = "search", recommendSlug = "" }) {
  const queryRecommendSlug = new URLSearchParams(window.location.search).get("recommend") || ""
  const initialRecommendSlug = recommendSlug || queryRecommendSlug
  const activeTab = "recommend"
  const [view, setView] = useState("map")
  const [saveNotice, setSaveNotice] = useState(null)
  const [connectOpen, setConnectOpen] = useState(false)
  const isSearchRoute = page === "search"

  useEffect(() => {
    let active = true
    const shouldOpenConnect = new URLSearchParams(window.location.search).get("storage_connected") === "1"

    const checkConnection = async () => {
      try {
        const status = await getPublicSavedBoxConnectionStatus()
        if (!active || !status.connected || !status.user?.id) return
        if (shouldOpenConnect) setConnectOpen(true)
        const recordedUserId = window.localStorage.getItem(CONNECTED_LEAD_USER_KEY)
        if (recordedUserId !== status.user.id) {
          await recordSavedBoxLead({
            email: status.email,
            sourceContext: "public_saved_box_connected",
            metadata: {
              method: "auth_return",
              claimed: status.claimResult || null,
            },
          })
          window.localStorage.setItem(CONNECTED_LEAD_USER_KEY, status.user.id)
        }
      } catch (error) {
        console.warn("Saved box connection check failed", error)
      }
    }

    checkConnection()
    const authSubscription = onAuthStateChange(() => {
      checkConnection()
    })

    return () => {
      active = false
      authSubscription?.data?.subscription?.unsubscribe?.()
    }
  }, [])

  // (2026-07-23) 탭 전환 핸들러 제거 — 추천할지도 단일 탭이라 전환 대상이 없다.

  return (
    <main className="public-map-page public-map-page--directory">
      <PublicTopBar onSavedOpen={() => setView("saved")} />

      {view === "saved" ? (
        <SavedBoxView
          onClose={() => setView("map")}
          onConnect={() => setConnectOpen(true)}
        />
      ) : isSearchRoute ? (
        <RecommendWebPage initialSlug={initialRecommendSlug} searchOnly onSaved={setSaveNotice} />
      ) : activeTab === "recommend" ? (
        <RecommendWebPage initialSlug={initialRecommendSlug} onSaved={setSaveNotice} />
      ) : (
        <CommunityWebPage
          view={view}
          onOpenSubmit={(nextOpen) => setView(nextOpen ? "submit" : "map")}
          onSaved={setSaveNotice}
        />
      )}
      <SaveNoticeOverlay
        notice={saveNotice}
        onClose={() => setSaveNotice(null)}
        onOpenSaved={() => {
          setSaveNotice(null)
          setView("saved")
        }}
        onConnect={() => {
          setSaveNotice(null)
          setConnectOpen(true)
        }}
      />
      <StorageConnectModal
        open={connectOpen}
        onClose={() => setConnectOpen(false)}
        onConnected={() => setView("saved")}
      />
    </main>
  )
}
