import { buildFeatureRecordGroups } from "./featureRecordGroups"

// 바인더 카드가 쓰는 파생값 헬퍼 (컴포넌트와 분리 — react-refresh 규칙)

export function getCardPhotos(feature) {
  const own = Array.isArray(feature?.photos) ? feature.photos : []
  const memo = (feature?.memos || []).flatMap((m) => (Array.isArray(m.photos) ? m.photos : []))
  return [...own, ...memo]
    .map((photo) => (typeof photo === "string" ? photo : photo?.url || photo?.thumbnail || photo?.src || photo?.cloudUrl || ""))
    .filter(Boolean)
}

export function cardRecordCount(feature) {
  if (!feature) return 0
  return buildFeatureRecordGroups(feature).length
}

export function formatDotDate(value) {
  const d = new Date(value || NaN)
  if (Number.isNaN(d.getTime())) return null
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`
}

// 채집된 카드의 note 는 주소인 경우가 많다 — 주소처럼 보이면 스펙의 주소 줄로 보낸다
export function looksLikeAddress(text) {
  const t = `${text || ""}`.trim()
  if (!t || t.length > 60) return false
  return /(로|길)\s?\d|(동|리)\s?\d|번길|[가-힣]+(시|군)\s[가-힣]/.test(t)
}

export function neighborhoodWord(feature, mapTitle) {
  const note = `${feature?.note || ""}`.trim()
  if (looksLikeAddress(note)) {
    const words = note.split(/\s+/)
    const gu = words.find((w) => /(구|군|동|읍|면)$/.test(w))
    return gu || words[0]
  }
  return mapTitle || null
}
