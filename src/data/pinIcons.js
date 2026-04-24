// ─── 핀 아이콘 카탈로그 — 7그룹 30종 ───
// 각 아이콘은 채움형(filled) SVG path + 카테고리별 배경색/아이콘색

export const PIN_ICON_GROUPS = [
  {
    label: "카페·음료",
    bg: "#FFF4EB",
    color: "#FF6B35",
    icons: [
      { id: "cafe", name: "카페", path: "M3 6h14v2H3zm0 4h10v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6zm14 0h2a2 2 0 012 2v2a2 2 0 01-2 2h-2v-6z" },
      { id: "tea", name: "차/음료", path: "M5 3h14l-1 9a4 4 0 01-4 4H8a4 4 0 01-4-4L3 3h2zm2 13h6m-3 0v4" },
      { id: "juice", name: "주스", path: "M8 2h8l-1 6h-6L8 2zm1 6l-1 12a2 2 0 002 2h4a2 2 0 002-2L15 8H9z" },
    ],
  },
  {
    label: "음식",
    bg: "#FCEBEB",
    color: "#E24B4A",
    icons: [
      { id: "restaurant", name: "음식점", path: "M7 2v8l-2 4v8h2v-8l2-4V2H7zm10 0c-1 0-2 2-2 5v3h2v12h2V10h2V7c0-3-1-5-2-5h-2z" },
      { id: "fastfood", name: "패스트푸드", path: "M4 11h16a1 1 0 010 2H4a1 1 0 010-2zm1-2c0-4 3-7 7-7s7 3 7 7H5zm1 6h12l-1 5a2 2 0 01-2 2H9a2 2 0 01-2-2l-1-5z" },
      { id: "bakery", name: "빵", path: "M12 4a6 6 0 016 6c0 2-1 3-2 4l1 8H7l1-8c-1-1-2-2-2-4a6 6 0 016-6z" },
      { id: "dessert", name: "디저트", path: "M4 18h16v2H4v-2zm1-2l2-8h10l2 8H5zm5-10V4a2 2 0 114 0v2" },
      { id: "bar", name: "바/주점", path: "M6 4h12v2c0 3-2 5-4 6v4h2v2H8v-2h2v-4c-2-1-4-3-4-6V4z" },
    ],
  },
  {
    label: "자연·산책",
    bg: "#E1F5EE",
    color: "#0F6E56",
    icons: [
      { id: "park", name: "공원/숲", path: "M12 3l6 9H6l6-9zm-2 9l-4 6h12l-4-6H10zm1 6v3h2v-3" },
      { id: "mountain", name: "산/등산", path: "M4 20L10 8l4 6 6-10 4 16H4z" },
      { id: "beach", name: "바다", path: "M2 16c2-2 4-2 6 0s4 2 6 0 4-2 6 0v4H2v-4zm6-8a4 4 0 108 0 4 4 0 00-8 0z" },
      { id: "lake", name: "호수/강", path: "M2 12c2-2 4-2 6 0s4 2 6 0 4-2 6 0m-18 4c2-2 4-2 6 0s4 2 6 0 4-2 6 0" },
      { id: "garden", name: "꽃/정원", path: "M12 14c-2 0-4-2-4-4 0-1 .5-2 1.5-2.5C9 6 10 5 12 5s3 1 2.5 2.5C15.5 8 16 9 16 10c0 2-2 4-4 4zm0 0v7m-3-3h6" },
      { id: "trail", name: "산책로", path: "M4 20l4-8 4 4 4-8 4 12" },
    ],
  },
  {
    label: "문화·예술",
    bg: "#EEEDFE",
    color: "#3C3489",
    icons: [
      { id: "gallery", name: "갤러리", path: "M3 5a2 2 0 012-2h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5zm4 10l3-4 2 3 3-4 4 5" },
      { id: "museum", name: "박물관", path: "M3 21h18v-2H3v2zm2-4h2V9H5v8zm4 0h2V9H9v8zm4 0h2V9h-2v8zm4 0h2V9h-2v8zM2 9l10-6 10 6v2H2V9z" },
      { id: "music", name: "공연/음악", path: "M9 18V6l12-3v12m-12 3a3 3 0 11-6 0 3 3 0 016 0zm12-3a3 3 0 11-6 0 3 3 0 016 0z" },
      { id: "cinema", name: "영화", path: "M4 4h16a2 2 0 012 2v12a2 2 0 01-2 2H4a2 2 0 01-2-2V6a2 2 0 012-2zm6 4l6 4-6 4V8z" },
      { id: "bookstore", name: "서점", path: "M4 4a2 2 0 012-2h8a2 2 0 012 2v16l-6-3-6 3V4z" },
    ],
  },
  {
    label: "쇼핑·마켓",
    bg: "#FAEEDA",
    color: "#BA7517",
    icons: [
      { id: "shopping", name: "쇼핑", path: "M6 6h12l2 14H4L6 6zm0 0V4a6 6 0 1112 0v2" },
      { id: "market", name: "마켓/시장", path: "M3 10V8l9-5 9 5v2H3zm0 10h18v-2H3v2zm2-4h2v-4H5v4zm4 0h2v-4H9v4zm4 0h2v-4h-2v4zm4 0h2v-4h-2v4z" },
      { id: "vintage", name: "빈티지", path: "M12 2a10 10 0 110 20 10 10 0 010-20zm0 4v6l4 2" },
      { id: "selectshop", name: "편집숍", path: "M21 16V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8m18 0l-3 4H5l-3-4m3 0h14" },
    ],
  },
  {
    label: "관광·역사",
    bg: "#E6F1FB",
    color: "#185FA5",
    icons: [
      { id: "tourism", name: "관광", path: "M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z M12 7a3 3 0 100 6 3 3 0 000-6z" },
      { id: "heritage", name: "역사/유적", path: "M3 21h18v-2H3v2zm2-4h2V9H5v8zm4 0h2V9H9v8zm4 0h2V9h-2v8zm4 0h2V9h-2v8zM2 9l10-6 10 6v2H2V9z" },
      { id: "hanok", name: "한옥/사찰", path: "M3 20h18v-2H3v2zm0-4h18v-2H3v2zm2-4V9l7-5 7 5v3H5z" },
      { id: "viewpoint", name: "전망대", path: "M12 3l9 7h-4v10H7V10H3l9-7z" },
      { id: "architecture", name: "건축", path: "M4 4h7v7H4V4zm9 0h7v7h-7V4zm-9 9h7v7H4v-7zm9 0h7v7h-7v-7z" },
    ],
  },
  {
    label: "라이프·기타",
    bg: null, // 개별 색상
    color: null,
    icons: [
      { id: "photo", name: "포토스팟", path: "M3 7a2 2 0 012-2h2l2-2h6l2 2h2a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7zm9 2a4 4 0 100 8 4 4 0 000-8z", bg: "#FAECE7", color: "#D85A30" },
      { id: "sports", name: "운동", path: "M12 12m-9 0a9 9 0 1018 0 9 9 0 10-18 0M4.5 7.5l15 9m-15 0l15-9", bg: "#FAECE7", color: "#D85A30" },
      { id: "accommodation", name: "숙소", path: "M3 12l9-8 9 8v8a1 1 0 01-1 1h-5v-5H9v5H4a1 1 0 01-1-1v-8z", bg: "#FBEAF0", color: "#993556" },
      { id: "spa", name: "스파/힐링", path: "M12 3c-3 6-8 7-8 12a8 8 0 0016 0c0-5-5-6-8-12z", bg: "#FBEAF0", color: "#993556" },
      { id: "favorite", name: "좋아하는곳", path: "M12 21l-1-1C5 14.5 2 11.5 2 8a5 5 0 0110 0 5 5 0 0110 0c0 3.5-3 6.5-9 12l-1 1z", bg: "#FFF4EB", color: "#FF6B35" },
      { id: "recommended", name: "추천", path: "M12 2l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z", bg: "#FFF4EB", color: "#FF6B35" },
      { id: "hotplace", name: "핫플", path: "M13 2L3 14h9l-1 8 10-12h-9l1-8z", bg: "#FFF4EB", color: "#FF6B35" },
    ],
  },
]

