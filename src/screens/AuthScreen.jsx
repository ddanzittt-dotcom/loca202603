import { useState } from "react"
import { signInWithEmail, signUpWithEmail, signInWithGoogle, signInWithKakao, signInWithNaver } from "../lib/auth"

function friendlyError(message = "") {
  const msg = message.toLowerCase()
  if (msg.includes("invalid login credentials") || msg.includes("invalid_credentials")) return "이메일 또는 비밀번호가 맞지 않아요."
  if (msg.includes("email not confirmed")) return "이메일 인증이 필요해요. 메일함을 확인해주세요."
  if (msg.includes("user already registered")) return "이미 가입된 이메일이에요. 로그인을 시도해보세요."
  if (msg.includes("password") && msg.includes("6")) return "비밀번호는 6자 이상이어야 해요."
  if (msg.includes("rate limit") || msg.includes("too many")) return "요청이 너무 많아요. 잠시 후 다시 시도해주세요."
  if (msg.includes("network") || msg.includes("fetch")) return "네트워크 연결을 확인해주세요."
  return message || "알 수 없는 오류가 발생했어요."
}

export function AuthScreen({ title = "LOCA 시작하기", subtitle = "기록을 안전하게 저장하려면 로그인이 필요해요", onSuccess }) {
  const [mode, setMode] = useState("login")
  const [nickname, setNickname] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState("")

  const handleSubmit = async (event) => {
    event.preventDefault()
    setSubmitting(true)
    setErrorMessage("")

    try {
      if (mode === "signup") {
        await signUpWithEmail(email.trim(), password, nickname.trim())
      } else {
        await signInWithEmail(email.trim(), password)
      }
      setPassword("")
      onSuccess?.(mode)
    } catch (error) {
      setErrorMessage(friendlyError(error.message))
    } finally {
      setSubmitting(false)
    }
  }

  const handleOAuth = async (provider) => {
    setErrorMessage("")
    setSubmitting(true)
    try {
      if (provider === "google") await signInWithGoogle()
      else if (provider === "kakao") await signInWithKakao()
      else if (provider === "naver") signInWithNaver()
    } catch (e) {
      setErrorMessage(friendlyError(e.message))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="screen screen--scroll">
      <div className="feed-section">
        <div className="section-head">
          <div>
            <h1 className="section-head__title" style={{ letterSpacing: "-0.3px" }}>{title}</h1>
            <p className="section-head__subtitle">{subtitle}</p>
          </div>
        </div>

        <form className="settings-card form-stack" onSubmit={handleSubmit}>
          <div className="chips-row chips-row--compact">
            <button
              className={`chip${mode === "login" ? " chip--active" : ""}`}
              type="button"
              onClick={() => setMode("login")}
              disabled={submitting}
            >
              로그인
            </button>
            <button
              className={`chip${mode === "signup" ? " chip--active" : ""}`}
              type="button"
              onClick={() => setMode("signup")}
              disabled={submitting}
            >
              회원가입
            </button>
          </div>

          {mode === "signup" ? (
            <label className="field">
              <span>닉네임</span>
              <input value={nickname} onChange={(event) => setNickname(event.target.value)} placeholder="예: 경주" required />
            </label>
          ) : null}

          <label className="field">
            <span>이메일</span>
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" required />
          </label>

          <label className="field">
            <span>비밀번호</span>
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="6자 이상" minLength={6} required />
          </label>

          {errorMessage ? (
            <article className="settings-card settings-card--danger">
              <p>{errorMessage}</p>
            </article>
          ) : null}

          <button className="button button--primary" type="submit" disabled={submitting}>
            {submitting ? "처리 중..." : mode === "signup" ? "계정 만들기" : "로그인"}
          </button>

          <div className="auth-divider">
            <hr />
            <span>간편 로그인</span>
            <hr />
          </div>

          <div className="auth-social-buttons">
            <button
              className="auth-social-btn auth-social-btn--naver"
              type="button"
              disabled={submitting}
              onClick={() => handleOAuth("naver")}
            >
              <svg className="auth-social-btn__icon" viewBox="0 0 20 20" fill="none"><path d="M13.56 10.7L6.15 0H0v20h6.44V9.3L13.85 20H20V0h-6.44v10.7z" fill="currentColor"/></svg>
              <span>네이버로 계속하기</span>
            </button>

            <button
              className="auth-social-btn auth-social-btn--kakao"
              type="button"
              disabled={submitting}
              onClick={() => handleOAuth("kakao")}
            >
              <svg className="auth-social-btn__icon" viewBox="0 0 20 20" fill="none"><path d="M10 1C4.48 1 0 4.45 0 8.68c0 2.74 1.86 5.15 4.66 6.51-.16.57-.58 2.09-.66 2.42-.1.4.15.4.31.29.13-.08 2.04-1.36 2.86-1.92.6.09 1.22.13 1.83.13 5.52 0 10-3.45 10-7.68S15.52 1 10 1z" fill="currentColor"/></svg>
              <span>카카오로 계속하기</span>
            </button>

            <button
              className="auth-social-btn auth-social-btn--google"
              type="button"
              disabled={submitting}
              onClick={() => handleOAuth("google")}
            >
              <svg className="auth-social-btn__icon" viewBox="0 0 20 20"><path d="M19.6 10.23c0-.68-.06-1.36-.17-2.02H10v3.83h5.38a4.6 4.6 0 01-2 3.02v2.5h3.24c1.89-1.74 2.98-4.3 2.98-7.33z" fill="#4285F4"/><path d="M10 20c2.7 0 4.96-.9 6.62-2.44l-3.24-2.5c-.9.6-2.04.95-3.38.95-2.6 0-4.8-1.76-5.58-4.12H1.07v2.58A9.99 9.99 0 0010 20z" fill="#34A853"/><path d="M4.42 11.89A6.01 6.01 0 014.1 10c0-.66.11-1.3.32-1.89V5.53H1.07A9.99 9.99 0 000 10c0 1.61.39 3.14 1.07 4.47l3.35-2.58z" fill="#FBBC05"/><path d="M10 3.96c1.47 0 2.78.5 3.82 1.5l2.86-2.87C14.96.99 12.7 0 10 0A9.99 9.99 0 001.07 5.53l3.35 2.58C5.2 5.72 7.4 3.96 10 3.96z" fill="#EA4335"/></svg>
              <span>Google로 계속하기</span>
            </button>
          </div>
        </form>
      </div>
    </section>
  )
}
