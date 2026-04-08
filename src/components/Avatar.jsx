// 아바타 컴포넌트
import { getAvatarColors, getInitials } from "../lib/avatarUtils"

/**
 * @param {string} name - 사용자 이름 (이니셜 + 색상 결정)
 * @param {string} [avatarUrl] - 프로필 사진 URL
 * @param {number} [size=48] - 크기 (px)
 * @param {string} [className] - 추가 CSS 클래스
 * @param {boolean} [round=true] - 원형 여부
 */
export function Avatar({ name, avatarUrl, size = 48, className = "", round = true }) {
  const colors = getAvatarColors(name)
  const initials = getInitials(name)
  const radius = round ? "50%" : "18px"
  const fontSize = Math.max(10, Math.round(size * 0.32))

  return (
    <div
      className={className}
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        background: avatarUrl ? "transparent" : colors.bg,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        overflow: "hidden",
      }}
    >
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt=""
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : (
        <span style={{ color: colors.text, fontSize, fontWeight: 500 }}>
          {initials}
        </span>
      )}
    </div>
  )
}
