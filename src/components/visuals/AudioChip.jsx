/**
 * AudioChip — 세이지 톤의 음성 메모 칩.
 *
 * 시안: 참고자료/design-source/map-cards-modals.jsx::AudioChip
 *
 * 작은 ▶ 버튼 + 라이브 파형(stable pseudo-random) + duration + (optional) 날짜 뱃지.
 *
 * Props:
 *   duration  — 표시할 길이 ("0:32" 등). 숫자(초)면 mm:ss 로 변환.
 *   date      — 우측 작은 뱃지 ("05.20" 등). 없으면 숨김.
 *   density   — 1 (넓음) | 2 (보통) | 3 (좁음) — 파형 막대 갯수 조절
 *   onPlay    — ▶ 버튼 클릭 핸들러
 */
function formatDuration(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    const m = Math.floor(value / 60)
    const s = Math.round(value - m * 60)
    return `${m}:${`${s}`.padStart(2, "0")}`
  }
  return String(value || "0:00")
}

export function AudioChip({ duration, date, density = 1, onPlay }) {
  const barCount = density >= 3 ? 10 : density >= 2 ? 16 : 22
  // stable pseudo-random heights (30~84%)
  const bars = Array.from({ length: barCount }, (_, i) => 30 + ((i * 17 + 7) % 18) * 3)
  const isInteractive = typeof onPlay === "function"
  const Tag = isInteractive ? "button" : "span"
  const tagProps = isInteractive
    ? { type: "button", onClick: onPlay, "aria-label": `재생 ${formatDuration(duration)}` }
    : {}

  return (
    <Tag className="loca-v2-audio-chip" {...tagProps}>
      <span className="loca-v2-audio-chip__play" aria-hidden="true">
        <svg width="9" height="9" viewBox="0 0 12 12" fill="currentColor">
          <path d="M3 2L10 6L3 10Z" />
        </svg>
      </span>
      <span className="loca-v2-audio-chip__bars" aria-hidden="true">
        {bars.map((h, i) => (
          <span key={i} style={{ height: `${h}%` }} />
        ))}
      </span>
      <span className="loca-v2-audio-chip__dur">{formatDuration(duration)}</span>
      {date ? <span className="loca-v2-audio-chip__date">{date}</span> : null}
    </Tag>
  )
}
