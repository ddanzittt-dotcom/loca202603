import { useEffect, useRef, useState } from "react"
import { fetchWalkTerrain, fetchWalkWildlife, proceduralTerrain, seedWildlife } from "../lib/walkWorld"
import { triggerSelectionFeedback } from "../lib/haptics"
import "../styles/walk-mode.css"

// 산책 모드 게임 — 내 동네 지형(프록시) 위에서 실제 관측된 동식물을 걸어가 채집.
// 데이터는 /api/terrain · /api/wildlife 프록시로만(walkWorld.js). 캔버스 엔진은 useEffect,
// HUD/목록/바인더/모달은 React state 로 브릿지한다. 상단 탭바(App)는 그대로 위에 뜬다.

const REVEAL_M = 260, COLLECT_M = 80, WALK_SPEED = 46, TSCALE = 0.4, WORLD_R = 2200
const DEFAULT_ORIGIN = { lat: 37.5665, lng: 126.978 } // 서울시청 (데모 기본 위치)
const TAXON_LABEL = { Aves: "새", Plantae: "식물", Mammalia: "포유류", Amphibia: "양서류", Reptilia: "파충류", Actinopterygii: "물고기" }
const GRASS = "#B7D690", GRASS_ALT = "#AFCF87", PATH = "#E4CFA0", PATH_EDGE = "#D6BE8C"
const POND = "#8FC3E8", POND_CORE = "#A8D2F0", BUSH = "#93BE72"
const INK = "#1F1A12", PAPER = "#FFFDF4", RED = "#E5493A", YELLOW = "#FFD338"
const PXFONT = '"DungGeunMo", monospace'

