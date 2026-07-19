// 도트형(픽셀 아트) 지도 썸네일 — 실제 지도 이미지 대신 카드 표지에 쓴다.
// 지도 id 로 시드된 결정적 픽셀 지형 + 실제 핀 좌표(있으면)로 빨간 핀을 찍는다.
// 프로토타입 habitat2/mapThumb 이식.

const DEFAULT_W = 280
const DEFAULT_H = 132
const DEFAULT_CELL = 8

function hashSeed(input) {
  const str = String(input || "seed")
  let h = 2166136261
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (Math.abs(h) % 2147483647) || 7
}

// opts.width/height/cell 로 크기를 덮어쓸 수 있다(기본값은 목록 썸네일용 280×132).
// 공유 카드처럼 canvas 로 래스터화하는 곳을 위해 SVG 루트에 명시적 width/height 를 넣는다
// (속성이 없으면 일부 브라우저에서 intrinsic size 가 0 이 되어 drawImage 가 실패한다).
export function generatePixelMapSvg(seedInput, points = [], opts = {}) {
  const W = Math.max(1, Math.round(opts.width || DEFAULT_W))
  const H = Math.max(1, Math.round(opts.height || DEFAULT_H))
  const CELL = Math.max(2, Math.round(opts.cell || DEFAULT_CELL))
  const seed = hashSeed(seedInput)
  let s = seed
  const rand = () => { s = (s * 16807 + 11) % 2147483647; return s / 2147483647 }

  const cols = Math.ceil(W / CELL)
  const rows = Math.ceil(H / CELL)
  let out = `<rect width="${W}" height="${H}" fill="#E7E0CA"/>`
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const v = rand()
      let fill = null
      if (v < 0.12) fill = "#D6CFAF"        // 흙 블록
      else if (v < 0.19) fill = "#C6D6B4"   // 초록
      else if (v < 0.235) fill = "#F4EEDA"  // 밝은 땅
      else if (v < 0.255) fill = "#AFC9E0"  // 물
      if (fill) out += `<rect x="${x * CELL}" y="${y * CELL}" width="${CELL}" height="${CELL}" fill="${fill}"/>`
    }
  }

  // 핀 위치: 실제 좌표가 있으면 정규화 배치, 없으면 시드 랜덤
  const coords = (Array.isArray(points) ? points : [])
    .map((p) => ({ lat: Number(p?.lat), lng: Number(p?.lng) }))
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng) && !(p.lat === 0 && p.lng === 0))

  const pins = []
  if (coords.length >= 1) {
    const lats = coords.map((c) => c.lat)
    const lngs = coords.map((c) => c.lng)
    // 기본: 전체 핀 경계상자(min~max)에 꽉 맞춤.
    // opts.focus: 핀이 가장 몰린 곳(중앙값 ± MAD)으로 프레임을 좁혀 밀집 지역을 확대하고,
    //   멀리 떨어진 핀은 가장자리로 클램프해 "그 너머에도 있음"만 암시. (뚜렷한 밀집일 때만 발동)
    const bounds = (vals) => {
      const s = [...vals].sort((a, b) => a - b)
      const lo0 = s[0]
      const hi0 = s[s.length - 1]
      if (!(opts.focus && coords.length >= 5)) return [lo0, hi0]
      const med = s[(s.length - 1) >> 1]
      const dev = vals.map((v) => Math.abs(v - med)).sort((a, b) => a - b)
      const mad = dev[(dev.length - 1) >> 1]
      const half = mad * 3
      // MAD 창이 전체 범위보다 확실히 좁을 때(=진짜 클러스터)만 확대
      if (half > 0 && half < (hi0 - lo0) / 2) return [med - half, med + half]
      return [lo0, hi0]
    }
    const [latLo, latHi] = bounds(lats)
    const [lngLo, lngHi] = bounds(lngs)
    const spanLat = (latHi - latLo) || 1
    const spanLng = (lngHi - lngLo) || 1
    const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v)
    coords.slice(0, 12).forEach((c) => {
      const nx = coords.length === 1 ? 0.5 : clamp01((c.lng - lngLo) / spanLng)
      const ny = coords.length === 1 ? 0.5 : clamp01((latHi - c.lat) / spanLat)
      const gx = 2 + Math.round(nx * (cols - 5))
      const gy = 1 + Math.round(ny * (rows - 3))
      pins.push({ x: gx * CELL + CELL / 2, y: gy * CELL + CELL / 2 })
    })
  } else {
    const count = Math.max(1, Math.min(6, Number(points) || 3))
    let ps = seed + 5
    const prand = () => { ps = (ps * 16807 + 11) % 2147483647; return ps / 2147483647 }
    for (let i = 0; i < count; i += 1) {
      const gx = 2 + Math.floor(prand() * (cols - 4))
      const gy = 1 + Math.floor(prand() * (rows - 2))
      pins.push({ x: gx * CELL + CELL / 2, y: gy * CELL + CELL / 2 })
    }
  }

  for (const p of pins) {
    out += `<rect x="${p.x - 4}" y="${p.y - 4}" width="8" height="8" fill="#E8442E" stroke="#1B1B18" stroke-width="1.6"/>`
    out += `<rect x="${p.x - 1.5}" y="${p.y - 1.5}" width="3" height="3" fill="#FFFDF4"/>`
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" shape-rendering="crispEdges" role="img" aria-label="지도 미리보기" style="width:100%;height:100%;display:block">${out}</svg>`
}
