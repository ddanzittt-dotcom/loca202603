import { useEffect, useRef, useState, useCallback } from "react"
import QRCode from "qrcode"
import { BottomSheet } from "../ui"

const QR_PREVIEW_SIZE = 200
const QR_DOWNLOAD_SIZE = 1024
const QR_LOGO_EMOJI = "📍"

function generateHighResQr(shareUrl, mapTitle) {
  return new Promise((resolve, reject) => {
    const qrCanvas = document.createElement("canvas")
    // High error correction to allow logo overlay
    QRCode.toCanvas(qrCanvas, shareUrl, {
      width: QR_DOWNLOAD_SIZE,
      margin: 2,
      errorCorrectionLevel: "H",
      color: { dark: "#000000", light: "#ffffff" },
    })
      .then(() => {
        // Draw logo emoji in center
        const qrCtx = qrCanvas.getContext("2d")
        const logoSize = Math.round(QR_DOWNLOAD_SIZE * 0.15)
        const cx = QR_DOWNLOAD_SIZE / 2
        const cy = QR_DOWNLOAD_SIZE / 2
        // White circle background
        qrCtx.fillStyle = "#ffffff"
        qrCtx.beginPath()
        qrCtx.arc(cx, cy, logoSize * 0.75, 0, Math.PI * 2)
        qrCtx.fill()
        // Emoji
        qrCtx.font = `${logoSize}px serif`
        qrCtx.textAlign = "center"
        qrCtx.textBaseline = "middle"
        qrCtx.fillText(QR_LOGO_EMOJI, cx, cy)

        // Create final canvas with title + URL below QR
        const padding = 80
        const titleHeight = 60
        const urlHeight = 40
        const gap = 24
        const totalH = padding + QR_DOWNLOAD_SIZE + gap + titleHeight + gap + urlHeight + padding
        const totalW = QR_DOWNLOAD_SIZE + padding * 2

        const finalCanvas = document.createElement("canvas")
        finalCanvas.width = totalW
        finalCanvas.height = totalH
        const ctx = finalCanvas.getContext("2d")

        // White background
        ctx.fillStyle = "#ffffff"
        ctx.fillRect(0, 0, totalW, totalH)

        // Draw QR
        ctx.drawImage(qrCanvas, padding, padding, QR_DOWNLOAD_SIZE, QR_DOWNLOAD_SIZE)

        // Draw map title
        const titleY = padding + QR_DOWNLOAD_SIZE + gap + titleHeight / 2
        ctx.fillStyle = "#101828"
        ctx.font = "bold 48px Pretendard, Noto Sans KR, sans-serif"
        ctx.textAlign = "center"
        ctx.textBaseline = "middle"
        ctx.fillText(mapTitle || "LOCA", totalW / 2, titleY, QR_DOWNLOAD_SIZE)

        // Draw URL text
        const urlY = titleY + titleHeight / 2 + gap + urlHeight / 2
        ctx.fillStyle = "#667085"
        ctx.font = "28px Pretendard, Noto Sans KR, sans-serif"
        ctx.fillText(shareUrl, totalW / 2, urlY, QR_DOWNLOAD_SIZE)

        // "LOCA" branding at bottom-right
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

export function ShareSheet({
  open,
  map,
  shareUrl,
  onClose,
  onOpenImageShare,
  capturing,
  showToast,
}) {
  const qrPreviewRef = useRef(null)
  const [copied, setCopied] = useState(false)
  const [codeCopied, setCodeCopied] = useState(false)

  const handleCopyCode = useCallback(async () => {
    const slug = map?.slug
    if (!slug) {
      if (showToast) showToast("발행된 지도만 코드를 복사할 수 있어요.")
      return
    }
    try {
      await navigator.clipboard.writeText(slug)
      setCodeCopied(true)
      if (showToast) showToast("공유 코드가 복사되었어요!")
      setTimeout(() => setCodeCopied(false), 2000)
    } catch {
      if (showToast) showToast("클립보드 복사에 실패했어요.")
      else prompt("공유 코드:", slug)
    }
  }, [map, showToast])

  // Generate QR preview
  useEffect(() => {
    if (!open || !shareUrl) return
    const canvas = qrPreviewRef.current
    if (!canvas) return
    QRCode.toCanvas(canvas, shareUrl, {
      width: QR_PREVIEW_SIZE,
      margin: 2,
      errorCorrectionLevel: "H",
      color: { dark: "#000000", light: "#ffffff" },
    })
      .then(() => {
        // Draw logo on preview too
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
  }, [open, shareUrl, showToast])

  const handleCopyUrl = useCallback(async () => {
    if (!shareUrl) return
    // Add utm_source=link
    const urlToCopy = shareUrl.includes("utm_source")
      ? shareUrl.replace(/utm_source=[^&]+/, "utm_source=link")
      : shareUrl + (shareUrl.includes("?") ? "&" : "?") + "utm_source=link"
    try {
      await navigator.clipboard.writeText(urlToCopy)
      setCopied(true)
      if (showToast) showToast("링크가 복사되었어요!")
      setTimeout(() => setCopied(false), 2000)
    } catch {
      if (showToast) showToast("클립보드 복사에 실패했어요.")
      else prompt("복사하세요:", urlToCopy)
    }
  }, [shareUrl, showToast])

  const handleKakaoShare = useCallback(() => {
    if (!shareUrl) return
    const kakaoUrl = shareUrl.includes("utm_source")
      ? shareUrl.replace(/utm_source=[^&]+/, "utm_source=kakao")
      : shareUrl + (shareUrl.includes("?") ? "&" : "?") + "utm_source=kakao"

    // Try Kakao SDK if available
    if (window.Kakao?.Share) {
      try {
        window.Kakao.Share.sendDefault({
          objectType: "feed",
          content: {
            title: map?.title || "LOCA 지도",
            description: `${map?.title || "LOCA"} 지도를 열어보세요.`,
            imageUrl: `${window.location.origin}/api/og-image/${map?.slug || "loca"}`,
            link: { mobileWebUrl: kakaoUrl, webUrl: kakaoUrl },
          },
          buttons: [
            { title: "지도 열기", link: { mobileWebUrl: kakaoUrl, webUrl: kakaoUrl } },
          ],
        })
        return
      } catch {
        // fallback below
      }
    }
    // Fallback: copy URL with kakao source
    navigator.clipboard.writeText(kakaoUrl).then(
      () => {
        if (showToast) showToast("카카오톡에 붙여넣기 하세요!")
      },
      () => {
        prompt("카카오톡에 붙여넣으세요:", kakaoUrl)
      },
    )
  }, [shareUrl, map, showToast])

  const handleQrDownload = useCallback(async () => {
    if (!shareUrl) return
    const qrUrl = shareUrl.includes("utm_source")
      ? shareUrl.replace(/utm_source=[^&]+/, "utm_source=qr")
      : shareUrl + (shareUrl.includes("?") ? "&" : "?") + "utm_source=qr"
    try {
      const canvas = await generateHighResQr(qrUrl, map?.title, map?.slug)
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
  }, [shareUrl, map, showToast])

  const showQr = shareUrl && shareUrl.length > 0 && shareUrl.length <= 2500

  return (
    <BottomSheet open={open} title="지도 공유하기" onClose={onClose}>
      <div className="share-sheet">
        {showQr ? (
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
        ) : (
          <p className="share-sheet__hint">URL이 길어서 QR 코드를 생성할 수 없어요.</p>
        )}

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

          {map?.slug ? (
            <button
              className="share-sheet__action-btn share-sheet__action-btn--code"
              type="button"
              onClick={handleCopyCode}
            >
              <span className="share-sheet__action-icon">📋</span>
              <span className="share-sheet__action-label">{codeCopied ? "복사됨!" : "코드 복사"}</span>
            </button>
          ) : null}
        </div>

        <div className="share-sheet__url-row">
          <input
            className="share-sheet__url-input"
            type="text"
            value={shareUrl}
            readOnly
            onClick={(e) => e.target.select()}
          />
        </div>
      </div>
    </BottomSheet>
  )
}
