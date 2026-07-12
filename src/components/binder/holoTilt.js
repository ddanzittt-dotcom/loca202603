// 홀로 카드 틸트 — 포인터 위치를 카드의 CSS 변수(--hx/--hy/--rx/--ry/--hp)로 주입해
// app-shell.css "홀로 카드" 섹션의 틸트·포일·글레어를 구동한다.
// 라이선스 주의: poke-holo(pokemon-cards-css)는 GPL-3.0이라 원본 코드를 참조·복사하지 않은
// 자체 구현이다. 유지보수 시에도 원본 저장소 코드를 가져오지 말 것.
// 호버 가능한 정밀 포인터(데스크톱) + 모션 허용 환경에서만 동작 — 그 외엔 no-op.

// MediaQueryList 는 모듈에서 1회 생성, .matches 는 핸들러 시점에 읽는다 —
// CSS 미디어쿼리처럼 세션 중 설정 변경(모션 축소 토글 등)이 실시간 반영되도록.
const supported = typeof window !== "undefined" && typeof window.matchMedia === "function"
const pointerQuery = supported ? window.matchMedia("(hover: hover) and (pointer: fine)") : null
const reduceMotionQuery = supported ? window.matchMedia("(prefers-reduced-motion: reduce)") : null

function canHolo() {
  return Boolean(pointerQuery?.matches) && !reduceMotionQuery?.matches
}

// 카드별 다음 프레임 좌표 — rAF 스로틀(프레임당 계산 1회, 최신 좌표만 반영)
const pendingByCard = new WeakMap()

export function holoTiltMove(event) {
  if (!canHolo()) return
  const card = event.currentTarget
  const scheduled = pendingByCard.has(card)
  pendingByCard.set(card, { x: event.clientX, y: event.clientY })
  if (scheduled) return
  requestAnimationFrame(() => {
    const point = pendingByCard.get(card)
    pendingByCard.delete(card)
    if (!point || !card.isConnected) return
    const rect = card.getBoundingClientRect()
    if (!rect.width || !rect.height) return
    const px = Math.min(100, Math.max(0, ((point.x - rect.left) / rect.width) * 100))
    const py = Math.min(100, Math.max(0, ((point.y - rect.top) / rect.height) * 100))
    const cx = px - 50
    const cy = py - 50
    card.classList.add("bd-holo-on")
    card.style.setProperty("--hx", `${px.toFixed(1)}%`)
    card.style.setProperty("--hy", `${py.toFixed(1)}%`)
    card.style.setProperty("--rx", `${(cx / 9).toFixed(2)}deg`) // rotateY — 좌우 기울임 (최대 ±5.6°)
    card.style.setProperty("--ry", `${(-cy / 11).toFixed(2)}deg`) // rotateX — 상하 기울임 (최대 ±4.5°)
    card.style.setProperty("--hp", Math.min(1, Math.hypot(cx, cy) / 50).toFixed(3))
  })
}

// 정리는 게이트 없이 항상 수행 — 호버 중 설정이 바뀌어도 틸트가 걸린 채 남지 않게
export function holoTiltLeave(event) {
  const card = event.currentTarget
  pendingByCard.delete(card)
  card.classList.remove("bd-holo-on")
  for (const prop of ["--hx", "--hy", "--rx", "--ry", "--hp"]) {
    card.style.removeProperty(prop)
  }
}
