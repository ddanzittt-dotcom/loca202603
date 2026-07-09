import { useState } from "react"
import { BottomSheet } from "../ui"
import { AGE_BANDS, SIDO_LIST } from "../../lib/demographics"

// 가입 직후 1회 노출되는 연령대·지역 선택 온보딩.
// 전부 선택 사항 — 건너뛰거나 일부만 골라도 저장된다.
export function ProfileOnboardingSheet({ open, saving = false, onSkip, onSave }) {
  const [ageBand, setAgeBand] = useState("")
  const [regionSido, setRegionSido] = useState("")

  const handleSave = () => {
    onSave({
      age_band: ageBand || null,
      region_sido: regionSido || null,
    })
  }

  const nothingPicked = !ageBand && !regionSido

  return (
    <BottomSheet
      open={open}
      title="딱 두 가지만 알려주세요"
      subtitle="내 동네에 맞는 지도·장소를 더 잘 추천하는 데 쓰여요. 선택 사항이에요."
      onClose={onSkip}
    >
      <div className="form-stack profile-onboard">
        <div className="field">
          <span>연령대</span>
          <div className="chips-row chips-row--wrap">
            {AGE_BANDS.map((band) => (
              <button
                key={band.value}
                type="button"
                className={`chip${ageBand === band.value ? " chip--active" : ""}`}
                onClick={() => setAgeBand((prev) => (prev === band.value ? "" : band.value))}
                disabled={saving}
              >
                {band.label}
              </button>
            ))}
          </div>
        </div>

        <label className="field">
          <span>거주 지역</span>
          <select value={regionSido} onChange={(event) => setRegionSido(event.target.value)} disabled={saving}>
            <option value="">선택 안 함</option>
            {SIDO_LIST.map((sido) => (
              <option key={sido} value={sido}>{sido}</option>
            ))}
          </select>
        </label>

        <p className="profile-onboard__note">
          입력한 정보는 개인을 식별하지 않는 <b>익명 통계</b>로만 활용돼요. 언제든 비워둘 수 있어요.
        </p>

        <div className="profile-onboard__actions">
          <button type="button" className="button button--ghost" onClick={onSkip} disabled={saving}>
            건너뛰기
          </button>
          <button type="button" className="button button--primary" onClick={handleSave} disabled={saving}>
            {saving ? "저장 중..." : nothingPicked ? "나중에 할게요" : "저장하기"}
          </button>
        </div>
      </div>
    </BottomSheet>
  )
}
