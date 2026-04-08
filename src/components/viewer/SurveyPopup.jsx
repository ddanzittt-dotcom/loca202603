export function SurveyPopup({ rating, setRating, comment, setComment, onSubmit, onClose }) {
  return (
    <div className="lw-survey-overlay">
      <div className="lw-survey">
        <h3>축하해요! 설문에 참여해주세요</h3>
        <div className="lw-survey__stars">
          {[1, 2, 3, 4, 5].map((star) => (
            <button key={star} type="button" className={`lw-star${rating >= star ? " is-active" : ""}`} onClick={() => setRating(star)}>★</button>
          ))}
        </div>
        <textarea className="lw-survey__comment" rows={2} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="한줄 후기를 남겨주세요 (선택)" />
        <div className="lw-survey__actions">
          <button className="button button--ghost" type="button" onClick={onClose}>건너뛰기</button>
          <button className="button button--primary" type="button" onClick={onSubmit} disabled={rating === 0}>제출</button>
        </div>
      </div>
    </div>
  )
}
