// 장소 공유 카드 → 캔버스 직접 렌더 (지시서 v1.0 기준).
// html2canvas 는 conic-gradient(프리즘 테두리)·CSS filter(사진 보정)를 못 굽는다.
// 그래서 출력 해상도(1080)에 캔버스로 직접 그린다 — 벡터 렌더 후 래스터화.
//
// 좌표는 모두 "디자인 원본" 단위(피드 432 기준). 출력 시 scale(S)로 곱한다.
//   - 피드 4:5 : 432×540 × 2.5 = 1080×1350
//   - 스토리 9:16 : 360×640 × 3 = 1080×1920 (Phase 3)
// 카드 A(사진형)만 우선 구현. 카드 B(도트형)는 Phase 4.

const FONT_STACK = "'Pretendard Variable', Pretendard, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif"

const PRISM_STOPS = ["#7DE2FF", "#B48CFF", "#FF9AD5", "#FFD98A", "#9DFFB0", "#7DE2FF"]

// 포맷별 스펙 (디자인 원본 단위)
const SPECS = {
  feed: {
    S: 2.5, W: 432, H: 540,
    border: 11, roundOut: 28, roundIn: 18,
    topMeta: 16, bottomStack: 22, sidePad: 24, gap: 8, dividerW: 44,
    spriteLeft: 150, spriteTop: 150,
    type: { meta: 12, enLabel: 12, title: 44, titleMin: 36, desc: 16, addr: 13, loca: 14 },
  },
  story: {
    S: 3, W: 360, H: 640,
    border: 9, roundOut: 26, roundIn: 18,
    // 인스타 스토리 UI(상단 프로필·하단 답장바)에 텍스트가 가리지 않도록 세이프존 반영.
    // 지시서 원안(top 18 / bottom 26)은 UI를 고려 안 해 실사용 시 겹침 → 안전 여백으로 조정.
    topMeta: 46, bottomStack: 54, sidePad: 24, gap: 8, dividerW: 44,
    spriteLeft: 118, spriteTop: 190,
    type: { meta: 12, enLabel: 12, title: 42, titleMin: 34, desc: 15, addr: 13, loca: 14 },
  },
}

// 카드 A(사진형) 텍스트 컬러 — 지시서 2.1
const CARD_A_COLORS = {
  meta: "rgba(255,255,255,.85)",
  enLabel: "rgba(255,255,255,.75)",
  title: "#FFFFFF",
  desc: "rgba(255,255,255,.9)",
  divider: "rgba(255,255,255,.5)",
  addr: "rgba(255,255,255,.75)",
  loca: "#FF9AD5",
}

// 카드 B(도트형) 텍스트 컬러 — 지시서 3.1 (밝은 배경 → 다크 그린)
const CARD_B_COLORS = {
  meta: "#4A6A55",
  enLabel: "#6A8A75",
  title: "#2B4A38",
  desc: "#42604D",
  divider: "rgba(43,74,56,.4)",
  addr: "#6A8A75",
  loca: "#E0679A",
}

