import { resolveFeatureEmoji } from "../components/FeatureEmoji"

// 카드 바인더 리디자인(2026-07) — 장소 타입 9종.
// 카드 헤더 배지·아트 틴트·이름판 서브에 쓰인다.
// 타입은 태그(예: "타입:카페")로 저장하고, 없으면 이모지/종류에서 유추한다.

export const PLACE_TYPES = [
  { id: "cafe", label: "카페", color: "#C8862E" },
  { id: "food", label: "밥집", color: "#C4512A" },
  { id: "beer", label: "술집", color: "#7C5299" },
  { id: "bread", label: "빵집", color: "#9C6B39" },
  { id: "nature", label: "자연", color: "#47804F" },
  { id: "walk", label: "길", color: "#39836F" },
  { id: "area", label: "영역", color: "#44759F" },
  { id: "home", label: "집", color: "#C46A8E" },
  { id: "heart", label: "단골", color: "#C74A6E" },
]

// 유추 실패 시 폴백 (선택지에는 노출하지 않음)
const FALLBACK_TYPE = { id: "etc", label: "장소", color: "#8A8574" }

const TYPE_BY_ID = new Map(PLACE_TYPES.map((type) => [type.id, type]))
const TYPE_BY_LABEL = new Map(PLACE_TYPES.map((type) => [type.label, type]))

const TYPE_TAG_PREFIX = "타입:"

export function typeTag(typeId) {
  const type = TYPE_BY_ID.get(typeId)
  return type ? `${TYPE_TAG_PREFIX}${type.label}` : null
}

// 이모지 → 타입 유추 표
const PIXEL_TYPE = {
  cafe: ["px-cafe", "px-coffee", "px-tea", "px-icecream"],
  food: ["px-noodle", "px-spicy-pork", "px-rice", "px-kimbap", "px-restaurant"],
  beer: ["px-beer"],
  bread: ["px-bread"],
  nature: ["px-tree", "px-park", "px-garden", "px-flower", "px-mountain", "px-river", "px-lake", "px-beach", "px-sun", "px-dog"],
  home: ["px-home", "px-house"],
  heart: ["px-heart", "px-star"],
}

const UNICODE_TYPE = {
  cafe: ["☕", "🍰", "🧁", "🍦", "🍨", "🍩", "🍪", "🫖", "🧋"],
  food: ["🍜", "🍚", "🍙", "🍖", "🍗", "🍕", "🍔", "🌭", "🥘", "🍲", "🌶", "🥟", "🍤"],
  beer: ["🍺", "🍻", "🍷", "🍶", "🥃", "🍸"],
  bread: ["🍞", "🥐", "🥖", "🥨"],
  nature: ["🌳", "🌲", "🌸", "🌺", "🌷", "🌊", "⛰", "🏔", "🏞", "🌅", "🌄", "🐶", "🦆", "🍂"],
  home: ["🏠", "🏡"],
  heart: ["❤", "💕", "⭐", "✨"],
}

function matchTypeIdFromEmoji(kind, value) {
  const table = kind === "pixel" ? PIXEL_TYPE : UNICODE_TYPE
  for (const [typeId, values] of Object.entries(table)) {
    if (kind === "pixel" ? values.includes(value) : values.some((emoji) => value.includes(emoji))) {
      return typeId
    }
  }
  return null
}

export function getPlaceType(feature) {
  // 1) 종류가 곧 타입인 것들
  if (feature?.type === "route") return TYPE_BY_ID.get("walk")
  if (feature?.type === "area") return TYPE_BY_ID.get("area")

  // 2) 태그에 명시적으로 저장된 타입 ("타입:카페" 또는 라벨 그대로)
  for (const tag of feature?.tags || []) {
    const raw = `${tag || ""}`.trim()
    const label = raw.startsWith(TYPE_TAG_PREFIX) ? raw.slice(TYPE_TAG_PREFIX.length) : raw
    const matched = TYPE_BY_LABEL.get(label)
    if (matched) return matched
  }

  // 3) 이모지에서 유추
  try {
    const descriptor = resolveFeatureEmoji(feature)
    if (descriptor?.value) {
      const matched = matchTypeIdFromEmoji(descriptor.kind === "pixel" ? "pixel" : "unicode", descriptor.value)
      if (matched) return TYPE_BY_ID.get(matched)
    }
  } catch {
    // 유추 실패 시 폴백
  }
  return FALLBACK_TYPE
}
