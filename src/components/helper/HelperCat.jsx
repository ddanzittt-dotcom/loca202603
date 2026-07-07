import { useEffect, useRef, useState } from "react"

// 도우미 고양이 "로카냥" — 두발로 선 턱시도(검정+흰 가슴/양말) 도트 고양이.
// 좌하단에 상주하며, 누르면 도움말 메뉴(주제별 튜토리얼 점프)를 연다.
// 픽셀 문법은 PixelRadar 의 걷는 고양이(xradar__cat-svg)와 동일하게 rect 기반.

export function TuxCatSprite({ size = 34, waving = false }) {
  return (
    <svg
      className={`hcat-svg${waving ? " is-waving" : ""}`}
      width={size}
      height={Math.round(size * 1.4)}
      viewBox="0 0 30 42"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* 귀 */}
      <path d="M6 6 L6 0 L11 6 Z" fill="#1F1A12" />
      <path d="M24 6 L24 0 L19 6 Z" fill="#1F1A12" />
      {/* 머리 */}
      <rect x="4" y="5" width="22" height="14" fill="#1F1A12" />
      {/* 눈 (깜빡임) */}
      <g className="hcat-eyes">
        <rect x="9" y="10" width="3" height="3" fill="#FFFDF4" />
        <rect x="18" y="10" width="3" height="3" fill="#FFFDF4" />
      </g>
      {/* 입가 흰 무늬 + 코 */}
      <rect x="12" y="14" width="6" height="4" fill="#FFFDF4" />
      <rect x="13.5" y="13" width="3" height="1.5" fill="#F0A0A8" />
      {/* 몸통 + 흰 가슴 */}
      <rect x="6" y="19" width="18" height="16" fill="#1F1A12" />
      <rect x="10" y="19" width="10" height="12" fill="#FFFDF4" />
      {/* 팔 — 왼팔은 인사(살랑) */}
      <g className="hcat-arm">
        <rect x="1" y="16" width="5" height="4" fill="#1F1A12" />
        <rect x="0" y="12" width="4" height="5" fill="#1F1A12" />
      </g>
      <rect x="24" y="22" width="5" height="4" fill="#1F1A12" />
      {/* 다리 + 흰 양말 */}
      <rect x="8" y="35" width="5" height="6" fill="#1F1A12" />
      <rect x="17" y="35" width="5" height="6" fill="#1F1A12" />
      <rect x="8" y="39" width="5" height="2.5" fill="#FFFDF4" />
      <rect x="17" y="39" width="5" height="2.5" fill="#FFFDF4" />
      {/* 꼬리 (살랑) */}
      <g className="hcat-tail">
        <rect x="24" y="30" width="4" height="3" fill="#1F1A12" />
        <rect x="27" y="26" width="3" height="5" fill="#1F1A12" />
        <rect x="28" y="23" width="3" height="3" fill="#FFFDF4" />
      </g>
    </svg>
  )
}

// 도움말 메뉴 항목 → 튜토리얼 시작 스텝 인덱스 (TutorialDialog 의 TUTORIAL_STEPS 기준)
const HELP_TOPICS = [
  { step: 0, emoji: "📖", label: "처음부터 전체 사용법" },
  { step: 1, emoji: "📍", label: "장소 채집하는 법" },
  { step: 2, emoji: "🗂️", label: "카드에 기록 남기는 법" },
  { step: 3, emoji: "🗺️", label: "지도 만드는 법" },
  { step: 4, emoji: "📣", label: "발행·공유하는 법" },
]

export function HelperCat({ onOpenTutorial }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const rootRef = useRef(null)

  // 바깥 탭/ESC 로 메뉴 닫기
  useEffect(() => {
    if (!menuOpen) return undefined
    const handlePointer = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) setMenuOpen(false)
    }
    const handleKey = (event) => {
      if (event.key === "Escape") setMenuOpen(false)
    }
    window.addEventListener("pointerdown", handlePointer)
    window.addEventListener("keydown", handleKey)
    return () => {
      window.removeEventListener("pointerdown", handlePointer)
      window.removeEventListener("keydown", handleKey)
    }
  }, [menuOpen])

  return (
    <div className="hcat" ref={rootRef}>
      {menuOpen ? (
        <div className="hcat-menu" role="menu" aria-label="도움말 메뉴">
          <span className="hcat-menu__title">뭐가 궁금해?</span>
          {HELP_TOPICS.map((topic) => (
            <button
              key={topic.step}
              type="button"
              role="menuitem"
              className="hcat-menu__item"
              onClick={() => {
                setMenuOpen(false)
                onOpenTutorial?.(topic.step)
              }}
            >
              <span aria-hidden="true">{topic.emoji}</span>
              {topic.label}
            </button>
          ))}
        </div>
      ) : null}
      <button
        type="button"
        className={`hcat-btn${menuOpen ? " is-open" : ""}`}
        onClick={() => setMenuOpen((open) => !open)}
        aria-label="도우미 로카냥 — 도움말 열기"
        aria-expanded={menuOpen}
      >
        <TuxCatSprite size={30} waving={menuOpen} />
      </button>
    </div>
  )
}
