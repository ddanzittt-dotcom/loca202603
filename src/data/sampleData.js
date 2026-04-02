export const me = {
  id: "me",
  name: "경주",
  handle: "@gyeongju_loca",
  emoji: "🧭",
  bio: "내 지도로 기록하는 로컬 산책과 주말 코스",
  followers: 0,
  following: 0,
  verified: false,
  type: "creator",
}

export const followedSeed = []

export const users = [me]

export const collections = [
  { id: "c1", mapId: "demo-seongsu", title: "성수 감성카페 7곳", creator: "@seongsu_lover", emojis: ["☕", "🖼️", "🏭"], places: 3, gradient: ["#fde68a", "#f59e0b"] },
]

export const communityPostsSeed = []

// ─── 내 지도 ───

export const mapsSeed = [
  // 일반 지도 (B2C)
  {
    id: "map-seongsu",
    title: "성수 반나절 코스",
    description: "카페와 산책 위주로 빠르게 도는 코스",
    theme: "#635BFF",
    category: "personal",
    config: {},
    updatedAt: "2026-03-14T09:00:00.000Z",
  },
  // 이벤트 지도 (B2B) — 기관/기업용 스탬프투어
  {
    id: "map-event-festival",
    title: "2026 성수 봄 축제",
    description: "성수동 일대 5곳을 방문하고 스탬프를 모아보세요!",
    theme: "#F97316",
    category: "event",
    config: { checkin_enabled: true, survey_enabled: true, announcements_enabled: true },
    updatedAt: "2026-04-01T10:00:00.000Z",
  },
]

export const featuresSeed = [
  // ── 일반 지도: 성수 반나절 코스 ──
  { id: "feat-bluebottle", mapId: "map-seongsu", type: "pin", title: "블루보틀 성수", emoji: "☕", lat: 37.5445, lng: 127.0560, tags: ["커피", "브런치"], note: "주말 오픈 직후가 가장 여유롭다.", highlight: true, updatedAt: "2026-03-14T09:10:00.000Z" },
  { id: "feat-seoulforest", mapId: "map-seongsu", type: "pin", title: "서울숲 남문", emoji: "🌳", lat: 37.5440, lng: 127.0380, tags: ["산책"], note: "해 질 때 가면 빛이 예쁘다.", highlight: false, updatedAt: "2026-03-14T09:15:00.000Z" },
  { id: "feat-daelim", mapId: "map-seongsu", type: "pin", title: "대림창고", emoji: "🏭", lat: 37.5430, lng: 127.0580, tags: ["카페"], note: "브랜드 팝업이 자주 열린다.", highlight: false, updatedAt: "2026-03-14T09:18:00.000Z" },
  { id: "feat-seongsu-route", mapId: "map-seongsu", type: "route", title: "카페에서 숲까지", emoji: "🚶", points: [[127.056, 37.5445], [127.049, 37.541], [127.043, 37.542], [127.038, 37.5440]], tags: ["도보"], note: "골목 구경하면서 15분 정도.", highlight: false, updatedAt: "2026-03-14T09:20:00.000Z" },

  // ── 이벤트 지도: 2026 성수 봄 축제 (5개 체크포인트) ──
  { id: "feat-ev1", mapId: "map-event-festival", type: "pin", title: "축제 본부", emoji: "1️⃣", lat: 37.5448, lng: 127.0555, tags: ["스탬프"], note: "축제 안내 부스에서 시작하세요.", highlight: true, updatedAt: "2026-04-01T10:01:00.000Z" },
  { id: "feat-ev2", mapId: "map-event-festival", type: "pin", title: "성수 연방", emoji: "2️⃣", lat: 37.5425, lng: 127.0590, tags: ["스탬프"], note: "리노베이션된 공장 건물 카페.", highlight: false, updatedAt: "2026-04-01T10:02:00.000Z" },
  { id: "feat-ev3", mapId: "map-event-festival", type: "pin", title: "아트벙커", emoji: "3️⃣", lat: 37.5410, lng: 127.0565, tags: ["스탬프"], note: "현대미술 전시를 무료로 관람하세요.", highlight: false, updatedAt: "2026-04-01T10:03:00.000Z" },
  { id: "feat-ev4", mapId: "map-event-festival", type: "pin", title: "뚝섬 수제맥주", emoji: "4️⃣", lat: 37.5380, lng: 127.0610, tags: ["스탬프"], note: "축제 참여자 10% 할인 이벤트.", highlight: false, updatedAt: "2026-04-01T10:04:00.000Z" },
  { id: "feat-ev5", mapId: "map-event-festival", type: "pin", title: "서울숲 피크닉", emoji: "5️⃣", lat: 37.5440, lng: 127.0375, tags: ["스탬프"], note: "완주 후 여기서 경품을 수령하세요!", highlight: true, updatedAt: "2026-04-01T10:05:00.000Z" },
]

export const communityMapFeaturesSeed = [
  { id: "cm1", mapId: "community-map", type: "pin", title: "모두가 좋아하는 카페", emoji: "☕", lat: 37.545, lng: 127.052, tags: ["카페"], note: "누구나 추천하는 곳", highlight: false, updatedAt: "2026-03-15T00:00:00.000Z", createdBy: "me", createdByName: "경주", memos: [] },
  { id: "cm2", mapId: "community-map", type: "pin", title: "성수 맛집", emoji: "🍜", lat: 37.541, lng: 127.060, tags: ["맛집"], note: "점심시간에 줄이 길다", highlight: false, updatedAt: "2026-03-14T00:00:00.000Z", createdBy: "me", createdByName: "경주", memos: [] },
  { id: "cm3", mapId: "community-map", type: "pin", title: "뚝섬 한강공원", emoji: "🌳", lat: 37.531, lng: 127.066, tags: ["산책"], note: "저녁 산책 추천", highlight: false, updatedAt: "2026-03-13T00:00:00.000Z", createdBy: "me", createdByName: "경주", memos: [] },
]

export const sharesSeed = []

// ─── 홈 추천 데모 지도 (readOnly) ───

export const demoMaps = [
  { id: "demo-seongsu", title: "성수 감성카페 7곳", description: "걷기 좋은 동선으로 묶은 카페 컬렉션", theme: "#F59E0B", updatedAt: "2026-03-15T00:00:00.000Z" },
]

export const demoFeatures = [
  { id: "d1", mapId: "demo-seongsu", type: "pin", title: "오르에르", emoji: "☕", lat: 37.5445, lng: 127.0550, tags: ["카페"], note: "오픈 직후가 가장 한적하다.", highlight: true, updatedAt: "2026-03-15T00:00:00.000Z" },
  { id: "d2", mapId: "demo-seongsu", type: "pin", title: "LCDC 서울", emoji: "🖼️", lat: 37.5410, lng: 127.0560, tags: ["편집숍"], note: "전시와 소품 구경을 같이 할 수 있다.", highlight: false, updatedAt: "2026-03-15T00:00:00.000Z" },
  { id: "d3", mapId: "demo-seongsu", type: "pin", title: "대림창고", emoji: "🏭", lat: 37.5430, lng: 127.0580, tags: ["카페"], note: "성수 대표 창고형 공간.", highlight: false, updatedAt: "2026-03-15T00:00:00.000Z" },
]
