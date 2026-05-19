// 도트형 이모지 카탈로그 + SVG/Canvas 렌더링 헬퍼.
//
// 디자인 원칙:
// - 각 이모지는 12×12 비트맵 문자열 그리드. 한 글자가 한 픽셀 색을 지정.
// - 폰트/OS 의존 없이 동일하게 렌더되도록 직접 그리는 방식.
// - 출력은 두 가지: pixelArtToSvgString() (NaverMap innerHTML / MapShareEditor / React),
//   drawPixelArtToCanvas() (Canvas 직접 그리기).

export const PIXEL_PALETTE = {
  ".": null,
  K: "#1A1A1A", k: "#5C5C5C", S: "#9CA3A1",
  W: "#FFFFFF", w: "#F5EDDD",
  R: "#C8431C", r: "#FF6B35", o: "#FFAA7A",
  N: "#D7423F", n: "#FF8A87",
  Y: "#B47912", y: "#F5C24F", L: "#F9E5A8",
  G: "#2F6B43", g: "#74B58A", l: "#BFE0C4",
  B: "#3B5B85", b: "#7FA2CC", i: "#B8D2EC",
  P: "#B83F76", p: "#F5A6C4", q: "#FFD3E0",
  C: "#6B3D1E", c: "#B07A4A", d: "#E0BE96",
  M: "#2D7A66", m: "#7CC2AE",
  X: "#2D4A3E", // brand secondary
}

export const PIXEL_SUBSETS = [
  { id: "symbol",   label: "심볼" },
  { id: "nature",   label: "식물" },
  { id: "food",     label: "음식" },
  { id: "animal",   label: "동물" },
  { id: "building", label: "장소" },
]

