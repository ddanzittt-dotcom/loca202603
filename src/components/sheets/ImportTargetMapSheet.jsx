import { useMemo, useState } from "react"
import { MapPin, Plus } from "lucide-react"
import { BottomSheet } from "../ui"
import { isEventMap } from "../../lib/mapPlacement"

/**
 * 모두의 지도에서 가져오기 → 내 지도 선택 바텀시트.
 *
 * Props:
 *   open          : boolean
 *   maps          : 사용자의 지도 배열
 *   features      : 전체 feature 배열 (지도별 장소 수 계산용)
 *   busy          : boolean (가져오기·새 지도 생성 진행 중)
 *   onPick(mapId) : 기존 지도 선택
 *   onCreate(title): 새 지도 생성 후 그 지도로 가져오기
 *   onClose()
 *
 * event map / readOnly 지도는 후보에서 제외한다.
 */
// 내부 컴포넌트 — 시트가 열릴 때마다 fresh mount 되어 내부 state 가 자동 초기화된다.
function ImportTargetMapSheetInner({
  maps,
  features,
  busy,
  onPick,
  onCreate,
  onClose,
}) {
  const [mode, setMode] = useState("pick") // "pick" | "create"
  const [title, setTitle] = useState("")

  const candidates = useMemo(() => (
    maps.filter((m) => !isEventMap(m) && m.canEditFeatures !== false)
  ), [maps])

  const placeCountByMap = useMemo(() => {
    const acc = new Map()
    for (const f of features) {
      if (!f?.mapId) continue
      acc.set(f.mapId, (acc.get(f.mapId) || 0) + 1)
    }
    return acc
  }, [features])

  const canCreate = title.trim().length > 0 && !busy

  const handleCreate = () => {
    const trimmed = title.trim()
    if (!trimmed) return
    onCreate?.(trimmed)
  }

  return (
    <BottomSheet
      open
      title="어느 지도로 가져올까요?"
      subtitle={mode === "create"
        ? "새 지도를 만들고 이 장소를 바로 추가해요."
        : "가져올 대상 지도를 선택하거나 새로 만들 수 있어요."}
      onClose={onClose}
    >
      <div className="itm-sheet">
        {mode === "pick" ? (
          <>
            <div className="itm-list">
              {candidates.length === 0 ? (
                <p className="itm-empty">
                  아직 만든 지도가 없어요. 아래 <strong>새 지도 만들기</strong>로 시작해보세요.
                </p>
              ) : (
                candidates.map((m) => {
                  const count = placeCountByMap.get(m.id) || 0
                  return (
                    <button
                      key={m.id}
                      type="button"
                      className="itm-row"
                      onClick={() => !busy && onPick?.(m.id)}
                      disabled={busy}
                    >
                      <span className="itm-row__icon" aria-hidden>
                        <MapPin size={16} />
                      </span>
                      <span className="itm-row__body">
                        <strong>{m.title || "제목 없는 지도"}</strong>
                        <small>장소 {count}개</small>
                      </span>
                    </button>
                  )
                })
              )}
            </div>

            <button
              type="button"
              className="itm-new-btn"
              onClick={() => setMode("create")}
              disabled={busy}
            >
              <Plus size={16} />
              <span>새 지도 만들기</span>
            </button>
          </>
        ) : (
          <div className="itm-create">
            <label className="itm-field">
              <span>지도 이름</span>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="예: 동네 카페 모음"
                autoFocus
                maxLength={50}
                onKeyDown={(e) => { if (e.key === "Enter" && canCreate) handleCreate() }}
              />
            </label>

            <div className="itm-create__actions">
              <button
                type="button"
                className="itm-btn itm-btn--ghost"
                onClick={() => setMode("pick")}
                disabled={busy}
              >
                뒤로
              </button>
              <button
                type="button"
                className="itm-btn itm-btn--primary"
                onClick={handleCreate}
                disabled={!canCreate}
              >
                {busy ? "만드는 중..." : "만들고 가져오기"}
              </button>
            </div>
          </div>
        )}
      </div>
    </BottomSheet>
  )
}

export function ImportTargetMapSheet({ open, ...rest }) {
  if (!open) return null
  return <ImportTargetMapSheetInner {...rest} />
}
