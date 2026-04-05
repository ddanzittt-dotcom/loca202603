// ─── 게이미피케이션 카탈로그 ───
// 서버 authoritative: XP/레벨/배지는 서버(gamificationService.js)가 source of truth
// 이 파일은 카탈로그 정의 + local fallback 전용

// ─── 뭉게 (Cloud Puff) 10단계 레벨 정의 ───
export const LEVELS = [
  { level: 1,  title: "씨앗 탐험가",    emoji: "☁️",  icon: "/characters/cloud_lv1.svg",  minXp: 0,     cloudName: "아기 뭉게",   bgColor: "#E6F1FB", badgeBg: "#E6F1FB", badgeText: "#0C447C" },
  { level: 2,  title: "새싹 탐험가",    emoji: "☁️",  icon: "/characters/cloud_lv2.svg",  minXp: 30,    cloudName: "맑은 뭉게",   bgColor: "#E6F1FB", badgeBg: "#E6F1FB", badgeText: "#0C447C" },
  { level: 3,  title: "꼬마 탐험가",    emoji: "🌸",  icon: "/characters/cloud_lv3.svg",  minXp: 100,   cloudName: "꽃 뭉게",     bgColor: "#FFF4EB", badgeBg: "#E6F1FB", badgeText: "#0C447C" },
  { level: 4,  title: "동네 탐험가",    emoji: "🎒",  icon: "/characters/cloud_lv4.svg",  minXp: 300,   cloudName: "탐험 뭉게",   bgColor: "#E1F5EE", badgeBg: "#E1F5EE", badgeText: "#085041" },
  { level: 5,  title: "거리 탐험가",    emoji: "🧭",  icon: "/characters/cloud_lv5.svg",  minXp: 700,   cloudName: "모험 뭉게",   bgColor: "#FAEEDA", badgeBg: "#E1F5EE", badgeText: "#085041" },
  { level: 6,  title: "로컬 가이드",    emoji: "🌅",  icon: "/characters/cloud_lv6.svg",  minXp: 1500,  cloudName: "노을 뭉게",   bgColor: "#FFF4EB", badgeBg: "#FFF4EB", badgeText: "#993C1D" },
  { level: 7,  title: "에디터",         emoji: "🌙",  icon: "/characters/cloud_lv7.svg",  minXp: 3000,  cloudName: "밤하늘 뭉게", bgColor: "#EEEDFE", badgeBg: "#EEEDFE", badgeText: "#3C3489" },
  { level: 8,  title: "시니어 에디터",   emoji: "👑",  icon: "/characters/cloud_lv8.svg",  minXp: 5000,  cloudName: "황금 뭉게",   bgColor: "#FAEEDA", badgeBg: "#FAEEDA", badgeText: "#633806" },
  { level: 9,  title: "마스터 에디터",   emoji: "🌊",  icon: "/characters/cloud_lv9.svg",  minXp: 8000,  cloudName: "오로라 뭉게", bgColor: "#E1F5EE", badgeBg: "#E1F5EE", badgeText: "#085041" },
  { level: 10, title: "레전드",         emoji: "✨",  icon: "/characters/cloud_lv10.svg", minXp: 15000, cloudName: "레전드 뭉게", bgColor: "linear-gradient(135deg, #FF6B35, #2D4A3E)", badgeBg: "#2D4A3E", badgeText: "#EF9F27" },
]

// ─── XP 획득 기준 (참고용 — 서버 record_map_action RPC가 실제 값을 결정) ───
export const XP_VALUES = {
  map_create: 20,
  pin_add: 5,
  route_add: 10,
  area_add: 10,
  checkin: 15,
  completion: 50,
  memo_add: 3,
  map_publish: 30,
  map_import: 10,
  survey_submit: 5,
}

