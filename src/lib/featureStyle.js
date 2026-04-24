export const FEATURE_LINE_STYLE_SOLID = "solid"
export const FEATURE_LINE_STYLE_SHORT_DASH = "shortdash"
export const FEATURE_LINE_STYLE_SHORT_DOT = "shortdot"

export const FEATURE_LINE_STYLE_ITEMS = [
  { value: FEATURE_LINE_STYLE_SOLID, label: "실선" },
  { value: FEATURE_LINE_STYLE_SHORT_DASH, label: "짧은 점선" },
  { value: FEATURE_LINE_STYLE_SHORT_DOT, label: "도트" },
]

const HEX_COLOR_RE = /^#[0-9A-F]{6}$/i
const ALLOWED_LINE_STYLE_SET = new Set(FEATURE_LINE_STYLE_ITEMS.map((item) => item.value))

const DEFAULT_STYLE_BY_TYPE = {
  pin: { color: "#FF6B35", lineStyle: FEATURE_LINE_STYLE_SOLID },
  route: { color: "#0F6E56", lineStyle: FEATURE_LINE_STYLE_SOLID },
  area: { color: "#854F0B", lineStyle: FEATURE_LINE_STYLE_SHORT_DASH },
}

const COLOR_PRESET_BY_TYPE = {
  pin: ["#FF6B35", "#2D4A3E", "#2F80ED", "#E24B4A", "#8B5CF6", "#0EA5A4"],
  route: ["#0F6E56", "#2D4A3E", "#2F80ED", "#E24B4A", "#854F0B", "#8B5CF6"],
  area: ["#854F0B", "#2D4A3E", "#2F80ED", "#E24B4A", "#0F6E56", "#8B5CF6"],
}

export function getFeatureColorPresets(type = "pin") {
  return COLOR_PRESET_BY_TYPE[type] || COLOR_PRESET_BY_TYPE.pin
}

export function getDefaultFeatureStyle(type = "pin") {
  const fallback = DEFAULT_STYLE_BY_TYPE[type] || DEFAULT_STYLE_BY_TYPE.pin
  return { ...fallback }
}

export function normalizeHexColor(value, fallback = "#FF6B35") {
  if (typeof value !== "string") return fallback
  const normalized = value.trim().toUpperCase()
  return HEX_COLOR_RE.test(normalized) ? normalized : fallback
}

export function normalizeFeatureLineStyle(value, fallback = FEATURE_LINE_STYLE_SOLID) {
  if (typeof value !== "string") return fallback
  const normalized = value.trim().toLowerCase()
  return ALLOWED_LINE_STYLE_SET.has(normalized) ? normalized : fallback
}

export function normalizeFeatureStyle(style, type = "pin") {
  const fallback = getDefaultFeatureStyle(type)
  if (!style || typeof style !== "object") return fallback
  return {
    color: normalizeHexColor(style.color, fallback.color),
    lineStyle: type === "route" || type === "area"
      ? normalizeFeatureLineStyle(style.lineStyle, fallback.lineStyle)
      : FEATURE_LINE_STYLE_SOLID,
  }
}

export function getFeatureStyleColor(feature, fallbackType = "pin") {
  return normalizeFeatureStyle(feature?.style, feature?.type || fallbackType).color
}

export function getFeatureStyleLineStyle(feature, fallbackType = "route") {
  return normalizeFeatureStyle(feature?.style, feature?.type || fallbackType).lineStyle
}

export function toRgba(hexColor, alpha = 1) {
  const normalized = normalizeHexColor(hexColor, "#000000")
  const r = parseInt(normalized.slice(1, 3), 16)
  const g = parseInt(normalized.slice(3, 5), 16)
  const b = parseInt(normalized.slice(5, 7), 16)
  const safeAlpha = Number.isFinite(alpha) ? Math.max(0, Math.min(alpha, 1)) : 1
  return `rgba(${r}, ${g}, ${b}, ${safeAlpha})`
}

export function getGoogleDashIcons(lineStyle, color) {
  if (lineStyle === FEATURE_LINE_STYLE_SOLID) return null
  const isDot = lineStyle === FEATURE_LINE_STYLE_SHORT_DOT
  const icon = isDot
    ? { path: "M 0,-1 0,1", strokeOpacity: 1, strokeWeight: 2, scale: 1.8, strokeColor: color }
    : { path: "M 0,-1 0,1", strokeOpacity: 1, strokeWeight: 2, scale: 4, strokeColor: color }
  return [{ icon, offset: "0", repeat: isDot ? "9px" : "16px" }]
}
