import { useEffect, useMemo, useRef, useState, useCallback } from "react"
import { X } from "lucide-react"
import { Share } from "@capacitor/share"
import QRCode from "qrcode"
import { generatePixelMapSvg } from "../lib/pixelMapThumb"

// LOCA 지도 공유 카드 — 시안 19a "웜 크림 도트맵 카드" 앞면 단일 렌더러.
// 지시서 v1.0 (2026-07-19) 구현. 4:5 피드용 1080×1350, 라이트 팔레트 고정.
// 원본 432×540 → ×2.5. 아래 수치는 모두 출력(1080) 기준으로 S 를 곱해 계산한다.
const CANVAS_W = 1080
const CANVAS_H = 1350
const S = 2.5

const PAD_TOP = 30 * S // 75
const PAD_X = 30 * S // 75
const PAD_BOTTOM = 24 * S // 60
const CONTENT_W = CANVAS_W - PAD_X * 2 // 930

const COL = {
  bg: "#F6F3EC",
  title: "#2B2721",
  countLabel: "#5A564A",
  handle: "#9A9284",
  desc: "#7A7466",
  line: "#CFC8B8",
  dotPin: "#E0679A", // 장소
  dotRoute: "#8FA88A", // 길
  dotArea: "#C9A13C", // 영역
  brandDot: "#E0679A",
  qrFg: "#2B2721",
  qrBg: "#FFFFFF",
  qrBorder: "#CFC8B8",
}

const F_SANS = "'Pretendard Variable', Pretendard, sans-serif"
const F_SERIF = "'Gowun Batang', 'Pretendard Variable', serif"

// 지도명: 8자 초과 26px, 11자 초과 22px 로 단계 축소 (원본 기준 × S).
function titleFontSize(title) {
  const len = [...(title || "")].length
  if (len > 11) return 22 * S
  if (len > 8) return 26 * S
  return 30 * S
}

// 한글은 공백이 없어 글자 단위로 접는다. 최대 maxLines 줄, 넘치면 … 로 말줄임.
function wrapDesc(ctx, text, maxWidth, maxLines) {
  const raw = (text || "").replace(/\s+/g, " ").trim()
  if (!raw) return []
  const chars = [...raw]
  const lines = []
  let line = ""
  let overflow = false
  for (let i = 0; i < chars.length; i += 1) {
    const test = line + chars[i]
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line)
      line = chars[i]
      if (lines.length >= maxLines) {
        line = ""
        overflow = i < chars.length - 1
        break
      }
    } else {
      line = test
    }
  }
  if (line && lines.length < maxLines) lines.push(line)
  if (overflow && lines.length) {
    let last = lines[lines.length - 1]
    while (last && ctx.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1)
    lines[lines.length - 1] = `${last}…`
  }
  return lines
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

// 도트맵을 object-fit: cover + nearest-neighbor(픽셀) 로 지도 영역에 채운다.
function drawDotMap(ctx, img, x, y, w, h, radius) {
  ctx.save()
  roundRectPath(ctx, x, y, w, h, radius)
  ctx.clip()
  if (img && img.width && img.height) {
    ctx.imageSmoothingEnabled = false
    const srcRatio = img.width / img.height
    const dstRatio = w / h
    let sx = 0
    let sy = 0
    let sw = img.width
    let sh = img.height
    if (srcRatio > dstRatio) {
      sw = img.height * dstRatio
      sx = (img.width - sw) / 2
    } else {
      sh = img.width / dstRatio
      sy = (img.height - sh) / 2
    }
    ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h)
  } else {
    ctx.fillStyle = "#E7E0CA"
    ctx.fillRect(x, y, w, h)
  }
  ctx.restore()
}

