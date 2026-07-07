/* eslint-disable react-refresh/only-export-components */
// 프로필 도트 아바타 — 남/여 두 캐릭터. 16×16 문자 그리드(HelperCat 방식).
// 성별 선택은 프로필 avatar_url 센티넬 "loca-char:male|female" 로 저장·동기화된다.

const PALETTE = {
  O: "#1B1B18", // 윤곽선
  H: "#4A3728", // 머리
  s: "#F2C9A0", // 피부
  E: "#26221C", // 눈
  m: "#C0714F", // 입
  B: "#4E73A8", // 남 셔츠(블루)
  R: "#DE7FA0", // 여 셔츠(로즈)
}

const MALE_GRID = [
  "................",
  "....OOOOOO......",
  "...OHHHHHHO.....",
  "..OHHHHHHHHO....",
  "..OHssssssHO....",
  "..OssssssssO....",
  "..OsEsssEssO....",
  "..OssssssssO....",
  "..OssmmmmssO....",
  "...OssssssO.....",
  "....OBBBBO......",
  "...OBBBBBBO.....",
  "..OBBBBBBBBO....",
  ".OBBBBBBBBBBO...",
  ".OBBBBBBBBBBO...",
  ".OOBBBBBBBBOO...",
]

const FEMALE_GRID = [
  "................",
  "....OOOOOO......",
  "...OHHHHHHO.....",
  "..OHHHHHHHHO....",
  ".OHHssssssHHO...",
  ".OHssssssssHO...",
  ".OHsEsssEssHO...",
  ".OHssssssssHO...",
  ".OHssmmmmssHO...",
  ".OHOssssssOHO...",
  ".OHH.OOOO.HHO...",
  "..OHRRRRRRHO....",
  ".OHRRRRRRRRHO...",
  ".ORRRRRRRRRRO...",
  ".ORRRRRRRRRRO...",
  ".OORRRRRRRROO...",
]

// 문자 그리드 → 가로 run 병합 rect 배열
function gridToRects(grid) {
  const rects = []
  grid.forEach((row, y) => {
    let x = 0
    while (x < row.length) {
      const ch = row[x]
      if (!PALETTE[ch]) { x += 1; continue }
      let end = x + 1
      while (end < row.length && row[end] === ch) end += 1
      rects.push({ x, y, w: end - x, fill: PALETTE[ch] })
      x = end
    }
  })
  return rects
}

const RECTS = { male: gridToRects(MALE_GRID), female: gridToRects(FEMALE_GRID) }

export const AVATAR_CHARS = ["male", "female"]

// 유저 → 선택된 캐릭터 ("male"|"female") 또는 null. avatar_url/emoji 센티넬에서 파싱.
export function avatarCharOf(user) {
  const raw = `${user?.avatarChar || user?.emoji || user?.avatarUrl || ""}`
  const matched = raw.match(/loca-char:(male|female)/)
  return matched ? matched[1] : null
}

export function avatarCharSentinel(char) {
  return `loca-char:${char === "female" ? "female" : "male"}`
}

export function PixelAvatar({ char, className = "" }) {
  const key = char === "female" ? "female" : "male"
  return (
    <svg
      className={`px-avatar ${className}`.trim()}
      viewBox="0 0 16 16"
      xmlns="http://www.w3.org/2000/svg"
      shapeRendering="crispEdges"
      style={{ width: "100%", height: "100%", display: "block" }}
      aria-hidden="true"
    >
      {RECTS[key].map((r) => (
        <rect key={`${r.x}-${r.y}`} x={r.x} y={r.y} width={r.w} height="1" fill={r.fill} />
      ))}
    </svg>
  )
}
