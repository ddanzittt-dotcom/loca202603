import { useState } from "react"
import { signInWithEmail, signUpWithEmail } from "../lib/auth"

export function AuthScreen({ title = "로그인", subtitle = "내 지도를 계정에 저장하고 불러올 수 있어요.", onSuccess }) {
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
      onSuccess?.(mode)
    } catch (error) {
      setErrorMessage(error.message || "로그인에 실패했어요.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="screen screen--scroll">
      <div className="feed-section">
        <div className="section-head">
          <div>
            <h1 className="section-head__title">{title}</h1>
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
        </form>
      </div>
    </section>
  )
}
