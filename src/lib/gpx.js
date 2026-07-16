// GPX 트랙 파싱 + 폴리라인 다운샘플 — 순수 모듈 (수집 스크립트·테스트 공용).
// 의존성 없는 정규식 파싱: <trkpt lat lon> / <rtept lat lon> 만 뽑는다.
// 반환 좌표 순서는 DB 규약과 동일한 [lng, lat] (map_features.points 형식).

export function parseGpxPoints(xml) {
  const points = []
  const re = /<(?:trkpt|rtept)[^>]*lat="([\d.+-]+)"[^>]*lon="([\d.+-]+)"/g
  let match
  while ((match = re.exec(String(xml || ""))) !== null) {
    const lat = Number(match[1])
    const lng = Number(match[2])
    if (Number.isFinite(lat) && Number.isFinite(lng)) points.push([lng, lat])
  }
  return points
}

// 균일 간격 다운샘플 — 첫/끝 점 보존. 지도 표시용으로 충분하고 결정적(같은 입력=같은 출력).
export function downsample(points, max = 400) {
  if (!Array.isArray(points) || points.length <= max) return points || []
  const stride = (points.length - 1) / (max - 1)
  const out = []
  for (let i = 0; i < max; i += 1) out.push(points[Math.round(i * stride)])
  return out
}
