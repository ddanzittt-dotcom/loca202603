/**
 * MiniMap — 지도 썸네일 SVG placeholder.
 *
 * 시안: 참고자료/design-source/visuals.jsx::MiniMap
 *
 * variant 4종 (참고자료 그대로):
 *   - 'course'  — 점선 코스 + 6개 핀
 *   - 'region'  — 코랄 폴리곤 영역 + 5개 핀
 *   - 'cluster' — 자유 곡선 + 9개 클러스터 핀
 *   - 'bloom'   — 두 개의 큰 원 + 4개 핀
 *
 * Props:
 *   variant   — 위 4종
 *   width/height — 기본 200x138, square 모드는 100x100
 *   square    — true면 정사각 100x100
 *
 * 실제 지도 SDK(네이버 등)가 로드되지 않을 때의 fallback 또는 카드 썸네일용.
 */
export function MiniMap({ variant = "course", width, height, square = false }) {
  const w = width ?? (square ? 100 : 200)
  const h = height ?? (square ? 100 : 138)
  const ratio = w / 200
  const yScale = square ? 100 / 138 : 1

  // 격자 라인
  const gridLines = [0.2, 0.4, 0.6, 0.8].map((p) => (
    <g key={p}>
      <line x1={w * p} y1="0" x2={w * p} y2={h} />
      <line x1="0" y1={h * p} x2={w} y2={h * p} />
    </g>
  ))

  // 패스/면
  const paths = {
    course: (
      <path
        d={`M ${28 * ratio} ${105 * ratio * yScale} L ${65 * ratio} ${60 * ratio * yScale} L ${95 * ratio} ${95 * ratio * yScale} L ${130 * ratio} ${50 * ratio * yScale} L ${162 * ratio} ${78 * ratio * yScale} L ${180 * ratio} ${38 * ratio * yScale}`}
        stroke="var(--accent)"
        strokeWidth={1.4}
        strokeDasharray="3 2.5"
        fill="none"
        opacity={0.6}
      />
    ),
    region: (
      <path
        d={`M ${30 * ratio} ${40 * ratio * yScale} Q ${90 * ratio} ${25 * ratio * yScale} ${150 * ratio} ${45 * ratio * yScale} Q ${170 * ratio} ${80 * ratio * yScale} ${130 * ratio} ${110 * ratio * yScale} Q ${70 * ratio} ${115 * ratio * yScale} ${35 * ratio} ${85 * ratio * yScale} Z`}
        fill="var(--accent-soft)"
        opacity={0.8}
      />
    ),
    cluster: (
      <path
        d={`M ${20 * ratio} ${60 * ratio * yScale} Q ${60 * ratio} ${50 * ratio * yScale} ${100 * ratio} ${70 * ratio * yScale} Q ${140 * ratio} ${90 * ratio * yScale} ${180 * ratio} ${75 * ratio * yScale}`}
        stroke="var(--second)"
        strokeWidth={2.5}
        fill="none"
        opacity={0.6}
      />
    ),
    bloom: (
      <g>
        <circle cx={60 * ratio} cy={50 * ratio * yScale} r={20 * ratio} fill="var(--accent-soft)" opacity={0.5} />
        <circle cx={130 * ratio} cy={85 * ratio * yScale} r={22 * ratio} fill="var(--second-soft)" opacity={0.6} />
      </g>
    ),
  }

  // 핀 좌표 세트
  const pinSets = {
    course: [[28, 105], [65, 60], [95, 95], [130, 50], [162, 78], [180, 38]],
    region: [[55, 55], [105, 42], [138, 78], [80, 92], [50, 105]],
    cluster: [[30, 55], [48, 68], [65, 50], [78, 78], [92, 62], [108, 92], [120, 48], [135, 75], [148, 58]],
    bloom: [[55, 48], [68, 62], [125, 80], [140, 92]],
  }

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      style={{ width: "100%", height: "100%", display: "block" }}
      aria-hidden="true"
      focusable="false"
    >
      <rect width={w} height={h} fill="var(--map)" />
      <g stroke="var(--map-grid)" strokeWidth={0.6} opacity={0.7}>
        {gridLines}
      </g>
      {paths[variant]}
      <g fill="var(--accent)" stroke="#fff" strokeWidth={0.8}>
        {pinSets[variant].map(([x, y], i) => (
          <circle
            key={i}
            cx={x * ratio}
            cy={y * ratio * yScale}
            r={3.2 * ratio}
          />
        ))}
      </g>
    </svg>
  )
}