// 카드 B 배경: 도트 격자 + 사선 하이라이트 + 픽셀 길 스프라이트 — 지시서 3장
function drawCardBBackground(ctx, spec, bx, iw, ih, px) {
  // 1) 도트 배경 (#E3EFE4 + 13×13 격자에 1.5px 도트)
  ctx.fillStyle = "#E3EFE4"
  ctx.fillRect(bx, bx, iw, ih)
  ctx.fillStyle = "rgba(62,125,90,.22)"
  const step = px(13)
  const dotR = px(1.5)
  for (let y = bx; y <= bx + ih; y += step) {
    for (let x = bx; x <= bx + iw; x += step) {
      ctx.beginPath()
      ctx.arc(x, y, dotR, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  // 2) 사선 하이라이트 (115deg 흰 스트릭)
  const hl = ctx.createLinearGradient(bx, bx + ih * 0.15, bx + iw, bx + ih * 0.85)
  hl.addColorStop(0.38, "rgba(255,255,255,0)")
  hl.addColorStop(0.46, "rgba(255,255,255,.45)")
  hl.addColorStop(0.52, "rgba(255,255,255,.2)")
  hl.addColorStop(0.60, "rgba(255,255,255,0)")
  ctx.fillStyle = hl
  ctx.fillRect(bx, bx, iw, ih)
  // 3) 픽셀 길 스프라이트 — 15px 단위, 좌상→우하 계단형 11칸, 모서리마다 하이라이트 교차
  const unit = px(15)
  const sx = bx + px(spec.spriteLeft)
  const sy = bx + px(spec.spriteTop)
  let col = 0
  let row = 0
  for (let i = 0; i < 11; i += 1) {
    ctx.fillStyle = i % 2 === 1 ? "#559A70" : "#3E7D5A"
    ctx.fillRect(sx + col * unit, sy + row * unit, unit, unit)
    if (i % 2 === 0) col += 1
    else row += 1
  }
}

function roundRectPath(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr)
  ctx.closePath()
}

// object-fit: cover + 초점(0~100%) 반영해서 이미지를 목표 사각에 그린다
function drawImageCover(ctx, img, dx, dy, dw, dh, focusX = 50, focusY = 50) {
  const iw = img.naturalWidth || img.width
  const ih = img.naturalHeight || img.height
  if (!iw || !ih) return
  const ir = iw / ih
  const br = dw / dh
  let sw, sh, sx, sy
  if (ir > br) {
    sh = ih; sw = ih * br
    sx = (iw - sw) * (Math.min(100, Math.max(0, focusX)) / 100); sy = 0
  } else {
    sw = iw; sh = iw / br
    sx = 0; sy = (ih - sh) * (Math.min(100, Math.max(0, focusY)) / 100)
  }
  ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh)
}

// 이미지 로드 (CORS 허용) — 실패 시 null
function loadImage(url) {
  return new Promise((resolve) => {
    if (!url) return resolve(null)
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = url
  })
}

// 한 줄 텍스트 렌더 (중앙 정렬, textBaseline top)
function drawLine(ctx, text, cx, y, { sizePx, weight, lsPx, color, shadow }) {
  ctx.font = `${weight} ${sizePx}px ${FONT_STACK}`
  ctx.textAlign = "center"
  ctx.textBaseline = "top"
  ctx.letterSpacing = `${lsPx || 0}px`
  ctx.fillStyle = color
  if (shadow) {
    ctx.shadowColor = shadow.color
    ctx.shadowBlur = shadow.blur
    ctx.shadowOffsetX = 0
    ctx.shadowOffsetY = shadow.offsetY
  }
  ctx.fillText(text, cx, y)
  ctx.shadowColor = "transparent"
  ctx.shadowBlur = 0
  ctx.shadowOffsetY = 0
  ctx.letterSpacing = "0px"
}

// 장소명 nowrap — 가용폭 넘치면 titleMin 까지 축소
function fitTitleSize(ctx, text, availPx, maxPx, minPx) {
  let s = maxPx
  ctx.font = `700 ${s}px ${FONT_STACK}`
  ctx.letterSpacing = "0px"
  while (ctx.measureText(text).width > availPx && s > minPx) {
    s -= 1
    ctx.font = `700 ${s}px ${FONT_STACK}`
  }
  return s
}

// 설명 최대 2줄 — 공백 없는 한글 대응, 넘치면 말줄임(…)
function wrapTwoLines(ctx, text, availPx, sizePx) {
  ctx.font = `400 ${sizePx}px ${FONT_STACK}`
  ctx.letterSpacing = "0px"
  if (ctx.measureText(text).width <= availPx) return [text]
  const chars = [...text]
  // 1줄 채우기
  let l1 = ""
  let i = 0
  for (; i < chars.length; i += 1) {
    if (ctx.measureText(l1 + chars[i]).width > availPx) break
    l1 += chars[i]
  }
  // 나머지 2줄 — 넘치면 … 로 자름
  let rest = chars.slice(i).join("")
  if (ctx.measureText(rest).width <= availPx) return [l1, rest]
  let l2 = ""
  for (const ch of chars.slice(i)) {
    if (ctx.measureText(l2 + ch + "…").width > availPx) break
    l2 += ch
  }
  return [l1, l2 + "…"]
}

/**
 * 공유 카드를 캔버스에 그려서 반환한다.
 * data: { dexNo, typeLabel, handle, name, enLabel, desc, address, date, photoUrl, focusX, focusY }
 * format: 'feed' | 'story'
 */
export async function renderShareCardCanvas(data, format = "feed") {
  const spec = SPECS[format] || SPECS.feed
  const { S } = spec
  const px = (v) => v * S
  const outW = spec.W * S
  const outH = spec.H * S

  const canvas = document.createElement("canvas")
  canvas.width = outW
  canvas.height = outH
  const ctx = canvas.getContext("2d")
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = "high"

  const photo = await loadImage(data.photoUrl)
  // 폴백 폰트로 그려지면 자간·줄바꿈이 틀어지므로 폰트 로드 후 렌더
  if (document.fonts?.ready) { try { await document.fonts.ready } catch { /* noop */ } }

  // ── 1. 프리즘 테두리 (외곽 라운드 사각을 conic 으로 채움) ──
  const conic = ctx.createConicGradient((210 * Math.PI) / 180, outW / 2, outH / 2)
  PRISM_STOPS.forEach((c, i) => conic.addColorStop(i / (PRISM_STOPS.length - 1), c))
  roundRectPath(ctx, 0, 0, outW, outH, px(spec.roundOut))
  ctx.fillStyle = conic
  ctx.fill()

  // ── 2. 내부 패널 (테두리 두께만큼 인셋) — 사진 있으면 카드 A, 없으면 카드 B ──
  const isCardB = !photo
  const bx = px(spec.border)
  const iw = outW - bx * 2
  const ih = outH - bx * 2
  ctx.save()
  roundRectPath(ctx, bx, bx, iw, ih, px(spec.roundIn))
  ctx.clip()

  if (!isCardB) {
    // 카드 A: 사진(풀블리드 cover + 초점 + 보정필터) + 명암 오버레이
    ctx.filter = "saturate(1.2) contrast(1.05)"
    drawImageCover(ctx, photo, bx, bx, iw, ih, data.focusX ?? 50, data.focusY ?? 50)
    ctx.filter = "none"
    const scrim = ctx.createLinearGradient(0, bx, 0, bx + ih)
    scrim.addColorStop(0, "rgba(0,0,0,.35)")
    scrim.addColorStop(0.28, "rgba(0,0,0,0)")
    scrim.addColorStop(0.48, "rgba(0,0,0,0)")
    scrim.addColorStop(1, "rgba(0,0,0,.72)")
    ctx.fillStyle = scrim
    ctx.fillRect(bx, bx, iw, ih)
  } else {
    // 카드 B: 도트 배경 + 사선 하이라이트 + 픽셀 길 스프라이트
    drawCardBBackground(ctx, spec, bx, iw, ih, px)
  }

  // ── 3. 텍스트 ──
  const C = isCardB ? CARD_B_COLORS : CARD_A_COLORS
  const cx = outW / 2
  // 사진(카드 A) 위에서만 대비용 그림자. 도트 카드는 밝은 배경이라 그림자 없음.
  const titleShadow = isCardB ? null : { color: "rgba(0,0,0,.5)", blur: px(12), offsetY: px(2) }

  // 3a. 상단 메타 (N.003 · 영역 · @danji)
  const metaParts = [
    `N.${String(data.dexNo || "0").padStart(3, "0")}`,
    data.typeLabel,
    data.handle ? (data.handle.startsWith("@") ? data.handle : `@${data.handle}`) : "",
  ].filter(Boolean)
  drawLine(ctx, metaParts.join("  ·  "), cx, px(spec.topMeta), {
    sizePx: px(spec.type.meta), weight: 400, lsPx: px(5), color: C.meta,
  })

  // 3b. 하단 스택 (아래에서 위로 anchored) — 순서: 영문라벨→장소명→설명→구분선→주소·날짜→LOCA
  const availPx = px(spec.W - spec.sidePad * 2)
  const blocks = []

  if (data.enLabel) {
    blocks.push({ kind: "line", text: data.enLabel, sizePx: px(spec.type.enLabel), weight: 400, lsPx: px(6), color: C.enLabel, h: px(spec.type.enLabel * 1.25) })
  }
  // 장소명 (nowrap + 축소)
  const titleSize = fitTitleSize(ctx, data.name || "이름 없는 장소", availPx, px(spec.type.title), px(spec.type.titleMin))
  blocks.push({ kind: "line", text: data.name || "이름 없는 장소", sizePx: titleSize, weight: 700, lsPx: 0, color: C.title, shadow: titleShadow, h: titleSize * 1.2 })
  // 설명 (최대 2줄) — 있을 때만
  if (data.desc) {
    const lines = wrapTwoLines(ctx, data.desc, availPx, px(spec.type.desc))
    blocks.push({ kind: "desc", lines, sizePx: px(spec.type.desc), lineH: px(spec.type.desc * 1.6), color: C.desc, h: lines.length * px(spec.type.desc * 1.6) })
  }
  // 구분선
  blocks.push({ kind: "divider", w: px(spec.dividerW), color: C.divider, h: Math.max(1, px(1)) })
  // 주소·날짜
  const addrDate = [data.address, data.date].filter(Boolean).join("  ·  ")
  if (addrDate) {
    blocks.push({ kind: "line", text: addrDate, sizePx: px(spec.type.addr), weight: 400, lsPx: 0, color: C.addr, h: px(spec.type.addr * 1.25) })
  }
  // LOCA
  blocks.push({ kind: "line", text: "LOCA", sizePx: px(spec.type.loca), weight: 700, lsPx: px(8), color: C.loca, h: px(spec.type.loca * 1.25) })

  const gap = px(spec.gap)
  const total = blocks.reduce((s, b) => s + b.h, 0) + gap * (blocks.length - 1)
  let y = outH - px(spec.bottomStack) - total

  for (const b of blocks) {
    if (b.kind === "line") {
      drawLine(ctx, b.text, cx, y, { sizePx: b.sizePx, weight: b.weight, lsPx: b.lsPx, color: b.color, shadow: b.shadow })
    } else if (b.kind === "desc") {
      b.lines.forEach((ln, i) => {
        drawLine(ctx, ln, cx, y + i * b.lineH, { sizePx: b.sizePx, weight: 400, lsPx: 0, color: b.color })
      })
    } else if (b.kind === "divider") {
      ctx.fillStyle = b.color
      ctx.fillRect(cx - b.w / 2, Math.round(y), b.w, Math.max(1, px(1)))
    }
    y += b.h + gap
  }

  ctx.restore()
  return canvas
}

export async function renderShareCardBlob(data, format = "feed") {
  const canvas = await renderShareCardCanvas(data, format)
  return await new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), "image/png"))
}
