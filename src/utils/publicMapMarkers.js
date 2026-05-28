export const PUBLIC_PIXEL_MARKER_ASSET_BASE = "/markers/public-map"

export const PUBLIC_PIXEL_MARKERS = {
  noodle: { label: "콩국수", fallback: "🍜", pixelId: "px-noodle", asset: null },
  spicy_pork: { label: "제육볶음", fallback: "🥘", pixelId: "px-spicy-pork", asset: null },
  rice: { label: "밥집", fallback: "🍚", pixelId: "px-rice", asset: null },
  kimbap: { label: "김밥", fallback: "🍙", pixelId: "px-kimbap", asset: null },
  burger: { label: "버거", fallback: "🍔", pixelId: "px-burger", asset: null },
  pizza: { label: "피자", fallback: "🍕", pixelId: "px-pizza", asset: null },
  dumpling: { label: "만두", fallback: "🥟", pixelId: "px-dumpling", asset: null },
  icecream: { label: "아이스크림", fallback: "🍦", pixelId: "px-icecream", asset: null },
  beer: { label: "맥주", fallback: "🍺", pixelId: "px-beer", asset: null },
  tea: { label: "차", fallback: "🍵", pixelId: "px-tea", asset: null },
  restaurant: { label: "맛집", fallback: "🍽️", pixelId: "px-restaurant", asset: null },
  dog_walk: { label: "강아지 산책", fallback: "🐶", pixelId: "px-dog", asset: null },
  toilet: { label: "공중화장실", fallback: "🚻", pixelId: "px-toilet", asset: null },
  bench: { label: "벤치", fallback: "🪑", pixelId: "px-bench", asset: null },
  book: { label: "책방", fallback: "📚", pixelId: "px-book", asset: null },
  market_route: { label: "시장길", fallback: "🛍️", pixelId: "px-market", asset: null },
  river_route: { label: "하천길", fallback: "🌊", pixelId: "px-river", asset: null },
  cafe: { label: "카페", fallback: "☕", pixelId: "px-cafe", asset: null },
  bread: { label: "빵집", fallback: "🥐", pixelId: "px-bread", asset: null },
  park: { label: "공원", fallback: "🌳", pixelId: "px-park", asset: null },
  photo: { label: "사진", fallback: "📷", pixelId: "px-camera", asset: null },
  hospital: { label: "병원", fallback: "🏥", pixelId: "px-hospital", asset: null },
  pharmacy: { label: "약국", fallback: "💊", pixelId: "px-pharmacy", asset: null },
  parking: { label: "주차", fallback: "🅿️", pixelId: "px-parking", asset: null },
  convenience: { label: "편의점", fallback: "🏪", pixelId: "px-convenience", asset: null },
  bank: { label: "은행", fallback: "🏦", pixelId: "px-bank", asset: null },
  post: { label: "우체국", fallback: "📮", pixelId: "px-post", asset: null },
  laundry: { label: "세탁", fallback: "🧺", pixelId: "px-laundry", asset: null },
  hotel: { label: "숙소", fallback: "🏨", pixelId: "px-hotel", asset: null },
  school: { label: "학교", fallback: "🏫", pixelId: "px-school", asset: null },
  playground: { label: "놀이터", fallback: "🛝", pixelId: "px-playground", asset: null },
  gallery: { label: "전시", fallback: "🖼️", pixelId: "px-gallery", asset: null },
  music: { label: "음악", fallback: "🎵", pixelId: "px-music", asset: null },
  gym: { label: "운동", fallback: "🏋️", pixelId: "px-gym", asset: null },
  barber: { label: "미용", fallback: "💈", pixelId: "px-barber", asset: null },
  bus: { label: "버스", fallback: "🚌", pixelId: "px-bus", asset: null },
  subway: { label: "지하철", fallback: "🚇", pixelId: "px-subway", asset: null },
  bike: { label: "자전거", fallback: "🚲", pixelId: "px-bike", asset: null },
  car: { label: "차량", fallback: "🚗", pixelId: "px-car", asset: null },
  bridge: { label: "다리", fallback: "🌉", pixelId: "px-bridge", asset: null },
  crosswalk: { label: "횡단보도", fallback: "🚶", pixelId: "px-crosswalk", asset: null },
  stairs: { label: "계단", fallback: "↗️", pixelId: "px-stairs", asset: null },
  alley: { label: "골목", fallback: "🛤️", pixelId: "px-alley", asset: null },
  mountain: { label: "산", fallback: "⛰️", pixelId: "px-mountain", asset: null },
  beach: { label: "바다", fallback: "🏖️", pixelId: "px-beach", asset: null },
  lake: { label: "호수", fallback: "🌊", pixelId: "px-lake", asset: null },
  garden: { label: "정원", fallback: "🌼", pixelId: "px-garden", asset: null },
  trash: { label: "쓰레기통", fallback: "🗑️", pixelId: "px-trash", asset: null },
  water: { label: "급수대", fallback: "💧", pixelId: "px-water", asset: null },
  wifi: { label: "와이파이", fallback: "📶", pixelId: "px-wifi", asset: null },
  place: { label: "장소", fallback: "📍", pixelId: "px-pin", asset: null },
  route: { label: "길", fallback: "🛣️", pixelId: "px-route", asset: null },
}

