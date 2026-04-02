import { useEffect, useRef, useState, useCallback } from "react"
import { Share } from "@capacitor/share"
import QRCode from "qrcode"

const CANVAS_W = 1080
const CANVAS_H = 1350

const FRAMES = [
  { id: "magazine", label: "매거진" },
  { id: "cute", label: "큐트맵" },
  { id: "pastel", label: "파스텔" },
  { id: "sunset", label: "선셋" },
  { id: "ocean", label: "오션" },
  { id: "forest", label: "포레스트" },
  { id: "candy", label: "캔디팝" },
]

const STICKER_PALETTE = ["❤️", "⭐", "📍", "🎉", "🔥", "✈️", "🍽️", "☕", "🌸", "🎵", "💫", "🏔️", "🌊", "🎈", "✨"]

function drawMapImage(ctx, mapImage, x, y, w, h, radius) {
  ctx.save()
  if (radius > 0) {
    ctx.beginPath()
    ctx.roundRect(x, y, w, h, radius)
    ctx.clip()
  }
  if (mapImage) {
    const srcRatio = mapImage.width / mapImage.height
    const dstRatio = w / h
    let sx = 0, sy = 0, sw = mapImage.width, sh = mapImage.height
    if (srcRatio > dstRatio) { sw = mapImage.height * dstRatio; sx = (mapImage.width - sw) / 2 }
    else { sh = mapImage.width / dstRatio; sy = (mapImage.height - sh) / 2 }
    ctx.drawImage(mapImage, sx, sy, sw, sh, x, y, w, h)
  } else {
    ctx.fillStyle = "#e5e7eb"
    ctx.fillRect(x, y, w, h)
  }
  ctx.restore()
}

function drawTitle(ctx, title, x, y, color, size, maxW) {
  ctx.fillStyle = color
  ctx.font = `bold ${size}px Pretendard, Noto Sans KR, sans-serif`
  ctx.textAlign = "center"
  ctx.fillText(title || "LOCA", x, y, maxW)
}

function drawStickers(ctx, stickers) {
  ctx.save()
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = "source-over"
  ctx.fillStyle = "#000"
  stickers.forEach((s) => {
    ctx.font = `${s.size}px serif`
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    ctx.fillText(s.emoji, s.x, s.y)
  })
  ctx.restore()
}

// Shared layout constants
const MAP_X = 60
const MAP_Y = 60
const MAP_W = CANVAS_W - 120 // 960
const MAP_H = 1040
const FOOTER_Y = MAP_Y + MAP_H + 30 // 1130

function drawTagsOrTitle(ctx, title, features, colors, titleColor) {
  // Always draw title first
  drawTitle(ctx, title, CANVAS_W / 2, FOOTER_Y + 50, titleColor || colors[0], 42, 700)
  // Then draw tags below title
  const tags = (features || []).filter((f) => f.type === "pin").slice(0, 6)
  if (tags.length > 0) {
    const tagH = 42, tagGap = 8, maxPerRow = 3, rows = []
    for (let i = 0; i < tags.length; i += maxPerRow) rows.push(tags.slice(i, i + maxPerRow))
    let tagIdx = 0
    rows.forEach((row, ri) => {
      ctx.font = "bold 24px Pretendard, Noto Sans KR, sans-serif"
      const widths = row.map((f) => ctx.measureText(`${f.emoji} ${f.title}`).width + 36)
      const totalW = widths.reduce((a, b) => a + b, 0) + (row.length - 1) * tagGap
      let startX = (CANVAS_W - totalW) / 2
      row.forEach((f, ci) => {
        const tw = widths[ci]
        const ty = FOOTER_Y + 80 + ri * (tagH + tagGap)
        ctx.fillStyle = colors[tagIdx % colors.length]
        ctx.beginPath(); ctx.roundRect(startX, ty, tw, tagH, tagH / 2); ctx.fill()
        ctx.fillStyle = "#fff"
        ctx.font = "bold 24px Pretendard, Noto Sans KR, sans-serif"
        ctx.textAlign = "center"; ctx.textBaseline = "middle"
        ctx.fillText(`${f.emoji} ${f.title}`, startX + tw / 2, ty + tagH / 2, tw - 14)
        startX += tw + tagGap
        tagIdx++
      })
    })
    ctx.textBaseline = "alphabetic"
  }
  ctx.textAlign = "start"
}

