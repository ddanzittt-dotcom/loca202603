import { useEffect, useMemo, useRef, useState } from "react"
import { LocateFixed, Maximize2, RotateCw, X } from "lucide-react"

// 탐색 헤더 픽셀 레이더 — 내 위치 중심으로 주변 추천(행사·공간)을 "탐지"하는 스캔 연출.
// 도트 = 실제 아이템(실좌표를 방위·거리로 배치). 점등된 도트 클릭 → 팝오버 → [카드 보기].
// 스윕은 진입/재탐지 시 2바퀴 돌고 멈춘다(상시 회전은 시선을 계속 뺏음).
// 명령형 캔버스 로직은 훅 밖 팩토리(createRadar)에 두고, React는 오버레이·팝오버만 관리한다.

const CELL = 8
const INK = "#1F1A12"
const RED = "#E5493A"
const YELLOW = "#FFD338"
const PAPER = "#FFFDF4"
// 오버월드(포켓몬 필드맵) 팔레트 — 잔디 / 흙길 / 연못 / 나무 / 풀숲
const GRASS = "#B7D690"
const GRASS_ALT = "#AFCF87" // 깎은 잔디 결 (줄무늬)
const FIELD = "#A9C981" // 밭/풀 패치 (구 블록 음영)
const PATH = "#E4CFA0" // 흙길
const PATH_EDGE = "#D6BE8C"
const POND = "#8FC3E8"
const POND_CORE = "#A8D2F0"
const TREE_LEAF = "#4E7A46"
const TREE_LEAF_HI = "#5C8C50"
const TREE_TRUNK = "#7A5A38"
const BUSH = "#93BE72" // 키큰 풀숲 바탕
const TILE = 20 // 이모지 마커 간격 기준(px)
const EMOJI_FONT = '16px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'
const LABEL_FONT = '9px "DungGeunMo", monospace'
// 거리 링 후보 값(km) — 자동 줌 범위에 맞는 "예쁜 숫자"를 고른다
const RING_STEPS = [0.5, 1, 2, 3, 5, 10, 15, 20, 30]
const WEDGE = 0.72
const MAX_LAPS = 2
const HIT_RADIUS = 18

function hashSeed(input) {
  const str = String(input || "seed")
  let h = 2166136261
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (Math.abs(h) % 2147483647) || 7
}

function angDiff(a, b) {
  let d = a - b
  while (d > Math.PI) d -= Math.PI * 2
  while (d < -Math.PI) d += Math.PI * 2
  return d
}

