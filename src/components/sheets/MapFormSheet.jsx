import { useState } from "react"
import { BottomSheet } from "../ui"
import { themePalette } from "../../lib/appUtils"
import { redeemInvitationCode } from "../../lib/mapService"

export function MapFormSheet({ mapSheet, setMapSheet, onSave, onDelete, onClose }) {
  const isCreate = mapSheet?.mode === "create"
  const category = mapSheet?.category || "personal"
  const config = mapSheet?.config || {}

  // 행사지도 코드 입력 상태
  const [eventCode, setEventCode] = useState("")
  const [codeStatus, setCodeStatus] = useState("idle") // idle | loading | verified | error
  const [codeError, setCodeError] = useState("")

  const handleSelectEvent = () => {
    setMapSheet((c) => ({
      ...c,
      category: "event",
      config: { checkin_enabled: true, survey_enabled: true, announcements_enabled: true },
    }))
    setEventCode("")
    setCodeStatus("idle")
    setCodeError("")
  }

  const handleSelectPersonal = () => {
    setMapSheet((c) => ({ ...c, category: "personal", config: {} }))
    setEventCode("")
    setCodeStatus("idle")
    setCodeError("")
  }

  const handleVerifyCode = async () => {
    if (!eventCode.trim()) return
    setCodeStatus("loading")
    setCodeError("")
    try {
      const result = await redeemInvitationCode(eventCode)
      if (result.success) {
        setCodeStatus("verified")
      } else {
        setCodeStatus("error")
        const messages = {
          invalid_code: "유효하지 않은 코드예요.",
          code_exhausted: "사용 횟수가 초과된 코드예요.",
          already_redeemed: "이미 등록된 코드예요. 그대로 진행하세요!",
          not_authenticated: "로그인이 필요해요.",
          rate_limited: "시도 횟수를 초과했어요. 1분 후 다시 시도해주세요.",
        }
        if (result.error === "already_redeemed") {
          // 이미 등록된 코드는 사용 가능
          setCodeStatus("verified")
        } else {
          setCodeError(messages[result.error] || "코드 확인에 실패했어요.")
        }
      }
    } catch {
      setCodeStatus("error")
      setCodeError("코드 확인에 실패했어요. 다시 시도해주세요.")
    }
  }

  const isEventReady = category !== "event" || codeStatus === "verified"

  return (
    <BottomSheet
      open={Boolean(mapSheet)}
      title={isCreate ? "새 지도 만들기" : "지도 수정"}
      subtitle="지도 이름, 설명, 테마 색상을 정할 수 있어요."
      onClose={onClose}
    >
      {mapSheet ? (
        <div className="form-stack">
          {isCreate ? (
            <div className="field">
              <span>지도 유형</span>
              <div className="category-toggle-row">
                <button
                  className={`category-toggle-btn${category === "personal" ? " is-active" : ""}`}
                  type="button"
                  onClick={handleSelectPersonal}
                >
                  📍 일반지도
                </button>
                <button
                  className={`category-toggle-btn${category === "event" ? " is-active" : ""}`}
                  type="button"
                  onClick={handleSelectEvent}
                >
                  🎪 행사지도
                </button>
              </div>
            </div>
          ) : null}

          {/* 행사지도 코드 입력 */}
          {isCreate && category === "event" ? (
            <div className="field">
              <span>행사 코드</span>
              <p className="field-hint">LOCA에서 발급받은 행사 코드를 입력해주세요.</p>
              <div className="event-code-row">
                <input
                  value={eventCode}
                  onChange={(e) => {
                    setEventCode(e.target.value.toUpperCase())
                    if (codeStatus !== "idle") { setCodeStatus("idle"); setCodeError("") }
                  }}
                  placeholder="예: LOCA-EVENT-2026"
                  disabled={codeStatus === "verified" || codeStatus === "loading"}
                />
                {codeStatus === "verified" ? (
                  <span className="event-code-verified">확인됨</span>
                ) : (
                  <button
                    className="button button--small"
                    type="button"
                    onClick={handleVerifyCode}
                    disabled={!eventCode.trim() || codeStatus === "loading"}
                  >
                    {codeStatus === "loading" ? "확인 중..." : "확인"}
                  </button>
                )}
              </div>
              {codeError ? <p className="field-error">{codeError}</p> : null}
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

          {category === "event" && codeStatus === "verified" ? (
            <div className="field">
              <span>행사 설정</span>
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
            <button
              className="button button--primary"
              type="button"
              onClick={onSave}
              disabled={!isEventReady}
            >
              저장
            </button>
          </div>
        </div>
      ) : null}
    </BottomSheet>
  )
}
