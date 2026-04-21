import { BottomSheet } from "../ui"

// 프로필에 올리기 / 프로필에서 내리기 공통 확인 시트.
// 진입점(MapsList / MapEditor / PublishSheet 후속 / Profile 등)에서 동일한 UI 로 재사용한다.
//
// props
//   open        boolean
//   mode        "add" | "remove"
//   mapTitle    string (표시용)
//   submitting  boolean
//   onConfirm   () => Promise|void
//   onCancel    () => void
export function ProfilePlacementConfirmSheet({ open, mode, mapTitle, submitting = false, onConfirm, onCancel }) {
  const isRemove = mode === "remove"
  const title = isRemove ? "프로필에서 내릴까요?" : "이 지도를 프로필에 올릴까요?"
  const subtitle = isRemove ? "발행 링크는 그대로 유지돼요" : "이 지도가 내 프로필 갤러리에 나타나요"
  const primaryLabel = isRemove
    ? (submitting ? "내리는 중..." : "프로필에서 내리기")
    : (submitting ? "올리는 중..." : "프로필에 올리기")

  return (
    <BottomSheet open={open} title={title} subtitle={subtitle} onClose={onCancel}>
      <div style={{ padding: "6px 16px 18px", display: "flex", flexDirection: "column", gap: 14 }}>
        {mapTitle ? (
          <p style={{ fontSize: 13, color: "#666", margin: 0, lineHeight: 1.4 }}>
            &lsquo;{mapTitle}&rsquo;
          </p>
        ) : null}
        <div style={{ display: "flex", gap: 8 }}>
          <button
            className="button button--secondary"
            type="button"
            onClick={onCancel}
            disabled={submitting}
            style={{ flex: 1 }}
          >
            취소
          </button>
          <button
            className={`button ${isRemove ? "button--danger" : "button--primary"}`}
            type="button"
            onClick={onConfirm}
            disabled={submitting}
            style={{ flex: 1 }}
          >
            {primaryLabel}
          </button>
        </div>
      </div>
    </BottomSheet>
  )
}
