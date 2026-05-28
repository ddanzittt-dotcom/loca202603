// Place-card emoji catalog and recent-use storage.

const RECENT_STORE_KEY = "loca.feature.emoji.recent.v1"
const RECENT_MAX = 18

export const EMOJI_CATALOG = [
  // face
  { e: "😊", n: "미소", g: "face" },
  { e: "🙂", n: "기본", g: "face" },
  { e: "😄", n: "웃음", g: "face" },
  { e: "😁", n: "활짝", g: "face" },
  { e: "🥰", n: "설렘", g: "face" },
  { e: "😍", n: "반함", g: "face" },
  { e: "😌", n: "편안", g: "face" },
  { e: "😎", n: "멋짐", g: "face" },
  { e: "🤔", n: "궁금", g: "face" },
  { e: "😋", n: "맛있음", g: "face" },
  { e: "😴", n: "휴식", g: "face" },
  { e: "🥲", n: "감동", g: "face" },
  { e: "😭", n: "눈물", g: "face" },
  { e: "😤", n: "다짐", g: "face" },
  { e: "🤩", n: "최고", g: "face" },
  { e: "😇", n: "맑음", g: "face" },

  // food
  { e: "☕", n: "커피", g: "food" },
  { e: "🍵", n: "차", g: "food" },
  { e: "🍰", n: "케이크", g: "food" },
  { e: "🧁", n: "컵케이크", g: "food" },
  { e: "🍩", n: "도넛", g: "food" },
  { e: "🍪", n: "쿠키", g: "food" },
  { e: "🍦", n: "아이스크림", g: "food" },
  { e: "🍧", n: "빙수", g: "food" },
  { e: "🍜", n: "라면", g: "food" },
  { e: "🍚", n: "밥", g: "food" },
  { e: "🍙", n: "주먹밥", g: "food" },
  { e: "🍱", n: "도시락", g: "food" },
  { e: "🍔", n: "버거", g: "food" },
  { e: "🍕", n: "피자", g: "food" },
  { e: "🥟", n: "만두", g: "food" },
  { e: "🍞", n: "빵", g: "food" },
  { e: "🥐", n: "크루아상", g: "food" },
  { e: "🍎", n: "사과", g: "food" },
  { e: "🍓", n: "딸기", g: "food" },
  { e: "🍺", n: "맥주", g: "food" },

  // nature
  { e: "🌿", n: "허브", g: "nature" },
  { e: "🍀", n: "행운", g: "nature" },
  { e: "🌳", n: "나무", g: "nature" },
  { e: "🌲", n: "숲", g: "nature" },
  { e: "🌵", n: "선인장", g: "nature" },
  { e: "🌷", n: "튤립", g: "nature" },
  { e: "🌸", n: "벚꽃", g: "nature" },
  { e: "🌼", n: "꽃", g: "nature" },
  { e: "🌻", n: "해바라기", g: "nature" },
  { e: "🍄", n: "버섯", g: "nature" },
  { e: "🍁", n: "단풍", g: "nature" },
  { e: "🌊", n: "파도", g: "nature" },
  { e: "⛰️", n: "산", g: "nature" },
  { e: "🏝️", n: "섬", g: "nature" },
  { e: "🌙", n: "달", g: "nature" },
  { e: "☀️", n: "햇살", g: "nature" },

  // animal
  { e: "🐶", n: "강아지", g: "animal" },
  { e: "🐱", n: "고양이", g: "animal" },
  { e: "🐰", n: "토끼", g: "animal" },
  { e: "🐻", n: "곰", g: "animal" },
  { e: "🐼", n: "판다", g: "animal" },
  { e: "🦊", n: "여우", g: "animal" },
  { e: "🐥", n: "새", g: "animal" },
  { e: "🦋", n: "나비", g: "animal" },
  { e: "🐝", n: "벌", g: "animal" },
  { e: "🐞", n: "무당벌레", g: "animal" },
  { e: "🐟", n: "물고기", g: "animal" },
  { e: "🐬", n: "돌고래", g: "animal" },
  { e: "🦄", n: "유니콘", g: "animal" },
  { e: "🐢", n: "거북이", g: "animal" },
  { e: "🦦", n: "수달", g: "animal" },
  { e: "🐾", n: "발자국", g: "animal" },

  // symbol
  { e: "✨", n: "반짝", g: "symbol" },
  { e: "⭐", n: "별", g: "symbol" },
  { e: "🌟", n: "빛나는 별", g: "symbol" },
  { e: "💫", n: "빙글", g: "symbol" },
  { e: "🔥", n: "불꽃", g: "symbol" },
  { e: "❤️", n: "하트", g: "symbol" },
  { e: "🧡", n: "주황 하트", g: "symbol" },
  { e: "💛", n: "노란 하트", g: "symbol" },
  { e: "💚", n: "초록 하트", g: "symbol" },
  { e: "💙", n: "파란 하트", g: "symbol" },
  { e: "💜", n: "보라 하트", g: "symbol" },
  { e: "🎀", n: "리본", g: "symbol" },
  { e: "🎈", n: "풍선", g: "symbol" },
  { e: "🎉", n: "파티", g: "symbol" },
  { e: "✅", n: "체크", g: "symbol" },
  { e: "📍", n: "핀", g: "symbol" },

  // object
  { e: "🏠", n: "집", g: "object" },
  { e: "🏡", n: "주택", g: "object" },
  { e: "🏢", n: "빌딩", g: "object" },
  { e: "🏫", n: "학교", g: "object" },
  { e: "🏥", n: "병원", g: "object" },
  { e: "🏪", n: "편의점", g: "object" },
  { e: "🏬", n: "상점", g: "object" },
  { e: "🏛️", n: "건물", g: "object" },
  { e: "🛍️", n: "쇼핑", g: "object" },
  { e: "🎨", n: "미술", g: "object" },
  { e: "🎬", n: "영화", g: "object" },
  { e: "🎵", n: "음악", g: "object" },
  { e: "📚", n: "책", g: "object" },
  { e: "📷", n: "카메라", g: "object" },
  { e: "🗺️", n: "지도", g: "object" },
  { e: "🚗", n: "자동차", g: "object" },
  { e: "🚌", n: "버스", g: "object" },
  { e: "🚲", n: "자전거", g: "object" },
]

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
  } catch {
    return []
  }
}

export function pushRecentEmoji(emoji) {
  if (!emoji) return
  try {
    const current = loadRecentEmojis()
    const next = [emoji, ...current.filter((v) => v !== emoji)].slice(0, RECENT_MAX)
    localStorage.setItem(RECENT_STORE_KEY, JSON.stringify(next))
  } catch {
    // Ignore localStorage quota and privacy-mode failures.
  }
}

export function lookupEmojiName(emoji) {
  if (!emoji) return ""
  const entry = EMOJI_CATALOG.find((item) => item.e === emoji)
  return entry?.n || ""
}
