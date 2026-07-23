import { useEffect, useRef, useState } from "react"
import { signInWithEmail, signUpWithEmail, signInWithGoogle, signInWithKakao, friendlyAuthError } from "../lib/auth"
import { buildLegalDocumentUrl, normalizeSlugInput, isValidSlug, SLUG_MIN, SLUG_MAX } from "../lib/appUtils"
import { checkSlugAvailable } from "../lib/mapService"
import { Turnstile } from "../components/Turnstile"

function openLegal(kind) {
  window.open(buildLegalDocumentUrl(kind), "_blank", "noopener,noreferrer")
}

// 에러 문구 매핑은 lib/auth.js 로 이동 — OAuth 복귀 처리(App.jsx)와 공유한다.
const friendlyError = friendlyAuthError

export function AuthScreen({ title = "로그인", subtitle = "", onSuccess }) {
  const [mode, setMode] = useState("login")
  const [nickname, setNickname] = useState("")
  const [slug, setSlug] = useState("")
  const [slugStatus, setSlugStatus] = useState("idle") // idle|checking|available|taken|invalid|error
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState("")
  const [captchaToken, setCaptchaToken] = useState("")
  const [agreeTerms, setAgreeTerms] = useState(false)
  const [agreePrivacy, setAgreePrivacy] = useState(false)
  const [agreeMarketing, setAgreeMarketing] = useState(false)
  const turnstileRef = useRef(null)

  // 아이디(slug) 실시간 중복확인 — 회원가입 모드에서만.
  useEffect(() => {
    if (mode !== "signup") return undefined
    if (!slug) { setSlugStatus("idle"); return undefined }
    if (!isValidSlug(slug)) { setSlugStatus("invalid"); return undefined }
    setSlugStatus("checking")
    const timer = window.setTimeout(async () => {
      try {
        const ok = await checkSlugAvailable(slug)
        setSlugStatus(ok ? "available" : "taken")
      } catch {
        // 확인 실패 시 가입을 막지 않는다(트리거가 유일성 보장) — 상태만 표시.
        setSlugStatus("error")
      }
    }, 350)
    return () => window.clearTimeout(timer)
  }, [slug, mode])

  const slugReady = mode !== "signup"
    || (isValidSlug(slug) && slugStatus !== "taken" && slugStatus !== "checking")

  const slugHint =
    !slug ? `영문 소문자·숫자·밑줄(_) ${SLUG_MIN}~${SLUG_MAX}자. 다른 사람이 이 아이디로 나를 초대해요.`
    : slugStatus === "invalid" ? `영문 소문자·숫자·밑줄(_)만, ${SLUG_MIN}~${SLUG_MAX}자로 입력해요.`
    : slugStatus === "checking" ? "확인 중..."
    : slugStatus === "taken" ? "이미 사용 중인 아이디예요."
    : slugStatus === "available" ? "사용 가능한 아이디예요."
    : slugStatus === "error" ? "중복 확인을 못 했어요. 그대로 진행하면 비슷한 아이디가 배정될 수 있어요."
    : ""

  const slugHintColor =
    slugStatus === "available" ? "#12B981"
    : (slugStatus === "taken" || slugStatus === "invalid") ? "#EF4444"
    : "#667085"

  const requiredAgreed = agreeTerms && agreePrivacy
  const allAgreed = agreeTerms && agreePrivacy && agreeMarketing
  const toggleAll = (checked) => {
    setAgreeTerms(checked)
    setAgreePrivacy(checked)
    setAgreeMarketing(checked)
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setSubmitting(true)
    setErrorMessage("")

    try {
      if (mode === "signup") {
        // 최종 중복확인(제출 직전 경합 방지). 확인 실패는 무시 — 트리거가 유일성 보장.
        try {
          const ok = await checkSlugAvailable(slug)
          if (!ok) {
            setSlugStatus("taken")
            setErrorMessage("이미 사용 중인 아이디예요. 다른 아이디를 입력해주세요.")
            return
          }
        } catch {
          // 확인 불가 시 형식만 맞으면 그대로 진행
        }
        await signUpWithEmail(email.trim(), password, nickname.trim(), captchaToken, {
          terms: agreeTerms,
          privacy: agreePrivacy,
          marketing: agreeMarketing,
        }, slug)
      } else {
        await signInWithEmail(email.trim(), password, captchaToken)
      }
      setPassword("")
      onSuccess?.(mode, "email")
    } catch (error) {
      setErrorMessage(friendlyError(error.message))
      // Turnstile 토큰은 1회용 — 실패 시 새 토큰을 받도록 위젯 리셋
      setCaptchaToken("")
      turnstileRef.current?.reset()
    } finally {
      setSubmitting(false)
    }
  }

  // 간편 로그인 — 성공하면 브라우저가 provider 로 리다이렉트되므로 이 화면은 언마운트된다.
  // 약관 동의는 받지 않는다: OAuth 신규 가입자는 로그인 후 ConsentGate(073 RPC)가 잡는다.
  const handleOAuth = async (provider) => {
    setErrorMessage("")
    setSubmitting(true)
    try {
      if (provider === "google") await signInWithGoogle()
      else if (provider === "kakao") await signInWithKakao()
    } catch (error) {
      setErrorMessage(friendlyError(error.message))
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

          {mode === "signup" ? (
            <label className="field">
              <span>아이디</span>
              <input
                value={slug}
                onChange={(event) => setSlug(normalizeSlugInput(event.target.value))}
                placeholder="loca_kim"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                minLength={SLUG_MIN}
                maxLength={SLUG_MAX}
                required
              />
              <small style={{ fontSize: "0.78rem", color: slugHintColor }}>{slugHint}</small>
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

          {mode === "signup" ? (
            <fieldset className="auth-consent">
              <legend className="auth-consent__legend">약관 동의</legend>
              <label className="auth-consent__all">
                <input type="checkbox" checked={allAgreed} onChange={(event) => toggleAll(event.target.checked)} />
                <span>전체 동의</span>
              </label>
              <div className="auth-consent__list">
                <label className="auth-consent__row">
                  <input type="checkbox" checked={agreeTerms} onChange={(event) => setAgreeTerms(event.target.checked)} />
                  <span>
                    <b className="auth-consent__req">[필수]</b>{" "}
                    <button type="button" className="auth-consent__link" onClick={() => openLegal("terms")}>이용약관</button> 동의
                  </span>
                </label>
                <label className="auth-consent__row">
                  <input type="checkbox" checked={agreePrivacy} onChange={(event) => setAgreePrivacy(event.target.checked)} />
                  <span>
                    <b className="auth-consent__req">[필수]</b>{" "}
                    <button type="button" className="auth-consent__link" onClick={() => openLegal("privacy")}>개인정보 처리방침</button> 동의
                    <em className="auth-consent__note">가명·익명 통계 작성 및 제공 목적 포함</em>
                  </span>
                </label>
                <label className="auth-consent__row">
                  <input type="checkbox" checked={agreeMarketing} onChange={(event) => setAgreeMarketing(event.target.checked)} />
                  <span>
                    <b className="auth-consent__opt">[선택]</b> 마케팅 정보 수신 동의
                  </span>
                </label>
              </div>
            </fieldset>
          ) : null}

          {errorMessage ? (
            <article className="settings-card settings-card--danger">
              <p>{errorMessage}</p>
            </article>
          ) : null}

          <Turnstile ref={turnstileRef} onToken={setCaptchaToken} />

          <button
            className="button button--primary"
            type="submit"
            disabled={submitting || (mode === "signup" && (!requiredAgreed || !slugReady))}
          >
            {submitting ? "처리 중..." : mode === "signup" ? "계정 만들기" : "로그인"}
          </button>

          <div className="auth-divider">
            <hr />
            <span>간편 로그인</span>
            <hr />
          </div>

          <div className="auth-social-buttons">
            <button
              className="auth-social-btn auth-social-btn--kakao"
              type="button"
              disabled={submitting}
              onClick={() => handleOAuth("kakao")}
            >
              <svg className="auth-social-btn__icon" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M10 1C4.48 1 0 4.45 0 8.68c0 2.74 1.86 5.15 4.66 6.51-.16.57-.58 2.09-.66 2.42-.1.4.15.4.31.29.13-.08 2.04-1.36 2.86-1.92.6.09 1.22.13 1.83.13 5.52 0 10-3.45 10-7.68S15.52 1 10 1z" fill="currentColor"/></svg>
              <span>카카오로 계속하기</span>
            </button>

            <button
              className="auth-social-btn auth-social-btn--google"
              type="button"
              disabled={submitting}
              onClick={() => handleOAuth("google")}
            >
              <svg className="auth-social-btn__icon" viewBox="0 0 20 20" aria-hidden="true"><path d="M19.6 10.23c0-.68-.06-1.36-.17-2.02H10v3.83h5.38a4.6 4.6 0 01-2 3.02v2.5h3.24c1.89-1.74 2.98-4.3 2.98-7.33z" fill="#4285F4"/><path d="M10 20c2.7 0 4.96-.9 6.62-2.44l-3.24-2.5c-.9.6-2.04.95-3.38.95-2.6 0-4.8-1.76-5.58-4.12H1.07v2.58A9.99 9.99 0 0010 20z" fill="#34A853"/><path d="M4.42 11.89A6.01 6.01 0 014.1 10c0-.66.11-1.3.32-1.89V5.53H1.07A9.99 9.99 0 000 10c0 1.61.39 3.14 1.07 4.47l3.35-2.58z" fill="#FBBC05"/><path d="M10 3.96c1.47 0 2.78.5 3.82 1.5l2.86-2.87C14.96.99 12.7 0 10 0A9.99 9.99 0 001.07 5.53l3.35 2.58C5.2 5.72 7.4 3.96 10 3.96z" fill="#EA4335"/></svg>
              <span>Google로 계속하기</span>
            </button>
          </div>
        </form>
      </div>
    </section>
  )
}
