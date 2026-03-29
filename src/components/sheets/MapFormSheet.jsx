import { BottomSheet } from "../ui"
import { themePalette } from "../../lib/appUtils"

export function MapFormSheet({ mapSheet, setMapSheet, onSave, onDelete, onClose }) {
  return (
    <BottomSheet
      open={Boolean(mapSheet)}
      title={mapSheet?.mode === "create" ? "새 지도 만들기" : "지도 수정"}
      subtitle="지도 이름, 설명, 테마 색상을 정할 수 있어요."
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
          <div className="field">
            <span>테마 색상</span>
            <div className="theme-row">
              {themePalette.map((theme) => (
                <button
                  key={theme}
                  className={`theme-dot${mapSheet.theme === theme ? " is-active" : ""}`}
                  style={{ "--theme-color": theme }}
                  type="button"
                  onClick={() => setMapSheet((current) => ({ ...current, theme }))}
                />
              ))}
            </div>
          </div>
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
