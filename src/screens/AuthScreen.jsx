import { useEffect, useRef, useState } from "react"
import { signInWithEmail, signUpWithEmail } from "../lib/auth"
import { buildLegalDocumentUrl, normalizeSlugInput, isValidSlug, SLUG_MIN, SLUG_MAX } from "../lib/appUtils"
import { checkSlugAvailable } from "../lib/mapService"
import { Turnstile } from "../components/Turnstile"

function openLegal(kind) {
  window.open(buildLegalDocumentUrl(kind), "_blank", "noopener,noreferrer")
}

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
        </form>
      </div>
    </section>
  )
}
