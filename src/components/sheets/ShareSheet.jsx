import { useEffect, useRef, useState, useCallback } from "react"
import QRCode from "qrcode"
import { BottomSheet } from "../ui"
import { logEvent } from "../../lib/analytics"

const QR_PREVIEW_SIZE = 200
const QR_DOWNLOAD_SIZE = 1024
const QR_LOGO_EMOJI = "📍"

function getCleanShareUrl(shareUrl) {
  if (!shareUrl) return ""
  try {
    const url = new URL(shareUrl)
    url.searchParams.delete("utm_source")
    return url.toString()
  } catch {
    return shareUrl.replace(/[?&]utm_source=[^&]+/, "")
  }
}

function generateHighResQr(shareUrl, mapTitle) {
  return new Promise((resolve, reject) => {
    const qrCanvas = document.createElement("canvas")
    QRCode.toCanvas(qrCanvas, shareUrl, {
      width: QR_DOWNLOAD_SIZE,
      margin: 2,
      errorCorrectionLevel: "H",
      color: { dark: "#000000", light: "#ffffff" },
    })
      .then(() => {
        const qrCtx = qrCanvas.getContext("2d")
        const logoSize = Math.round(QR_DOWNLOAD_SIZE * 0.15)
        const cx = QR_DOWNLOAD_SIZE / 2
        const cy = QR_DOWNLOAD_SIZE / 2
        qrCtx.fillStyle = "#ffffff"
        qrCtx.beginPath()
        qrCtx.arc(cx, cy, logoSize * 0.75, 0, Math.PI * 2)
        qrCtx.fill()
        qrCtx.font = `${logoSize}px serif`
        qrCtx.textAlign = "center"
        qrCtx.textBaseline = "middle"
        qrCtx.fillText(QR_LOGO_EMOJI, cx, cy)

        // 최종 캔버스: QR + 타이틀만 (URL 제거)
        const padding = 80
        const titleHeight = 60
        const gap = 24
        const totalH = padding + QR_DOWNLOAD_SIZE + gap + titleHeight + padding
        const totalW = QR_DOWNLOAD_SIZE + padding * 2

        const finalCanvas = document.createElement("canvas")
        finalCanvas.width = totalW
        finalCanvas.height = totalH
        const ctx = finalCanvas.getContext("2d")

        ctx.fillStyle = "#ffffff"
        ctx.fillRect(0, 0, totalW, totalH)
        ctx.drawImage(qrCanvas, padding, padding, QR_DOWNLOAD_SIZE, QR_DOWNLOAD_SIZE)

        const titleY = padding + QR_DOWNLOAD_SIZE + gap + titleHeight / 2
        ctx.fillStyle = "#101828"
        ctx.font = "bold 48px Pretendard, Noto Sans KR, sans-serif"
        ctx.textAlign = "center"
        ctx.textBaseline = "middle"
        ctx.fillText(mapTitle || "LOCA", totalW / 2, titleY, QR_DOWNLOAD_SIZE)

        ctx.fillStyle = "#b0b8c9"
        ctx.font = "bold 24px Pretendard, Noto Sans KR, sans-serif"
        ctx.textAlign = "right"
        ctx.fillText("LOCA", totalW - padding, totalH - 30)

        resolve(finalCanvas)
      })
      .catch(reject)
  })
}

function sanitizeFilename(str) {
  // eslint-disable-next-line no-control-regex
  return (str || "LOCA").replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").slice(0, 80)
}

// 카카오 SDK 초기화
function ensureKakaoSdk() {
  return new Promise((resolve) => {
    if (window.Kakao?.Share) {
      if (!window.Kakao.isInitialized()) {
        const key = import.meta.env.VITE_KAKAO_JS_KEY
        if (key) window.Kakao.init(key)
      }
      resolve(true)
      return
    }
    // SDK 동적 로드
    const key = import.meta.env.VITE_KAKAO_JS_KEY
    if (!key) { resolve(false); return }

    const script = document.createElement("script")
    script.src = "https://t1.kakaocdn.net/kakao_js_sdk/2.7.4/kakao.min.js"
    script.onload = () => {
      if (window.Kakao && !window.Kakao.isInitialized()) {
        window.Kakao.init(key)
      }
      resolve(!!window.Kakao?.Share)
    }
    script.onerror = () => resolve(false)
    document.head.appendChild(script)
  })
}

