import { useEffect, useRef, useState, useCallback } from "react"
import QRCode from "qrcode"
import { BottomSheet } from "../ui"
import { logEvent } from "../../lib/analytics"
import { getProfilePlacementState } from "../../lib/mapPlacement"

const QR_PREVIEW_SIZE = 200
const QR_DOWNLOAD_SIZE = 1024

function drawBrandLogo(ctx, x, y, size, align = "center") {
  ctx.save()
  ctx.font = `900 ${size}px Pretendard Variable`
  ctx.textBaseline = "middle"
  ctx.textAlign = align
  ctx.fillStyle = "#101010"
  const word = "loca"
  const wordWidth = ctx.measureText(word).width
  const dotWidth = ctx.measureText(".").width
  const startX = align === "center" ? x - (wordWidth + dotWidth) / 2 : x - wordWidth - dotWidth
  ctx.textAlign = "left"
  ctx.fillText(word, startX, y)
  ctx.fillStyle = "#ff4b2e"
  ctx.fillText(".", startX + wordWidth, y)
  ctx.restore()
}

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
        drawBrandLogo(qrCtx, cx, cy, Math.round(logoSize * 0.58))

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
        ctx.font = "bold 48px Pretendard Variable"
        ctx.textAlign = "center"
        ctx.textBaseline = "middle"
        ctx.fillText(mapTitle || "LOCA", totalW / 2, titleY, QR_DOWNLOAD_SIZE)

        ctx.fillStyle = "#b0b8c9"
        drawBrandLogo(ctx, totalW - padding, totalH - 30, 24, "right")

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
  onPublishMap,
  onUnpublishMap,
  onEnsureShareLink,
  onSetMapPublic,
  autoEnable = false,
  showToast,
}) {
  const qrPreviewRef = useRef(null)
  const autoLinkTriedRef = useRef(false)
  const [copied, setCopied] = useState(false)
  const [copying, setCopying] = useState(false)
  const [kakaoSharing, setKakaoSharing] = useState(false)
  const [qrDownloading, setQrDownloading] = useState(false)
  const [shareToggling, setShareToggling] = useState(false)
  const [autoLinking, setAutoLinking] = useState(false)
  const [publicToggling, setPublicToggling] = useState(false)

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
        drawBrandLogo(ctx, cx, cy, Math.round(logoSize * 0.58))
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
      setShareToggling(false)
      setAutoLinking(false)
      setPublicToggling(false)
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
        const ogImageUrl = `https://loca.im/api/og-image/${encodeURIComponent(map?.slug || "loca")}`
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
  const canManageShare = map?.canManage !== false
  const canToggleShare = canManageShare && (
    placement.isPublished
      ? typeof onUnpublishMap === "function"
      : typeof (onEnsureShareLink || onPublishMap) === "function"
  )

  // 공유 시트를 여는 것 = 공유 의도.
  // 링크가 없으면 자동으로 만들고(링크 아는 사람만 보는 상태), 이미 있으면 스냅샷만 조용히 갱신한다(주소 유지).
  useEffect(() => {
    if (!open) {
      autoLinkTriedRef.current = false
      return
    }
    if (autoLinkTriedRef.current) return
    if (!autoEnable || !map?.id || !canManageShare) return
    if (typeof onEnsureShareLink !== "function") return
    autoLinkTriedRef.current = true
    if (placement.isPublished) {
      onEnsureShareLink(map.id)
      return
    }
    setAutoLinking(true)
    Promise.resolve(onEnsureShareLink(map.id)).finally(() => setAutoLinking(false))
  }, [open, autoEnable, canManageShare, map?.id, onEnsureShareLink, placement.isPublished])

  const handleToggleShare = useCallback(async () => {
    if (!map?.id || shareToggling || !canToggleShare) return
    setShareToggling(true)
    try {
      if (placement.isPublished) {
        // 끄기 = 회수. 결과를 기억시키지 않고 행동하는 순간에 보여준다.
        const confirmed = window.confirm(
          "공유 링크를 끌까요?\n지금까지 공유한 링크가 더 이상 열리지 않고, 공개·프로필 노출도 함께 꺼져요.\n다시 켜면 새 링크가 만들어져요.",
        )
        if (!confirmed) return
        await onUnpublishMap(map.id)
        onClose?.()
      } else {
        // 켤 때는 시트를 유지해 방금 만든 링크를 바로 복사/공유할 수 있게 한다.
        const enableShare = onEnsureShareLink || onPublishMap
        await enableShare(map.id)
      }
    } finally {
      setShareToggling(false)
    }
  }, [canToggleShare, map?.id, onClose, onEnsureShareLink, onPublishMap, onUnpublishMap, placement.isPublished, shareToggling])

  // 공개 토글 — 검색·탐색·프로필 노출 (ON: public+프로필, OFF: 링크 공유 상태로 강등)
  const isPublic = map?.visibility === "public"
  const canTogglePublic = canManageShare && typeof onSetMapPublic === "function"
  const handleTogglePublic = useCallback(async () => {
    if (!map?.id || publicToggling || !canTogglePublic) return
    setPublicToggling(true)
    try {
      await onSetMapPublic(map.id, !isPublic)
    } finally {
      setPublicToggling(false)
    }
  }, [canTogglePublic, isPublic, map?.id, onSetMapPublic, publicToggling])

  return (
    <BottomSheet open={open} title="공유 링크" onClose={onClose}>
      <div className="share-sheet">
        <div className="share-sheet__publish">
          <div className="share-sheet__publish-copy">
            <strong>링크 공유</strong>
            <span>링크를 아는 사람만 볼 수 있어요. 검색·탐색에는 노출되지 않아요.</span>
          </div>
          <button
            className={`share-sheet__publish-toggle${placement.isPublished ? " is-active" : ""}`}
            type="button"
            onClick={handleToggleShare}
            disabled={!canToggleShare || shareToggling}
            aria-pressed={placement.isPublished}
          >
            {shareToggling ? "..." : placement.isPublished ? "ON" : "OFF"}
          </button>
        </div>
        {typeof onSetMapPublic === "function" ? (
          <div className="share-sheet__publish">
            <div className="share-sheet__publish-copy">
              <strong>검색·탐색에 공개</strong>
              <span>{isPublic ? "검색 결과·탐색·내 프로필에 노출되고 있어요." : "켜면 검색 결과·탐색·내 프로필에 노출돼요."}</span>
            </div>
            <button
              className={`share-sheet__publish-toggle${isPublic ? " is-active" : ""}`}
              type="button"
              onClick={handleTogglePublic}
              disabled={!canTogglePublic || publicToggling || autoLinking}
              aria-pressed={isPublic}
            >
              {publicToggling ? "..." : isPublic ? "ON" : "OFF"}
            </button>
          </div>
        ) : null}
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
            disabled={!cleanUrl || copying || autoLinking}
          >
            <span className="share-sheet__action-icon">🔗</span>
            <span className="share-sheet__action-label">
              {autoLinking ? "링크 만드는 중..." : copying ? "복사 중..." : copied ? "복사 완료" : "링크 복사"}
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
