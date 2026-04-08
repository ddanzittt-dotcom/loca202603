const REPORT_REASONS = [
  { value: "spam", label: "스팸/광고" },
  { value: "offensive", label: "욕설/혐오" },
  { value: "inappropriate", label: "부적절한 내용" },
  { value: "misinformation", label: "허위 정보" },
  { value: "other", label: "기타" },
]

export function ReportDialog({ onReport, onClose }) {
  return (
    <div className="lw-report-overlay">
      <div className="lw-report">
        <h4>댓글 신고</h4>
        <p>사유를 선택해주세요.</p>
        <div className="lw-report__options">
          {REPORT_REASONS.map((opt) => (
            <button key={opt.value} type="button" onClick={() => onReport(opt.value)}>{opt.label}</button>
          ))}
        </div>
        <button className="lw-report__cancel" type="button" onClick={onClose}>취소</button>
      </div>
    </div>
  )
}
