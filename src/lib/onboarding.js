// 온보딩 상수 및 localStorage 헬퍼

export const ONBOARDING_VERSION = "1.0.0"

const KEYS = {
  welcomeSeen: "loca.onboarding_welcome_seen",
  coachmarkSeen: "loca.onboarding_editor_coachmark_seen",
  firstPinCelebrated: "loca.onboarding_first_pin_celebrated",
  version: "loca.onboarding_version",
}

function read(key) {
  try { return window.localStorage?.getItem(key) } catch { return null }
}

function write(key, value) {
  try { window.localStorage?.setItem(key, value) } catch { /* noop */ }
}

function remove(key) {
  try { window.localStorage?.removeItem(key) } catch { /* noop */ }
}

// 웰컴 화면
export function isWelcomeSeen() {
  return read(KEYS.welcomeSeen) === ONBOARDING_VERSION
}
export function markWelcomeSeen() {
  write(KEYS.welcomeSeen, ONBOARDING_VERSION)
}

// 편집기 코치마크
export function isCoachmarkSeen() {
  return read(KEYS.coachmarkSeen) === ONBOARDING_VERSION
}
export function markCoachmarkSeen() {
  write(KEYS.coachmarkSeen, ONBOARDING_VERSION)
}
export function resetCoachmark() {
  remove(KEYS.coachmarkSeen)
}

// 첫 핀 축하
export function isFirstPinCelebrated() {
  return read(KEYS.firstPinCelebrated) === "true"
}
export function markFirstPinCelebrated() {
  write(KEYS.firstPinCelebrated, "true")
}
