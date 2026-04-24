// 장소 카드 이모지 카탈로그 + 최근 사용 저장소.
// 시안: design/2.loca_place_card_proposal_v5.html (section 03)
// 최근 사용은 디바이스 로컬(localStorage)에 보관한다.

const RECENT_STORE_KEY = "loca.feature.emoji.recent.v1"
const RECENT_MAX = 18

export const EMOJI_CATALOG = [
  // ==== 표정·기분 (g: face) ====
  { e: "😊", n: "미소", g: "face" },
  { e: "🥰", n: "설렘", g: "face" },
  { e: "😍", n: "반함", g: "face" },
  { e: "🤩", n: "신남", g: "face" },
  { e: "🥹", n: "뭉클", g: "face" },
  { e: "🙂", n: "기본", g: "face" },
  { e: "😌", n: "편안", g: "face" },
  { e: "🤗", n: "포근", g: "face" },
  { e: "😎", n: "쿨", g: "face" },
  { e: "🥲", n: "웃픔", g: "face" },
  { e: "😴", n: "잠", g: "face" },
  { e: "🤔", n: "궁금", g: "face" },

  // ==== 음식·디저트 (g: food) ====
  { e: "☕", n: "커피", g: "food" },
  { e: "🧋", n: "버블티", g: "food" },
  { e: "🫖", n: "티팟", g: "food" },
  { e: "🍵", n: "녹차", g: "food" },
  { e: "🍰", n: "케이크", g: "food" },
  { e: "🥐", n: "크루아상", g: "food" },
  { e: "🍞", n: "빵", g: "food" },
  { e: "🥯", n: "베이글", g: "food" },
  { e: "🍩", n: "도넛", g: "food" },
  { e: "🍪", n: "쿠키", g: "food" },
  { e: "🧁", n: "컵케이크", g: "food" },
  { e: "🥞", n: "팬케이크", g: "food" },
  { e: "🍦", n: "아이스크림", g: "food" },
  { e: "🍧", n: "빙수", g: "food" },
  { e: "🍜", n: "라멘", g: "food" },
  { e: "🍱", n: "도시락", g: "food" },
  { e: "🍣", n: "초밥", g: "food" },
  { e: "🍕", n: "피자", g: "food" },
  { e: "🍔", n: "버거", g: "food" },
  { e: "🌮", n: "타코", g: "food" },
  { e: "🍗", n: "치킨", g: "food" },
  { e: "🥩", n: "스테이크", g: "food" },
  { e: "🍷", n: "와인", g: "food" },
  { e: "🍺", n: "맥주", g: "food" },
  { e: "🍶", n: "사케", g: "food" },

  // ==== 식물·자연 (g: nature) ====
  { e: "🌿", n: "허브", g: "nature" },
  { e: "🌱", n: "새싹", g: "nature" },
  { e: "🌳", n: "나무", g: "nature" },
  { e: "🌲", n: "침엽수", g: "nature" },
  { e: "🍀", n: "행운", g: "nature" },
  { e: "🌸", n: "벚꽃", g: "nature" },
  { e: "🌷", n: "튤립", g: "nature" },
  { e: "🌹", n: "장미", g: "nature" },
  { e: "🌻", n: "해바라기", g: "nature" },
  { e: "🌼", n: "들꽃", g: "nature" },
  { e: "💐", n: "꽃다발", g: "nature" },
  { e: "🍁", n: "단풍", g: "nature" },
  { e: "🌊", n: "파도", g: "nature" },
  { e: "🏞️", n: "풍경", g: "nature" },
  { e: "⛰️", n: "산", g: "nature" },

  // ==== 동물 (g: animal) ====
  { e: "🐰", n: "토끼", g: "animal" },
  { e: "🐱", n: "고양이", g: "animal" },
  { e: "🐶", n: "강아지", g: "animal" },
  { e: "🐻", n: "곰", g: "animal" },
  { e: "🐼", n: "판다", g: "animal" },
  { e: "🐨", n: "코알라", g: "animal" },
  { e: "🦊", n: "여우", g: "animal" },
  { e: "🐹", n: "햄스터", g: "animal" },
  { e: "🦄", n: "유니콘", g: "animal" },
  { e: "🦋", n: "나비", g: "animal" },
  { e: "🐝", n: "꿀벌", g: "animal" },
  { e: "🐞", n: "무당벌레", g: "animal" },
  { e: "🐟", n: "물고기", g: "animal" },
  { e: "🐬", n: "돌고래", g: "animal" },
  { e: "🦉", n: "부엉이", g: "animal" },
  { e: "🦩", n: "홍학", g: "animal" },

  // ==== 심볼·무드 (g: symbol) ====
  { e: "✨", n: "반짝", g: "symbol" },
  { e: "💖", n: "하트", g: "symbol" },
  { e: "💕", n: "커플", g: "symbol" },
  { e: "💝", n: "선물하트", g: "symbol" },
  { e: "💌", n: "편지", g: "symbol" },
  { e: "🫶", n: "손하트", g: "symbol" },
  { e: "🎀", n: "리본", g: "symbol" },
  { e: "🌟", n: "별", g: "symbol" },
  { e: "⭐", n: "작은별", g: "symbol" },
  { e: "🌈", n: "무지개", g: "symbol" },
  { e: "☁️", n: "구름", g: "symbol" },
  { e: "🫧", n: "거품", g: "symbol" },
  { e: "🕯️", n: "양초", g: "symbol" },
  { e: "🔥", n: "불꽃", g: "symbol" },
  { e: "💫", n: "어지러이", g: "symbol" },
  { e: "🎉", n: "파티", g: "symbol" },

  // ==== 오브젝트·공간 (g: object) ====
  { e: "🏠", n: "집", g: "object" },
  { e: "🏡", n: "주택", g: "object" },
  { e: "🏢", n: "빌딩", g: "object" },
  { e: "🏛️", n: "신전", g: "object" },
  { e: "🏟️", n: "경기장", g: "object" },
  { e: "🏰", n: "성", g: "object" },
  { e: "🏖️", n: "해변", g: "object" },
  { e: "⛺", n: "캠핑", g: "object" },
  { e: "🛍️", n: "쇼핑", g: "object" },
  { e: "🛒", n: "마트", g: "object" },
  { e: "🎨", n: "미술", g: "object" },
  { e: "📚", n: "책", g: "object" },
  { e: "🎬", n: "영화", g: "object" },
  { e: "🎵", n: "음악", g: "object" },
  { e: "🎁", n: "선물", g: "object" },
  { e: "📸", n: "카메라", g: "object" },
  { e: "📍", n: "핀", g: "object" },
  { e: "🗺️", n: "지도", g: "object" },
]

