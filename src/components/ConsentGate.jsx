import { useState } from "react"
import { createPortal } from "react-dom"
import { buildLegalDocumentUrl } from "../lib/appUtils"

function openLegal(kind) {
  window.open(buildLegalDocumentUrl(kind), "_blank", "noopener,noreferrer")
}

// 로그인 후 필수 동의 게이트.
// OAuth(카카오 등)·동의 UI 배포 이전 계정·방침 버전 변경으로 동의 기록이 없거나 구버전인
// 사용자에게 이용약관+개인정보 처리방침(필수) 동의를 받는다. 이메일 가입과 동일한 동의 모델
// (auth-consent* 스타일 재사용). 셸은 인라인 스타일로 자립 — 공유 CSS 미변경.
const BACKDROP = {
  position: "fixed", inset: 0, background: "rgba(31, 26, 18, 0.55)",
  zIndex: 9998, backdropFilter: "blur(2px)",
}
const SHEET = {
  position: "fixed", left: "50%", bottom: 0, transform: "translateX(-50%)",
  width: "min(440px, 100%)", maxHeight: "92vh", overflowY: "auto",
  background: "#FBF7EF", color: "#1F1A12",
  borderRadius: "18px 18px 0 0", padding: "10px 20px 24px",
  zIndex: 9999, boxShadow: "0 -10px 44px rgba(31, 26, 18, 0.28)",
}
const HANDLE = {
  width: 44, height: 4, borderRadius: 2, background: "rgba(31,26,18,0.18)",
  margin: "0 auto 14px",
}

export function ConsentGate({ open, onAgree, submitting = false }) {
  const [agreeTerms, setAgreeTerms] = useState(false)
  const [agreePrivacy, setAgreePrivacy] = useState(false)
  const [agreeMarketing, setAgreeMarketing] = useState(false)

  const requiredAgreed = agreeTerms && agreePrivacy
  const allAgreed = agreeTerms && agreePrivacy && agreeMarketing
  const toggleAll = (checked) => {
    setAgreeTerms(checked)
    setAgreePrivacy(checked)
    setAgreeMarketing(checked)
  }

  if (!open) return null

  return createPortal(
    <>
      <div style={BACKDROP} />
      <section style={SHEET} role="dialog" aria-modal="true" aria-label="서비스 이용 약관 동의">
        <div style={HANDLE} />
        <header style={{ marginBottom: 14 }}>
          <h2 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 800 }}>서비스 이용을 위한 동의</h2>
          <p style={{ margin: 0, fontSize: 13, color: "#6b6355" }}>
            계속하려면 아래 필수 항목에 동의해 주세요.
          </p>
        </header>

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

        <button
          type="button"
          className="button button--primary"
          style={{ width: "100%", marginTop: 16 }}
          disabled={!requiredAgreed || submitting}
          onClick={() => onAgree?.({ marketing: agreeMarketing })}
        >
          {submitting ? "처리 중..." : "동의하고 계속하기"}
        </button>
      </section>
    </>,
    document.body,
  )
}