export const PIXEL_ART = [
  // -------------------- SYMBOL --------------------
  { id: "px-heart", label: "하트", sub: "symbol", grid: [
    "............",
    ".RR....RR...",
    "RrrR..RrrR..",
    "RrrrRRrrrR..",
    "RrrrrrrrrR..",
    ".RrrrrrrR...",
    "..RrrrrR....",
    "...RrrR.....",
    "....RR......",
    ".....R......",
    "............",
    "............",
  ]},
  { id: "px-star", label: "반짝", sub: "symbol", grid: [
    "............",
    ".....y......",
    ".....Y......",
    ".....y......",
    "....yyy.....",
    "yyyyyYyyyyy.",
    "yyyyYyYyyyy.",
    "....yyy.....",
    ".....y......",
    ".....Y......",
    ".....y......",
    "............",
  ]},
  { id: "px-moon", label: "달", sub: "symbol", grid: [
    "............",
    "....yyyy....",
    "...yYYYYy...",
    "..yyYYYYYy..",
    "..yYYYY.....",
    "..yYYY......",
    "..yYYY......",
    "..yYYYY.....",
    "..yyYYYYYy..",
    "...yYYYYy...",
    "....yyyy....",
    "............",
  ]},
  { id: "px-diamond", label: "다이아", sub: "symbol", grid: [
    "............",
    "..bbbbbbbb..",
    "..bibBBbib..",
    "bbBBbbbbBBbb",
    ".bBBBbbBBBb.",
    "..bBBBBBBb..",
    "...bBBBBb...",
    "....bBBb....",
    "....bBBb....",
    ".....bb.....",
    "............",
    "............",
  ]},
  { id: "px-sun", label: "해", sub: "symbol", grid: [
    "............",
    ".....Y......",
    ".y...Y...y..",
    "..y.yYy.y...",
    "...yYYYy....",
    "YYyYLLLYyYY.",
    "YYyYLLLYyYY.",
    "...yYYYy....",
    "..y.yYy.y...",
    ".y...Y...y..",
    ".....Y......",
    "............",
  ]},
  { id: "px-pin", label: "핀", sub: "symbol", grid: [
    "............",
    "...rRrrRr...",
    "..RrrrrrrR..",
    ".RrwwwwwwrR.",
    ".RrwwwwwwrR.",
    ".RrwwwwwwrR.",
    ".RrrwwwwrrR.",
    "..RrrrrrrR..",
    "...RrrrrR...",
    "....RrrR....",
    ".....RR.....",
    "......R.....",
  ]},
  { id: "px-fire", label: "불", sub: "symbol", grid: [
    "............",
    ".....y......",
    "....yyo.....",
    "....yyo.....",
    "...yyoor....",
    "..yyooorr...",
    "..yLLoorRR..",
    ".yyLLLorRR..",
    ".yyLLooorR..",
    ".yyooooorR..",
    "..yyoorrR...",
    "...yyoor....",
  ]},
  { id: "px-check", label: "체크", sub: "symbol", grid: [
    "............",
    "............",
    "..........GG",
    ".........GgG",
    "........GgG.",
    ".......GgG..",
    "G.....GgG...",
    "GG...GgG....",
    ".GG.GgG.....",
    "..GGgG......",
    "...GG.......",
    "............",
  ]},
  // -------------------- NATURE --------------------
  { id: "px-tree", label: "나무", sub: "nature", grid: [
    "............",
    ".....g......",
    "....ggg.....",
    "...gGGGg....",
    "..ggGGGgg...",
    ".gGGGGGGGg..",
    "gggGGGGGggg.",
    ".gGGGGGGGg..",
    "..gggGGggg..",
    ".....C......",
    ".....C......",
    "....CCC.....",
  ]},
  { id: "px-flower", label: "꽃", sub: "nature", grid: [
    "............",
    "....p.p.....",
    "...pPyPp....",
    "...pPyPp....",
    "....pyp.....",
    ".....G......",
    "..g..G..g...",
    ".gG..G..Gg..",
    "..g..G..g...",
    ".....G......",
    "....GGG.....",
    "............",
  ]},
  { id: "px-mushroom", label: "버섯", sub: "nature", grid: [
    "............",
    "...RRRRRR...",
    "..RrrrrrrR..",
    ".RrwwrrwwrR.",
    ".RrwwrrwwrR.",
    ".RrrwwrrrrR.",
    "..RRRRRRRR..",
    "...wwwwww...",
    "....wWWw....",
    "....wWWw....",
    "....wWWw....",
    ".....ww.....",
  ]},
  { id: "px-leaf", label: "잎", sub: "nature", grid: [
    "............",
    "..........G.",
    ".........GgG",
    "........Gggg",
    ".......GgggG",
    "......Ggggg.",
    ".....Gggggg.",
    "....GggGgg..",
    "...GGgGgg...",
    "..GggGg.....",
    ".GgGG.......",
    "GGG.........",
  ]},
  // -------------------- FOOD --------------------
  { id: "px-cake", label: "케이크", sub: "food", grid: [
    "............",
    ".....r......",
    ".....Y......",
    ".....y......",
    ".WWWWWWWWWW.",
    "WqqqqqqqqqqW",
    "WrPrPrPrPrPW",
    "WccccccccccW",
    "WccccccccccW",
    "WccdCcccccdW",
    "WccccccccccW",
    "WWWWWWWWWWWW",
  ]},
  { id: "px-coffee", label: "커피", sub: "food", grid: [
    "............",
    ".m.m.m......",
    "m.m.m.......",
    ".m.m.m......",
    "............",
    "WWWWWWWWWWWW",
    "WccccccccccW",
    "WccccccccccW",
    "WccccccccccW",
    "WccccccccccW",
    "WWWWWWWWWWWW",
    ".WWWWWWWWWW.",
  ]},
  { id: "px-apple", label: "사과", sub: "food", grid: [
    "............",
    ".....G......",
    "....GG......",
    ".....C......",
    "....NNN.....",
    "..NNnNNnNN..",
    ".NNnNNNNNNN.",
    ".NNNNNNNNNN.",
    ".NNNNNNNNNN.",
    ".NNNNNNNNNN.",
    "..NNNNNNNN..",
    "...NNNNNN...",
  ]},
  { id: "px-bread", label: "빵", sub: "food", grid: [
    "............",
    "............",
    "............",
    "...CCCCCC...",
    "..CcccccCC..",
    ".CdcccccccC.",
    ".CcdcccCccC.",
    ".CcccCcccdC.",
    ".CdcccccccC.",
    "..CcdccccC..",
    "...CCCCCC...",
    "............",
  ]},
  { id: "px-cherry", label: "체리", sub: "food", grid: [
    "............",
    "......G.....",
    ".....GG.....",
    "....G.G.....",
    "...G..GG....",
    "..G....G....",
    ".NN....NN...",
    "NnN....NnN..",
    "NNN....NNN..",
    ".NN....NN...",
    "............",
    "............",
  ]},
  // -------------------- ANIMAL --------------------
  { id: "px-cat", label: "고양이", sub: "animal", grid: [
    "............",
    "..k.....k...",
    ".kkk...kkk..",
    ".kKkkkkkKk..",
    ".kkkkkkkkk..",
    ".kKkkkkkKk..",
    ".kkkpkpkkkk.",
    ".kkkpppkkk..",
    "..kkkkkkk...",
    "...kkkkk....",
    "............",
    "............",
  ]},
  { id: "px-fish", label: "물고기", sub: "animal", grid: [
    "............",
    "............",
    "...bbbb.....",
    "..bbbbbb..B.",
    ".bKbbbbbb.BB",
    ".bKbbbbbbBBB",
    ".bbbbbbbb.BB",
    "..bbbbbb..B.",
    "...bbbb.....",
    "............",
    "............",
    "............",
  ]},
  { id: "px-butterfly", label: "나비", sub: "animal", grid: [
    "............",
    "..pp....pp..",
    ".pPpp..ppPp.",
    "pPPPpKKpPPPp",
    "pPPpKKKKpPPp",
    "ppPpKKKKpPpp",
    ".ppKKKKKKpp.",
    "....KKKK....",
    ".....KK.....",
    ".....KK.....",
    "............",
    "............",
  ]},
  { id: "px-bird", label: "새", sub: "animal", grid: [
    "............",
    "...bbbb.....",
    "..biiiib....",
    ".biiKiiib...",
    "biiiiiiib...",
    "biiiiiiibb..",
    ".biiiiiibb..",
    "..bbbbbb....",
    "....r..r....",
    "............",
    "............",
    "............",
  ]},
  // -------------------- BUILDING --------------------
  { id: "px-house", label: "집", sub: "building", grid: [
    "............",
    ".....R......",
    "....RRR.....",
    "...RRRRR....",
    "..RRRRRRR...",
    ".RRRRRRRRR..",
    "RWWWWWWWWWR.",
    "WccwwccccccW",
    "WccwwccccccW",
    "WccccccCcccW",
    "WcccccCCcccW",
    "WWWWWWCCWWWW",
  ]},
  { id: "px-cafe", label: "카페", sub: "building", grid: [
    "............",
    ".m.m.m......",
    ".m.m.m......",
    "............",
    "YYYYYYYYYYYY",
    "YyyyyyyyyyyY",
    "YwwwwwwwwwwY",
    "WccccccccccW",
    "WccwwccwwccW",
    "WccwwccwwccW",
    "WccccccccccW",
    "WWWWWWWWWWWW",
  ]},
  { id: "px-castle", label: "성", sub: "building", grid: [
    "............",
    "C.C.CCCC.C.C",
    "CCCCCCCCCCCC",
    "CcccCCCCcccC",
    "CcccCCCCcccC",
    "CCCCCCCCCCCC",
    "CcCcCcCcCcCc",
    "CcCcCcCcCcCc",
    "CcCcCcCcCcCc",
    "CcCcKKKKCcCc",
    "CCCCKKKKCCCC",
    "CCCCCCCCCCCC",
  ]},
  { id: "px-tent", label: "텐트", sub: "building", grid: [
    "............",
    "............",
    ".....C......",
    "....CCC.....",
    "...CCdCC....",
    "..CCddCCC...",
    ".CCdddCdCC..",
    "CCddddCddCC.",
    "CdddddCdddCC",
    "CddddddCdddC",
    "CCCCCCCCCCCC",
    "............",
  ]},
]