const MARKER_KEYWORD_RULES = [
  { key: "noodle", terms: ["콩국수", "국수", "면", "냉면", "라면", "칼국수", "우동", "소바", "noodle"] },
  { key: "spicy_pork", terms: ["제육볶음", "제육", "고기", "백반", "spicy pork"] },
  { key: "rice", terms: ["밥집", "한식", "백반", "국밥", "식사", "rice"] },
  { key: "kimbap", terms: ["김밥", "분식", "kimbap"] },
  { key: "burger", terms: ["버거", "햄버거", "burger"] },
  { key: "pizza", terms: ["피자", "pizza"] },
  { key: "dumpling", terms: ["만두", "dumpling"] },
  { key: "icecream", terms: ["아이스크림", "빙수", "디저트", "dessert", "ice cream"] },
  { key: "beer", terms: ["맥주", "술집", "호프", "beer", "pub"] },
  { key: "tea", terms: ["찻집", "티룸", "tea"] },
  { key: "restaurant", terms: ["맛집", "식당", "음식", "점심", "저녁", "restaurant"] },
  { key: "dog_walk", terms: ["강아지 산책", "강아지", "반려견", "반려동물", "멍멍", "dog", "pet"] },
  { key: "toilet", terms: ["공중화장실", "화장실", "toilet", "restroom", "wc"] },
  { key: "bench", terms: ["벤치", "의자", "쉼터", "쉬기", "bench"] },
  { key: "book", terms: ["책방", "서점", "책", "도서관", "book", "library"] },
  { key: "market_route", terms: ["시장길", "시장", "장터", "전통시장", "market"] },
  { key: "river_route", terms: ["하천길", "하천", "천변", "강변", "river"] },
  { key: "cafe", terms: ["카페", "커피", "라떼", "에스프레소", "coffee", "cafe"] },
  { key: "bread", terms: ["빵집", "빵", "베이커리", "제과", "bakery", "bread"] },
  { key: "park", terms: ["공원", "산책길", "산책", "나무", "park", "walk"] },
  { key: "photo", terms: ["사진", "포토", "뷰", "전망", "인생샷", "photo", "view"] },
  { key: "hospital", terms: ["병원", "의원", "응급실", "진료", "hospital", "clinic"] },
  { key: "pharmacy", terms: ["약국", "약", "pharmacy"] },
  { key: "parking", terms: ["주차", "주차장", "parking"] },
  { key: "convenience", terms: ["편의점", "마트", "슈퍼", "store"] },
  { key: "bank", terms: ["은행", "atm", "현금", "bank"] },
  { key: "post", terms: ["우체국", "택배", "우편", "post"] },
  { key: "laundry", terms: ["세탁", "빨래", "코인세탁", "laundry"] },
  { key: "hotel", terms: ["숙소", "호텔", "게스트하우스", "hotel", "stay"] },
  { key: "school", terms: ["학교", "초등학교", "중학교", "고등학교", "school"] },
  { key: "playground", terms: ["놀이터", "키즈", "아이", "playground"] },
  { key: "gallery", terms: ["전시", "갤러리", "미술관", "gallery", "art"] },
  { key: "music", terms: ["음악", "공연", "라이브", "버스킹", "music"] },
  { key: "gym", terms: ["운동", "헬스", "체육관", "fitness", "gym"] },
  { key: "barber", terms: ["미용실", "헤어", "이발", "바버", "barber", "hair"] },
  { key: "bus", terms: ["버스", "정류장", "bus"] },
  { key: "subway", terms: ["지하철", "역", "전철", "subway", "station"] },
  { key: "bike", terms: ["자전거", "따릉이", "bike"] },
  { key: "car", terms: ["차량", "자동차", "드라이브", "car"] },
  { key: "bridge", terms: ["다리", "교량", "bridge"] },
  { key: "crosswalk", terms: ["횡단보도", "건널목", "crosswalk"] },
  { key: "stairs", terms: ["계단", "언덕", "오르막", "stairs"] },
  { key: "alley", terms: ["골목", "골목길", "동네길", "alley"] },
  { key: "mountain", terms: ["산", "등산", "둘레길", "mountain", "trail"] },
  { key: "beach", terms: ["바다", "해변", "해수욕장", "beach", "sea"] },
  { key: "lake", terms: ["호수", "연못", "저수지", "lake"] },
  { key: "garden", terms: ["정원", "꽃", "화단", "garden", "flower"] },
  { key: "trash", terms: ["쓰레기통", "분리수거", "trash"] },
  { key: "water", terms: ["급수대", "식수대", "물", "water"] },
  { key: "wifi", terms: ["와이파이", "wifi", "인터넷"] },
]

