import { LogIn } from "lucide-react"
import { BrandLogo } from "../components/BrandLogo"

export function WelcomeScreen({ showLoginBanner = false, onStart, onLogin }) {
  return (
    <section className="startup-screen" aria-label="LOCA 시작 화면">
      <div className="startup-screen__logo-wrap">
        <BrandLogo as="h1" className="startup-screen__logo" dotClassName="startup-screen__logo-dot" />
      </div>

      {showLoginBanner ? (
        <aside className="startup-login-banner" aria-label="로그인 안내">
          <div className="startup-login-banner__copy">
            <strong>좋아했던 장소들을 잃어버리지 않도록</strong>
            <span>로그인하면 지도와 기록을 오래 간직할 수 있어요.</span>
          </div>
          <div className="startup-login-banner__actions">
            <button
              className="startup-login-banner__primary"
              type="button"
              onClick={onLogin}
            >
              <LogIn size={17} strokeWidth={2.2} />
              로그인
            </button>
          </div>
        </aside>
      ) : null}

      {!showLoginBanner ? (
        <button
          className="startup-screen__skip"
          type="button"
          onClick={onStart}
          aria-label="시작 화면 건너뛰기"
        />
      ) : null}
    </section>
  )
}
