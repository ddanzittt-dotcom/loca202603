import { useRef, useState } from "react"
import { signInWithEmail, signUpWithEmail } from "../lib/auth"
import { Turnstile } from "../components/Turnstile"

function friendlyError(message = "") {
  const msg = message.toLowerCase()
  if (msg.includes("invalid login credentials") || msg.includes("invalid_credentials")) return "이메일 또는 비밀번호가 맞지 않아요."
  if (msg.includes("email not confirmed")) return "이메일 인증이 필요해요. 메일함을 확인해주세요."
  if (msg.includes("user already registered")) return "이미 가입된 이메일이에요. 로그인을 시도해보세요."
  if (msg.includes("password") && msg.includes("6")) return "비밀번호는 6자 이상이어야 해요."
  if (msg.includes("captcha") || msg.includes("verification")) return "보안 확인에 실패했어요. 잠시 후 다시 시도해주세요."
  if (msg.includes("rate limit") || msg.includes("too many")) return "요청이 너무 많아요. 잠시 후 다시 시도해주세요."
  if (msg.includes("network") || msg.includes("fetch")) return "네트워크 연결을 확인해주세요."
  return message || "알 수 없는 오류가 발생했어요."
}

export function AuthScreen({ title = "로그인", subtitle = "", onSuccess }) {
  const [mode, setMode] = useState("login")
  const [nickname, setNickname] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState("")
  const [captchaToken, setCaptchaToken] = useState("")
  const turnstileRef = useRef(null)

  const handleSubmit = async (event) => {
    event.preventDefault()
    setSubmitting(true)
    setErrorMessage("")

    try {
      if (mode === "signup") {
        await signUpWithEmail(email.trim(), password, nickname.trim(), captchaToken)
      } else {
        await signInWithEmail(email.trim(), password, captchaToken)
      }
      setPassword("")
      onSuccess?.(mode)
    } catch (error) {
      setErrorMessage(friendlyError(error.message))
      // Turnstile 토큰은 1회용 — 실패 시 새 토큰을 받도록 위젯 리셋
      setCaptchaToken("")
      turnstileRef.current?.reset()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="screen screen--scroll">
      <div className="feed-section">
        <div className="section-head">
          <div>
            <h1 className="section-head__title" style={{ letterSpacing: 0 }}>{title}</h1>
            {subtitle ? <p className="section-head__subtitle">{subtitle}</p> : null}
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

          <Turnstile ref={turnstileRef} onToken={setCaptchaToken} />

          <button className="button button--primary" type="submit" disabled={submitting}>
            {submitting ? "처리 중..." : mode === "signup" ? "계정 만들기" : "로그인"}
          </button>
        </form>
      </div>
    </section>
  )
}