function drawCloud(ctx, cx, cy, s, color) {
  ctx.fillStyle = color || "rgba(255,255,255,0.7)"
  ctx.beginPath(); ctx.arc(cx, cy, s * 30, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.arc(cx - s * 22, cy + s * 8, s * 22, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.arc(cx + s * 25, cy + s * 6, s * 24, 0, Math.PI * 2); ctx.fill()
}

const framePainters = {
  magazine(ctx, mapImage, title, theme) {
    ctx.fillStyle = "#101014"
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)
    drawMapImage(ctx, mapImage, 0, 0, CANVAS_W, CANVAS_H, 0)
    const grad = ctx.createLinearGradient(0, CANVAS_H * 0.5, 0, CANVAS_H)
    grad.addColorStop(0, "rgba(0,0,0,0)")
    grad.addColorStop(0.5, "rgba(0,0,0,0.5)")
    grad.addColorStop(1, "rgba(0,0,0,0.85)")
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)
    ctx.fillStyle = theme || "#635BFF"
    ctx.fillRect(80, FOOTER_Y - 10, 60, 5)
    ctx.fillStyle = "#fff"
    ctx.font = "bold 56px Pretendard, Noto Sans KR, sans-serif"
    ctx.textAlign = "left"
    ctx.fillText(title || "LOCA", 80, FOOTER_Y + 50, CANVAS_W - 160)
    ctx.textAlign = "start"
  },

  cute(ctx, mapImage, title, theme, features) {
    const sky = ctx.createLinearGradient(0, 0, 0, CANVAS_H)
    sky.addColorStop(0, "#7EC8E3"); sky.addColorStop(0.3, "#A8E6CF")
    sky.addColorStop(0.6, "#FFD3B6"); sky.addColorStop(1, "#FF9A76")
    ctx.fillStyle = sky
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)
    drawCloud(ctx, 120, 30, 1.0); drawCloud(ctx, 500, 20, 0.7)
    ctx.fillStyle = "#fff"
    ctx.beginPath(); ctx.roundRect(MAP_X - 8, MAP_Y - 8, MAP_W + 16, MAP_H + 16, 28); ctx.fill()
    drawMapImage(ctx, mapImage, MAP_X, MAP_Y, MAP_W, MAP_H, 22)
    drawTagsOrTitle(ctx, title, features, ["#FF6B6B", "#4ECDC4", "#FFE66D", "#A8E6CF", "#FF8A5C", "#6C5CE7"], "#2d2d2d")
    ctx.font = "40px serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"
    ctx.fillText("🌿", 30, 30); ctx.fillText("🌸", 40, CANVAS_H - 30); ctx.fillText("⭐", CANVAS_W - 40, CANVAS_H - 30)
    ctx.textAlign = "start"; ctx.textBaseline = "alphabetic"
  },

  pastel(ctx, mapImage, title, theme, features) {
    const bg = ctx.createLinearGradient(0, 0, CANVAS_W, CANVAS_H)
    bg.addColorStop(0, "#FFDEE9"); bg.addColorStop(0.5, "#E8D5F5"); bg.addColorStop(1, "#B5DEFF")
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)
    // soft circles
    ctx.globalAlpha = 0.15; ctx.fillStyle = "#fff"
    ctx.beginPath(); ctx.arc(200, 100, 180, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.arc(CANVAS_W - 150, CANVAS_H - 200, 220, 0, Math.PI * 2); ctx.fill()
    ctx.globalAlpha = 1
    // white card
    ctx.save()
    ctx.shadowColor = "rgba(0,0,0,0.06)"; ctx.shadowBlur = 24; ctx.shadowOffsetY = 8
    ctx.fillStyle = "rgba(255,255,255,0.85)"
    ctx.beginPath(); ctx.roundRect(MAP_X - 10, MAP_Y - 10, MAP_W + 20, MAP_H + 20, 32); ctx.fill()
    ctx.restore()
    drawMapImage(ctx, mapImage, MAP_X, MAP_Y, MAP_W, MAP_H, 24)
    drawTagsOrTitle(ctx, title, features, ["#E491B2", "#9B7ED8", "#6CB4EE", "#F0A6CA", "#B8A9C9", "#88C9D4"], "#5B4A6F")
    ctx.font = "36px serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"
    ctx.fillText("🦋", 35, 35); ctx.fillText("🌷", CANVAS_W - 35, 40); ctx.fillText("💜", 35, CANVAS_H - 35)
    ctx.textAlign = "start"; ctx.textBaseline = "alphabetic"
  },

  sunset(ctx, mapImage, title, theme, features) {
    const bg = ctx.createLinearGradient(0, 0, 0, CANVAS_H)
    bg.addColorStop(0, "#1a1a2e"); bg.addColorStop(0.3, "#16213e")
    bg.addColorStop(0.6, "#e94560"); bg.addColorStop(1, "#ffb347")
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)
    // stars
    ctx.fillStyle = "rgba(255,255,255,0.5)"
    for (let i = 0; i < 30; i++) {
      const sx = 40 + (i * 137) % (CANVAS_W - 80)
      const sy = 10 + (i * 89) % 40
      ctx.beginPath(); ctx.arc(sx, sy, 1.5, 0, Math.PI * 2); ctx.fill()
    }
    // map with glow border
    ctx.save()
    ctx.shadowColor = "rgba(233,69,96,0.3)"; ctx.shadowBlur = 30
    ctx.fillStyle = "rgba(255,255,255,0.1)"
    ctx.beginPath(); ctx.roundRect(MAP_X - 6, MAP_Y - 6, MAP_W + 12, MAP_H + 12, 22); ctx.fill()
    ctx.restore()
    drawMapImage(ctx, mapImage, MAP_X, MAP_Y, MAP_W, MAP_H, 18)
    drawTagsOrTitle(ctx, title, features, ["#e94560", "#ffb347", "#ff6b6b", "#ffd166", "#ef476f", "#fca311"], "#fff")
    ctx.font = "36px serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"
    ctx.fillText("🌅", 35, 35); ctx.fillText("✨", CANVAS_W - 35, CANVAS_H - 35)
    ctx.textAlign = "start"; ctx.textBaseline = "alphabetic"
  },

  ocean(ctx, mapImage, title, theme, features) {
    const bg = ctx.createLinearGradient(0, 0, 0, CANVAS_H)
    bg.addColorStop(0, "#E0F7FA"); bg.addColorStop(0.4, "#80DEEA")
    bg.addColorStop(0.8, "#0097A7"); bg.addColorStop(1, "#006064")
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)
    // wave pattern
    ctx.strokeStyle = "rgba(255,255,255,0.12)"; ctx.lineWidth = 3
    for (let wy = 20; wy < CANVAS_H; wy += 60) {
      ctx.beginPath()
      for (let wx = 0; wx <= CANVAS_W; wx += 5) {
        const y2 = wy + Math.sin(wx * 0.015 + wy * 0.1) * 12
        wx === 0 ? ctx.moveTo(wx, y2) : ctx.lineTo(wx, y2)
      }
      ctx.stroke()
    }
    ctx.fillStyle = "#fff"
    ctx.beginPath(); ctx.roundRect(MAP_X - 8, MAP_Y - 8, MAP_W + 16, MAP_H + 16, 26); ctx.fill()
    drawMapImage(ctx, mapImage, MAP_X, MAP_Y, MAP_W, MAP_H, 20)
    drawTagsOrTitle(ctx, title, features, ["#00BCD4", "#0097A7", "#26C6DA", "#4DD0E1", "#00ACC1", "#0088A3"], "#fff")
    ctx.font = "36px serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"
    ctx.fillText("🐚", 35, 30); ctx.fillText("🌊", CANVAS_W - 35, 35); ctx.fillText("🐠", 35, CANVAS_H - 30)
    ctx.textAlign = "start"; ctx.textBaseline = "alphabetic"
  },

  forest(ctx, mapImage, title, theme, features) {
    const bg = ctx.createLinearGradient(0, 0, 0, CANVAS_H)
    bg.addColorStop(0, "#E8F5E9"); bg.addColorStop(0.4, "#A5D6A7")
    bg.addColorStop(0.8, "#388E3C"); bg.addColorStop(1, "#1B5E20")
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)
    // tree silhouettes at bottom
    ctx.fillStyle = "rgba(27,94,32,0.15)"
    const drawTree = (tx, th) => {
      ctx.beginPath()
      ctx.moveTo(tx, CANVAS_H); ctx.lineTo(tx - th * 0.3, CANVAS_H - th * 0.6)
      ctx.lineTo(tx - th * 0.15, CANVAS_H - th * 0.6); ctx.lineTo(tx - th * 0.35, CANVAS_H - th)
      ctx.lineTo(tx + th * 0.35, CANVAS_H - th); ctx.lineTo(tx + th * 0.15, CANVAS_H - th * 0.6)
      ctx.lineTo(tx + th * 0.3, CANVAS_H - th * 0.6); ctx.lineTo(tx, CANVAS_H)
      ctx.fill()
    }
    drawTree(80, 200); drawTree(250, 160); drawTree(CANVAS_W - 100, 220); drawTree(CANVAS_W - 250, 140)
    // map
    ctx.save()
    ctx.shadowColor = "rgba(0,0,0,0.1)"; ctx.shadowBlur = 20; ctx.shadowOffsetY = 6
    ctx.fillStyle = "rgba(255,255,255,0.9)"
    ctx.beginPath(); ctx.roundRect(MAP_X - 8, MAP_Y - 8, MAP_W + 16, MAP_H + 16, 26); ctx.fill()
    ctx.restore()
    drawMapImage(ctx, mapImage, MAP_X, MAP_Y, MAP_W, MAP_H, 20)
    drawTagsOrTitle(ctx, title, features, ["#4CAF50", "#2E7D32", "#81C784", "#66BB6A", "#388E3C", "#43A047"], "#fff")
    ctx.font = "36px serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"
    ctx.fillText("🌲", 35, 30); ctx.fillText("🍃", CANVAS_W - 35, 35); ctx.fillText("🌿", 35, CANVAS_H - 30); ctx.fillText("🦌", CANVAS_W - 40, CANVAS_H - 30)
    ctx.textAlign = "start"; ctx.textBaseline = "alphabetic"
  },

  candy(ctx, mapImage, title, theme, features) {
    ctx.fillStyle = "#FFF8E1"
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)
    // polka dots
    const dotColors = ["rgba(255,105,135,0.12)", "rgba(255,193,7,0.12)", "rgba(129,212,250,0.12)", "rgba(206,147,216,0.12)"]
    for (let dy = 30; dy < CANVAS_H; dy += 70) {
      for (let dx = 30; dx < CANVAS_W; dx += 70) {
        ctx.fillStyle = dotColors[((dy / 70 | 0) + (dx / 70 | 0)) % dotColors.length]
        ctx.beginPath(); ctx.arc(dx + (dy % 140 === 0 ? 0 : 35), dy, 16, 0, Math.PI * 2); ctx.fill()
      }
    }
    // map with colorful border
    ctx.save()
    ctx.shadowColor = "rgba(255,105,135,0.15)"; ctx.shadowBlur = 20
    ctx.strokeStyle = "#FF6987"; ctx.lineWidth = 6; ctx.setLineDash([16, 10])
    ctx.beginPath(); ctx.roundRect(MAP_X - 12, MAP_Y - 12, MAP_W + 24, MAP_H + 24, 28); ctx.stroke()
    ctx.setLineDash([])
    ctx.restore()
    ctx.fillStyle = "#fff"
    ctx.beginPath(); ctx.roundRect(MAP_X - 6, MAP_Y - 6, MAP_W + 12, MAP_H + 12, 24); ctx.fill()
    drawMapImage(ctx, mapImage, MAP_X, MAP_Y, MAP_W, MAP_H, 20)
    drawTagsOrTitle(ctx, title, features, ["#FF6987", "#FFC107", "#81D4FA", "#CE93D8", "#FFB74D", "#AED581"], "#E65100")
    ctx.font = "36px serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"
    ctx.fillText("🍭", 35, 30); ctx.fillText("🍬", CANVAS_W - 35, 35); ctx.fillText("🎀", 35, CANVAS_H - 30); ctx.fillText("🧁", CANVAS_W - 40, CANVAS_H - 30)
    ctx.textAlign = "start"; ctx.textBaseline = "alphabetic"
  },
}

