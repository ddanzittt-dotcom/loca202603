// 지도에 담긴 기록을 타입별로 세고, "장소 N · 길 N · 영역 N" 라벨로 만드는 공용 헬퍼.
// 내 지도 목록 카드(MapsListScreen)와 프로필 공개 시트(PublishSheet)가 같은 규칙을 공유한다.

// 기록 타입별 개수 집계 (장소=pin / 길=route / 영역=area).
export function countFeatureTypes(features = []) {
  const counts = { pin: 0, route: 0, area: 0 }
  for (const feature of features) {
    if (feature.type === "route") counts.route += 1
    else if (feature.type === "area") counts.area += 1
    else counts.pin += 1
  }
  return counts
}

// 있는 타입만 "장소 N · 길 N · 영역 N" 으로 보여준다. 전부 0이면 emptyLabel.
export function formatFeatureCounts({ pin = 0, route = 0, area = 0 } = {}, { emptyLabel = "비어 있음" } = {}) {
  const parts = []
  if (pin > 0) parts.push(`장소 ${pin}`)
  if (route > 0) parts.push(`길 ${route}`)
  if (area > 0) parts.push(`영역 ${area}`)
  return parts.length ? parts.join(" · ") : emptyLabel
}