const PIXEL_ART_INDEX = new Map(PIXEL_ART.map((art) => [art.id, art]))

export function findPixelArt(id) {
  return PIXEL_ART_INDEX.get(id) || null
}

export function findPixelArtLabel(id) {
  const art = PIXEL_ART_INDEX.get(id)
  return art ? art.label : ""
}

/**
 * 비트맵 그리드를 SVG 문자열로 변환한다.
 * 인접한 같은 색 픽셀은 한 줄짜리 path로 합쳐서 노드 수를 줄인다.
 * 결과 SVG 는 viewBox 가 비트맵 좌표계 (12×12) 이고, width/height 는 호출자가 지정.
 */
export function pixelArtToSvgString(art, size = 32) {
  if (!art || !Array.isArray(art.grid)) return ""
  const rows = art.grid
  const h = rows.length
  const w = rows[0]?.length || 12

  // 같은 색 가로 run 으로 모아 rect 로 출력 (노드 수 약 1/3)
  const runs = []
  for (let y = 0; y < h; y++) {
    const row = rows[y]
    let x = 0
    while (x < row.length) {
      const ch = row[x]
      if (!PIXEL_PALETTE[ch]) { x++; continue }
      let end = x + 1
      while (end < row.length && row[end] === ch) end++
      runs.push({ x, y, len: end - x, color: PIXEL_PALETTE[ch] })
      x = end
    }
  }

  const rects = runs
    .map((r) => `<rect x="${r.x}" y="${r.y}" width="${r.len}" height="1" fill="${r.color}"/>`)
    .join("")

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges">${rects}</svg>`
}

/**
 * SVG 문자열을 data URL 로 감싼다. <img src> 용도.
 */
export function pixelArtToDataUrl(art, size = 32) {
  const svg = pixelArtToSvgString(art, size)
  if (!svg) return ""
  // ASCII-safe encoding (한글 label 미사용)
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

/**
 * Canvas 에 픽셀 아트를 그린다. MapShareEditor 처럼 canvas 직접 그리는 곳용.
 * 호출 후 ctx 상태(fillStyle 등)는 복원하지 않음 — 호출자가 save/restore 책임.
 */
export function drawPixelArtToCanvas(ctx, art, x, y, sizePx) {
  if (!art || !ctx) return
  const rows = art.grid
  const w = rows[0]?.length || 12
  const h = rows.length
  const cell = Math.max(1, Math.floor(sizePx / Math.max(w, h)))
  // 정렬: 중앙 맞춤
  const offX = x + Math.floor((sizePx - cell * w) / 2)
  const offY = y + Math.floor((sizePx - cell * h) / 2)
  ctx.imageSmoothingEnabled = false
  for (let yy = 0; yy < h; yy++) {
    const row = rows[yy]
    for (let xx = 0; xx < row.length; xx++) {
      const color = PIXEL_PALETTE[row[xx]]
      if (!color) continue
      ctx.fillStyle = color
      ctx.fillRect(offX + xx * cell, offY + yy * cell, cell, cell)
    }
  }
}