function drawQrCode(ctx, qrImg) {
  if (!qrImg) return
  const size = 120
  const x = CANVAS_W - MAP_X - size
  const y = FOOTER_Y + 10
  ctx.save()
  ctx.fillStyle = "rgba(255,255,255,0.92)"
  ctx.beginPath()
  ctx.roundRect(x - 8, y - 8, size + 16, size + 16, 14)
  ctx.fill()
  ctx.drawImage(qrImg, x, y, size, size)
  ctx.restore()
}

function drawFrame(ctx, frame, mapImage, title, theme, stickers, features, frameImg, qrImg) {
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H)
  ctx.save()
  if (frame.frameImage && frameImg) {
    const r = frame.mapRect
    drawMapImage(ctx, mapImage, r.x, r.y, r.w, r.h, 0)
    ctx.drawImage(frameImg, 0, 0, CANVAS_W, CANVAS_H)
  } else {
    const painter = framePainters[frame.id]
    if (painter) {
      painter(ctx, mapImage, title, theme, features)
    } else {
      ctx.fillStyle = "#fff"
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)
      drawMapImage(ctx, mapImage, 50, 50, CANVAS_W - 100, CANVAS_H - 250, 0)
      drawTitle(ctx, title, CANVAS_W / 2, CANVAS_H - 120, "#101828", 44, CANVAS_W - 120)
    }
  }
  ctx.restore()
  drawQrCode(ctx, qrImg)
  drawStickers(ctx, stickers)
}

