// 지도 카드 공용 미니맵 SVG 생성기 (지도 목록 / 프로필 / 탐색 카드에서 공유)
//
// 데이터 시각화가 아니라 "한 장의 일러스트"로 보이게 그린다:
// - 종이 질감: 크림 → 테마색으로 흐르는 은은한 그라데이션 + 아주 옅은 점 패턴
// - 핀: 수채 얼룩처럼 번지는 블롭 위에 또렷한 점
// - 동선: 핀들을 잇는 점점이 찍힌 곡선 (별자리 느낌)
// - 길: 부드러운 곡선, 영역: 테두리 없는 반투명 면

const WIDTH = 200
const HEIGHT = 138
const EMBER = "#FF6B35"
const EMBER_DEEP = "#C44518"

function sanitizeHexColor(value) {
  return typeof value === "string" && /^#[0-9a-fA-F]{3,8}$/u.test(value.trim()) ? value.trim() : null
}

function toLatLng(point) {
  if (Array.isArray(point)) {
    const lng = Number(point[0])
    const lat = Number(point[1])
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null
  }
  const lat = Number(point?.lat ?? point?.y)
  const lng = Number(point?.lng ?? point?.x)
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null
}

// 좌표 기반 결정적 의사난수 (0~1) — 렌더마다 흔들리지 않게
function seededUnit(seedA, seedB, salt = 0) {
  const value = Math.abs(Math.sin(seedA * 127.1 + seedB * 311.7 + salt * 74.7) * 43758.5453)
  return value - Math.floor(value)
}

function wrapSvg(defs, inner) {
  return `<svg viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice"><defs>${defs}</defs>${inner}</svg>`
}

// 부드러운 곡선 path (중점 quadratic 스무딩)
function smoothPath(points) {
  if (points.length < 2) return ""
  let d = `M ${points[0].x} ${points[0].y}`
  for (let i = 1; i < points.length - 1; i += 1) {
    const midX = ((Number(points[i].x) + Number(points[i + 1].x)) / 2).toFixed(1)
    const midY = ((Number(points[i].y) + Number(points[i + 1].y)) / 2).toFixed(1)
    d += ` Q ${points[i].x} ${points[i].y} ${midX} ${midY}`
  }
  const last = points[points.length - 1]
  d += ` L ${last.x} ${last.y}`
  return d
}

function buildBackdrop(theme) {
  const tint = theme || EMBER
  const gradId = `mmg-${tint.replace("#", "")}`
  const dotsId = `mmd-${tint.replace("#", "")}`
  const defs = `
    <linearGradient id="${gradId}" x1="0" y1="0" x2="0.9" y2="1">
      <stop offset="0" stop-color="#FBF7EC"/>
      <stop offset="0.62" stop-color="#F4EDDC"/>
      <stop offset="1" stop-color="${tint}" stop-opacity="0.16"/>
    </linearGradient>
    <pattern id="${dotsId}" width="14" height="14" patternUnits="userSpaceOnUse">
      <circle cx="2" cy="2" r="0.8" fill="${tint}" opacity="0.12"/>
    </pattern>`
  const rects = `<rect width="${WIDTH}" height="${HEIGHT}" fill="url(#${gradId})"/><rect width="${WIDTH}" height="${HEIGHT}" fill="url(#${dotsId})"/>`
  return { defs, rects }
}

function renderPinArt(points, theme) {
  const tint = theme || EMBER
  const blobs = points.map((point, index) => {
    const wobbleA = seededUnit(point.rawLat, point.rawLng, 1)
    const wobbleB = seededUnit(point.rawLat, point.rawLng, 2)
    const r1 = (9 + wobbleA * 7).toFixed(1)
    const r2 = (5 + wobbleB * 4).toFixed(1)
    const dx = ((wobbleA - 0.5) * 6).toFixed(1)
    const dy = ((wobbleB - 0.5) * 6).toFixed(1)
    void index
    return `<circle cx="${point.x}" cy="${point.y}" r="${r1}" fill="${tint}" opacity="0.13"/>`
      + `<circle cx="${(Number(point.x) + Number(dx)).toFixed(1)}" cy="${(Number(point.y) + Number(dy)).toFixed(1)}" r="${r2}" fill="${tint}" opacity="0.15"/>`
  }).join("")

  const dotRadius = points.length > 14 ? 2.6 : points.length > 7 ? 3 : 3.6
  const dots = points.map((point) => (
    `<circle cx="${point.x}" cy="${point.y}" r="${dotRadius}" fill="#FFFDF7" stroke="${EMBER_DEEP}" stroke-width="0.9"/>`
    + `<circle cx="${point.x}" cy="${point.y}" r="${(dotRadius * 0.52).toFixed(1)}" fill="${EMBER}"/>`
  )).join("")

  return { blobs, dots }
}