const PAL = {
  ".": null, K: "#1A1A1A", k: "#5C5C5C", W: "#FFFFFF", w: "#F5EDDD",
  R: "#C8431C", r: "#FF6B35", N: "#D7423F", n: "#FF8A87", Y: "#B47912", y: "#F5C24F", L: "#F9E5A8",
  G: "#2F6B43", g: "#74B58A", B: "#3B5B85", b: "#7FA2CC", i: "#B8D2EC",
  P: "#B83F76", p: "#F5A6C4", C: "#6B3D1E", c: "#B07A4A", M: "#2D7A66", m: "#7CC2AE",
}
const SPRITES = {
  bird: ["............", "...bbbb.....", "..biiiib....", ".biiKiiib...", "biiiiiiib...", "biiiiiiibb..", ".biiiiiibb..", "..bbbbbb....", "....r..r....", "............", "............", "............"],
  fish: ["............", "............", "...bbbb.....", "..bbbbbb..B.", ".bKbbbbbb.BB", ".bKbbbbbbBBB", ".bbbbbbbb.BB", "..bbbbbb..B.", "...bbbb.....", "............", "............", "............"],
  dog: ["............", "..C....C....", ".CcC..CcC...", ".CccCCCcC...", ".CccccccC...", ".CcKccKcC...", ".CccccccC...", ".CccnccC....", "..CccccC....", "...CCCC.....", "...C..C.....", "............"],
  flower: ["............", "....p.p.....", "...pPyPp....", "...pPyPp....", "....pyp.....", ".....G......", "..g..G..g...", ".gG..G..Gg..", "..g..G..g...", ".....G......", "....GGG.....", "............"],
  leaf: ["............", "..........G.", ".........GgG", "........Gggg", ".......GgggG", "......Ggggg.", ".....Gggggg.", "....GggGgg..", "...GGgGgg...", "..GggGg.....", ".GgGG.......", "GGG........."],
  tree: ["............", ".....g......", "....ggg.....", "...gGGGg....", "..ggGGGgg...", ".gGGGGGGGg..", "gggGGGGGggg.", ".gGGGGGGGg..", "..gggGGggg..", ".....C......", ".....C......", "....CCC....."],
  mushroom: ["............", "...RRRRRR...", "..RrrrrrrR..", ".RrwwrrwwrR.", ".RrwwrrwwrR.", ".RrrwwrrrrR.", "..RRRRRRRR..", "...wwwwww...", "....wWWw....", "....wWWw....", "....wWWw....", ".....ww....."],
  house: ["............", ".....R......", "....RRR.....", "...RRRRR....", "..RRRRRRR...", ".RRRRRRRRR..", "RWWWWWWWWWR.", "WccwwccccccW", "WccwwccccccW", "WccccccCcccW", "WcccccCCcccW", "WWWWWWCCWWWW"],
  frog: ["............", "..gg....gg..", ".gGGg..gGGg.", ".gGKg..gKGg.", ".gGGggggGGg.", "..gggggggg..", ".gggggggggg.", ".gGgggggggG.", ".gg.gggg.gg.", "..g.g..g.g..", "............", "............"],
  lizard: ["............", "............", "...MM.......", "..MmKM......", "..MmmMMMMM..", "..MMmmmmmM..", "....MmmmM.M.", "....MmmM..M.", "...M.MM.MM..", "...M..M.....", "............", "............"],
  qbox: ["KKKKKKKKKKKK", "KYyyyyyyyyYK", "KyLyyyyyyLyK", "KyyyKKKKyyyK", "KyyKKyyKKyyK", "KyyyyyyKKyyK", "KyyyyKKKyyyK", "KyyyyKKyyyyK", "KyyyyyyyyyyK", "KyyyyKKyyyyK", "KYyyyyyyyyYK", "KKKKKKKKKKKK"],
}
function spriteFor(group, title) {
  if (group === "Aves") return "bird"
  if (group === "Actinopterygii") return "fish"
  if (group === "Mammalia") return "dog"
  if (group === "Amphibia") return "frog"
  if (group === "Reptilia") return "lizard"
  const h = [...String(title)].reduce((a, ch) => a + ch.charCodeAt(0), 0)
  return ["flower", "leaf", "tree", "mushroom"][h % 4]
}
function drawSprite(g, name, x, y, sizePx) {
  const rows = SPRITES[name]
  if (!rows) return
  const cell = Math.max(1, Math.floor(sizePx / 12))
  const ox = x + Math.floor((sizePx - cell * 12) / 2)
  const oy = y + Math.floor((sizePx - cell * 12) / 2)
  for (let yy = 0; yy < 12; yy += 1) for (let xx = 0; xx < 12; xx += 1) {
    const col = PAL[rows[yy][xx]]
    if (!col) continue
    g.fillStyle = col
    g.fillRect(ox + xx * cell, oy + yy * cell, cell, cell)
  }
}
const spriteUrlCache = {}
function spriteUrl(name, size = 30) {
  const key = name + size
  if (spriteUrlCache[key]) return spriteUrlCache[key]
  const c = document.createElement("canvas")
  c.width = size; c.height = size
  drawSprite(c.getContext("2d"), name, 0, 0, size)
  spriteUrlCache[key] = c.toDataURL()
  return spriteUrlCache[key]
}
const hash2 = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s) }
const fmtD = (m) => (m < 1000 ? `${Math.round(m)}m` : `${(m / 1000).toFixed(1)}km`)
const ARROWS = ["→", "↗", "↑", "↖", "←", "↙", "↓", "↘"]
const arrowOf = (dx, dy) => ARROWS[Math.round(((Math.atan2(dy, dx) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 4)) % 8]

export function WalkModeScreen({ onExit, onCollect }) {
  const canvasRef = useRef(null)
  const engineRef = useRef(null)
  const [intro, setIntro] = useState(true)
  const [count, setCount] = useState(0)
  const [total, setTotal] = useState(0)
  const [status, setStatus] = useState("")
  const [nearby, setNearby] = useState([])
  const [collectTarget, setCollectTarget] = useState(null)
  const [modalSpot, setModalSpot] = useState(null)
  const [binder, setBinder] = useState([])
  const [scanning, setScanning] = useState(true)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [panelOpen, setPanelOpen] = useState(true)
  const [atEdge, setAtEdge] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined
    const ctx = canvas.getContext("2d")
    const reduce = Boolean(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches)
    let statusTimer = null
    const flashStatus = (msg, ms = 2600) => { setStatus(msg); clearTimeout(statusTimer); statusTimer = setTimeout(() => setStatus(""), ms) }

    const st = {
      W: 0, H: 0, origin: { ...DEFAULT_ORIGIN },
      player: { x: 0, y: 0 }, vel: { x: 0, y: 0 }, facing: 1, cam: { x: 0, y: 0 },
      moveTarget: null, auto: false, mode: "sim", watchId: null,
      zoom: 0.55, spots: [], collected: 0, activeSpot: null,
      keys: { up: 0, down: 0, left: 0, right: 0 },
      joy: { x: 0, y: 0 }, // 모바일 아날로그 조이스틱 벡터 (|v|≤1, 밀은 정도=속도)
      terrainBake: null, dust: [], lastDust: 0, worldGen: 0,
      loaded: false, loading: false, scan: { sweep: -Math.PI / 2, laps: 0, on: true },
      raf: 0, last: 0, lastUI: 0,
    }
    const mPerLat = 110540
    const mPerLng = () => 111320 * Math.cos((st.origin.lat * Math.PI) / 180)
    const geoToM = (lat, lng) => ({ x: (lng - st.origin.lng) * mPerLng(), y: (lat - st.origin.lat) * mPerLat })
    const dist2 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)
    const w2s = (wx, wy) => ({ x: st.W / 2 + (wx - st.cam.x) * st.zoom, y: st.H / 2 - (wy - st.cam.y) * st.zoom })
    const s2w = (sx, sy) => ({ x: st.cam.x + (sx - st.W / 2) / st.zoom, y: st.cam.y - (sy - st.H / 2) / st.zoom })

    function resize() {
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      st.W = canvas.clientWidth; st.H = canvas.clientHeight
      canvas.width = st.W * dpr; canvas.height = st.H * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.imageSmoothingEnabled = false
    }
    window.addEventListener("resize", resize)

    // ── 지형 베이크 (프록시/절차 생성 데이터 → 오프스크린) ──
    function bakeTerrain(data) {
      const size = Math.round(WORLD_R * 2 * TSCALE)
      const bake = document.createElement("canvas")
      bake.width = size; bake.height = size
      const g = bake.getContext("2d")
      const C = size / 2
      const toB = (pt) => { const m = geoToM(pt[0], pt[1]); return [C + m.x * TSCALE, C - m.y * TSCALE] }
      const trace = (pts) => { g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))) }
      g.fillStyle = GRASS; g.fillRect(0, 0, size, size)
      g.fillStyle = GRASS_ALT
      for (let y = 0; y < size; y += 26) g.fillRect(0, y, size, 13)
      const px = { parks: [], waters: [], streams: [], roads: [] }
      if (data) {
        px.parks = (data.parks || []).map((p) => p.map(toB))
        px.waters = (data.waters || []).map((p) => p.map(toB))
        px.streams = (data.streams || []).map((p) => p.map(toB))
        px.roads = (data.roads || []).map((r) => ({ pts: r.c.map(toB), major: r.major }))
      }
      g.fillStyle = BUSH
      for (const p of px.parks) { trace(p); g.closePath(); g.fill() }
      g.fillStyle = POND
      for (const p of px.waters) { trace(p); g.closePath(); g.fill() }
      g.lineJoin = "round"; g.lineCap = "round"; g.strokeStyle = POND
      for (const p of px.streams) { g.lineWidth = 9; trace(p); g.stroke() }
      g.fillStyle = POND_CORE
      for (const p of px.waters) {
        if (p.length < 3) continue
        let cx = 0, cy = 0; p.forEach((q) => { cx += q[0]; cy += q[1] }); cx /= p.length; cy /= p.length
        for (let i = 0; i < 4; i += 1) { const r1 = hash2(cx + i * 17, cy); g.fillRect(cx + (r1 - 0.5) * 60, cy + (hash2(cy, i * 31) - 0.5) * 40, 10 + r1 * 8, 3) }
      }
      for (const pass of [0, 1]) {
        g.strokeStyle = pass === 0 ? PATH_EDGE : PATH
        for (const r of px.roads) { g.lineWidth = (r.major ? 8.5 : 5) + (pass === 0 ? 3 : 0); trace(r.pts); g.stroke() }
      }
      const img = g.getImageData(0, 0, size, size)
      const at = (bx, by) => { const i = ((by | 0) * size + (bx | 0)) * 4; return [img.data[i], img.data[i + 1], img.data[i + 2]] }
      const clearFor = (bx, by, rad) => {
        for (const [dx, dy] of [[0, 0], [-rad, 0], [rad, 0], [0, -rad], [0, rad]]) {
          const c = at(bx + dx, by + dy)
          if ((c[2] > 190 && c[0] < 190) || (c[0] > 200 && c[1] > 180 && c[2] < 180)) return false
        }
        return true
      }
      let houseCount = 0
      for (const r of px.roads) {
        if (r.major || houseCount > 90) continue
        for (let i = 0; i + 1 < r.pts.length && houseCount <= 90; i += 2) {
          const [x1, y1] = r.pts[i]; const [x2, y2] = r.pts[i + 1]
          const len = Math.hypot(x2 - x1, y2 - y1); if (len < 18) continue
          const h = hash2(x1, y1); if (h < 0.55) continue
          const t = 0.3 + h * 0.4; const nx = -(y2 - y1) / len; const ny = (x2 - x1) / len; const side = h > 0.77 ? 1 : -1
          const bx = x1 + (x2 - x1) * t + nx * 11 * side; const by = y1 + (y2 - y1) * t + ny * 11 * side
          if (bx < 20 || by < 20 || bx > size - 20 || by > size - 20 || !clearFor(bx, by, 9)) continue
          drawSprite(g, "house", bx - 10, by - 16, 20); houseCount += 1
        }
      }
      const step = 34
      for (let by = 20; by < size - 20; by += step) for (let bx = 20; bx < size - 20; bx += step) {
        const h = hash2(bx, by); const jx = bx + (h - 0.5) * 26; const jy = by + (hash2(by, bx) - 0.5) * 26
        const ground = at(jx, jy); const inPark = ground[0] > 130 && ground[0] < 160 && ground[1] > 175
        if (h < (inPark ? 0.55 : 0.86) || !clearFor(jx, jy, 7)) continue
        if (h > 0.965 && !inPark) { g.fillStyle = ["#E88AA0", "#F5C24F", "#FFFDF4"][Math.floor(h * 100) % 3]; g.fillRect(jx, jy, 3, 3); g.fillStyle = "#2F6B43"; g.fillRect(jx + 1, jy + 3, 1, 2) }
        else drawSprite(g, "tree", jx - 8, jy - 12, 17)
      }
      for (let a = 0; a < Math.PI * 2; a += 0.045) {
        const rr = (WORLD_R - 90 - hash2(a * 57, 3) * 70) * TSCALE
        const bx = C + Math.cos(a) * rr; const by = C + Math.sin(a) * rr
        if (hash2(bx, by) < 0.5) drawSprite(g, "tree", bx - 9, by - 13, 19)
      }
      st.terrainBake = bake
    }

    // ── 생물 스팟 로드 (프록시 → 좌표 미터 변환, 실패면 데모 시드) ──
    async function loadSpots(gen) {
      const items = await fetchWalkWildlife(st.origin.lat, st.origin.lng, 2)
      if (gen !== st.worldGen) return
      let spots
      if (items.length) {
        const byTaxon = new Map()
        for (const it of items) {
          if (!Number.isFinite(it.lat) || !Number.isFinite(it.lng)) continue
          const k = it.taxonId || it.title
          const prev = byTaxon.get(k)
          if (!prev || (!prev.photo && it.photo)) byTaxon.set(k, it)
        }
        spots = [...byTaxon.values()].map((it) => {
          const m = geoToM(it.lat, it.lng)
          return { ...it, x: m.x, y: m.y, sprite: spriteFor(it.taxonGroup, it.title), collected: false }
        }).filter((s) => Math.hypot(s.x, s.y) < WORLD_R - 120)
        spots.sort((a, b) => dist2(a, st.player) - dist2(b, st.player))
        spots = spots.slice(0, 24)
      }
      if (!spots || !spots.length) {
        // 데모 시드 — 중심 주변 배치 (좌표도 부여해 카드 등록 가능하게)
        spots = seedWildlife().map((sp, i) => {
          const ang = (i / 10) * Math.PI * 2 + 0.5; const r = 240 + (i % 5) * 260
          const x = Math.cos(ang) * r; const y = Math.sin(ang) * r
          return { ...sp, x, y, lat: st.origin.lat + y / mPerLat, lng: st.origin.lng + x / mPerLng(), sprite: spriteFor(sp.taxonGroup, sp.title), collected: false }
        })
      }
      st.spots = spots
      setTotal(spots.length)
      pushNearby(true)
    }

    async function initWorld() {
      const gen = ++st.worldGen
      st.loading = true; st.loaded = false; st.scan = { sweep: -Math.PI / 2, laps: 0, on: true }
      setScanning(true)
      flashStatus("내 동네를 스캔하는 중…", 6000)
      loadSpots(gen)
      const data = await fetchWalkTerrain(st.origin.lat, st.origin.lng)
      if (gen !== st.worldGen) return
      bakeTerrain(data || proceduralTerrain(st.origin.lat, st.origin.lng))
      st.loaded = true; st.loading = false
      flashStatus(data ? "실제 동네 골목·강·공원이 그려졌어요 🗺" : "지도 서버 연결 전 — 데모 동네로 시작해요")
    }

    // ── 근처 목록을 React 로 push (4/sec) ──
    let lastSig = ""
    function pushNearby(force) {
      const rows = st.spots.filter((s) => !s.collected)
        .map((s) => ({ s, d: dist2(s, st.player) })).sort((a, b) => a.d - b.d).slice(0, 5)
      const sig = rows.map(({ s, d }) => s.id + (d < COLLECT_M) + (d < REVEAL_M) + Math.round(d / 25)).join("|")
      if (!force && sig === lastSig) return
      lastSig = sig
      setNearby(rows.map(({ s, d }) => {
        const known = d < REVEAL_M
        return {
          id: s.id, near: d < COLLECT_M, known,
          title: known ? s.title : `미확인 ${s.category}`,
          place: known && s.place ? s.place : "가까이 가면 정체가 보여요",
          sprite: known ? s.sprite : "qbox",
          arrow: arrowOf(s.x - st.player.x, s.y - st.player.y), dist: fmtD(d),
        }
      }))
    }

    // ── 입력 ──
    const KEY = { ArrowUp: "up", KeyW: "up", ArrowDown: "down", KeyS: "down", ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right" }
    const onKeyDown = (e) => {
      if (st.mode !== "sim") return
      const k = KEY[e.code]
      if (k) { st.keys[k] = 1; st.moveTarget = null; st.auto = false; e.preventDefault() }
    }
    const onKeyUp = (e) => { const k = KEY[e.code]; if (k) st.keys[k] = 0 }
    window.addEventListener("keydown", onKeyDown)
    window.addEventListener("keyup", onKeyUp)
    const onPointerDown = (e) => {
      if (st.mode !== "sim") return
      const r = canvas.getBoundingClientRect()
      st.moveTarget = { ...s2w(e.clientX - r.left, e.clientY - r.top), stamp: performance.now() }
      st.auto = false
    }
    const onWheel = (e) => { e.preventDefault(); st.zoom = Math.min(1.4, Math.max(0.18, st.zoom * (e.deltaY < 0 ? 1.12 : 0.89))) }
    canvas.addEventListener("pointerdown", onPointerDown)
    canvas.addEventListener("wheel", onWheel, { passive: false })

    // 내 동네 지도 스캔 — 실제 위치를 1회 받아 그 동네로 월드를 다시 그린다.
    // 이동은 계속 조이스틱/클릭(sim)으로 — 실제로 걸어다닐 필요 없음.
    function scanMyArea() {
      if (!("geolocation" in navigator)) { flashStatus("이 브라우저는 위치를 지원하지 않아요"); return }
      st.auto = false; st.moveTarget = null
      flashStatus("내 위치로 동네를 스캔하는 중…", 6000)
      navigator.geolocation.getCurrentPosition((pos) => {
        st.origin = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        st.player = { x: 0, y: 0 }; st.cam = { x: 0, y: 0 }; st.terrainBake = null
        initWorld()
      }, () => { flashStatus("위치 권한이 거부돼 기본 동네로 둘게요") }, { timeout: 8000, enableHighAccuracy: true })
    }

    // 여기서 다시 스캔 — 고양이가 서 있는 지점을 새 중심으로 월드를 다시 그린다.
    // 동네 끝(나무 울타리)에 닿았을 때 이어서 탐험하는 용도. 채집 기록(count/binder)은 유지.
    // 좌표는 0.01° 그리드로 스냅돼 서버 엣지 캐시를 그대로 적중한다(walkWorld.js).
    function rescanHere() {
      const lat = st.origin.lat + st.player.y / mPerLat
      const lng = st.origin.lng + st.player.x / mPerLng()
      st.origin = { lat, lng }
      st.player = { x: 0, y: 0 }; st.cam = { x: 0, y: 0 }; st.terrainBake = null
      st.moveTarget = null; st.auto = false
      setAtEdge(false)
      initWorld()
    }

    // ── 채집 ──
    function take(spot) {
      if (!spot || spot.collected) return
      spot.collected = true
      st.collected += 1
      triggerSelectionFeedback()
      setCount(st.collected)
      setBinder((prev) => [...prev, { id: spot.id, no: st.collected, title: spot.title, sprite: spot.sprite }])
      flashStatus(`${spot.title} 채집! 바인더에 담았어요 ✚`)
      pushNearby(true)
    }

    engineRef.current = {
      press(dir, down) { if (st.mode !== "sim") return; st.keys[dir] = down ? 1 : 0; if (down) { st.moveTarget = null; st.auto = false } },
      setJoystick(x, y) { st.joy.x = x; st.joy.y = y; if (x || y) { st.moveTarget = null; st.auto = false } },
      zoomBy(f) { st.zoom = Math.min(1.4, Math.max(0.18, st.zoom * f)) },
      toggleAuto() { st.auto = !st.auto; if (st.auto) { st.moveTarget = null; flashStatus("가장 가까운 생물에게 자동으로 걸어가요") } return st.auto },
      scanMyArea,
      rescanHere,
      listRow(id) {
        const s = st.spots.find((x) => x.id === id); if (!s) return
        setSheetOpen(false)
        st.moveTarget = { x: s.x, y: s.y, stamp: performance.now() }; st.auto = false
      },
      openCollect() { if (st.activeSpot) setModalSpot(st.activeSpot) },
      take,
      autoActive: () => st.auto,
    }

    // ── 렌더 ──
    function drawTerrain() {
      ctx.fillStyle = GRASS; ctx.fillRect(0, 0, st.W, st.H)
      if (!st.terrainBake) return
      const bake = st.terrainBake; const C = bake.width / 2
      const sx = C + (st.cam.x - st.W / 2 / st.zoom) * TSCALE
      const sy = C - (st.cam.y + st.H / 2 / st.zoom) * TSCALE
      ctx.drawImage(bake, sx, sy, (st.W / st.zoom) * TSCALE, (st.H / st.zoom) * TSCALE, 0, 0, st.W, st.H)
    }
    function drawCollectRing(now) {
      const c = w2s(st.player.x, st.player.y)
      ctx.strokeStyle = "rgba(255,77,26,.65)"; ctx.setLineDash([7, 6]); ctx.lineDashOffset = -(now / 90) % 13; ctx.lineWidth = 2
      ctx.beginPath(); ctx.arc(c.x, c.y, COLLECT_M * st.zoom, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([])
      ctx.font = `10px ${PXFONT}`; ctx.textAlign = "left"; ctx.strokeStyle = PAPER; ctx.lineWidth = 3
      const lx = c.x + COLLECT_M * st.zoom * 0.72; const ly = c.y - COLLECT_M * st.zoom * 0.72
      ctx.strokeText("80m", lx, ly); ctx.fillStyle = INK; ctx.fillText("80m", lx, ly)
    }
    function drawTargetFlag(now) {
      if (!st.moveTarget) return
      const p = w2s(st.moveTarget.x, st.moveTarget.y); const t = ((now - st.moveTarget.stamp) / 500) % 1
      ctx.strokeStyle = `rgba(229,73,58,${0.85 * (1 - t)})`; ctx.lineWidth = 2
      ctx.beginPath(); ctx.arc(p.x, p.y, 4 + t * 12, 0, Math.PI * 2); ctx.stroke()
      ctx.fillStyle = RED; ctx.fillRect(p.x - 1, p.y - 14, 2, 14)
      ctx.beginPath(); ctx.moveTo(p.x + 1, p.y - 14); ctx.lineTo(p.x + 10, p.y - 10.5); ctx.lineTo(p.x + 1, p.y - 7); ctx.closePath(); ctx.fill()
    }
    function motion(kind, phase, now) {
      const step = Math.floor(now / 130) + phase
      if (kind === "hop") { return { dy: [0, 0, 0, 0, -4, -1, 0, 0][step % 8] } }
      if (kind === "sway") { return { dy: [0, -1, 0, -1][Math.floor(now / 300 + phase) % 4] } }
      return { dy: [0, -2, -3, -2][step % 4] }
    }
    function drawQBox(p, i, now) {
      const half = 13
      const hop = reduce ? 0 : [0, 0, 0, 0, -6, -3, 0, 0][Math.floor(now / 150 + i * 3) % 8]
      ctx.fillStyle = "rgba(31,26,18,.2)"; ctx.beginPath(); ctx.ellipse(p.x, p.y + 5, Math.max(4, half - 5), 3, 0, 0, Math.PI * 2); ctx.fill()
      drawSprite(ctx, "qbox", p.x - half, p.y - 26 + 2 + hop, 26)
    }
    function drawSpot(s, i, now) {
      const p = w2s(s.x, s.y)
      if (p.x < -50 || p.x > st.W + 50 || p.y < -60 || p.y > st.H + 50) return
      const d = dist2(s, st.player)
      if (s.collected) {
        ctx.globalAlpha = 0.5; ctx.fillStyle = PAPER; ctx.fillRect(p.x - 7, p.y - 7, 14, 14)
        ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.strokeRect(p.x - 7, p.y - 7, 14, 14)
        ctx.strokeStyle = "#2F6B43"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(p.x - 3.5, p.y); ctx.lineTo(p.x - 1, p.y + 3); ctx.lineTo(p.x + 4, p.y - 3.5); ctx.stroke(); ctx.globalAlpha = 1
        return
      }
      const known = d < REVEAL_M; const near = d < COLLECT_M
      if (near) { const t = (now / 600) % 1; ctx.fillStyle = `rgba(255,211,56,${0.5 - t * 0.3})`; ctx.beginPath(); ctx.arc(p.x, p.y, 17 + t * 8, 0, Math.PI * 2); ctx.fill() }
      if (known) {
        const mv = motion(s.taxonGroup === "Plantae" ? "sway" : "hop", (i * 3) % 8, now)
        ctx.fillStyle = "rgba(31,26,18,.2)"; ctx.beginPath(); ctx.ellipse(p.x, p.y + 7, 10, 3, 0, 0, Math.PI * 2); ctx.fill()
        drawSprite(ctx, s.sprite, p.x - 14, p.y - 22 + mv.dy, 28)
        const label = s.title.length > 6 ? `${s.title.slice(0, 6)}…` : s.title
        ctx.font = `10px ${PXFONT}`; ctx.textAlign = "center"; ctx.strokeStyle = PAPER; ctx.lineWidth = 3
        ctx.strokeText(label, p.x, p.y + 17); ctx.fillStyle = INK; ctx.fillText(label, p.x, p.y + 17)
      } else drawQBox(p, i, now)
    }
    function drawCat(now) {
      const c = w2s(st.player.x, st.player.y)
      const running = Math.hypot(st.vel.x, st.vel.y) > 1
      const u = 1.35
      ctx.save(); ctx.translate(c.x, c.y); if (st.facing < 0) ctx.scale(-1, 1); ctx.translate(-16 * u, -18 * u)
      // 달리기 — 차분한 4프레임 갤럽 사이클 + 낮은 도약(suspension) 바운스
      const rf = reduce ? 0 : Math.floor(now / 135) % 4
      const bob = running ? [-2, -1, -2, 0][rf] * u : 0
      // 그림자 — 도약 순간(bob 큼) 살짝 작아져 뜬 느낌
      const shW = running ? [0.82, 0.94, 0.82, 1][rf] : 1
      ctx.fillStyle = "rgba(31,26,18,.22)"; ctx.beginPath(); ctx.ellipse(16 * u, 20.5 * u, 11 * u * shW, 2.6 * u, 0, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = INK
      const tf = Math.floor(now / (running ? 90 : 260)) % 2 // 달릴 때 꼬리 빨리 나부낌
      ctx.fillRect(2 * u, (7 + tf) * u + bob, 3 * u, 3 * u); ctx.fillRect(0, (4 + tf) * u + bob, 3 * u, 4 * u); ctx.fillRect(1 * u, (2 + tf) * u + bob, 3 * u, 3 * u)
      ctx.fillRect(4 * u, 9 * u + bob, 18 * u, 7 * u); ctx.fillRect(17 * u, 6 * u + bob, 9 * u, 9 * u); ctx.fillRect(21 * u, 3 * u + bob, 9 * u, 7 * u)
      ctx.beginPath(); ctx.moveTo(21 * u, 4 * u + bob); ctx.lineTo(21 * u, bob); ctx.lineTo(25 * u, 4 * u + bob); ctx.closePath(); ctx.fill()
      ctx.beginPath(); ctx.moveTo(30 * u, 4 * u + bob); ctx.lineTo(30 * u, bob); ctx.lineTo(26 * u, 4 * u + bob); ctx.closePath(); ctx.fill()
      ctx.fillStyle = PAPER; ctx.fillRect(25 * u, 5 * u + bob, 2 * u, 2 * u); ctx.fillStyle = INK
      // 다리 — 갤럽: 뒷다리(꼬리쪽)·앞다리(머리쪽)가 프레임마다 앞뒤로 뻗음
      const gait = running
        ? [[5, 9, 16, 20], [2, 6, 21, 25], [6, 10, 15, 19], [9, 13, 18, 22]][rf]
        : [6, 12, 17, 22]
      const legLen = (running ? [4.5, 6.5, 4.5, 6.5][rf] : 5) * u
      for (const lx of gait) ctx.fillRect(lx * u, 15 * u + bob, 2.6 * u, legLen)
      ctx.restore()
      if (running && now - st.lastDust > 100) { st.lastDust = now; st.dust.push({ x: st.player.x - st.facing * 8, y: st.player.y - 6, t: now }) }
    }
    function drawDust(now) {
      st.dust = st.dust.filter((d) => now - d.t < 480)
      for (const d of st.dust) { const k = (now - d.t) / 480; const p = w2s(d.x, d.y); ctx.globalAlpha = 0.45 * (1 - k); ctx.fillStyle = PAPER; const s = 3 + k * 4; ctx.fillRect(p.x - s / 2, p.y - s / 2 - k * 8, s, s) }
      ctx.globalAlpha = 1
    }
    function drawEdgeArrow(now) {
      const t = st.spots.filter((s) => !s.collected).map((s) => ({ s, d: dist2(s, st.player) })).sort((a, b) => a.d - b.d)[0]
      if (!t) return
      const p = w2s(t.s.x, t.s.y)
      if (p.x > 24 && p.x < st.W - 24 && p.y > 24 && p.y < st.H - 24) return
      const cx = st.W / 2; const cy = st.H / 2; const ang = Math.atan2(p.y - cy, p.x - cx)
      const ex = cx + Math.cos(ang) * (Math.min(st.W, st.H) / 2 - 44); const ey = cy + Math.sin(ang) * (Math.min(st.W, st.H) / 2 - 44)
      const pulse = 1 + Math.sin(now / 240) * 0.12
      ctx.save(); ctx.translate(ex, ey); ctx.rotate(ang); ctx.scale(pulse, pulse)
      ctx.fillStyle = INK; ctx.beginPath(); ctx.moveTo(15, 0); ctx.lineTo(-9, -10); ctx.lineTo(-9, 10); ctx.closePath(); ctx.fill()
      ctx.fillStyle = RED; ctx.beginPath(); ctx.moveTo(11, 0); ctx.lineTo(-6, -7); ctx.lineTo(-6, 7); ctx.closePath(); ctx.fill(); ctx.restore()
      ctx.font = `10px ${PXFONT}`; ctx.textAlign = "center"; ctx.strokeStyle = PAPER; ctx.lineWidth = 3
      ctx.strokeText(fmtD(t.d), ex, ey + 24); ctx.fillStyle = INK; ctx.fillText(fmtD(t.d), ex, ey + 24)
    }
    function drawCompass() {
      ctx.fillStyle = RED; ctx.beginPath(); ctx.moveTo(st.W - 26, st.H - 40); ctx.lineTo(st.W - 31, st.H - 30); ctx.lineTo(st.W - 21, st.H - 30); ctx.closePath(); ctx.fill()
      ctx.font = `10px ${PXFONT}`; ctx.textAlign = "center"; ctx.strokeStyle = PAPER; ctx.lineWidth = 3
      ctx.strokeText("N", st.W - 26, st.H - 20); ctx.fillStyle = INK; ctx.fillText("N", st.W - 26, st.H - 20)
    }
    function drawScan(now, dt) {
      const sc = st.scan; if (!sc.on) return
      sc.sweep += dt * 2.6
      if (sc.sweep > Math.PI * 1.5) { sc.sweep -= Math.PI * 2; sc.laps += 1 }
      if (st.loaded && sc.laps >= 1) { sc.on = false; setScanning(false); return }
      const c = w2s(st.player.x, st.player.y); const R = Math.hypot(st.W, st.H)
      ctx.fillStyle = "rgba(255,211,56,0.15)"; ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.arc(c.x, c.y, R, sc.sweep - 0.8, sc.sweep); ctx.closePath(); ctx.fill()
      ctx.strokeStyle = RED; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(c.x + Math.cos(sc.sweep) * R, c.y + Math.sin(sc.sweep) * R); ctx.stroke()
    }

    function tick(now) {
      if (typeof document !== "undefined" && document.hidden) { st.raf = requestAnimationFrame(tick); return }
      const dt = Math.min((now - st.last) / 1000, 0.1) || 0.016
      st.last = now
      if (st.mode === "sim") {
        // 입력 벡터 ix,iy — 조이스틱(아날로그) 우선, 없으면 키보드, 없으면 자동/클릭 목표(단위벡터)
        let ix = st.joy.x || (st.keys.right - st.keys.left)
        let iy = st.joy.y || (st.keys.up - st.keys.down)
        if (!ix && !iy) {
          let target = null
          if (st.auto) {
            const t = st.spots.filter((s) => !s.collected).map((s) => ({ s, d: dist2(s, st.player) })).sort((a, b) => a.d - b.d)[0]
            if (t) target = t.d > COLLECT_M * 0.55 ? { x: t.s.x, y: t.s.y } : null
            if (t && !target) st.auto = false
          } else if (st.moveTarget) { target = st.moveTarget; if (dist2(target, st.player) < 6) { st.moveTarget = null; target = null } }
          if (target) { const d = dist2(target, st.player); ix = (target.x - st.player.x) / d; iy = (target.y - st.player.y) / d }
        }
        // |v|>1 이면 단위로 정규화(대각선 가속 방지). 조이스틱은 밀은 정도가 곧 속도.
        let mag = Math.hypot(ix, iy)
        if (mag > 1) { ix /= mag; iy /= mag; mag = 1 }
        const tvx = ix * WALK_SPEED; const tvy = iy * WALK_SPEED
        const k = 1 - Math.exp(-9 * dt)
        st.vel.x += (tvx - st.vel.x) * k; st.vel.y += (tvy - st.vel.y) * k
        st.player.x += st.vel.x * dt; st.player.y += st.vel.y * dt
        const rr = Math.hypot(st.player.x, st.player.y)
        if (rr > WORLD_R - 60) { st.player.x *= (WORLD_R - 60) / rr; st.player.y *= (WORLD_R - 60) / rr }
        if (Math.abs(st.vel.x) > 2) st.facing = st.vel.x > 0 ? 1 : -1
      } else { st.vel.x = 0; st.vel.y = 0 }
      const ck = 1 - Math.exp(-6 * dt)
      st.cam.x += (st.player.x - st.cam.x) * ck; st.cam.y += (st.player.y - st.cam.y) * ck

      drawTerrain(); drawCollectRing(now); drawTargetFlag(now)
      st.spots.forEach((s, i) => drawSpot(s, i, now))
      drawDust(now); drawCat(now); drawEdgeArrow(now); drawCompass(); drawScan(now, dt)

      if (now - st.lastUI > 250) {
        st.lastUI = now
        const nearest = st.spots.filter((s) => !s.collected).map((s) => ({ s, d: dist2(s, st.player) })).sort((a, b) => a.d - b.d)[0]
        const active = nearest && nearest.d < COLLECT_M ? nearest.s : null
        st.activeSpot = active
        setCollectTarget(active ? { title: dist2(active, st.player) < REVEAL_M ? active.title : "미확인 생물" } : null)
        // 동네 끝 근접 감지 — 울타리(WORLD_R-60) 가까이 가면 "여기서 다시 스캔" 안내
        setAtEdge(st.loaded && Math.hypot(st.player.x, st.player.y) > WORLD_R - 340)
        pushNearby(false)
      }
      st.raf = requestAnimationFrame(tick)
    }

    resize()
    initWorld()
    st.last = performance.now()
    st.raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(st.raf)
      clearTimeout(statusTimer)
      if (st.watchId != null) navigator.geolocation.clearWatch(st.watchId)
      window.removeEventListener("resize", resize)
      window.removeEventListener("keydown", onKeyDown)
      window.removeEventListener("keyup", onKeyUp)
      canvas.removeEventListener("pointerdown", onPointerDown)
      canvas.removeEventListener("wheel", onWheel)
      engineRef.current = null
    }
  }, [])

  const eng = () => engineRef.current

  return (
    <div className={`walk-mode${sheetOpen ? " sheet-open" : ""}`}>
      <canvas ref={canvasRef} className="walk-mode__canvas" />

      {intro ? (
        <div className="walk-intro" role="dialog" aria-modal="true" aria-label="산책 모드 안내">
          <div className="walk-intro__card">
            <div className="walk-intro__band">🐾 내 동네 산책 모드</div>
            <div className="walk-intro__body">
              <p className="walk-intro__lead">내 동네를 게임처럼 걸으며<br /><b>주변에서 실제로 관측된 동식물</b>을 채집하는 모드예요.</p>
              <ul className="walk-intro__list">
                <li>🕹 <b>조이스틱·화면 클릭</b>으로 고양이를 움직여요 (실제로 걸어다닐 필요 없어요)</li>
                <li>❓ 물음표 지점에 가까이 가면 정체가 드러나고, 원 안에 들면 채집할 수 있어요</li>
                <li>◎ <b>내 동네 지도 스캔</b>을 누르면 실제 내 위치 기준으로 동네를 다시 그려요</li>
                <li>🧭 동네 끝(나무 울타리)에 닿으면 <b>여기서 다시 스캔</b>으로 이어서 탐험해요</li>
              </ul>
              <p className="walk-intro__note">⚠ 실제로 걸을 땐 화면보다 주변을 먼저 살펴요 · 기록·사진 © iNaturalist 기여자 (CC)</p>
            </div>
            <button type="button" className="walk-intro__ok" onClick={() => setIntro(false)}>확인하고 시작하기</button>
          </div>
        </div>
      ) : null}

      <div className="walk-hud">
        <div className="walk-hud__tl">
          <button type="button" className="walk-chip is-on" onClick={() => eng()?.scanMyArea()}>◎ 내 동네 지도 스캔</button>
          <button type="button" className="walk-chip walk-exit" onClick={onExit} aria-label="지도 나가기">✕ 지도 나가기</button>
        </div>
        <div className="walk-hud__tr">
          <span className="walk-counter">채집 <b>{count}</b>/{total}</span>
          <div className="walk-zoom">
            <button type="button" className="walk-chip" onClick={() => eng()?.zoomBy(1 / 1.28)} aria-label="축소">－</button>
            <button type="button" className="walk-chip" onClick={() => eng()?.zoomBy(1.28)} aria-label="확대">＋</button>
          </div>
        </div>

        {status ? <div className="walk-status">{status}</div> : null}
        {scanning ? <div className="walk-scan-label">내 동네 스캔 중…</div> : null}

        <WalkJoystick engineRef={engineRef} />

        {collectTarget ? (
          <div className="walk-collect-wrap">
            <button type="button" className="walk-collect" onClick={() => eng()?.openCollect()}>🧺 {collectTarget.title} 채집하기</button>
          </div>
        ) : null}

        {atEdge && !collectTarget ? (
          <div className="walk-rescan-wrap">
            <button type="button" className="walk-rescan" onClick={() => eng()?.rescanHere()}>🧭 동네 끝! 여기서 다시 스캔</button>
          </div>
        ) : null}

        <button type="button" className="walk-chip walk-sheet-chip" onClick={() => setSheetOpen((v) => !v)}>📋 근처 생물</button>

        <aside className={`walk-panel${panelOpen ? "" : " is-collapsed"}`} aria-label="근처의 생물과 바인더">
          <h2>근처의 생물
            <span>
              <button type="button" className="walk-auto" onClick={() => eng()?.toggleAuto()}>🐾 자동 산책</button>
              <button type="button" className="walk-panel-toggle" onClick={() => setPanelOpen((v) => !v)} aria-label={panelOpen ? "창 접기" : "창 펴기"}>{panelOpen ? "▾ 창 접기" : "▸ 창 펴기"}</button>
              <button type="button" className="walk-panel-close" onClick={() => setSheetOpen(false)} aria-label="근처 생물 닫기">✕</button>
            </span>
          </h2>
          <div className="walk-panel__body">
            <div className="walk-spot-list">
              {nearby.length ? nearby.map((s) => (
                <button key={s.id} type="button" className={`walk-spot${s.near ? " is-near" : ""}`} onClick={() => eng()?.listRow(s.id)}>
                  <img className="walk-spot__sp" src={spriteUrl(s.sprite)} alt="" />
                  <span className="walk-spot__nm"><b>{s.title}</b><small>{s.place}</small></span>
                  <span className="walk-spot__d">{s.arrow}<br />{s.dist}</span>
                </button>
              )) : <div className="walk-empty">이 동네 생물을 전부 채집했어요! 🎉</div>}
            </div>
            <div className="walk-divider" />
            <h2>오늘의 새발견 <span className="walk-sub">{count}마리</span></h2>
            <div className="walk-binder">
              {binder.length ? binder.map((b) => (
                <div key={b.id} className="walk-bcard">
                  <div className="no">No.{String(b.no).padStart(3, "0")}</div>
                  <img src={spriteUrl(b.sprite)} alt="" />
                  <div className="nm">{b.title}</div>
                </div>
              )) : <p className="walk-empty">아직 비어 있어요.<br />물음표 지점까지 걸어가 보세요!</p>}
            </div>
            <p className="walk-safety">⚠ 실제 산책 시엔 화면보다 주변을 먼저 살펴요<br />관측 기록·사진 © iNaturalist 기여자 (CC)</p>
          </div>
        </aside>
      </div>

      {modalSpot ? (
        <div className="walk-modal" role="dialog" aria-modal="true" onClick={(e) => { if (e.currentTarget === e.target) setModalSpot(null) }}>
          <div className="walk-findcard">
            <div className="band"><span>새발견 · NEW FIND</span><b>No.{String(count + 1).padStart(3, "0")}</b></div>
            <div className="photo">
              {modalSpot.photoLarge || modalSpot.photo
                ? <img src={modalSpot.photoLarge || modalSpot.photo} alt={modalSpot.title} />
                : <div className="fb"><img src={spriteUrl(modalSpot.sprite, 64)} alt="" /></div>}
            </div>
            <div className="body">
              <h3>{modalSpot.title}</h3>
              <p className="sci">{modalSpot.scientific}</p>
              <p className="meta">
                {modalSpot.place ? <>📍 {modalSpot.place}<br /></> : null}
                {modalSpot.observedOn ? <>👀 {modalSpot.observedOn} 관측<br /></> : null}
                {modalSpot.demo ? "데모 생물이에요" : `이 자리 근처에서 실제로 관측된 ${modalSpot.category}예요`}
              </p>
              {modalSpot.attribution ? <p className="attr">사진 {modalSpot.attribution}</p> : null}
              <div className="actions">
                <button type="button" className="later" onClick={() => setModalSpot(null)}>다음에</button>
                <button
                  type="button"
                  className="take"
                  onClick={() => {
                    // 실제 새발견 카드 등록(CollectSheet). 인증 게이트에 막히면 게임 채집도 보류.
                    const proceeded = onCollect ? onCollect(modalSpot) : true
                    if (proceeded !== false) eng()?.take(modalSpot)
                    setModalSpot(null)
                  }}
                >카드로 채집</button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

// 모바일 아날로그 조이스틱 — 베이스 중심에서 민 방향·거리가 곧 이동 방향·속도.
// 화면 y(아래+)를 월드 y(위+)로 뒤집어 엔진에 넘긴다. 데스크톱은 CSS 로 숨김(키보드/클릭 사용).
function WalkJoystick({ engineRef }) {
  const baseRef = useRef(null)
  const activeRef = useRef(false)
  const [thumb, setThumb] = useState({ x: 0, y: 0 })
  const R = 42 // 썸 최대 이동 반경(px)

  const compute = (e) => {
    const base = baseRef.current
    if (!base) return
    const rect = base.getBoundingClientRect()
    let dx = e.clientX - (rect.left + rect.width / 2)
    let dy = e.clientY - (rect.top + rect.height / 2)
    const d = Math.hypot(dx, dy)
    if (d > R) { dx = (dx / d) * R; dy = (dy / d) * R }
    setThumb({ x: dx, y: dy })
    engineRef.current?.setJoystick(dx / R, -dy / R)
  }
  const start = (e) => { e.preventDefault(); activeRef.current = true; try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* ignore */ } compute(e) }
  const move = (e) => { if (activeRef.current) compute(e) }
  const end = () => { activeRef.current = false; setThumb({ x: 0, y: 0 }); engineRef.current?.setJoystick(0, 0) }

  return (
    <div
      ref={baseRef}
      className="walk-joystick"
      aria-label="이동 조이스틱"
      onPointerDown={start}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <span className="walk-joystick__ring" aria-hidden="true" />
      <span className="walk-joystick__thumb" style={{ transform: `translate(${thumb.x}px, ${thumb.y}px)` }} aria-hidden="true" />
    </div>
  )
}
