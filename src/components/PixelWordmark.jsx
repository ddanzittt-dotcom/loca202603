// 도트형 LOCA 워드마크 — 13px 그리드 픽셀 블록 (타이틀·상단 네비 공용).
// D안: 잉크 글자 + 하드섀도(배경별 색 지정) + 엠버 마침표.
// SVG rect 라 어떤 크기에서도 도트가 깨지지 않는다. height 로 스케일.

// 글자 블록 (마침표 제외) — L / O / C / A
const GLYPH = [
  [0, 0, 13, 91], [13, 78, 52, 13],                                   // L
  [91, 0, 39, 13], [78, 13, 13, 65], [130, 13, 13, 65], [91, 78, 39, 13], // O
  [169, 0, 52, 13], [156, 13, 13, 65], [169, 78, 52, 13],             // C
  [247, 0, 39, 13], [234, 13, 13, 78], [286, 13, 13, 78], [247, 39, 39, 13], // A
]
const DOT = [310, 65, 26, 26]

export function PixelWordmark({
  height = 28,
  shadow = "#F6EFDB", // 크림 하드섀도 (밝은 배경엔 "#E3DCC9" 권장)
  ink = "#1F1A12",
  dot = "#FF4D1A",
  className = "",
  title = "LOCA",
}) {
  const width = Math.round((height * 350) / 100)
  return (
    <svg
      className={className}
      width={width}
      height={height}
      viewBox="0 0 350 100"
      shapeRendering="crispEdges"
      role="img"
      aria-label={title}
    >
      {/* 하드섀도 (글자 + 마침표, +7,+7 오프셋) */}
      <g fill={shadow} transform="translate(7,7)">
        {GLYPH.map((r, i) => <rect key={i} x={r[0]} y={r[1]} width={r[2]} height={r[3]} />)}
        <rect x={DOT[0]} y={DOT[1]} width={DOT[2]} height={DOT[3]} />
      </g>
      {/* 잉크 글자 */}
      <g fill={ink}>
        {GLYPH.map((r, i) => <rect key={i} x={r[0]} y={r[1]} width={r[2]} height={r[3]} />)}
      </g>
      {/* 엠버 마침표 */}
      <rect x={DOT[0]} y={DOT[1]} width={DOT[2]} height={DOT[3]} fill={dot} />
    </svg>
  )
}