export function generateMiniMapSvg(features = [], options = {}) {
  const theme = sanitizeHexColor(options.theme)
  const emptyLabel = options.emptyLabel || "아직 빈 지도"
  const { defs, rects } = buildBackdrop(theme)
  const tint = theme || EMBER

  const pins = features.filter((item) => (
    item?.type === "pin"
    && Number.isFinite(Number(item.lat))
    && Number.isFinite(Number(item.lng))
  ))
  const shapes = features
    .filter((item) => (item?.type === "route" || item?.type === "area") && Array.isArray(item.points))
    .map((item) => ({
      type: item.type,
      coords: item.points.map(toLatLng).filter(Boolean),
    }))
    .filter((shape) => shape.coords.length >= 2)

  const allCoords = [
    ...pins.map((pin) => ({ lat: Number(pin.lat), lng: Number(pin.lng) })),
    ...shapes.flatMap((shape) => shape.coords),
  ]

  if (allCoords.length === 0) {
    return wrapSvg(defs, `${rects}
      <circle cx="100" cy="62" r="16" fill="${tint}" opacity="0.14"/>
      <circle cx="100" cy="62" r="3.4" fill="#FFFDF7" stroke="${EMBER_DEEP}" stroke-width="0.9"/>
      <circle cx="100" cy="62" r="1.8" fill="${EMBER}"/>
      <text x="100" y="94" text-anchor="middle" font-family="Pretendard, sans-serif" font-size="9.5" font-weight="700" fill="#8B847A">${emptyLabel}</text>`)
  }

  const minLat = Math.min(...allCoords.map((p) => p.lat))
  const maxLat = Math.max(...allCoords.map((p) => p.lat))
  const minLng = Math.min(...allCoords.map((p) => p.lng))
  const maxLng = Math.max(...allCoords.map((p) => p.lng))
  const latRange = maxLat - minLat
  const lngRange = maxLng - minLng

  // 전부 한 지점 — 크게 번진 얼룩 하나
  if (latRange < 0.0005 && lngRange < 0.0005 && shapes.length === 0) {
    const countLabel = pins.length > 1
      ? `<text x="100" y="104" text-anchor="middle" font-family="Pretendard, sans-serif" font-size="9" font-weight="700" fill="#6B6357">${pins.length}곳 한 지점</text>`
      : ""
    return wrapSvg(defs, `${rects}
      <circle cx="100" cy="66" r="22" fill="${tint}" opacity="0.12"/>
      <circle cx="94" cy="61" r="12" fill="${tint}" opacity="0.14"/>
      <circle cx="100" cy="66" r="5.5" fill="#FFFDF7" stroke="${EMBER_DEEP}" stroke-width="1"/>
      <circle cx="100" cy="66" r="3" fill="${EMBER}"/>${countLabel}`)
  }

  const padding = 24
  const safeLatRange = Math.max(latRange, 0.0005)
  const safeLngRange = Math.max(lngRange, 0.0005)
  const drawableW = WIDTH - padding * 2
  const drawableH = HEIGHT - padding * 2
  const scale = Math.min(drawableW / safeLngRange, drawableH / safeLatRange)
  const usedW = safeLngRange * scale
  const usedH = safeLatRange * scale
  const offsetX = padding + (drawableW - usedW) / 2
  const offsetY = padding + (drawableH - usedH) / 2
  const project = (p) => ({
    x: (offsetX + (p.lng - minLng) * scale).toFixed(1),
    y: (offsetY + (maxLat - p.lat) * scale).toFixed(1),
  })

  const pinPoints = pins.map((pin) => ({
    ...project({ lat: Number(pin.lat), lng: Number(pin.lng) }),
    rawLat: Number(pin.lat),
    rawLng: Number(pin.lng),
  }))

  // 영역: 테두리 없는 반투명 면 (겹칠수록 진해지는 수채 느낌)
  const areaSvg = shapes.filter((shape) => shape.type === "area").map((shape) => {
    const pointsAttr = shape.coords.map((p) => {
      const { x, y } = project(p)
      return `${x},${y}`
    }).join(" ")
    return `<polygon points="${pointsAttr}" fill="${tint}" fill-opacity="0.14"/>`
  }).join("")

  // 길: 부드러운 곡선
  const routeSvg = shapes.filter((shape) => shape.type === "route").map((shape) => {
    const path = smoothPath(shape.coords.map(project))
    return `<path d="${path}" fill="none" stroke="${tint}" stroke-opacity="0.55" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`
  }).join("")

  // 동선: 핀들을 잇는 점점이 곡선 (길이 이미 있으면 생략해 덜 산만하게)
  const trailSvg = pinPoints.length >= 2 && shapes.every((shape) => shape.type !== "route")
    ? `<path d="${smoothPath(pinPoints)}" fill="none" stroke="${tint}" stroke-opacity="0.4" stroke-width="1.1" stroke-dasharray="0.2 5" stroke-linecap="round"/>`
    : ""

  const { blobs, dots } = renderPinArt(pinPoints, theme)

  return wrapSvg(defs, `${rects}${areaSvg}${blobs}${routeSvg}${trailSvg}${dots}`)
}