const PIXEL_ID_TO_MARKER_KEY = Object.fromEntries(
  Object.entries(PUBLIC_PIXEL_MARKERS)
    .filter(([, marker]) => marker.pixelId)
    .map(([key, marker]) => [marker.pixelId, key]),
)

const LEGACY_PIXEL_PREFIX = "loca-emoji:pixel:"

export const publicPixelEmojiValue = (pixelId) => `${LEGACY_PIXEL_PREFIX}${pixelId}`

const publicPlaceEmojiOption = (pixelId, label) => ({
  pixelId,
  value: publicPixelEmojiValue(pixelId),
  label,
})

export const PUBLIC_PLACE_EMOJI_OPTIONS = [
  publicPlaceEmojiOption("px-pin", "장소"),
  publicPlaceEmojiOption("px-heart", "하트"),
  publicPlaceEmojiOption("px-star", "추천"),
  publicPlaceEmojiOption("px-sun", "햇살"),
  publicPlaceEmojiOption("px-noodle", "국수"),
  publicPlaceEmojiOption("px-spicy-pork", "제육"),
  publicPlaceEmojiOption("px-rice", "밥집"),
  publicPlaceEmojiOption("px-kimbap", "김밥"),
  publicPlaceEmojiOption("px-restaurant", "맛집"),
  publicPlaceEmojiOption("px-cafe", "카페"),
  publicPlaceEmojiOption("px-coffee", "커피"),
  publicPlaceEmojiOption("px-tea", "차"),
  publicPlaceEmojiOption("px-bread", "빵집"),
  publicPlaceEmojiOption("px-icecream", "디저트"),
  publicPlaceEmojiOption("px-beer", "맥주"),
  publicPlaceEmojiOption("px-market", "시장"),
  publicPlaceEmojiOption("px-tree", "나무"),
  publicPlaceEmojiOption("px-park", "공원"),
  publicPlaceEmojiOption("px-garden", "정원"),
  publicPlaceEmojiOption("px-flower", "꽃"),
  publicPlaceEmojiOption("px-mountain", "산"),
  publicPlaceEmojiOption("px-river", "하천"),
  publicPlaceEmojiOption("px-lake", "호수"),
  publicPlaceEmojiOption("px-beach", "바다"),
  publicPlaceEmojiOption("px-dog", "강아지"),
  publicPlaceEmojiOption("px-bench", "벤치"),
  publicPlaceEmojiOption("px-book", "책방"),
  publicPlaceEmojiOption("px-camera", "사진"),
  publicPlaceEmojiOption("px-toilet", "화장실"),
  publicPlaceEmojiOption("px-trash", "쓰레기통"),
  publicPlaceEmojiOption("px-water", "급수대"),
  publicPlaceEmojiOption("px-wifi", "와이파이"),
  publicPlaceEmojiOption("px-hospital", "병원"),
  publicPlaceEmojiOption("px-pharmacy", "약국"),
  publicPlaceEmojiOption("px-parking", "주차"),
  publicPlaceEmojiOption("px-convenience", "편의점"),
  publicPlaceEmojiOption("px-bank", "은행"),
  publicPlaceEmojiOption("px-post", "우체국"),
  publicPlaceEmojiOption("px-laundry", "세탁"),
  publicPlaceEmojiOption("px-hotel", "숙소"),
  publicPlaceEmojiOption("px-school", "학교"),
  publicPlaceEmojiOption("px-playground", "놀이터"),
  publicPlaceEmojiOption("px-gallery", "전시"),
  publicPlaceEmojiOption("px-music", "음악"),
  publicPlaceEmojiOption("px-gym", "운동"),
  publicPlaceEmojiOption("px-barber", "미용"),
  publicPlaceEmojiOption("px-bus", "버스"),
  publicPlaceEmojiOption("px-subway", "지하철"),
  publicPlaceEmojiOption("px-bike", "자전거"),
  publicPlaceEmojiOption("px-car", "차량"),
  publicPlaceEmojiOption("px-bridge", "다리"),
  publicPlaceEmojiOption("px-crosswalk", "횡단보도"),
  publicPlaceEmojiOption("px-stairs", "계단"),
  publicPlaceEmojiOption("px-alley", "골목"),
]

