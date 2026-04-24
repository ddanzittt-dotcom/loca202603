// 온보딩 코치마크 오버레이
export function CoachMark({ step, totalSteps, title, description, nextLabel = "다음", onNext, onSkip }) {
  return (
    <div className="coachmark-overlay" onClick={onSkip}>
      <div className="coachmark-bubble" onClick={(e) => e.stopPropagation()}>
        <span className="coachmark-bubble__step">{step} / {totalSteps}</span>
        <p className="coachmark-bubble__title">{title}</p>
        <p className="coachmark-bubble__desc">{description}</p>
        <div className="coachmark-bubble__actions">
          <button className="coachmark-bubble__skip" type="button" onClick={onSkip}>건너뛰기</button>
          <button className="coachmark-bubble__next" type="button" onClick={onNext}>{nextLabel}</button>
        </div>
      </div>
    </div>
  )
}
