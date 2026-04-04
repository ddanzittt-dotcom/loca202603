/**
 * mapCompletion.js
 * 지도 완성도 계산
 *
 * 점수 기준 (100점 만점):
 * - 제목 있음: 10점
 * - 설명 있음: 10점
 * - 핀 3개 이상: 15점 (1~2개: 5점)
 * - 핀에 note/media 비율 50% 이상: 15점 (25% 이상: 8점)
 * - 태그 1개 이상 있는 핀 비율 50%+: 10점
 * - route 존재: 10점
 * - area 존재: 5점
 * - highlight 핀 1개 이상: 10점
 * - 발행됨: 15점
 */

/**
 * 지도 완성도 스냅샷 계산
 * @param {object} map - { title, description, isPublished, ... }
 * @param {object[]} features - 해당 지도의 피처 배열
 * @returns {{ score: number, breakdown: object[], tier: string }}
 */
export function getMapCompletionSnapshot(map, features) {
  const pins = features.filter((f) => f.type === "pin")
  const routes = features.filter((f) => f.type === "route")
  const areas = features.filter((f) => f.type === "area")

  const breakdown = []
  let score = 0

  // 1. 제목
  const hasTitle = Boolean(map.title?.trim())
  if (hasTitle) score += 10
  breakdown.push({ key: "title", label: "제목", points: hasTitle ? 10 : 0, max: 10, done: hasTitle })

  // 2. 설명
  const hasDesc = Boolean(map.description?.trim())
  if (hasDesc) score += 10
  breakdown.push({ key: "description", label: "설명", points: hasDesc ? 10 : 0, max: 10, done: hasDesc })

  // 3. 핀 개수
  const pinPoints = pins.length >= 3 ? 15 : pins.length >= 1 ? 5 : 0
  score += pinPoints
  breakdown.push({ key: "pins", label: `핀 ${pins.length}개`, points: pinPoints, max: 15, done: pins.length >= 3 })

  // 4. 핀 note/media 비율
  const enrichedPins = pins.filter((f) => f.note?.trim() || (f.photos?.length > 0) || (f.voices?.length > 0))
  const enrichRatio = pins.length > 0 ? enrichedPins.length / pins.length : 0
  const enrichPoints = enrichRatio >= 0.5 ? 15 : enrichRatio >= 0.25 ? 8 : 0
  score += enrichPoints
  breakdown.push({ key: "enrich", label: "메모/미디어", points: enrichPoints, max: 15, done: enrichRatio >= 0.5 })

  // 5. 태그 비율
  const taggedPins = pins.filter((f) => f.tags?.length > 0)
  const tagRatio = pins.length > 0 ? taggedPins.length / pins.length : 0
  const tagPoints = tagRatio >= 0.5 ? 10 : 0
  score += tagPoints
  breakdown.push({ key: "tags", label: "태그", points: tagPoints, max: 10, done: tagRatio >= 0.5 })

  // 6. 경로 존재
  const hasRoute = routes.length > 0
  if (hasRoute) score += 10
  breakdown.push({ key: "route", label: "경로", points: hasRoute ? 10 : 0, max: 10, done: hasRoute })

  // 7. 영역 존재
  const hasArea = areas.length > 0
  if (hasArea) score += 5
  breakdown.push({ key: "area", label: "영역", points: hasArea ? 5 : 0, max: 5, done: hasArea })

  // 8. 하이라이트
  const hasHighlight = pins.some((f) => f.highlight)
  if (hasHighlight) score += 10
  breakdown.push({ key: "highlight", label: "하이라이트", points: hasHighlight ? 10 : 0, max: 10, done: hasHighlight })

  // 9. 발행
  const isPublished = Boolean(map.isPublished || map.is_published)
  if (isPublished) score += 15
  breakdown.push({ key: "published", label: "발행", points: isPublished ? 15 : 0, max: 15, done: isPublished })

  // tier 결정
  let tier = "draft"
  if (score >= 90) tier = "excellent"
  else if (score >= 70) tier = "good"
  else if (score >= 40) tier = "progress"

  return { score, breakdown, tier }
}