// 전체 아이콘 flat 리스트
export const ALL_PIN_ICONS = PIN_ICON_GROUPS.flatMap((group) =>
  group.icons.map((icon) => ({
    ...icon,
    bg: icon.bg || group.bg,
    color: icon.color || group.color,
    group: group.label,
    src: `/icons/pins/${icon.id}.svg`,
  })),
)

// id → 아이콘 데이터 조회
export function getPinIcon(id) {
  return ALL_PIN_ICONS.find((icon) => icon.id === id) || ALL_PIN_ICONS[0]
}

// 기존 이모지 → 카테고리 매핑 (마이그레이션용)
const EMOJI_TO_CATEGORY = {
  "☕": "cafe", "🍵": "tea", "🧃": "juice",
  "🍴": "restaurant", "🍽️": "restaurant", "🍔": "fastfood", "🍞": "bakery", "🍰": "dessert", "🍺": "bar",
  "🌲": "park", "🌳": "park", "⛰️": "mountain", "🌊": "beach", "🏞️": "lake", "🌸": "garden", "🚶": "trail",
  "🖼️": "gallery", "🎨": "gallery", "🏛️": "museum", "🎵": "music", "🎬": "cinema", "📚": "bookstore",
  "🛍️": "shopping", "🏪": "market", "⏰": "vintage", "📦": "selectshop",
  "📍": "tourism", "🏺": "heritage", "🏠": "hanok", "⛪": "hanok", "🔺": "viewpoint", "🏢": "architecture",
  "📷": "photo", "📸": "photo", "🏃": "sports", "🏨": "accommodation", "💧": "spa",
  "❤️": "favorite", "⭐": "recommended", "⚡": "hotplace",
}

const CATEGORY_TO_EMOJI = {
  cafe: "☕",
  tea: "🍵",
  juice: "🧃",
  restaurant: "🍽️",
  fastfood: "🍔",
  bakery: "🍞",
  dessert: "🍰",
  bar: "🍺",
  park: "🌳",
  mountain: "⛰️",
  beach: "🌊",
  lake: "🏞️",
  garden: "🌸",
  trail: "🚶",
  gallery: "🖼️",
  museum: "🏛️",
  music: "🎵",
  cinema: "🎬",
  bookstore: "📚",
  shopping: "🛍️",
  market: "🏪",
  vintage: "⏰",
  selectshop: "📦",
  tourism: "📍",
  heritage: "🏺",
  hanok: "🏠",
  viewpoint: "🔺",
  architecture: "🏢",
  photo: "📸",
  sports: "🏃",
  accommodation: "🏨",
  spa: "💧",
  favorite: "❤️",
  recommended: "⭐",
  hotplace: "⚡",
}

export function emojiToCategory(emoji) {
  return EMOJI_TO_CATEGORY[emoji] || "tourism"
}

export function categoryToEmoji(categoryId) {
  return CATEGORY_TO_EMOJI[categoryId] || "📍"
}

export function isMappedPinEmoji(emoji) {
  return Boolean(EMOJI_TO_CATEGORY[emoji])
}
