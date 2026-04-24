import { useState } from "react"
import { markWelcomeSeen } from "../lib/onboarding"

export function WelcomeScreen({ onStart }) {
  const [imgError, setImgError] = useState(false)
  const handleStart = () => {
    markWelcomeSeen()
    onStart?.()
  }

  return (
    <section className="welcome-screen">
      <div className="welcome-screen__body">
        <strong className="welcome-screen__logo">LOCA</strong>
        {imgError ? (
          <span className="welcome-screen__character-fallback">☁️</span>
        ) : (
          <img
            src="/characters/cloud_lv1.svg"
            alt=""
            className="welcome-screen__character"
            onError={() => setImgError(true)}
          />
        )}
        <p className="welcome-screen__title">
          내 장소를 기록하고,{"\n"}하나의 지도로 남겨보세요
        </p>
        <p className="welcome-screen__desc">
          기록은 계정에 안전하게 저장돼요
        </p>
      </div>
      <div className="welcome-screen__footer">
        <button
          className="welcome-screen__cta"
          type="button"
          onClick={handleStart}
        >
          시작하기
        </button>
      </div>
    </section>
  )
}