export function ShareSheet({
  open,
  map,
  shareUrl: rawShareUrl,
  onClose,
  onOpenImageShare,
  capturing,
  showToast,
}) {
  const qrPreviewRef = useRef(null)
  const [copied, setCopied] = useState(false)

  // 발행된 지도: slug가 있으면 발행된 것
  const cleanUrl = getCleanShareUrl(rawShareUrl)

  // QR용 URL: 공유 URL이 있으면 QR 생성
  const qrUrl = cleanUrl || null

  // Generate QR preview
  useEffect(() => {
    if (!open || !qrUrl) return
    const canvas = qrPreviewRef.current
    if (!canvas) return
    QRCode.toCanvas(canvas, qrUrl, {
      width: QR_PREVIEW_SIZE,
      margin: 2,
      errorCorrectionLevel: "H",
      color: { dark: "#000000", light: "#ffffff" },
    })
      .then(() => {
        const ctx = canvas.getContext("2d")
        const logoSize = Math.round(QR_PREVIEW_SIZE * 0.15)
        const cx = QR_PREVIEW_SIZE / 2
        const cy = QR_PREVIEW_SIZE / 2
        ctx.fillStyle = "#ffffff"
        ctx.beginPath()
        ctx.arc(cx, cy, logoSize * 0.75, 0, Math.PI * 2)
        ctx.fill()
        ctx.font = `${logoSize}px serif`
        ctx.textAlign = "center"
        ctx.textBaseline = "middle"
        ctx.fillText(QR_LOGO_EMOJI, cx, cy)
      })
      .catch(() => {
        if (showToast) showToast("QR 코드를 만들지 못했어요.")
      })
  }, [open, qrUrl, showToast])

  const handleCopyUrl = useCallback(async () => {
    if (!cleanUrl) return
    try {
      await navigator.clipboard.writeText(cleanUrl)
      logEvent("share_click", { map_id: map?.id, meta: { method: "link" } })
      setCopied(true)
      if (showToast) showToast("링크가 복사되었어요!")
      setTimeout(() => setCopied(false), 2000)
    } catch {
      if (showToast) showToast("클립보드 복사에 실패했어요.")
      else prompt("복사하세요:", cleanUrl)
    }
  }, [cleanUrl, showToast, map])

  const handleKakaoShare = useCallback(async () => {
    if (!cleanUrl) return
    logEvent("share_click", { map_id: map?.id, meta: { method: "kakao" } })

    const sdkReady = await ensureKakaoSdk()
    if (sdkReady && window.Kakao?.Share) {
      try {
        const kakaoUrl = cleanUrl + (cleanUrl.includes("?") ? "&" : "?") + "utm_source=kakao"
        const ogImageUrl = `https://loca202603.vercel.app/api/og-image/${encodeURIComponent(map?.slug || "loca")}`
        window.Kakao.Share.sendDefault({
          objectType: "feed",
          content: {
            title: map?.title || "LOCA 지도",
            description: map?.description || `${map?.title || "LOCA"} 지도를 열어보세요.`,
            imageUrl: ogImageUrl,
            imageWidth: 800,
            imageHeight: 400,
            link: { mobileWebUrl: kakaoUrl, webUrl: kakaoUrl },
          },
          buttons: [
            { title: "지도 열기", link: { mobileWebUrl: kakaoUrl, webUrl: kakaoUrl } },
          ],
        })
        return
      } catch {
        // fallback
      }
    }
    // 카카오 SDK 없으면 클립보드 복사 후 안내
    try {
      await navigator.clipboard.writeText(cleanUrl)
      if (showToast) showToast("링크가 복사되었어요. 카카오톡에 붙여넣기 하세요!")
    } catch {
      prompt("카카오톡에 붙여넣으세요:", cleanUrl)
    }
  }, [cleanUrl, map, showToast])

  const handleQrDownload = useCallback(async () => {
    if (!qrUrl) return
    logEvent("share_click", { map_id: map?.id, meta: { method: "qr" } })
    try {
      const canvas = await generateHighResQr(qrUrl, map?.title)
      canvas.toBlob((blob) => {
        if (!blob) return
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = `LOCA_QR_${sanitizeFilename(map?.title)}_${map?.slug || "map"}.png`
        a.click()
        URL.revokeObjectURL(url)
      }, "image/png")
      if (showToast) showToast("QR 코드가 저장되었어요!")
    } catch {
      if (showToast) showToast("QR 다운로드에 실패했어요.")
    }
  }, [qrUrl, map, showToast])

  return (
    <BottomSheet open={open} title="지도 공유하기" onClose={onClose}>
      <div className="share-sheet">
        {qrUrl ? (
          <div className="share-sheet__qr-section">
            <canvas
              ref={qrPreviewRef}
              className="share-sheet__qr-preview"
              width={QR_PREVIEW_SIZE}
              height={QR_PREVIEW_SIZE}
            />
            <button
              className="button button--ghost share-sheet__qr-download-btn"
              type="button"
              onClick={handleQrDownload}
            >
              인쇄용 QR 다운로드 (1024px)
            </button>
          </div>
        ) : null}

        <div className="share-sheet__actions">
          <button
            className="share-sheet__action-btn share-sheet__action-btn--copy"
            type="button"
            onClick={handleCopyUrl}
          >
            <span className="share-sheet__action-icon">🔗</span>
            <span className="share-sheet__action-label">{copied ? "복사됨!" : "링크 복사"}</span>
          </button>

          <button
            className="share-sheet__action-btn share-sheet__action-btn--kakao"
            type="button"
            onClick={handleKakaoShare}
          >
            <span className="share-sheet__action-icon">💬</span>
            <span className="share-sheet__action-label">카카오톡</span>
          </button>

          <button
            className="share-sheet__action-btn share-sheet__action-btn--image"
            type="button"
            disabled={capturing}
            onClick={onOpenImageShare}
          >
            <span className="share-sheet__action-icon">🖼️</span>
            <span className="share-sheet__action-label">{capturing ? "캡처 중..." : "이미지 공유"}</span>
          </button>
        </div>
      </div>
    </BottomSheet>
  )
}