const PUBLIC_PLACE_EMOJI_LABEL_BY_PIXEL_ID = new Map(
  PUBLIC_PLACE_EMOJI_OPTIONS.map((option) => [option.pixelId, option.label]),
)

export const getPublicPlaceEmojiOptionLabel = (pixelId) => (
  PUBLIC_PLACE_EMOJI_LABEL_BY_PIXEL_ID.get(pixelId) || ""
)

export const getPixelIdFromPublicEmojiValue = (value) => {
  if (typeof value !== "string" || !value.startsWith(LEGACY_PIXEL_PREFIX)) return ""
  return value.slice(LEGACY_PIXEL_PREFIX.length).trim()
}

const normalizeText = (value) => String(value || "").normalize("NFKC").toLowerCase()

const asList = (value) => {
  if (Array.isArray(value)) return value
  if (typeof value === "string") return value.split(/[,#\n]/u)
  return []
}

const getRequestedMarkerKey = (feature) => {
  const rawKey = feature?.pixel_icon_key || feature?.pixelIconKey || feature?.marker_icon_key || feature?.markerIconKey
  if (!rawKey) return ""
  const value = String(rawKey).trim()
  if (PUBLIC_PIXEL_MARKERS[value]) return value
  return PIXEL_ID_TO_MARKER_KEY[value] || ""
}

export const getPublicRecordKind = (feature) => (
  feature?.recordType === "route" || feature?.type === "route" ? "route" : "place"
)

export const getPublicMarkerKeywordText = (feature) => {
  const values = [
    feature?.representative_keyword,
    feature?.representativeKeyword,
    feature?.category,
    feature?.title,
    feature?.description,
    feature?.note,
    feature?.intro,
    ...asList(feature?.keywords),
    ...asList(feature?.tags),
  ]
  return normalizeText(values.filter(Boolean).join(" "))
}

export const getPublicMarkerIconKey = (feature) => {
  const requestedKey = getRequestedMarkerKey(feature)
  if (requestedKey) return requestedKey

  const text = getPublicMarkerKeywordText(feature)
  const matched = MARKER_KEYWORD_RULES.find((rule) => (
    rule.terms.some((term) => text.includes(normalizeText(term)))
  ))
  if (matched) return matched.key
  return getPublicRecordKind(feature) === "route" ? "route" : "place"
}

export const getPublicRecommendedPixelId = (feature) => {
  const iconKey = getPublicMarkerIconKey(feature)
  const marker = PUBLIC_PIXEL_MARKERS[iconKey] || PUBLIC_PIXEL_MARKERS.place
  return marker.pixelId || (getPublicRecordKind(feature) === "route" ? "px-route" : "px-pin")
}

export const getPublicMarkerDescriptor = (feature) => {
  const iconKey = getPublicMarkerIconKey(feature)
  const marker = PUBLIC_PIXEL_MARKERS[iconKey] || PUBLIC_PIXEL_MARKERS.place
  const kind = getPublicRecordKind(feature)
  const assetSrc = marker.asset ? `${PUBLIC_PIXEL_MARKER_ASSET_BASE}/${marker.asset}` : null
  const customEmoji = typeof feature?.emoji === "string" ? feature.emoji.trim() : ""
  const customPixelId = getPixelIdFromPublicEmojiValue(customEmoji)
  const useCustomEmoji = customEmoji
    && !customEmoji.startsWith("loca-emoji:")
    && Array.from(customEmoji).length <= 4
    && kind === "place"

  return {
    iconKey,
    assetSrc,
    fallback: useCustomEmoji ? customEmoji : marker.fallback,
    label: marker.label,
    pixelId: kind === "place" && customPixelId ? customPixelId : marker.pixelId,
    kind,
  }
}