export function MapShareEditor({ map, features = [], handle = "", shareUrl = "", onClose }) {
  const canvasRef = useRef(null)
  const [title, setTitle] = useState(map?.title || "")
  const [desc, setDesc] = useState(map?.description || "")
  const [dotImage, setDotImage] = useState(null)
  const [qrImage, setQrImage] = useState(null)
  const [fontsReady, setFontsReady] = useState(false)
  const [fontTick, setFontTick] = useState(0)
  const [sharing, setSharing] = useState(false)

  const mapId = map?.id || "loca"

  const counts = useMemo(() => {
    const c = { pin: 0, route: 0, area: 0 }
    for (const f of features || []) {
      if (f?.type === "pin") c.pin += 1
      else if (f?.type === "route") c.route += 1
      else if (f?.type === "area") c.area += 1
    }
    return c
  }, [features])

  const pinPoints = useMemo(() => (
    (features || [])
      .filter((f) => f?.type === "pin" && Number.isFinite(Number(f.lat)) && Number.isFinite(Number(f.lng)))
      .map((f) => ({ lat: Number(f.lat), lng: Number(f.lng) }))
  ), [features])

  // 폰트 준비:
  // 1) Pretendard(본문)를 먼저 로드하고 즉시 렌더(캔버스 폴백 방지).
  // 2) 보조 세리프 Gowun Batang 은 jsdelivr(@fontsource, CSP 상 cdn.jsdelivr.net 허용)에서
  //    지연 로드해 완료되면 @핸들만 세리프로 다시 그린다. 실패하면 Pretendard 로 폴백.
  useEffect(() => {
    let alive = true
    const run = async () => {
      try {
        if (document.fonts?.load) {
          await Promise.allSettled([
            document.fonts.load(`900 75px 'Pretendard Variable'`),
            document.fonts.load(`600 30px 'Pretendard Variable'`),
          ])
          await document.fonts.ready
        }
      } catch { /* 폰트 API 미지원 — 기본 폰트로 진행 */ }
      if (alive) setFontsReady(true)

      // Gowun Batang best-effort (지연 로드 → 완료 시 재렌더)
      try {
        const id = "loca-gowun-batang-font"
        let link = document.getElementById(id)
        if (!link) {
          link = document.createElement("link")
          link.id = id
          link.rel = "stylesheet"
          link.href = "https://cdn.jsdelivr.net/npm/@fontsource/gowun-batang/400.css"
          link.crossOrigin = "anonymous"
          document.head.appendChild(link)
        }
        if (!link.sheet) {
          await new Promise((res) => { link.addEventListener("load", res, { once: true }); link.addEventListener("error", res, { once: true }) })
        }
        if (document.fonts?.load) await document.fonts.load(`400 30px 'Gowun Batang'`)
        if (alive) setFontTick((t) => t + 1)
      } catch { /* Gowun 로드 실패 — Pretendard 폴백 유지 */ }
    }
    run()
    return () => { alive = false }
  }, [])

  // 도트맵 스냅샷: 지도 id 시드 + 실제 핀 좌표. SVG → Image 로 1회 래스터화.
  useEffect(() => {
    // 소스 비율을 카드 지도 영역(대략 1.15:1)에 맞춰 object-fit: cover 크롭을 최소화.
    // focus: 핀이 가장 몰린 곳(밀집 지역)을 중심으로 확대.
    const svg = generatePixelMapSvg(mapId, pinPoints, { width: 360, height: 312, cell: 8, focus: true })
    const img = new Image()
    img.decoding = "async"
    let alive = true
    img.onload = () => { if (alive) setDotImage(img) }
    img.onerror = () => { if (alive) setDotImage(null) }
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
    return () => { alive = false }
  }, [mapId, pinPoints])

  // QR — 공유 링크. 에러 보정 M, 전경 #2B2721 / 배경 #FFF.
  useEffect(() => {
    let alive = true
    if (!shareUrl) {
      queueMicrotask(() => { if (alive) setQrImage(null) })
      return () => { alive = false }
    }
    const qrUrl = shareUrl.includes("utm_source")
      ? shareUrl.replace(/utm_source=[^&]+/, "utm_source=qr")
      : shareUrl + (shareUrl.includes("?") ? "&" : "?") + "utm_source=qr"
    const qrCanvas = document.createElement("canvas")
    QRCode.toCanvas(qrCanvas, qrUrl, {
      width: 220,
      margin: 0,
      errorCorrectionLevel: "M",
      color: { dark: COL.qrFg, light: COL.qrBg },
    })
      .then(() => { if (alive) setQrImage(qrCanvas) })
      .catch((err) => {
        console.warn("QR 코드 생성 실패", err)
        if (alive) setQrImage(null)
      })
    return () => { alive = false }
  }, [shareUrl])

  const render = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.width = CANVAS_W
    canvas.height = CANVAS_H
    const ctx = canvas.getContext("2d")
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H)

    // 카드 배경
    ctx.fillStyle = COL.bg
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)

    // ── 지도 설명 줄 미리 계산 (지도 영역 높이 산정에 필요)
    ctx.font = `400 ${13 * S}px ${F_SANS}`
    const descLineH = 13 * S * 1.6
    const descLines = wrapDesc(ctx, desc, CONTENT_W, 2)
    const descH = descLines.length * descLineH

    // ── 세로 레이아웃 계산
    const titleFont = titleFontSize(title)
    const titleBandH = titleFont * 1.02
    const mapTop = PAD_TOP + titleBandH + 16 * S

    const countRowH = 12 * S
    const footerH = 44 * S
    let bottomStack = 16 * S + countRowH // map→count margin + count row
    if (descLines.length) bottomStack += 10 * S + descH // count→desc margin + desc
    bottomStack += 16 * S + footerH + PAD_BOTTOM // →footer margin + footer + bottom pad
    const mapH = Math.max(120, CANVAS_H - mapTop - bottomStack)
    const mapW = CONTENT_W

    // ── ① 지도명 (중앙, 폰트만으로 강조, 1줄)
    ctx.textAlign = "center"
    ctx.textBaseline = "top"
    ctx.fillStyle = COL.title
    ctx.font = `900 ${titleFont}px ${F_SANS}`
    try { ctx.letterSpacing = `${-0.5 * S}px` } catch { /* 미지원 무시 */ }
    ctx.fillText(title || "제목 없는 지도", CANVAS_W / 2, PAD_TOP, CONTENT_W)
    try { ctx.letterSpacing = "0px" } catch { /* noop */ }

    // ── ② 지도 영역 (도트맵)
    drawDotMap(ctx, dotImage, PAD_X, mapTop, mapW, mapH, 8 * S)

    // ── ③ 카운트 줄
    const countCenterY = mapTop + mapH + 16 * S + countRowH / 2
    const items = []
    if (counts.pin > 0) items.push({ label: `장소 ${counts.pin}`, color: COL.dotPin })
    if (counts.route > 0) items.push({ label: `길 ${counts.route}`, color: COL.dotRoute })
    if (counts.area > 0) items.push({ label: `영역 ${counts.area}`, color: COL.dotArea })

    ctx.textBaseline = "middle"
    ctx.textAlign = "left"
    ctx.font = `600 ${12 * S}px ${F_SANS}`
    const dotD = 8 * S
    let cursorX = PAD_X
    items.forEach((it, i) => {
      ctx.fillStyle = it.color
      ctx.beginPath()
      ctx.arc(cursorX + dotD / 2, countCenterY, dotD / 2, 0, Math.PI * 2)
      ctx.fill()
      const labelX = cursorX + dotD + 6 * S
      ctx.fillStyle = COL.countLabel
      ctx.fillText(it.label, labelX, countCenterY)
      cursorX = labelX + ctx.measureText(it.label).width + (i < items.length - 1 ? 14 * S : 0)
    })

    // @핸들 (우측 끝 고정, 보조 세리프)
    ctx.font = `400 ${12 * S}px ${F_SERIF}`
    const handleText = handle || ""
    const handleW = handleText ? ctx.measureText(handleText).width : 0
    const handleX = CANVAS_W - PAD_X - handleW

    // 연결선 — 남는 폭 전체, 최소 12px(원본) 미만이면 생략
    const lineStart = cursorX + (items.length ? 14 * S : 0)
    const lineEnd = (handleText ? handleX : CANVAS_W - PAD_X) - (handleText ? 14 * S : 0)
    if (lineEnd - lineStart >= 12 * S) {
      ctx.strokeStyle = COL.line
      ctx.lineWidth = S
      ctx.beginPath()
      ctx.moveTo(lineStart, countCenterY)
      ctx.lineTo(lineEnd, countCenterY)
      ctx.stroke()
    }
    if (handleText) {
      ctx.fillStyle = COL.handle
      ctx.font = `400 ${12 * S}px ${F_SERIF}`
      ctx.textAlign = "left"
      ctx.fillText(handleText, handleX, countCenterY)
    }

    // ── ④ 지도 설명
    if (descLines.length) {
      const descTop = mapTop + mapH + 16 * S + countRowH + 10 * S
      ctx.fillStyle = COL.desc
      ctx.font = `400 ${13 * S}px ${F_SANS}`
      ctx.textAlign = "left"
      ctx.textBaseline = "top"
      descLines.forEach((ln, i) => {
        ctx.fillText(ln, PAD_X, descTop + i * descLineH + (descLineH - 13 * S) / 2)
      })
    }

    // ── ⑤ 푸터 (좌: LOCA 로고 / 우: QR)
    const footerBottom = CANVAS_H - PAD_BOTTOM
    // 로고
    ctx.textAlign = "left"
    ctx.textBaseline = "alphabetic"
    ctx.fillStyle = COL.title
    ctx.font = `900 ${16 * S}px ${F_SANS}`
    try { ctx.letterSpacing = `${2 * S}px` } catch { /* noop */ }
    const logoBaseline = footerBottom - 6 * S
    ctx.fillText("LOCA", PAD_X, logoBaseline)
    const logoW = ctx.measureText("LOCA").width
    try { ctx.letterSpacing = "0px" } catch { /* noop */ }
    const sq = 7 * S
    ctx.fillStyle = COL.brandDot
    ctx.fillRect(PAD_X + logoW + 4 * S, logoBaseline - sq, sq, sq)

    // QR 박스
    const qrBox = 44 * S
    const qrX = CANVAS_W - PAD_X - qrBox
    const qrY = footerBottom - qrBox
    ctx.fillStyle = COL.qrBg
    roundRectPath(ctx, qrX, qrY, qrBox, qrBox, 6 * S)
    ctx.fill()
    ctx.strokeStyle = COL.qrBorder
    ctx.lineWidth = S
    roundRectPath(ctx, qrX, qrY, qrBox, qrBox, 6 * S)
    ctx.stroke()
    if (qrImage) {
      const qpad = 5 * S
      ctx.save()
      ctx.imageSmoothingEnabled = false
      ctx.drawImage(qrImage, qrX + qpad, qrY + qpad, qrBox - qpad * 2, qrBox - qpad * 2)
      ctx.restore()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fontTick: Gowun Batang 로드 후 @핸들 재렌더 트리거
  }, [title, desc, counts, handle, dotImage, qrImage, fontTick])

  useEffect(() => {
    if (!fontsReady) return
    render()
  }, [render, fontsReady])

  const handleExport = async () => {
    const canvas = canvasRef.current
    if (!canvas || sharing) return
    setSharing(true)
    canvas.toBlob(async (blob) => {
      if (!blob) { setSharing(false); return }
      const filename = `${(title || "LOCA").replace(/[\\/:*?"<>|]/g, "_")}.png`
      try {
        const dataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader()
          reader.onloadend = () => resolve(reader.result)
          reader.onerror = reject
          reader.readAsDataURL(blob)
        })
        try {
          await Share.share({ title: title || "LOCA", files: [dataUrl], dialogTitle: "지도 이미지 공유하기" })
          setSharing(false)
          return
        } catch (err) {
          if (err?.message === "Share canceled") { setSharing(false); return }
          // 네이티브 공유 실패 → 아래 다운로드 폴백
        }
      } catch {
        /* dataURL 실패 → 다운로드 폴백 */
      }
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
      setSharing(false)
    }, "image/png")
  }

  return (
    <div className="share-editor">
      <header className="share-editor__header">
        <button className="share-editor__close" type="button" onClick={onClose} aria-label="닫기"><X size={18} /></button>
        <strong className="share-editor__heading">이미지 공유</strong>
        <button className="share-editor__export" type="button" onClick={handleExport} disabled={sharing}>
          {sharing ? "..." : "공유"}
        </button>
      </header>

      <div className="share-editor__preview">
        <canvas ref={canvasRef} className="share-editor__canvas" width={CANVAS_W} height={CANVAS_H} />
      </div>

      <div className="share-editor__controls">
        <div className="share-editor__field">
          <label className="share-editor__label" htmlFor="share-title">지도명</label>
          <input
            id="share-title"
            className="share-editor__input"
            type="text"
            value={title}
            maxLength={30}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="제목 없는 지도"
          />
        </div>
        <div className="share-editor__field">
          <label className="share-editor__label" htmlFor="share-desc">지도 설명</label>
          <textarea
            id="share-desc"
            className="share-editor__input share-editor__input--area"
            value={desc}
            maxLength={80}
            rows={2}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="한 줄 소개를 남겨 보세요 (최대 2줄)"
          />
        </div>
      </div>
    </div>
  )
}
