import { resolveFeatureEmoji } from "../components/FeatureEmoji"

// 장소 카테고리 자동 판정 — 도감(내 장소) 분류용.
// 등급(레어리티) 없음: 카테고리 색이 카드의 개성을 만든다.

export const PLACE_CATEGORIES = [
  { id: "food", label: "음식", color: "#E5493A" },
  { id: "cafe", label: "카페", color: "#E89B2D" },
  { id: "nature", label: "자연", color: "#3E9B57" },
  { id: "culture", label: "문화", color: "#7A5FD0" },
  { id: "shop", label: "가게", color: "#D96A2E" },
  { id: "route", label: "길", color: "#2D6FD0" },
  { id: "area", label: "영역", color: "#2E9E97" },
  { id: "etc", label: "그 외", color: "#8B7F63" },
]

const CATEGORY_BY_ID = new Map(PLACE_CATEGORIES.map((category) => [category.id, category]))

const PIXEL_CATEGORY = {
  food: ["px-noodle", "px-spicy-pork", "px-rice", "px-kimbap", "px-restaurant", "px-beer"],
  cafe: ["px-cafe", "px-coffee", "px-tea", "px-bread", "px-icecream"],
  nature: ["px-tree", "px-park", "px-garden", "px-flower", "px-mountain", "px-river", "px-lake", "px-beach", "px-sun", "px-dog"],
  culture: ["px-book", "px-camera"],
  shop: ["px-market"],
}

const UNICODE_CATEGORY = {
  food: ["🍜", "🍚", "🍙", "🍖", "🍗", "🍕", "🍔", "🌭", "🥘", "🍲", "🍺", "🍻", "🍷", "🌶", "🥟", "🍤"],
  cafe: ["☕", "🍰", "🧁", "🍞", "🥐", "🍦", "🍨", "🍩", "🍪", "🫖", "🧋"],
  nature: ["🌳", "🌲", "🌸", "🌺", "🌷", "🌊", "⛰", "🏔", "🏞", "🌅", "🌄", "🐶", "🦆", "🍂"],
  culture: ["📚", "📖", "📷", "🎨", "🏛", "🎭", "🎬", "⛪", "🏯"],
  shop: ["🛍", "🏪", "💐", "🧺"],
}

function matchCategoryId(kind, value) {
  const table = kind === "pixel" ? PIXEL_CATEGORY : UNICODE_CATEGORY
  for (const [categoryId, values] of Object.entries(table)) {
    if (kind === "pixel" ? values.includes(value) : values.some((emoji) => value.includes(emoji))) {
      return categoryId
    }
  }
  return null
}

export function getPlaceCategory(feature) {
  if (feature?.type === "route") return CATEGORY_BY_ID.get("route")
  if (feature?.type === "area") return CATEGORY_BY_ID.get("area")

  try {
    const descriptor = resolveFeatureEmoji(feature)
    if (descriptor?.kind === "pixel" && typeof descriptor.value === "string") {
      const matched = matchCategoryId("pixel", descriptor.value)
      if (matched) return CATEGORY_BY_ID.get(matched)
    }
    if (descriptor?.kind === "unicode" && typeof descriptor.value === "string") {
      const matched = matchCategoryId("unicode", descriptor.value)
      if (matched) return CATEGORY_BY_ID.get(matched)
    }
  } catch {
    // 판정 실패 시 그 외
  }
  return CATEGORY_BY_ID.get("etc")
}
