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

          {category === "event" && (isCreate ? codeStatus === "verified" : true) ? (
            <>
              <div className="field">
                <span>행사 기능</span>
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

              {config.checkin_enabled !== false ? (
                <div className="field">
                  <span>체크인 반경 (미터)</span>
                  <p className="field-hint">참여자가 장소에서 이 거리 안에 있어야 체크인할 수 있어요.</p>
                  <select
                    value={config.checkin_radius || 50}
                    onChange={(e) => setMapSheet((c) => ({
                      ...c,
                      config: { ...c.config, checkin_radius: Number(e.target.value) },
                    }))}
                  >
                    <option value={10}>10m (매우 가까움)</option>
                    <option value={30}>30m</option>
                    <option value={50}>50m (기본)</option>
                    <option value={100}>100m</option>
                    <option value={200}>200m</option>
                    <option value={500}>500m (넓음)</option>
                    <option value={0}>제한 없음</option>
                  </select>
                </div>
              ) : null}

              <div className="field">
                <span>완주 메시지</span>
                <input
                  value={config.completion_message || ""}
                  onChange={(e) => setMapSheet((c) => ({
                    ...c,
                    config: { ...c.config, completion_message: e.target.value },
                  }))}
                  placeholder="예: 축하합니다! 모든 코스를 완주했어요 🎉"
                />
              </div>

              <div className="field">
                <span>수비니어 설정</span>
                <p className="field-hint">완주한 참여자에게 수집품을 발급해요.</p>
                <label className="event-config-item">
                  <input
                    type="checkbox"
                    checked={config.souvenir_enabled !== false}
                    onChange={(e) => setMapSheet((c) => ({
                      ...c,
                      config: { ...c.config, souvenir_enabled: e.target.checked },
                    }))}
                  />
                  <span>수비니어 발급</span>
                </label>
                {config.souvenir_enabled !== false ? (
                  <div className="souvenir-config">
                    <label className="field field--inline">
                      <span>이모지</span>
                      <input
                        value={config.souvenir_emoji || "🏆"}
                        onChange={(e) => setMapSheet((c) => ({
                          ...c,
                          config: { ...c.config, souvenir_emoji: e.target.value },
                        }))}
                        style={{ width: 60, textAlign: "center" }}
                        maxLength={4}
                      />
                    </label>
                    <label className="field field--inline">
                      <span>이름</span>
                      <input
                        value={config.souvenir_title || ""}
                        onChange={(e) => setMapSheet((c) => ({
                          ...c,
                          config: { ...c.config, souvenir_title: e.target.value },
                        }))}
                        placeholder="예: 2026 봄 축제 완주 기념"
                      />
                    </label>
                  </div>
                ) : null}
              </div>
            </>
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
