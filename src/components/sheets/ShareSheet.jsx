import { useEffect, useRef, useState, useCallback } from "react"
import QRCode from "qrcode"
import { BottomSheet } from "../ui"
import { logEvent } from "../../lib/analytics"
import { getProfilePlacementState } from "../../lib/mapPlacement"

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

    const key = import.meta.env.VITE_KAKAO_JS_KEY
    if (!key) {
      resolve(false)
      return
    }

    const script = document.createElement("script")
    script.src = "https://t1.kakaocdn.net/kakao_js_sdk/2.7.4/kakao.min.js"
    script.onload = () => {
      if (window.Kakao && !window.Kakao.isInitialized()) {
        window.Kakao.init(key)
      }
      resolve(Boolean(window.Kakao?.Share))
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
  const [copying, setCopying] = useState(false)
  const [kakaoSharing, setKakaoSharing] = useState(false)
  const [qrDownloading, setQrDownloading] = useState(false)

  const cleanUrl = getCleanShareUrl(rawShareUrl)
  const qrUrl = cleanUrl || null

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
        showToast?.("QR 코드를 만들지 못했어요.")
      })
  }, [open, qrUrl, showToast])

  useEffect(() => {
    if (!open) {
      setCopied(false)
      setCopying(false)
      setKakaoSharing(false)
      setQrDownloading(false)
    }
  }, [open])

  const handleCopyUrl = useCallback(async () => {
    if (!cleanUrl || copying) return
    setCopying(true)
    try {
      await navigator.clipboard.writeText(cleanUrl)
      logEvent("share_click", { map_id: map?.id, meta: { method: "link" } })
      setCopied(true)
      showToast?.("링크를 복사했어요!")
      setTimeout(() => setCopied(false), 1800)
    } catch {
      if (showToast) showToast("클립보드 복사에 실패했어요.")
      else prompt("복사하세요:", cleanUrl)
    } finally {
      setCopying(false)
    }
  }, [cleanUrl, copying, map?.id, showToast])

  const handleKakaoShare = useCallback(async () => {
    if (!cleanUrl || kakaoSharing) return
    setKakaoSharing(true)
    logEvent("share_click", { map_id: map?.id, meta: { method: "kakao" } })

    try {
      const sdkReady = await ensureKakaoSdk()
      if (sdkReady && window.Kakao?.Share) {
        const kakaoUrl = cleanUrl + (cleanUrl.includes("?") ? "&" : "?") + "utm_source=kakao"
        const ogImageUrl = `https://loca202603.vercel.app/api/og-image/${encodeURIComponent(map?.slug || "loca")}`
        window.Kakao.Share.sendDefault({
          objectType: "feed",
          content: {
            title: map?.title || "LOCA 지도",
            description: map?.description || `${map?.title || "LOCA"} 지도를 확인해보세요.`,
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
      }

      await navigator.clipboard.writeText(cleanUrl)
      showToast?.("링크를 복사했어요. 카카오에 붙여넣어 공유해 주세요.")
    } catch {
      prompt("카카오에 붙여넣으세요:", cleanUrl)
    } finally {
      setKakaoSharing(false)
    }
  }, [cleanUrl, kakaoSharing, map, showToast])

  const handleQrDownload = useCallback(async () => {
    if (!qrUrl || qrDownloading) return
    setQrDownloading(true)
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
      showToast?.("QR 코드가 다운로드됐어요.")
    } catch {
      showToast?.("QR 다운로드에 실패했어요.")
    } finally {
      setQrDownloading(false)
    }
  }, [map?.id, map?.slug, map?.title, qrDownloading, qrUrl, showToast])

  const placement = getProfilePlacementState(map || {}, null)
  const statusLabel = placement.isPublished ? "링크 공유 켜짐" : "링크 공유 꺼짐"
  const statusHint = placement.isPublished
    ? "공유 링크가 활성화되어 있어요."
    : "메뉴에서 링크 공유 켜기를 하면 누구나 링크로 볼 수 있어요."

  return (
    <BottomSheet open={open} title="공유 링크" onClose={onClose}>
      <div className="share-sheet">
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "8px 12px", marginBottom: 8,
          background: "#FAF5EE", borderRadius: 10,
        }}>
          <span style={{
            fontSize: 10, fontWeight: 500,
            padding: "2px 8px", borderRadius: 8,
            background: placement.isPublished ? "#E1F5EE" : "#FAEEDA",
            color: placement.isPublished ? "#085041" : "#633806",
          }}>{statusLabel}</span>
          <p style={{ fontSize: 11, color: "#666", margin: 0, lineHeight: 1.4 }}>
            {statusHint}
          </p>
        </div>
        <p className="share-sheet__hint">
          링크를 전달하면 상대가 지도를 바로 열고, 내 라이브러리로 저장할 수 있어요.
        </p>
        <p style={{ fontSize: 10, color: "#aaa", margin: "2px 0 12px", lineHeight: 1.4 }}>
          보여주고 싶은 지도만 내 프로필에 공개할 수 있어요.
        </p>

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
              disabled={qrDownloading}
            >
              {qrDownloading ? "QR 생성 중..." : "고해상도 QR 다운로드 (1024px)"}
            </button>
          </div>
        ) : null}

        <div className="share-sheet__actions">
          <button
            className="share-sheet__action-btn share-sheet__action-btn--copy"
            type="button"
            onClick={handleCopyUrl}
            disabled={!cleanUrl || copying}
          >
            <span className="share-sheet__action-icon">🔗</span>
            <span className="share-sheet__action-label">
              {copying ? "복사 중..." : copied ? "복사 완료" : "링크 복사"}
            </span>
          </button>

          <button
            className="share-sheet__action-btn share-sheet__action-btn--kakao"
            type="button"
            onClick={handleKakaoShare}
            disabled={!cleanUrl || kakaoSharing}
          >
            <span className="share-sheet__action-icon">💬</span>
            <span className="share-sheet__action-label">{kakaoSharing ? "준비 중..." : "카카오"}</span>
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
