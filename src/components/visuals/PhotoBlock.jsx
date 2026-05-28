/**
 * PhotoBlock — 사진/미디어 placeholder.
 * 그라데이션 + 미세 격자 텍스처. 실 사진 자산 들어오기 전까지 사용.
 *
 * 시안: 참고자료/design-source/visuals.jsx::PhotoBlock
 *
 * Props:
 *   tone    — 'a' | 'b' | 'c' | 'd' | 'e' (그라데이션 변형)
 *   src     — 실 이미지 URL (있으면 그라데이션 위에 덮어 그림)
 *   alt     — img alt
 *   size    — px 또는 CSS string. width/height 동일.
 *   radius  — px (기본 12)
 *   children— 위에 얹는 오버레이 (뱃지 등)
 *
 * src 있으면 <img>, 없으면 그라데이션만.
 */
const TONE_GRADIENT = {
  a: "linear-gradient(135deg, var(--accent-soft) 0%, var(--second) 100%)",
  b: "linear-gradient(135deg, var(--bg-warm) 0%, var(--accent) 120%)",
  c: "linear-gradient(135deg, var(--second-soft) 0%, var(--accent-soft) 100%)",
  d: "linear-gradient(135deg, #FFE9D2 0%, var(--accent) 120%)",
  e: "linear-gradient(135deg, var(--third-soft) 0%, var(--second) 100%)",
}

export function PhotoBlock({
  tone = "a",
  src,
  alt = "",
  size,
  width,
  height,
  radius = 12,
  style,
  className = "",
  onImageError,
  children,
}) {
  const finalWidth = width ?? size
  const finalHeight = height ?? size
  const baseStyle = {
    position: "relative",
    overflow: "hidden",
    borderRadius: radius,
    background: TONE_GRADIENT[tone] || TONE_GRADIENT.a,
    width: finalWidth,
    height: finalHeight,
    ...style,
  }
  return (
    <div className={`loca-v2-photo-block ${className}`} style={baseStyle}>
      {src ? (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          onError={onImageError}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
          }}
        />
      ) : (
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(circle at 25% 30%, rgba(255,255,255,0.35), transparent 55%)," +
              "radial-gradient(circle at 75% 75%, rgba(0,0,0,0.08), transparent 55%)",
            pointerEvents: "none",
          }}
        />
      )}
      {children}
    </div>
  )
}
