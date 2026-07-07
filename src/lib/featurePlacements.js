// 지도-기록 M:N 배치(050) 순수 헬퍼.
// 상태 형태: { [mapId]: featureId[] } — 한 카드가 여러 지도에 담긴 관계를 나타낸다.
// 스칼라 feature.mapId(홈 지도)와 병존하며, 지도 소속 판정은 둘의 합집합으로 한다.

// 카드들을 대상 지도 배치에 중복 없이 뒤에 이어붙인다. 변화가 없으면 원본 참조를 그대로 반환한다.
export function addPlacements(placementsByMap, mapId, featureIds) {
  if (!mapId || !Array.isArray(featureIds) || featureIds.length === 0) return placementsByMap
  const base = placementsByMap || {}
  const existing = base[mapId] || []
  const seen = new Set(existing)
  const appended = featureIds.filter((id) => id && !seen.has(id))
  if (appended.length === 0) return placementsByMap
  return { ...base, [mapId]: [...existing, ...appended] }
}

// 카드 하나를 대상 지도 배치에서 뺀다. 배치가 비면 해당 지도 키를 제거한다.
export function removePlacement(placementsByMap, mapId, featureId) {
  if (!mapId || !featureId) return placementsByMap
  const base = placementsByMap || {}
  const existing = base[mapId]
  if (!Array.isArray(existing) || !existing.includes(featureId)) return placementsByMap
  const next = existing.filter((id) => id !== featureId)
  const clone = { ...base }
  if (next.length === 0) delete clone[mapId]
  else clone[mapId] = next
  return clone
}

// 카드가 지도에 담겼는지 — 스칼라 홈 지도(mapId) 또는 M:N 배치 중 하나라도 해당하면 true.
export function featureInMap(placementsByMap, feature, mapId) {
  if (!feature || !mapId) return false
  if ((feature.mapId || feature.map_id) === mapId) return true
  const ids = (placementsByMap || {})[mapId]
  return Array.isArray(ids) && ids.includes(feature.id || feature.feature_id)
}
