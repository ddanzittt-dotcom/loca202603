import { useState } from "react"
import { BottomSheet } from "../ui"
import { FEEDBACK_CATEGORIES } from "../../lib/feedback"

// "치즈냥의 귓속말" — 치즈냥을 눌러 여는 피드백 시트.
// 유형(4종) + 내용(≤1000자)만 받고, 화면·기기 컨텍스트는 App 이 자동 첨부한다.
// onSubmit 은 async: 성공 시 App 이 시트를 닫고 치즈냥 뛰어나가기 모션을 재생,
// 실패 시 여기서 친화 문구를 인라인 표시하고 입력은 보존한다.
// ★ App 은 열릴 때만 이 컴포넌트를 마운트한다 → 매번 새 입력 상태(수동 리셋 불필요).

const BODY_MAX = 1000

export function FeedbackSheet({ open = true, onClose, onSubmit }) {
  const [category, setCategory] = useState("")
  const [body, setBody] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")

  const canSend = Boolean(category) && body.trim().length > 0 && !submitting

  const handleSend = async () => {
    if (!canSend) return
    setSubmitting(true)
    setError("")
    try {
      await onSubmit({ category, body: body.trim() })
      // 성공 시 App 이 open=false 로 내리고 모션을 재생한다 (여기선 별도 처리 없음)
    } catch (err) {
      setError(err?.message || "지금은 전달을 못 했어. 잠깐 뒤에 다시 말해줘!")
      setSubmitting(false)
    }
  }

  return (
    <BottomSheet
      open={open}
      title="치즈냥의 귓속말"
      subtitle="로카를 만드는 사람들에게 몰래 전해줄게. 작은 것도 좋아!"
      onClose={submitting ? undefined : onClose}
    >
      <div className="form-stack fb-sheet">
        <div className="field">
          <span>어떤 이야기야?</span>
          <div className="chips-row chips-row--wrap" role="group" aria-label="이야기 유형">
            {FEEDBACK_CATEGORIES.map((cat) => (
              <button
                key={cat.key}
                type="button"
                className={`chip${category === cat.key ? " chip--active" : ""}`}
                aria-pressed={category === cat.key}
                onClick={() => setCategory((prev) => (prev === cat.key ? "" : cat.key))}
                disabled={submitting}
              >
                <span aria-hidden="true">{cat.emoji}</span> {cat.label}
              </button>
            ))}
          </div>
        </div>

        <label className="field">
          <span>내용</span>
          <textarea
            className="fb-sheet__body"
            rows={4}
            maxLength={BODY_MAX}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="로카를 쓰면서 느꼈던 점을 편하게 적어줘"
            disabled={submitting}
          />
          <span className="fb-sheet__count">{body.length} / {BODY_MAX}</span>
        </label>

        <p className="fb-sheet__note">
          <span aria-hidden="true">ℹ️</span> 지금 보고 있는 화면·기기 정보가 함께 담겨요. (이름·연락처는 담기지 않아요)
        </p>

        {error ? <p className="fb-sheet__error" role="alert">{error}</p> : null}

        <button
          type="button"
          className="button button--primary fb-sheet__send"
          onClick={handleSend}
          disabled={!canSend}
        >
          {submitting ? "치즈냥에게 건네는 중..." : "이야기 보내기"}
        </button>
      </div>
    </BottomSheet>
  )
}
