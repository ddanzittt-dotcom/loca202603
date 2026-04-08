// 아바타 색상 팔레트 + 이니셜 추출 유틸리티

const AVATAR_PALETTES = [
  { bg: "#E8BCAD", text: "#993C1D" },
  { bg: "#ECCAA0", text: "#633806" },
  { bg: "#C2D6B8", text: "#085041" },
  { bg: "#ACD6CC", text: "#085041" },
  { bg: "#ABC6DC", text: "#0C447C" },
  { bg: "#C8C9DC", text: "#3D3E6B" },
  { bg: "#E8C8BE", text: "#712B13" },
  { bg: "#9CC8AC", text: "#085041" },
]

export function getAvatarColors(name) {
  let hash = 0
  for (let i = 0; i < (name || "").length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return AVATAR_PALETTES[Math.abs(hash) % AVATAR_PALETTES.length]
}

export function getInitials(name) {
  if (!name) return "?"
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}