// 형태별 탭 — 용도별(카페·음식점 등)이 아닌 "형태·느낌" 기반.
export const EMOJI_TABS = [
  { id: "recent", label: "🕘", aria: "최근 사용" },
  { id: "face", label: "😊", aria: "표정·기분" },
  { id: "food", label: "🍰", aria: "음식·디저트" },
  { id: "nature", label: "🌿", aria: "식물·자연" },
  { id: "animal", label: "🐰", aria: "동물·생명" },
  { id: "symbol", label: "✨", aria: "심볼·무드" },
  { id: "object", label: "🏠", aria: "오브젝트·공간" },
]

export function loadRecentEmojis() {
  try {
    const raw = localStorage.getItem(RECENT_STORE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === "string").slice(0, RECENT_MAX) : []
  } catch { return [] }
}

export function pushRecentEmoji(emoji) {
  if (!emoji) return
  try {
    const current = loadRecentEmojis()
    const next = [emoji, ...current.filter((v) => v !== emoji)].slice(0, RECENT_MAX)
    localStorage.setItem(RECENT_STORE_KEY, JSON.stringify(next))
  } catch { /* quota 등 무시 */ }
}

export function lookupEmojiName(emoji) {
  if (!emoji) return ""
  const entry = EMOJI_CATALOG.find((item) => item.e === emoji)
  return entry?.n || ""
}
