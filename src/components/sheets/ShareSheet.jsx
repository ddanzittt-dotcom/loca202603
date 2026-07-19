import { useEffect, useRef, useState, useCallback } from "react"
import { BottomSheet } from "../ui"
import { logEvent } from "../../lib/analytics"
import { getProfilePlacementState } from "../../lib/mapPlacement"

// 공유 = 링크 복사 + 이미지 공유(도트맵 카드). (QR·카카오 공유는 2026-07 정리 — 필요 시 git 이력 참조)

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

export function ShareSheet({
  open,
  map,
  shareUrl: rawShareUrl,
  onClose,
  onPublishMap,
  onUnpublishMap,
  onEnsureShareLink,
  onSetMapPublic,
  onOpenImageShare,
  autoEnable = false,
  showToast,
}) {
  const autoLinkTriedRef = useRef(false)
  const [copied, setCopied] = useState(false)
  const [copying, setCopying] = useState(false)
  const [shareToggling, setShareToggling] = useState(false)
  const [autoLinking, setAutoLinking] = useState(false)
  const [publicToggling, setPublicToggling] = useState(false)

  const cleanUrl = getCleanShareUrl(rawShareUrl)

  useEffect(() => {
    if (!open) {
      setCopied(false)
      setCopying(false)
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
      else prompt("주소를 복사해 주세요:", cleanUrl)
    } finally {
      setCopying(false)
    }
  }, [cleanUrl, copying, map?.id, showToast])

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

        {cleanUrl ? (
          <div className="share-sheet__url" title={cleanUrl}>
            {cleanUrl.replace(/^https?:\/\//, "")}
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
          {typeof onOpenImageShare === "function" ? (
            <button
              className="share-sheet__action-btn share-sheet__action-btn--image"
              type="button"
              onClick={() => {
                logEvent("share_click", { map_id: map?.id, meta: { method: "image" } })
                onOpenImageShare()
              }}
            >
              <span className="share-sheet__action-icon">🖼️</span>
              <span className="share-sheet__action-label">이미지 공유</span>
            </button>
          ) : null}
        </div>
      </div>
    </BottomSheet>
  )
}