export function MapShareEditor({ mapImage, mapTitle, mapTheme, mapFeatures = [], shareUrl = "", onClose, showToast }) {
  const canvasRef = useRef(null)
  const previewRef = useRef(null)
  const [frameId, setFrameId] = useState("magazine")
  const [stickers, setStickers] = useState([])
  const [dragging, setDragging] = useState(null)
  const [qrImage, setQrImage] = useState(null)

  const frame = FRAMES.find((f) => f.id === frameId) || FRAMES[0]

  // Generate QR code image with logo
  useEffect(() => {
    if (!shareUrl) return
    const qrUrl = shareUrl.includes("utm_source")
      ? shareUrl.replace(/utm_source=[^&]+/, "utm_source=qr")
      : shareUrl + (shareUrl.includes("?") ? "&" : "?") + "utm_source=qr"
    const qrCanvas = document.createElement("canvas")
    QRCode.toCanvas(qrCanvas, qrUrl, { width: 140, margin: 1, errorCorrectionLevel: "H", color: { dark: "#000", light: "#fff" } })
      .then(() => {
        // Draw logo emoji in center
        const ctx = qrCanvas.getContext("2d")
        const logoSize = Math.round(140 * 0.15)
        const cx = 70, cy = 70
        ctx.fillStyle = "#ffffff"
        ctx.beginPath()
        ctx.arc(cx, cy, logoSize * 0.75, 0, Math.PI * 2)
        ctx.fill()
        ctx.font = `${logoSize}px serif`
        ctx.textAlign = "center"
        ctx.textBaseline = "middle"
        ctx.fillText("📍", cx, cy)
        setQrImage(qrCanvas)
      })
      .catch((err) => {
        console.warn("QR 코드 생성 실패", err)
        if (showToast) showToast("QR 코드를 만들지 못했어요.")
      })
  }, [shareUrl, showToast])

  const render = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.width = CANVAS_W
    canvas.height = CANVAS_H
    const ctx = canvas.getContext("2d")
    drawFrame(ctx, frame, mapImage, mapTitle, mapTheme, stickers, mapFeatures, null, qrImage)
  }, [frame, mapImage, mapTitle, mapTheme, stickers, mapFeatures, qrImage])

  useEffect(() => {
    render()
  }, [render])

  const getCanvasPos = (e) => {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return null
    const touch = e.touches ? e.touches[0] : e
    const scaleX = CANVAS_W / rect.width
    const scaleY = CANVAS_H / rect.height
    return { x: (touch.clientX - rect.left) * scaleX, y: (touch.clientY - rect.top) * scaleY }
  }

  const handlePointerDown = (e) => {
    const pos = getCanvasPos(e)
    if (!pos) return
    const hit = [...stickers].reverse().findIndex((s) => Math.abs(s.x - pos.x) < s.size / 2 && Math.abs(s.y - pos.y) < s.size / 2)
    if (hit >= 0) {
      setDragging(stickers.length - 1 - hit)
    }
  }

  const handlePointerMove = (e) => {
    if (dragging === null) return
    const pos = getCanvasPos(e)
    if (!pos) return
    setStickers((prev) => prev.map((s, i) => (i === dragging ? { ...s, x: pos.x, y: pos.y } : s)))
  }

  const handlePointerUp = () => {
    setDragging(null)
  }

  const addSticker = (emoji) => {
    setStickers((prev) => [...prev, { emoji, x: CANVAS_W / 2, y: CANVAS_H / 2, size: 80 }])
  }

  const removeLastSticker = () => {
    setStickers((prev) => prev.slice(0, -1))
  }

  const handleExport = async () => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.toBlob(async (blob) => {
      if (!blob) return
      try {
        const reader = new FileReader()
        reader.onloadend = async () => {
          try {
            await Share.share({
              title: mapTitle,
              files: [reader.result],
              dialogTitle: "지도 이미지 공유하기",
            })
            return
          } catch (err) {
            if (err?.message === "Share canceled") return
            // fallback to download below
          }
        }
        reader.readAsDataURL(blob)
        return
      } catch {
        // fallback to download below
      }
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `${mapTitle || "LOCA"}.png`
      a.click()
      URL.revokeObjectURL(url)
    }, "image/png")
  }

  return (
    <div className="share-editor">
      <header className="share-editor__header">
        <button className="share-editor__close" type="button" onClick={onClose}>✕</button>
        <strong className="share-editor__heading">이미지 공유</strong>
        <button className="share-editor__export" type="button" onClick={handleExport}>공유</button>
      </header>

      <div className="share-editor__preview" ref={previewRef}>
        <canvas
          ref={canvasRef}
          className="share-editor__canvas"
          onMouseDown={handlePointerDown}
          onMouseMove={handlePointerMove}
          onMouseUp={handlePointerUp}
          onTouchStart={handlePointerDown}
          onTouchMove={handlePointerMove}
          onTouchEnd={handlePointerUp}
        />
      </div>

      <div className="share-editor__controls">
        <div className="share-editor__section">
          <label className="share-editor__label">프레임</label>
          <div className="share-editor__frame-list">
            {FRAMES.map((f) => (
              <button
                key={f.id}
                className={`share-editor__frame-chip${frameId === f.id ? " is-active" : ""}`}
                type="button"
                onClick={() => setFrameId(f.id)}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="share-editor__section">
          <div className="share-editor__sticker-header">
            <label className="share-editor__label">스티커</label>
            {stickers.length > 0 ? (
              <button className="share-editor__undo" type="button" onClick={removeLastSticker}>되돌리기</button>
            ) : null}
          </div>
          <div className="share-editor__sticker-list">
            {STICKER_PALETTE.map((emoji) => (
              <button key={emoji} className="share-editor__sticker-btn" type="button" onClick={() => addSticker(emoji)}>
                {emoji}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
