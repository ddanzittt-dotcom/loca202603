import { BottomSheet } from "../ui"
import { themePalette } from "../../lib/appUtils"

export function MapFormSheet({ mapSheet, setMapSheet, onSave, onDelete, onClose, hasB2BAccess = false, isAdmin = false }) {
  const isCreate = mapSheet?.mode === "create"
  const category = mapSheet?.category || "personal"
  const config = mapSheet?.config || {}
  const canCreateEvent = isAdmin || hasB2BAccess

  return (
    <BottomSheet
      open={Boolean(mapSheet)}
      title={isCreate ? "새 지도 만들기" : "지도 수정"}
      subtitle="지도 이름, 설명, 테마 색상을 정할 수 있어요."
      onClose={onClose}
    >
      {mapSheet ? (
        <div className="form-stack">
          {canCreateEvent && isCreate ? (
            <div className="field">
              <span>지도 유형</span>
              <div className="category-toggle-row">
                <button
                  className={`category-toggle-btn${category === "personal" ? " is-active" : ""}`}
                  type="button"
                  onClick={() => setMapSheet((c) => ({ ...c, category: "personal", config: {} }))}
                >
                  📍 개인 지도
                </button>
                <button
                  className={`category-toggle-btn${category === "event" ? " is-active" : ""}`}
                  type="button"
                  onClick={() => setMapSheet((c) => ({
                    ...c,
                    category: "event",
                    config: { checkin_enabled: true, survey_enabled: true, announcements_enabled: true },
                  }))}
                >
                  🎪 이벤트 지도
                </button>
              </div>
            </div>
          ) : null}

          <label className="field">
            <span>지도 이름</span>
            <input
              value={mapSheet.title}
              onChange={(event) => setMapSheet((current) => ({ ...current, title: event.target.value }))}
              placeholder={category === "event" ? "예: 2026 봄 축제 스탬프투어" : "예: 제주 2박 3일"}
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

          {category === "event" ? (
            <div className="field">
              <span>이벤트 설정</span>
              <div className="event-config-list">
                <label className="event-config-item">
                  <input
                    type="checkbox"
                    checked={config.checkin_enabled !== false}
                    onChange={(e) => setMapSheet((c) => ({
                      ...c,
                      config: { ...c.config, checkin_enabled: e.target.checked },
                    }))}
                  />
                  <span>체크인 (스탬프)</span>
                </label>
                <label className="event-config-item">
                  <input
                    type="checkbox"
                    checked={config.survey_enabled !== false}
                    onChange={(e) => setMapSheet((c) => ({
                      ...c,
                      config: { ...c.config, survey_enabled: e.target.checked },
                    }))}
                  />
                  <span>완주 후 설문</span>
                </label>
                <label className="event-config-item">
                  <input
                    type="checkbox"
                    checked={config.announcements_enabled !== false}
                    onChange={(e) => setMapSheet((c) => ({
                      ...c,
                      config: { ...c.config, announcements_enabled: e.target.checked },
                    }))}
                  />
                  <span>공지사항</span>
                </label>
              </div>
            </div>
          ) : null}

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
