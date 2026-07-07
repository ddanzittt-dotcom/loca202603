import { useEffect, useState } from "react"
import { TuxCatSprite } from "./HelperCat"

// 로카냥 튜토리얼 — 포켓몬식 대화창.
// 어두운 배경 + 중앙 스텝 카드 + 하단 대화창(타자기). 탭 1회 = 타이핑 완성, 2회 = 다음 스텝.

const TUTORIAL_STEPS = [
  {
    emoji: "🐾",
    title: "LOCA는 이렇게 써요",
    desc: ["채집 → 바인더 → 지도 → 공유", "네 걸음이면 충분해요"],
    speech: "반가워! 나는 로카냥이야. LOCA 사용법을 차근차근 알려줄게!",
  },
  {
    emoji: "📍",
    title: "1. 장소를 채집해요",
    desc: ["탐색이나 지도에서 마음에 든 곳을", "누르면 카드가 만들어져요"],
    speech: "마음에 드는 곳을 발견하면 눌러서 채집해! 그 자리에서 카드 한 장이 만들어져.",
  },
  {
    emoji: "🗂️",
    title: "2. 카드가 바인더에 모여요",
    desc: ["'내 장소'에서 카드를 누르면", "기록과 사진을 남길 수 있어요"],
    speech: "채집한 카드는 '내 장소' 바인더에 꽂혀. 카드를 누르면 뒤집혀서 기록과 사진을 남길 수 있어!",
  },
  {
    emoji: "🗺️",
    title: "3. 카드를 지도로 묶어요",
    desc: ["'내 지도'에서 새 지도를 만들고", "모은 카드를 골라 담아요"],
    speech: "카드가 모이면 '내 지도'에서 새 지도를 만들어봐. 골라 담기만 하면 나만의 지도 완성!",
  },
  {
    emoji: "📣",
    title: "4. 발행하고 공유해요",
    desc: ["완성한 지도는 링크·QR·카카오로", "친구에게 공유할 수 있어요"],
    speech: "완성한 지도는 발행해서 친구에게 공유할 수 있어. 그럼, 좋은 채집 되길! 냐옹~",
  },
]

// 타자기 효과 — PlaceFlipCard 의 useTypewriter 와 같은 패턴 (키 기반 진행 상태)
function useTypewriter(text) {
  const key = `${text || ""}`
  const [progress, setProgress] = useState({ key: "", count: 0 })
  const count = progress.key === key ? progress.count : 0

  useEffect(() => {
    if (!key) return undefined
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches
    const timer = window.setInterval(() => {
      setProgress((current) => {
        const base = current.key === key ? current.count : 0
        if (base >= key.length) return current
        return { key, count: reduced ? key.length : base + 1 }
      })
    }, 28)
    return () => window.clearInterval(timer)
  }, [key])

  const complete = () => setProgress({ key, count: key.length })
  return [key.slice(0, count), count >= key.length, complete]
}

export function TutorialDialog({ startStep = 0, onClose }) {
  const [step, setStep] = useState(() => Math.min(Math.max(startStep, 0), TUTORIAL_STEPS.length - 1))
  const current = TUTORIAL_STEPS[step]
  const [typed, typingDone, completeTyping] = useTypewriter(current.speech)
  const isLast = step === TUTORIAL_STEPS.length - 1

  useEffect(() => {
    const handleKey = (event) => {
      if (event.key === "Escape") onClose?.()
    }
    window.addEventListener("keydown", handleKey)
    return () => window.removeEventListener("keydown", handleKey)
  }, [onClose])

  const advance = () => {
    if (!typingDone) {
      completeTyping()
      return
    }
    if (isLast) onClose?.()
    else setStep((value) => value + 1)
  }

  return (
    <div className="tut-ov" role="dialog" aria-modal="true" aria-label="LOCA 사용법 안내">
      <button type="button" className="tut-skip" onClick={onClose}>건너뛰기 ✕</button>

      {/* 중앙 스텝 카드 */}
      <div className="tut-card" key={step}>
        <span className="tut-card__emoji" aria-hidden="true">{current.emoji}</span>
        <strong className="tut-card__title">{current.title}</strong>
        {current.desc.map((line) => (
          <p key={line} className="tut-card__desc">{line}</p>
        ))}
        <div className="tut-dots" aria-label={`${step + 1} / ${TUTORIAL_STEPS.length}`}>
          {TUTORIAL_STEPS.map((item, index) => (
            <span key={item.title} className={`tut-dot${index === step ? " is-on" : ""}`} />
          ))}
        </div>
      </div>

      {/* 하단 대화창 */}
      <button type="button" className="tut-dlg" onClick={advance}>
        <span className="tut-dlg__cat" aria-hidden="true"><TuxCatSprite size={40} waving /></span>
        <span className="tut-dlg__name">로카냥</span>
        <span className="tut-dlg__text">
          {typed}
          {typingDone ? null : <span className="tut-dlg__caret" aria-hidden="true">_</span>}
        </span>
        {typingDone ? (
          <span className="tut-dlg__next" aria-hidden="true">{isLast ? "시작하기!" : "▼"}</span>
        ) : null}
      </button>
      <p className="tut-hint" aria-hidden="true">대화창을 탭하면 다음으로 넘어가요</p>
    </div>
  )
}
