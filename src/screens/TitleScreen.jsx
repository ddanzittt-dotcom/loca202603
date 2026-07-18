import { useEffect, useRef } from "react"
import { PixelWordmark } from "../components/PixelWordmark"
import { drawPixelArtToCanvas, findPixelArt } from "../lib/pixelEmojiCatalog"
import { buildLegalDocumentUrl } from "../lib/appUtils"
import "../styles/title-screen.css"

function openLegalDoc(kind) {
  window.open(buildLegalDocumentUrl(kind), "_blank", "noopener,noreferrer")
}

// LOCA 타이틀 화면 — 고양이 삼총사(검정 로카냥·치즈냥·흰냥)가 큰길을 따라 동쪽으로
// 무한 질주하는 라이브 배경(Dave the Diver 감성). 네트워크 0 · 매번 동일.
// 배경은 손튜닝 쇼케이스 동네를 가로 타일링해 끝없이 이어진다. 시간대 틴트(아침/낮/노을/밤+반딧불).
// "바로 입장하기" → onEnter, "게임으로 동네 탐색하기" → onExploreGame, "로그인" → onLogin.

const WORLD_R = 2200
const TSCALE = 0.4
const RUN_SPEED = 220
const CAT_GAP = 140
const GRASS = "#B7D690", GRASS_ALT = "#AFCF87", PATH = "#E4CFA0", PATH_EDGE = "#D6BE8C"
const POND = "#8FC3E8", POND_CORE = "#A8D2F0", BUSH = "#93BE72"
const INK = "#1F1A12", PAPER = "#FFFDF4", YELLOW = "#FFD338"
const PXFONT = '"DungGeunMo", monospace'
const CATS = [
  { body: "#1F1A12", eye: "#FFFDF4", outline: null },      // 로카냥 (검정)
  { body: "#F2A33C", eye: "#1F1A12", outline: "#1F1A12" }, // 치즈냥 (체다)
  { body: "#FFFDF4", eye: "#1F1A12", outline: "#1F1A12" }, // 흰냥
]
// 큰길 — 베이크 폭(±WORLD_R)과 정확히 만나고 양끝 y 가 같아야 이음새가 없다
const ROAD_PTS = [[-2200, 0], [-1500, 15], [-700, -30], [0, 30], [700, -25], [1500, 20], [2200, 0]]
const BADGES = [[300, -140], [1500, 130], [-1200, -110]]
const FIREFLIES = [[-620, -260], [-420, -420], [300, 120], [660, 480], [-80, 420], [480, -220]]

function roadY(x) {
  const worldW = WORLD_R * 2
  const wx = (((x + WORLD_R) % worldW) + worldW) % worldW - WORLD_R
  for (let i = 0; i < ROAD_PTS.length - 1; i++) {
    const a = ROAD_PTS[i], b = ROAD_PTS[i + 1]
    if (wx >= a[0] && wx <= b[0]) return a[1] + (b[1] - a[1]) * ((wx - a[0]) / (b[0] - a[0]))
  }
  return 0
}
const hash2 = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s) }

function timeTint() {
  const h = new Date().getHours()
  if (h >= 5 && h < 10) return { fill: "rgba(255,214,140,0.14)", night: false }
  if (h >= 10 && h < 17) return { fill: null, night: false }
  if (h >= 17 && h < 20) return { fill: "rgba(255,105,60,0.20)", night: false }
  return { fill: "rgba(22,30,68,0.44)", night: true }
}