function createRadar(canvas, { onCount, onDot, maxDots = 30 }) {
  const ctx = canvas.getContext("2d")
  const reduce = Boolean(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches)
  const st = {
    W: 0, H: 0, cx: 0, cy: 0, map: null, rings: [], dots: [],
    sweep: -Math.PI / 2, laps: 0, sweeping: false, last: 0, selected: null,
    items: [], location: null, seed: 7, count: -1, revealed: false, maxDots,
  }
  let raf = 0

  function build() {
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const w = canvas.clientWidth || 320
    const h = canvas.clientHeight || 150
    canvas.width = w * dpr
    canvas.height = h * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    st.W = w
    st.H = h
    st.cx = Math.round(w / 2 / CELL) * CELL + CELL / 2
    st.cy = Math.round(h / 2 / CELL) * CELL + CELL / 2

    // 오버월드 배경 — 흙길/풀 패치/풀숲/연못/나무 경계 (시드 결정적, 실제 지리는 아님)
    let s = st.seed
    const rand = () => { s = (s * 16807 + 11) % 2147483647; return s / 2147483647 }
    const hCount = 1 + Math.floor(rand() * 2) // 흙길은 도로보다 성기게 (1~2개)
    const vCount = 1 + Math.floor(rand() * 2)
    const hRoads = []
    const vRoads = []
    for (let i = 0; i < hCount; i += 1) hRoads.push(Math.round(((i + 0.5 + rand() * 0.55) / (hCount + 0.6)) * h))
    for (let i = 0; i < vCount; i += 1) vRoads.push(Math.round(((i + 0.5 + rand() * 0.55) / (vCount + 0.6)) * w))
    hRoads.sort((a, b) => a - b)
    vRoads.sort((a, b) => a - b)
    // 밭/풀 패치 — 길로 나뉜 칸 일부만 톤 다운 (경작지 느낌)
    const xs = [0, ...vRoads, w]
    const ys = [0, ...hRoads, h]
    const blocks = []
    for (let yi = 0; yi < ys.length - 1; yi += 1) {
      for (let xi = 0; xi < xs.length - 1; xi += 1) {
        if (rand() < 0.3) blocks.push([xs[xi] + 8, ys[yi] + 8, xs[xi + 1] - xs[xi] - 16, ys[yi + 1] - ys[yi] - 16])
      }
    }
    // 키큰 풀숲 1~2곳 (풀잎 삼각형 tuft 위치까지 미리 계산)
    const bushes = []
    for (let i = 0; i < 2; i += 1) {
      if (rand() < 0.8) {
        const bx = rand() * (w - 100) + 24
        const by = rand() * (h - 80) + 24
        const bw = 46 + rand() * 40
        const bh = 30 + rand() * 24
        const tufts = []
        const n = 4 + Math.floor(rand() * 4)
        for (let t = 0; t < n; t += 1) tufts.push([bx + 6 + rand() * (bw - 18), by + 4 + rand() * (bh - 14)])
        bushes.push({ x: bx, y: by, w: bw, h: bh, tufts })
      }
    }
    // 연못 — 코너 하나에 둥근 물
    const pondCorner = Math.floor(rand() * 4)
    const pond = rand() < 0.85
      ? {
        w: Math.min(104, w * 0.24),
        h: Math.min(72, h * 0.36),
        corner: pondCorner,
      }
      : null
    // 나무 경계 — 상/하단 줄 + 좌/우 기둥 (위치·크기 지터 고정)
    const trees = []
    for (let x = 4; x < w - 14; x += 20 + Math.floor(rand() * 6)) {
      trees.push([x, 2 + rand() * 4])
      trees.push([x + 8, h - 18 + rand() * 3])
    }
    for (let y = 24; y < h - 30; y += 26 + Math.floor(rand() * 8)) {
      trees.push([2 + rand() * 3, y])
      trees.push([w - 15 + rand() * 2, y])
    }
    // 꽃 포인트 2~4개
    const flowers = []
    const fn = 2 + Math.floor(rand() * 3)
    for (let i = 0; i < fn; i += 1) flowers.push([20 + rand() * (w - 40), 24 + rand() * (h - 48), rand() < 0.5 ? "🌼" : "🌷"])
    st.map = { hRoads, vRoads, blocks, bushes, pond, trees, flowers }

    const loc = st.location || { lat: 37.5665, lng: 126.978 }
    const cosLat = Math.cos((loc.lat * Math.PI) / 180) || 1
    const spanX = w * 0.44
    const spanY = h * 0.42
    const pool = st.items.slice(0, st.maxDots)
    // 자동 줌 — 가장 먼 도트를 기준으로 정규화해 행사·공간·생물이 거리와 무관하게 모두 보이게.
    // sqrt 스케일로 가까운 것들도 중앙에 뭉치지 않고 퍼진다.
    const dists = pool.map((i) => (Number.isFinite(i.distKm) ? i.distKm : null)).filter((v) => v != null)
    // 3~30km 범위로 자동 줌 — 아주 먼 행사 1개가 나머지를 중앙에 뭉치게 하지 않도록 상한 30km
    const maxDist = Math.min(30, Math.max(3, ...(dists.length ? dists : [5])))
    // 거리 링 — 자동 줌 범위에 맞는 "예쁜 숫자" 2개 (안쪽/바깥쪽)
    const rOf = (d) => Math.sqrt(Math.min(1, d / maxDist)) * 0.92 + 0.06
    const pickStep = (target) => RING_STEPS.reduce((best, v) => (Math.abs(v - target) < Math.abs(best - target) ? v : best), RING_STEPS[0])
    st.rings = [...new Set([pickStep(maxDist * 0.3), pickStep(maxDist * 0.85)])]
      .filter((km) => km <= maxDist * 1.05)
      .map((km) => ({ km, rx: spanX * rOf(km), ry: spanY * rOf(km) }))
    st.dots = pool.map((item) => {
      const east = (item.lng - loc.lng) * cosLat
      const north = item.lat - loc.lat
      const angGeo = Math.atan2(-north, east) // 화면 y는 아래로 → 북쪽이 위
      const ratio = Math.min(1, (Number.isFinite(item.distKm) ? item.distKm : maxDist) / maxDist)
      const rRatio = Math.sqrt(ratio) * 0.92 + 0.06
      let x = st.cx + Math.cos(angGeo) * spanX * rRatio
      let y = st.cy + Math.sin(angGeo) * spanY * rRatio
      x = Math.max(CELL, Math.min(w - CELL, x))
      y = Math.max(CELL, Math.min(h - CELL, y))
      // 이미 탐지가 끝난 상태(리사이즈·확대 등)면 재배치 후에도 점등 유지
      return { x, y, ang: 0, item, seen: st.revealed, hit: 0 }
    })

    // 이모지 타일이 겹치지 않게 살짝 밀어내기 (n≤18, 몇 번만)
    const minGap = TILE + 4
    const dots = st.dots
    for (let pass = 0; pass < 6; pass += 1) {
      for (let i = 0; i < dots.length; i += 1) {
        for (let j = i + 1; j < dots.length; j += 1) {
          const a = dots[i]
          const b = dots[j]
          const dx = b.x - a.x
          const dy = b.y - a.y
          const dist = Math.hypot(dx, dy) || 0.01
          if (dist < minGap) {
            const push = (minGap - dist) / 2
            const ux = dx / dist
            const uy = dy / dist
            a.x -= ux * push; a.y -= uy * push
            b.x += ux * push; b.y += uy * push
          }
        }
      }
      for (const d of dots) {
        d.x = Math.max(TILE, Math.min(w - TILE, d.x))
        d.y = Math.max(TILE, Math.min(h - TILE, d.y))
      }
    }
    // 스윕 점등 판정용 각도는 최종 위치 기준
    for (const d of dots) d.ang = Math.atan2(d.y - st.cy, d.x - st.cx)
  }

  function emitCount() {
    const seen = st.dots.filter((d) => d.seen).length
    if (seen !== st.count) { st.count = seen; onCount(seen) }
  }

  function drawTree(x, y) {
    ctx.fillStyle = TREE_TRUNK
    ctx.fillRect(x + 4, y + 10, 4, 5)
    ctx.fillStyle = TREE_LEAF_HI
    ctx.beginPath()
    ctx.arc(x + 2.5, y + 8, 4, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.arc(x + 9.5, y + 8, 4, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = TREE_LEAF
    ctx.beginPath()
    ctx.arc(x + 6, y + 5.5, 5.5, 0, Math.PI * 2)
    ctx.fill()
  }

  function drawPond(w, h, pond) {
    // 코너 배치 — 0:우상 1:우하 2:좌하 3:좌상 (나무 경계 안쪽)
    const m = 18
    const px = pond.corner === 0 || pond.corner === 1 ? w - pond.w - m : m
    const py = pond.corner === 0 || pond.corner === 3 ? m + 4 : h - pond.h - m
    const rr = (x, y, rw, rh, r, fill) => {
      ctx.fillStyle = fill
      ctx.beginPath()
      ctx.moveTo(x + r, y)
      ctx.arcTo(x + rw, y, x + rw, y + rh, r)
      ctx.arcTo(x + rw, y + rh, x, y + rh, r)
      ctx.arcTo(x, y + rh, x, y, r)
      ctx.arcTo(x, y, x + rw, y, r)
      ctx.closePath()
      ctx.fill()
    }
    rr(px, py, pond.w, pond.h, 14, POND)
    rr(px + 8, py + 8, pond.w - 16, pond.h - 16, 10, POND_CORE)
    ctx.fillStyle = "rgba(255,253,244,0.7)"
    ctx.fillRect(px + pond.w * 0.24, py + pond.h * 0.3, 12, 3)
    ctx.fillRect(px + pond.w * 0.55, py + pond.h * 0.58, 8, 3)
  }

  function draw(now) {
    const { W, H, cx, cy } = st
    ctx.clearRect(0, 0, W, H)
    // 잔디 바탕 + 깎은 결 줄무늬
    ctx.fillStyle = GRASS
    ctx.fillRect(0, 0, W, H)
    ctx.fillStyle = GRASS_ALT
    for (let y = 16; y < H; y += 32) ctx.fillRect(0, y, W, 16)
    const map = st.map
    if (map) {
      // 밭 패치 → 풀숲 → 연못 → 흙길 → 꽃 → 나무 경계 순서
      ctx.fillStyle = FIELD
      for (const b of map.blocks) ctx.fillRect(b[0], b[1], b[2], b[3])
      for (const bush of map.bushes) {
        ctx.fillStyle = BUSH
        ctx.fillRect(bush.x, bush.y, bush.w, bush.h)
        ctx.fillStyle = TREE_LEAF
        for (const t of bush.tufts) {
          ctx.beginPath()
          ctx.moveTo(t[0], t[1] + 9)
          ctx.lineTo(t[0] + 3, t[1])
          ctx.lineTo(t[0] + 6, t[1] + 9)
          ctx.closePath()
          ctx.fill()
        }
      }
      if (map.pond) drawPond(W, H, map.pond)
      for (const y of map.hRoads) {
        ctx.fillStyle = PATH_EDGE
        ctx.fillRect(0, y - 6, W, 12)
        ctx.fillStyle = PATH
        ctx.fillRect(0, y - 5, W, 10)
      }
      for (const x of map.vRoads) {
        ctx.fillStyle = PATH_EDGE
        ctx.fillRect(x - 6, 0, 12, H)
        ctx.fillStyle = PATH
        ctx.fillRect(x - 5, 0, 10, H)
      }
      ctx.font = '9px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      for (const f of map.flowers) ctx.fillText(f[2], f[0], f[1])
      for (const t of map.trees) drawTree(t[0], t[1])
    }

    // 거리 링 + km 라벨 — 축척 직관
    ctx.setLineDash([4, 4])
    ctx.strokeStyle = "rgba(31,26,18,0.32)"
    ctx.lineWidth = 1.2
    for (const ring of st.rings) {
      ctx.beginPath()
      ctx.ellipse(cx, cy, ring.rx, ring.ry, 0, 0, Math.PI * 2)
      ctx.stroke()
    }
    ctx.setLineDash([])
    ctx.font = LABEL_FONT
    ctx.textAlign = "left"
    ctx.textBaseline = "middle"
    for (const ring of st.rings) {
      const label = `${ring.km}km`
      const lx = cx + ring.rx * 0.72
      const ly = cy - ring.ry * 0.72
      ctx.strokeStyle = PAPER
      ctx.lineWidth = 3
      ctx.strokeText(label, lx, ly)
      ctx.fillStyle = "#55523F"
      ctx.fillText(label, lx, ly)
    }

    // 나침반 N (상단 중앙)
    ctx.fillStyle = RED
    ctx.beginPath()
    ctx.moveTo(cx, 5)
    ctx.lineTo(cx - 4, 13)
    ctx.lineTo(cx + 4, 13)
    ctx.closePath()
    ctx.fill()
    ctx.font = LABEL_FONT
    ctx.textAlign = "center"
    ctx.strokeStyle = PAPER
    ctx.lineWidth = 3
    ctx.strokeText("N", cx, 20)
    ctx.fillStyle = INK
    ctx.fillText("N", cx, 20)

    // 내 위치 펄스 (DOM 고양이 발밑)
    ctx.fillStyle = "rgba(255,211,56,0.4)"
    ctx.beginPath()
    ctx.arc(cx, cy, 13, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = RED
    ctx.strokeStyle = INK
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.arc(cx, cy, 3.5, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()

    if (st.sweeping) {
      const cols = Math.ceil(W / CELL)
      const rows = Math.ceil(H / CELL)
      ctx.fillStyle = "rgba(255,211,56,0.36)"
      for (let y = 0; y < rows; y += 1) {
        for (let x = 0; x < cols; x += 1) {
          const a = Math.atan2(y * CELL + CELL / 2 - cy, x * CELL + CELL / 2 - cx)
          const d0 = angDiff(st.sweep, a)
          if (d0 >= 0 && d0 < WEDGE) {
            ctx.globalAlpha = 0.18 + (1 - d0 / WEDGE) * 0.34
            ctx.fillRect(x * CELL, y * CELL, CELL, CELL)
          }
        }
      }
      ctx.globalAlpha = 1
      ctx.strokeStyle = RED
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.lineTo(cx + Math.cos(st.sweep) * W, cy + Math.sin(st.sweep) * W)
      ctx.stroke()
    }

    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    for (const p of st.dots) {
      const half = TILE / 2
      const glow = p.hit ? Math.max(0, 1 - (now - p.hit) / 1100) : 0
      if (p.seen || reduce) {
        // 선택 = 붉은 원형 파문
        if (p === st.selected) {
          const sp = (now / 700) % 1
          ctx.strokeStyle = `rgba(229,73,58,${0.9 * (1 - sp)})`
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.arc(p.x, p.y, half + 3 + sp * 9, 0, Math.PI * 2)
          ctx.stroke()
        }
        // 점등 직후/선택 = 노란 광원
        if (glow > 0.02 || p === st.selected) {
          ctx.fillStyle = `rgba(255,211,56,${Math.max(glow, p === st.selected ? 0.6 : 0)})`
          ctx.beginPath()
          ctx.arc(p.x, p.y, half + 3, 0, Math.PI * 2)
          ctx.fill()
        }
        // 네모틀 없이 이모지를 지도 위에 바로 — 가독용 소프트 헤일로만
        ctx.fillStyle = "rgba(255,253,244,0.66)"
        ctx.beginPath()
        ctx.arc(p.x, p.y, half - 0.5, 0, Math.PI * 2)
        ctx.fill()
        ctx.font = EMOJI_FONT
        ctx.fillText(p.item.emoji || "📍", p.x, p.y + 1)
      } else {
        // 미탐지 = 흐릿한 점
        ctx.fillStyle = "rgba(31,26,18,0.15)"
        ctx.beginPath()
        ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2)
        ctx.fill()
      }
    }
    // 중심(나)은 DOM 고양이가 표시한다 — 캔버스엔 그리지 않음
  }

  function alive(now) {
    return st.sweeping || st.selected || st.dots.some((d) => d.hit && now - d.hit < 1200)
  }

  function frame(now) {
    if (st.sweeping) {
      const dt = Math.min(48, now - st.last || 16)
      st.last = now
      st.sweep += dt * 0.0021
      if (st.sweep > Math.PI * 1.5) { st.sweep -= Math.PI * 2; st.laps += 1 }
      for (const d of st.dots) {
        const diff = angDiff(st.sweep, d.ang)
        if (diff >= 0 && diff < WEDGE && (!d.hit || now - d.hit > 1600)) {
          d.hit = now
          d.seen = true
        }
      }
      emitCount()
      if (st.laps >= MAX_LAPS) { st.sweeping = false; st.revealed = true }
    }
    draw(now)
    if (alive(now)) {
      raf = requestAnimationFrame(frame)
    } else {
      raf = 0
      draw(now)
    }
  }

  function kick() {
    if (!raf) raf = requestAnimationFrame(frame)
  }

  function dotAt(mx, my) {
    let best = null
    let bd = HIT_RADIUS
    for (const p of st.dots) {
      if (!(p.seen || reduce)) continue
      const d = Math.hypot(mx - p.x, my - p.y)
      if (d < bd) { bd = d; best = p }
    }
    return best
  }

  function onMove(event) {
    const rect = canvas.getBoundingClientRect()
    canvas.style.cursor = dotAt(event.clientX - rect.left, event.clientY - rect.top) ? "pointer" : "default"
  }

  function onClick(event) {
    const rect = canvas.getBoundingClientRect()
    const hit = dotAt(event.clientX - rect.left, event.clientY - rect.top)
    st.selected = hit || null
    onDot(hit ? { item: hit.item, x: hit.x, y: hit.y, W: st.W, H: st.H } : null)
    kick()
  }

  canvas.addEventListener("pointermove", onMove)
  canvas.addEventListener("click", onClick)

  const ro = typeof ResizeObserver !== "undefined"
    ? new ResizeObserver(() => { build(); if (!raf) draw(performance.now()) })
    : null
  if (ro) ro.observe(canvas)

  return {
    setData(items, location, seed) {
      st.items = Array.isArray(items) ? items : []
      st.location = location || null
      st.seed = seed
      st.selected = null
      onDot(null)
      // 스윕 없이 바로 보여주는 경우(reduce/빈 데이터)면 revealed=true 로 두고 빌드
      st.revealed = reduce || st.items.length === 0
      build()
      st.count = -1
      if (reduce || st.dots.length === 0) {
        st.sweeping = false
        st.dots.forEach((d) => { d.seen = true })
        emitCount()
        draw(performance.now())
      } else {
        st.sweep = -Math.PI / 2
        st.laps = 0
        st.sweeping = true
        st.last = performance.now()
        emitCount()
        kick()
      }
    },
    clearSelection() { st.selected = null; kick() },
    destroy() {
      if (raf) cancelAnimationFrame(raf)
      canvas.removeEventListener("pointermove", onMove)
      canvas.removeEventListener("click", onClick)
      if (ro) ro.disconnect()
    },
  }
}

export function PixelRadar({
  items = [],
  location,
  label = "내 위치 주변",
  hasLocation = false,
  locating = false,
  maxDots = 30,
  expanded = false,
  onLocate,
  onReload,
  onSelect,
  onExpand,
  onClose,
}) {
  const canvasRef = useRef(null)
  const radarRef = useRef(null)
  const [count, setCount] = useState(0)
  const [popover, setPopover] = useState(null) // {item, x, y, flip}

  const signature = useMemo(() => (
    `${location?.lat},${location?.lng}|${items.map((it) => it.id).join(",")}`
  ), [items, location])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined
    const radar = createRadar(canvas, {
      maxDots,
      onCount: setCount,
      onDot: (info) => {
        if (!info) { setPopover(null); return }
        const pw = 180
        const flip = info.x + 14 + pw > info.W - 6
        setPopover({
          item: info.item,
          x: flip ? info.x - 14 - pw : info.x + 14,
          y: Math.max(6, Math.min(info.H - 78, info.y - 16)),
          flip,
        })
      },
    })
    radarRef.current = radar
    return () => { radar.destroy(); radarRef.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    radarRef.current?.setData(items, location, hashSeed(signature))
    // signature 로만 갱신 — items/location 은 signature 에 반영됨
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature])

  return (
    <div className={`xradar${expanded ? " xradar--expanded" : ""}`} aria-label="주변 탐지 레이더">
      <canvas ref={canvasRef} className="xradar__canvas" />
      {onClose ? (
        <button type="button" className="xradar__close" onClick={onClose} aria-label="레이더 닫기">
          <X size={16} strokeWidth={2.5} />
        </button>
      ) : null}
      <span className="xradar__cat" aria-hidden="true">
        <span className="xradar__cat-inner">
          <svg className="xradar__cat-svg" viewBox="0 0 32 22" xmlns="http://www.w3.org/2000/svg">
            <g className="cat-tail" fill="#1F1A12">
              <rect x="2" y="7" width="3" height="3" />
              <rect x="0" y="4" width="3" height="4" />
              <rect x="1" y="2" width="3" height="3" />
            </g>
            <g fill="#1F1A12">
              <rect x="4" y="9" width="18" height="7" rx="2" />
              <rect x="17" y="6" width="9" height="9" rx="2" />
              <rect x="21" y="3" width="9" height="7" rx="1.5" />
              <path d="M21 4 L21 0 L25 4 Z" />
              <path d="M30 4 L30 0 L26 4 Z" />
            </g>
            <rect x="25" y="5" width="2" height="2" fill="#FFFDF4" />
            <g className="cat-legs cat-legs--a" fill="#1F1A12">
              <rect x="6" y="15" width="2.6" height="5" /><rect x="12" y="15" width="2.6" height="5" />
              <rect x="17" y="15" width="2.6" height="5" /><rect x="22" y="15" width="2.6" height="5" />
            </g>
            <g className="cat-legs cat-legs--b" fill="#1F1A12">
              <rect x="8" y="15" width="2.6" height="5" /><rect x="10" y="15" width="2.6" height="5" />
              <rect x="19" y="15" width="2.6" height="5" /><rect x="24" y="15" width="2.6" height="5" />
            </g>
          </svg>
        </span>
      </span>
      <div className="xradar__overlay">
        <button
          type="button"
          className={`xradar__loc${hasLocation ? " is-set" : ""}`}
          onClick={onLocate}
          disabled={locating}
        >
          <LocateFixed size={13} strokeWidth={2.4} aria-hidden="true" />
          {locating ? "위치 찾는 중…" : label}
        </button>
        <div className="xradar__right">
          <span className="xradar__detect">주변 <b>{count}</b>곳 탐지</span>
          {onExpand ? (
            <button type="button" className="xradar__reload" onClick={onExpand} aria-label="지도 크게 보기">
              <Maximize2 size={13} strokeWidth={2.4} />
            </button>
          ) : null}
          <button type="button" className="xradar__reload" onClick={onReload} aria-label="다시 탐지">
            <RotateCw size={13} strokeWidth={2.4} />
          </button>
        </div>
      </div>

      {popover ? (
        <div
          className={`xradar__pop${popover.flip ? " flip" : ""}`}
          style={{ left: `${popover.x}px`, top: `${popover.y}px` }}
        >
          <b>{popover.item.title}</b>
          <span>
            {popover.item.type === "event" ? "행사" : (popover.item.category || "공간")}
            {Number.isFinite(popover.item.distKm) ? ` · ${popover.item.distKm}km` : ""}
          </span>
          <div className="xradar__pop-actions">
            <button
              type="button"
              className="xradar__pop-view"
              onClick={() => {
                const it = popover.item
                radarRef.current?.clearSelection()
                setPopover(null)
                onSelect?.(it)
              }}
            >
              카드 보기
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
