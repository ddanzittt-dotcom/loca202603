import { useEffect } from "react"
import { FeatureEmoji } from "../FeatureEmoji"
import { cardArtFeature } from "../../lib/binderCardData"

// 새로운 곳 발견 연출 — 등록 도장 + 반짝임. SPOT 등록보다 임팩트를 크게.
// onDone: 연출 종료(자동 or 카드 보기 클릭) → 카드 오픈으로 이어진다.
export function NewFindBurst({ feature, dexNo, onDone }) {
  useEffect(() => {
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches
    const timer = window.setTimeout(() => onDone?.(), reduced ? 300 : 2600)
    return () => window.clearTimeout(timer)
  }, [onDone])

  const name = (feature?.title || "").trim() || "새로운 곳"
  const sparkles = [
    { left: "12%", top: "22%", d: "0s", s: 22 },
    { left: "82%", top: "18%", d: "0.15s", s: 16 },
    { left: "20%", top: "70%", d: "0.3s", s: 14 },
    { left: "78%", top: "72%", d: "0.22s", s: 20 },
    { left: "50%", top: "8%", d: "0.4s", s: 18 },
    { left: "88%", top: "48%", d: "0.5s", s: 13 },
    { left: "6%", top: "48%", d: "0.35s", s: 13 },
  ]

  return (
    <div className="nfb-ov" onClick={() => onDone?.()} role="dialog" aria-modal="true" aria-label="새로운 곳 발견">
      <div className="nfb-rays" aria-hidden="true" />
      {sparkles.map((sp, index) => (
        <span
          key={index}
          className="nfb-spark"
          aria-hidden="true"
          style={{ left: sp.left, top: sp.top, fontSize: sp.s, animationDelay: sp.d }}
        >✦</span>
      ))}

      <div className="nfb-card" onClick={(event) => event.stopPropagation()} role="presentation">
        <span className="nfb-tag">NEW!</span>
        <div className="nfb-art">
          <FeatureEmoji feature={cardArtFeature(feature || {})} size={72} unicodeFontSize={48} />
        </div>
        <p className="nfb-title">새로운 곳 발견!</p>
        <p className="nfb-name">{name}</p>
        <p className="nfb-no">No.{dexNo || "000"} 등록 완료</p>
        <button type="button" className="nfb-btn" onClick={() => onDone?.()}>카드 보기</button>
      </div>
    </div>
  )
}