export function TitleScreen({ onEnter, onExploreGame, onLogin }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined
    const ctx = canvas.getContext("2d")
    const reduce = Boolean(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches)
    const tree = findPixelArt("px-tree"), house = findPixelArt("px-house")
    const st = { W: 0, H: 0, dist: 0, cam: { x: 0, y: roadY(0) }, zoom: 0.8, dust: [], lastDust: 0, raf: 0, last: 0 }

    function resize() {
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      st.W = canvas.clientWidth; st.H = canvas.clientHeight
      canvas.width = st.W * dpr; canvas.height = st.H * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.imageSmoothingEnabled = false
    }
    window.addEventListener("resize", resize)

    // 쇼케이스 동네 지형 데이터 (미터 좌표, 가로 타일링 전제: 좌우 끝 y 일치)
    const showcase = {
      roads: [
        { c: ROAD_PTS, major: true },
        { c: [[-60, -1500], [-30, -500], [10, 200], [-20, 900], [10, 1500]], major: false },
        { c: [[-2200, 560], [-1000, 600], [-300, 520], [300, 640], [1000, 560], [2200, 560]], major: false },
        { c: [[-2200, -720], [-1100, -700], [-350, -650], [250, -760], [1000, -700], [2200, -720]], major: false },
        { c: [[620, -25], [612, 250], [622, 600]], major: false },
      ],
      streams: [[[-2200, 300], [-1400, 520], [-600, 380], [200, 140], [900, -60], [1600, 120], [2200, 300]]],
      waters: [(() => { const p = []; for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2; p.push([640 + Math.cos(a) * 180, 540 + Math.sin(a) * 120]) } return p })()],
      parks: [(() => { const p = []; for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; p.push([-620 + Math.cos(a) * 280, -330 + Math.sin(a) * 220]) } return p })()],
    }

    // 월드(±WORLD_R m)를 오프스크린에 한 번 굽는다 (상·하단 숲 띠 → 가로 반복 이음새 없음)
    function bakeTerrain() {
      const size = Math.round(WORLD_R * 2 * TSCALE)
      const bake = document.createElement("canvas")
      bake.width = size; bake.height = size
      const g = bake.getContext("2d")
      const C = size / 2
      const toB = (pt) => [C + pt[0] * TSCALE, C - pt[1] * TSCALE]
      const trace = (pts) => { g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))) }
      g.fillStyle = GRASS; g.fillRect(0, 0, size, size)
      g.fillStyle = GRASS_ALT
      for (let y = 0; y < size; y += 26) g.fillRect(0, y, size, 13)
      g.fillStyle = BUSH
      for (const p of showcase.parks) { trace(p.map(toB)); g.closePath(); g.fill() }
      g.fillStyle = POND
      for (const p of showcase.waters) { trace(p.map(toB)); g.closePath(); g.fill() }
      g.lineJoin = "round"; g.lineCap = "round"; g.strokeStyle = POND
      for (const p of showcase.streams) { g.lineWidth = 9; trace(p.map(toB)); g.stroke() }
      g.fillStyle = POND_CORE
      for (const p of showcase.waters) {
        const b = p.map(toB); let cx = 0, cy = 0; b.forEach((q) => { cx += q[0]; cy += q[1] }); cx /= b.length; cy /= b.length
        for (let i = 0; i < 4; i++) { const r1 = hash2(cx + i * 17, cy); g.fillRect(cx + (r1 - 0.5) * 60, cy + (hash2(cy, i * 31) - 0.5) * 40, 10 + r1 * 8, 3) }
      }
      for (const pass of [0, 1]) {
        g.strokeStyle = pass === 0 ? PATH_EDGE : PATH
        for (const r of showcase.roads) { g.lineWidth = (r.major ? 8.5 : 5) + (pass === 0 ? 3 : 0); trace(r.c.map(toB)); g.stroke() }
      }
      // 나무·꽃 결정적 산포 (길·물 위 회피)
      const img = g.getImageData(0, 0, size, size)
      const at = (bx, by) => { const i = ((by | 0) * size + (bx | 0)) * 4; return [img.data[i], img.data[i + 1], img.data[i + 2]] }
      const clearFor = (bx, by) => { const c = at(bx, by); return !((c[2] > 190 && c[0] < 190) || (c[0] > 200 && c[1] > 180 && c[2] < 180)) }
      const step = 34
      for (let by = 40; by < size - 40; by += step) for (let bx = 20; bx < size - 20; bx += step) {
        const h = hash2(bx, by); const jx = bx + (h - 0.5) * 26, jy = by + (hash2(by, bx) - 0.5) * 26
        if (h < 0.86 || !clearFor(jx, jy)) continue
        if (h > 0.965) { g.fillStyle = ["#E88AA0", "#F5C24F", "#FFFDF4"][Math.floor(h * 100) % 3]; g.fillRect(jx, jy, 3, 3); g.fillStyle = "#2F6B43"; g.fillRect(jx + 1, jy + 3, 1, 2) }
        else if (house && h > 0.93 && jy > size * 0.4 && jy < size * 0.6) drawPixelArtToCanvas(g, house, jx - 10, jy - 16, 20)
        else if (tree) drawPixelArtToCanvas(g, tree, jx - 8, jy - 12, 17)
      }
      // 상·하단 숲 띠 — 가로 반복 이음새 없음
      if (tree) for (let bx = 6; bx < size - 6; bx += 24) for (const edge of [0, 1]) for (let row = 0; row < 4; row++) {
        const h = hash2(bx * (edge ? 7 : 13), row * 31)
        if (h < 0.3) continue
        const by = edge ? size - 24 - row * 24 - h * 12 : 10 + row * 24 + h * 12
        drawPixelArtToCanvas(g, tree, bx - 8 + (h - 0.5) * 10, by, row === 1 ? 19 : 17)
      }
      return bake
    }
    const bake = bakeTerrain()

    const w2s = (wx, wy) => ({ x: st.W / 2 + (wx - st.cam.x) * st.zoom, y: st.H / 2 - (wy - st.cam.y) * st.zoom })
    const wrapCam = (x) => x + Math.round((st.cam.x - x) / (WORLD_R * 2)) * (WORLD_R * 2)

    function drawTerrain() {
      ctx.fillStyle = GRASS; ctx.fillRect(0, 0, st.W, st.H)
      const worldW = WORLD_R * 2
      const tilePx = bake.width * (st.zoom / TSCALE)
      const camLeft = st.cam.x - st.W / 2 / st.zoom
      const k0 = Math.floor((camLeft + WORLD_R) / worldW)
      const syy = st.H / 2 - (WORLD_R - st.cam.y) * st.zoom
      for (let k = k0; k <= k0 + 1; k++) {
        const sxx = st.W / 2 + ((-WORLD_R + k * worldW) - st.cam.x) * st.zoom
        ctx.drawImage(bake, sxx, syy, tilePx, tilePx)
      }
    }
    function drawQBox(p, i, now) {
      const half = 15
      const hop = reduce ? 0 : [0, 0, 0, 0, -7, -3, 0, 0][Math.floor(now / 150 + i * 3) % 8]
      ctx.fillStyle = "rgba(31,26,18,.2)"
      ctx.beginPath(); ctx.ellipse(p.x, p.y + 5, Math.max(4, half - 5), 3, 0, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = INK; ctx.fillRect(p.x - half, p.y - 30 + 2 + hop, 30, 30)
      ctx.fillStyle = YELLOW; ctx.fillRect(p.x - half + 3, p.y - 30 + 5 + hop, 24, 24)
      ctx.fillStyle = INK; ctx.font = "16px " + PXFONT; ctx.textAlign = "center"
      ctx.fillText("?", p.x, p.y - 9 + hop)
    }
    function drawCat(now, sx, sy, colors) {
      const u = 1.35
      const animMs = 80
      ctx.save(); ctx.translate(sx, sy); ctx.translate(-16 * u, -18 * u)
      const bob = [0, -1, 0, -1][Math.floor(now / animMs) % 4] * u
      ctx.fillStyle = "rgba(31,26,18,.22)"
      ctx.beginPath(); ctx.ellipse(16 * u, 20.5 * u, 11 * u, 2.6 * u, 0, 0, Math.PI * 2); ctx.fill()
      const tf = Math.floor(now / (animMs * 2)) % 2
      const legA = Math.floor(now / animMs) % 2 === 0
      const legs = legA ? [6, 12, 17, 22] : [8, 10, 19, 24]
      const body = (col, ox, oy) => {
        ctx.fillStyle = col
        ctx.fillRect(2 * u + ox, (7 + tf) * u + bob + oy, 3 * u, 3 * u)
        ctx.fillRect(ox, (4 + tf) * u + bob + oy, 3 * u, 4 * u)
        ctx.fillRect(1 * u + ox, (2 + tf) * u + bob + oy, 3 * u, 3 * u)
        ctx.fillRect(4 * u + ox, 9 * u + bob + oy, 18 * u, 7 * u)
        ctx.fillRect(17 * u + ox, 6 * u + bob + oy, 9 * u, 9 * u)
        ctx.fillRect(21 * u + ox, 3 * u + bob + oy, 9 * u, 7 * u)
        ctx.beginPath(); ctx.moveTo(21 * u + ox, 4 * u + bob + oy); ctx.lineTo(21 * u + ox, bob + oy); ctx.lineTo(25 * u + ox, 4 * u + bob + oy); ctx.closePath(); ctx.fill()
        ctx.beginPath(); ctx.moveTo(30 * u + ox, 4 * u + bob + oy); ctx.lineTo(30 * u + ox, bob + oy); ctx.lineTo(26 * u + ox, 4 * u + bob + oy); ctx.closePath(); ctx.fill()
        for (const lx of legs) ctx.fillRect(lx * u + ox, 15 * u + bob + oy, 2.6 * u, 5 * u)
      }
      if (colors.outline) for (const [ox, oy] of [[-2, 0], [2, 0], [0, -2], [0, 2]]) body(colors.outline, ox, oy)
      body(colors.body, 0, 0)
      ctx.fillStyle = colors.eye; ctx.fillRect(25 * u, 5 * u + bob, 2 * u, 2 * u)
      ctx.restore()
    }
    function drawDust(now) {
      st.dust = st.dust.filter((d) => now - d.t < 480)
      for (const d of st.dust) {
        const k = (now - d.t) / 480; const p = w2s(d.x, d.y)
        ctx.globalAlpha = 0.45 * (1 - k); ctx.fillStyle = PAPER
        const s = 3 + k * 4; ctx.fillRect(p.x - s / 2, p.y - s / 2 - k * 8, s, s)
      }
      ctx.globalAlpha = 1
    }
    function drawTint(now) {
      const t = timeTint()
      if (t.fill) { ctx.fillStyle = t.fill; ctx.fillRect(0, 0, st.W, st.H) }
      if (!t.night) return
      for (let i = 0; i < FIREFLIES.length; i++) {
        const f = FIREFLIES[i]
        const wob = reduce ? 0 : 1
        const p = w2s(wrapCam(f[0]) + Math.sin(now / 900 + i * 7) * 14 * wob, f[1] + Math.cos(now / 700 + i * 3) * 10 * wob)
        if (p.x < 0 || p.x > st.W || p.y < 0 || p.y > st.H) continue
        ctx.globalAlpha = reduce ? 0.8 : 0.35 + 0.65 * Math.abs(Math.sin(now / 450 + i * 1.7))
        ctx.fillStyle = YELLOW; ctx.fillRect(p.x, p.y, 3, 3)
      }
      ctx.globalAlpha = 1
    }

    function frame(now) {
      if (typeof document !== "undefined" && document.hidden) { st.raf = requestAnimationFrame(frame); return }
      const dt = Math.min((now - st.last) / 1000, 0.05) || 0.016
      st.last = now
      st.dist += RUN_SPEED * dt * (reduce ? 0.5 : 1)
      const lead = { x: st.dist, y: roadY(st.dist) }
      // 카메라: 가로 = 행렬 중앙(선두 -100m), 세로 = 로고와 버튼 사이(54.5% 높이)
      const ck = 1 - Math.exp(-6 * dt)
      st.cam.x += (lead.x - 100 - st.cam.x) * ck
      st.cam.y += (lead.y + (0.045 * st.H) / st.zoom - st.cam.y) * ck
      if (now - st.lastDust > 90) {
        st.lastDust = now
        for (let i = 0; i < CATS.length; i++) { const cx = st.dist - i * CAT_GAP; st.dust.push({ x: cx - 16, y: roadY(cx), t: now - i * 40 }) }
      }
      drawTerrain()
      for (let i = 0; i < BADGES.length; i++) {
        const p = w2s(wrapCam(BADGES[i][0]), BADGES[i][1])
        if (p.x > -40 && p.x < st.W + 40 && p.y > -40 && p.y < st.H + 40) drawQBox(p, i, now)
      }
      drawDust(now)
      for (let i = CATS.length - 1; i >= 0; i--) {
        const cx = st.dist - i * CAT_GAP; const p = w2s(cx, roadY(cx))
        drawCat(now + i * 60, p.x, p.y, CATS[i])
      }
      drawTint(now)
      st.raf = requestAnimationFrame(frame)
    }
    resize()
    st.last = performance.now()
    st.raf = requestAnimationFrame(frame)
    return () => { cancelAnimationFrame(st.raf); window.removeEventListener("resize", resize) }
  }, [])

  return (
    <div className="loca-title" role="dialog" aria-modal="true" aria-label="LOCA 시작">
      <canvas ref={canvasRef} className="loca-title__canvas" />
      <div className="loca-title__band">
        <span>NO.000</span><span>LOCAL BINDER</span><span>V.2026.07</span>
      </div>
      <div className="loca-title__stage">
        <PixelWordmark className="loca-title__logo" height={98} />
        <div className="loca-title__menu">
          <button type="button" className="loca-title__btn loca-title__btn--go" onClick={onEnter}>
            <span className="loca-title__blink">▶</span> 바로 입장하기
          </button>
          <button type="button" className="loca-title__btn loca-title__btn--game" onClick={onExploreGame}>
            🐾 게임으로 동네 탐색하기
          </button>
        </div>
        {onLogin ? (
          <button type="button" className="loca-title__login" onClick={onLogin}>
            이미 계정이 있어요 · 로그인
          </button>
        ) : null}
      </div>
      <div className="loca-title__foot">
        <span>© 2026 LOCA · LOCA.IM</span>
        <span aria-hidden="true">·</span>
        <button type="button" className="loca-title__legal" onClick={() => openLegalDoc("terms")}>이용약관</button>
        <span aria-hidden="true">·</span>
        {/* 개인정보보호법 시행령 §31③ — 첫 화면 하단 게재 + 명칭 사용 + 색상으로 타 링크와 구분 */}
        <button type="button" className="loca-title__legal loca-title__legal--privacy" onClick={() => openLegalDoc("privacy")}>개인정보처리방침</button>
      </div>
    </div>
  )
}
