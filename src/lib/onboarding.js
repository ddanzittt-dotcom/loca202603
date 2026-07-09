// 온보딩 상수 및 localStorage 헬퍼

export const ONBOARDING_VERSION = "1.0.0"

const KEYS = {
  welcomeSeen: "loca.onboarding_welcome_seen",
  coachmarkSeen: "loca.onboarding_editor_coachmark_seen",
  firstPinCelebrated: "loca.onboarding_first_pin_celebrated",
  profileSeen: "loca.onboarding_profile_seen",
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

// 도우미 고양이(로카냥) 튜토리얼 — 입장 직후(guest) / 로그인 첫 진입(authed) 각 1회 자동 재생
export function isTutorialSeen(mode) {
  return read(`loca.tutorial_seen_${mode}`) === ONBOARDING_VERSION
}
export function markTutorialSeen(mode) {
  write(`loca.tutorial_seen_${mode}`, ONBOARDING_VERSION)
}

// 가입 직후 프로필(연령대·지역) 온보딩 1스텝 — 저장/건너뛰기 모두 1회로 종료.
// 인구통계 컬럼은 비공개(058/060)라 API 로 되읽을 수 없어 localStorage 플래그로 게이트한다.
export function isProfileOnboardSeen() {
  return read(KEYS.profileSeen) === "true"
}
export function markProfileOnboardSeen() {
  write(KEYS.profileSeen, "true")
}

// 첫 핀 축하
export function isFirstPinCelebrated() {
  return read(KEYS.firstPinCelebrated) === "true"
}
export function markFirstPinCelebrated() {
  write(KEYS.firstPinCelebrated, "true")
}
