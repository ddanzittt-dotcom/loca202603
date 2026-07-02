// 지도 카드 공용 미니맵 SVG 생성기 (지도 목록 / 프로필 / 탐색 카드에서 공유)
// - 핀은 주황 점, 길은 점선, 영역은 반투명 면으로 그린다
// - theme 색상을 주면 바탕과 길/영역에 살짝 입혀 카드마다 결이 달라진다

const WIDTH = 200
const HEIGHT = 138
const DEFAULT_BG = "#EFE7D4"

function renderGrid() {
  const vertical = [40, 80, 120, 160].map((x) => `<line x1="${x}" y1="0" x2="${x}" y2="${HEIGHT}"/>`).join("")
  const horizontal = [34, 69, 103].map((y) => `<line x1="0" y1="${y}" x2="${WIDTH}" y2="${y}"/>`).join("")
  return `<g stroke="#DDD0B3" stroke-width="0.6">${vertical}${horizontal}</g>`
}

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

function wrapSvg(inner) {
  return `<svg viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">${inner}</svg>`
}

export function generateMiniMapSvg(features = [], options = {}) {
  const theme = sanitizeHexColor(options.theme)
  const emptyLabel = options.emptyLabel || "장소 없음"

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

  const bg = `<rect width="${WIDTH}" height="${HEIGHT}" fill="${DEFAULT_BG}"/>`
    + (theme ? `<rect width="${WIDTH}" height="${HEIGHT}" fill="${theme}" opacity="0.09"/>` : "")
  const grid = renderGrid()

  const allCoords = [
    ...pins.map((pin) => ({ lat: Number(pin.lat), lng: Number(pin.lng) })),
    ...shapes.flatMap((shape) => shape.coords),
  ]

  if (allCoords.length === 0) {
    return wrapSvg(`${bg}${grid}<text x="${WIDTH / 2}" y="${HEIGHT / 2 + 4}" text-anchor="middle" font-family="Pretendard, sans-serif" font-size="10" font-weight="700" fill="#8B847A">${emptyLabel}</text>`)
  }

  const minLat = Math.min(...allCoords.map((p) => p.lat))
  const maxLat = Math.max(...allCoords.map((p) => p.lat))
  const minLng = Math.min(...allCoords.map((p) => p.lng))
  const maxLng = Math.max(...allCoords.map((p) => p.lng))
  const latRange = maxLat - minLat
  const lngRange = maxLng - minLng

  // 전부 한 지점에 몰려 있는 경우 — 펄스 점 하나로 표현
  if (latRange < 0.0005 && lngRange < 0.0005 && shapes.length === 0) {
    const countLabel = pins.length > 1
      ? `<text x="${WIDTH / 2}" y="102" text-anchor="middle" font-family="Pretendard, sans-serif" font-size="9" font-weight="700" fill="#4A453E">${pins.length}곳 한 지점</text>`
      : ""
    return wrapSvg(`${bg}${grid}<circle cx="100" cy="69" r="14" fill="#FF6B35" opacity="0.15"/><circle cx="100" cy="69" r="8" fill="#FF6B35" opacity="0.3"/><circle cx="100" cy="69" r="6" fill="white" stroke="#C44518" stroke-width="1"/><circle cx="100" cy="69" r="3.5" fill="#FF6B35"/>${countLabel}`)
  }

  const padding = 18
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

  const shapeColor = theme || "#2D4A3E"
  const shapeSvg = shapes.map((shape) => {
    const pointsAttr = shape.coords.map((p) => {
      const { x, y } = project(p)
      return `${x},${y}`
    }).join(" ")
    if (shape.type === "area") {
      return `<polygon points="${pointsAttr}" fill="${shapeColor}" fill-opacity="0.16" stroke="${shapeColor}" stroke-opacity="0.55" stroke-width="1"/>`
    }
    return `<polyline points="${pointsAttr}" fill="none" stroke="${shapeColor}" stroke-opacity="0.75" stroke-width="1.6" stroke-dasharray="4 3" stroke-linecap="round"/>`
  }).join("")

  const radius = pins.length > 20 ? 3 : pins.length > 10 ? 3.5 : 4.5
  const dots = pins.map((pin) => {
    const { x, y } = project({ lat: Number(pin.lat), lng: Number(pin.lng) })
    return `<circle cx="${x}" cy="${y}" r="${radius}" fill="white" stroke="#C44518" stroke-width="0.8"/><circle cx="${x}" cy="${y}" r="${(radius * 0.62).toFixed(1)}" fill="#FF6B35"/>`
  }).join("")

  return wrapSvg(`${bg}${grid}${shapeSvg}<g>${dots}</g>`)
}