// ─── 뱃지 정의 ───
export const BADGES = [
  // 탐험 계열
  { id: "first_checkin",   emoji: "🏃", name: "첫 발자국",  desc: "첫 체크인 완료",           category: "explore", condition: (s) => s.checkins >= 1 },
  { id: "first_completion", emoji: "🎯", name: "완주자",    desc: "이벤트 첫 완주",           category: "explore", condition: (s) => s.completions >= 1 },
  { id: "five_completions", emoji: "🏅", name: "5관왕",    desc: "5개 이벤트 완주",           category: "explore", condition: (s) => s.completions >= 5 },
  { id: "three_regions",   emoji: "🌏", name: "3개 도시",  desc: "3개 이상 지역에서 체크인",   category: "explore", condition: (s) => s.regions >= 3 },

  // 창작 계열
  { id: "ten_pins",        emoji: "📍", name: "핀 초보",   desc: "핀 10개 추가",             category: "create", condition: (s) => s.pins >= 10 },
  { id: "fifty_pins",      emoji: "📌", name: "핀 장인",   desc: "핀 50개 추가",             category: "create", condition: (s) => s.pins >= 50 },
  { id: "five_maps",       emoji: "🗺",  name: "지도장인",  desc: "지도 5개 생성",             category: "create", condition: (s) => s.maps >= 5 },
  { id: "three_publishes", emoji: "📢", name: "공유왕",    desc: "지도 3개 발행",             category: "create", condition: (s) => s.publishes >= 3 },

  // 커뮤니티 계열
  { id: "ten_memos",       emoji: "💬", name: "수다쟁이",  desc: "댓글 10개 작성",            category: "community", condition: (s) => s.memos >= 10 },
  { id: "five_imports",    emoji: "📥", name: "수집가",    desc: "다른 지도 5개 가져오기",     category: "community", condition: (s) => s.imports >= 5 },

  // 연속 기록
  { id: "streak_3",        emoji: "🔥", name: "3일 연속",  desc: "3일 연속 활동",             category: "streak", condition: (s) => s.streak >= 3 },
  { id: "streak_7",        emoji: "🔥", name: "7일 연속",  desc: "7일 연속 활동",             category: "streak", condition: (s) => s.streak >= 7 },
  { id: "streak_30",       emoji: "💎", name: "30일 연속", desc: "30일 연속 활동",            category: "streak", condition: (s) => s.streak >= 30 },
]

// ─── 유틸리티 함수 ───

export function getLevelForXp(xp) {
  let current = LEVELS[0]
  for (const lvl of LEVELS) {
    if (xp >= lvl.minXp) current = lvl
    else break
  }
  return current
}

export function getNextLevel(xp) {
  for (const lvl of LEVELS) {
    if (xp < lvl.minXp) return lvl
  }
  return null // 최고 레벨
}

export function getLevelProgress(xp) {
  const current = getLevelForXp(xp)
  const next = getNextLevel(xp)
  if (!next) return { current, next: null, progress: 1, remaining: 0 }
  const range = next.minXp - current.minXp
  const earned = xp - current.minXp
  return {
    current,
    next,
    progress: range > 0 ? earned / range : 1,
    remaining: next.minXp - xp,
  }
}

export function getEarnedBadges(stats) {
  return BADGES.filter((b) => b.condition(stats))
}

export function getNextEarnableBadge(stats) {
  return BADGES.find((b) => !b.condition(stats)) || null
}

/** local fallback: 로컬 데이터로 통계 계산 (cloud mode에서는 서버 stats 사용) */
export function computeStatsFromLocal({ maps, features, checkins, completions, memos, imports, publishes, streak, regions }) {
  const pins = features.filter((f) => f.type === "pin").length
  const routes = features.filter((f) => f.type === "route").length
  const areas = features.filter((f) => f.type === "area").length

  const stats = {
    maps: maps.length,
    pins,
    routes,
    areas,
    checkins: checkins || 0,
    completions: completions || 0,
    memos: memos || 0,
    imports: imports || 0,
    publishes: publishes || 0,
    streak: streak || 0,
    regions: regions || 0,
  }

  // XP 계산
  const xp =
    stats.maps * XP_VALUES.map_create +
    stats.pins * XP_VALUES.pin_add +
    stats.routes * XP_VALUES.route_add +
    stats.areas * XP_VALUES.area_add +
    stats.checkins * XP_VALUES.checkin +
    stats.completions * XP_VALUES.completion +
    stats.memos * XP_VALUES.memo_add +
    stats.publishes * XP_VALUES.map_publish +
    stats.imports * XP_VALUES.map_import

  return { ...stats, xp }
}
