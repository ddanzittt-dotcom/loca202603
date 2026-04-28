import { useState } from "react"
import { markWelcomeSeen } from "../lib/onboarding"

export function WelcomeScreen({ onStart, onAddFirstPlace }) {
  const [imgError, setImgError] = useState(false)
  const handleBrowse = () => {
    markWelcomeSeen()
    onStart?.()
  }
  const handleAddFirstPlace = () => {
    markWelcomeSeen()
    if (onAddFirstPlace) {
      onAddFirstPlace()
      return
    }
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
          좋아한 장소를 모아{"\n"}나만의 지도로 남겨보세요.
        </p>
        <p className="welcome-screen__desc">
          처음은 한 장소면 충분해요.
        </p>
      </div>
      <div className="welcome-screen__footer">
        <div className="welcome-screen__cta-stack">
          <button
            className="welcome-screen__cta"
            type="button"
            onClick={handleAddFirstPlace}
          >
            첫 장소 남기기
          </button>
          <button
            className="welcome-screen__cta welcome-screen__cta--secondary"
            type="button"
            onClick={handleBrowse}
          >
            둘러보기
          </button>
        </div>
      </div>
    </section>
  )
}
