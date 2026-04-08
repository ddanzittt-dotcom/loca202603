import { BottomSheet } from "../ui"

export function MapFormSheet({ mapSheet, setMapSheet, onSave, onDelete, onClose }) {
  const isCreate = mapSheet?.mode === "create"

  return (
    <BottomSheet
      open={Boolean(mapSheet)}
      title={isCreate ? "새 지도 만들기" : "지도 수정"}
      subtitle="지도 이름과 설명을 입력하세요."
      onClose={onClose}
    >
      {mapSheet ? (
        <div className="form-stack">
          <label className="field">
            <span>지도 이름</span>
            <input
              value={mapSheet.title}
              onChange={(event) => setMapSheet((current) => ({ ...current, title: event.target.value }))}
              placeholder="예: 제주 2박 3일"
            />
          </label>
          <label className="field">
            <span>설명</span>
            <textarea
              rows="3"
              value={mapSheet.description}
              onChange={(event) => setMapSheet((current) => ({ ...current, description: event.target.value }))}
              placeholder="짧은 설명을 남겨두면 나중에 찾기 쉬워져요."
            />
          </label>

          <div className="sheet-actions">
            {mapSheet.mode === "edit" ? (
              <button className="button button--danger" type="button" onClick={onDelete}>
                지도 삭제
              </button>
            ) : null}
            <button className="button button--primary" type="button" onClick={onSave}>
              저장
            </button>
          </div>
        </div>
      ) : null}
    </BottomSheet>
  )
}
