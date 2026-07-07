import { useEffect, useMemo, useRef, useState } from "react"
import { LocateFixed, Maximize2, RotateCw, X } from "lucide-react"

// 탐색 헤더 픽셀 레이더 — 내 위치 중심으로 주변 추천(행사·공간)을 "탐지"하는 스캔 연출.
// 도트 = 실제 아이템(실좌표를 방위·거리로 배치). 점등된 도트 클릭 → 팝오버 → [카드 보기].
// 스윕은 진입/재탐지 시 2바퀴 돌고 멈춘다(상시 회전은 시선을 계속 뺏음).
// 명령형 캔버스 로직은 훅 밖 팩토리(createRadar)에 두고, React는 오버레이·팝오버만 관리한다.

const CELL = 8
const TERRAIN = ["#D6CFAF", "#C6D6B4", "#F4EEDA", "#AFC9E0"]
const INK = "#1F1A12"
const RED = "#E5493A"
const YELLOW = "#FFD338"
const PAPER = "#FFFDF4"
const TILE = 20 // 이모지 도트 타일 크기(px)
const EMOJI_FONT = '13px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'
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
    W: 0, H: 0, cx: 0, cy: 0, terrain: [], dots: [],
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

    const cols = Math.ceil(w / CELL)
    const rows = Math.ceil(h / CELL)
    let s = st.seed
    const rand = () => { s = (s * 16807 + 11) % 2147483647; return s / 2147483647 }
    const terrain = []
    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < cols; x += 1) {
        const v = rand()
        let f = null
        if (v < 0.10) f = TERRAIN[0]
        else if (v < 0.17) f = TERRAIN[1]
        else if (v < 0.205) f = TERRAIN[2]
        else if (v < 0.225) f = TERRAIN[3]
        if (f) terrain.push([x, y, f])
      }
    }
    st.terrain = terrain

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

  function draw(now) {
    const { W, H, cx, cy } = st
    ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = "#E7E0CA"
    ctx.fillRect(0, 0, W, H)
    for (const t of st.terrain) {
      ctx.fillStyle = t[2]
      ctx.fillRect(t[0] * CELL, t[1] * CELL, CELL, CELL)
    }

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
      const tx = p.x - half
      const ty = p.y - half
      const glow = p.hit ? Math.max(0, 1 - (now - p.hit) / 1100) : 0
      if (p.seen || reduce) {
        // 선택/점등 하이라이트
        if (p === st.selected) {
          const sp = (now / 700) % 1
          ctx.strokeStyle = `rgba(229,73,58,${0.9 * (1 - sp)})`
          ctx.lineWidth = 2
          const sr = half + 3 + sp * 9
          ctx.strokeRect(p.x - sr, p.y - sr, sr * 2, sr * 2)
        }
        if (glow > 0.02 || p === st.selected) {
          ctx.fillStyle = YELLOW
          ctx.fillRect(tx - 2, ty - 2, TILE + 4, TILE + 4)
        }
        // 미니 카드 타일 + 이모지
        ctx.fillStyle = PAPER
        ctx.fillRect(tx, ty, TILE, TILE)
        ctx.strokeStyle = INK
        ctx.lineWidth = 1.6
        ctx.strokeRect(tx, ty, TILE, TILE)
        ctx.font = EMOJI_FONT
        ctx.fillText(p.item.emoji || "📍", p.x, p.y + 1)
      } else {
        // 미탐지 = 흐릿한 빈 슬리브
        ctx.fillStyle = "rgba(31,26,18,0.12)"
        ctx.fillRect(tx + 3, ty + 3, TILE - 6, TILE - 6)
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
