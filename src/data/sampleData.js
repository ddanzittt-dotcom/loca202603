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
  { id: "c1", mapId: "demo-collection-seongsu", title: "성수 감성카페 7곳", creator: "@seongsu_lover", emojis: ["☕", "🖼️", "🏭"], places: 7, gradient: ["#fde68a", "#f59e0b"] },
  { id: "c2", mapId: "demo-collection-bts", title: "BTS 생일카페 투어", creator: "@army_seoul", emojis: ["🎤", "💜", "🌙"], places: 5, gradient: ["#c4b5fd", "#7c3aed"] },
  { id: "c3", mapId: "demo-collection-euljiro", title: "을지로 레트로 산책", creator: "@oldseoul", emojis: ["🍢", "🌙", "📷"], places: 6, gradient: ["#99f6e4", "#14b8a6"] },
]

export const communityPostsSeed = []

export const mapsSeed = [
  { id: "map-seongsu", title: "성수 반나절 코스", description: "카페와 산책 위주로 빠르게 도는 코스", theme: "#635BFF", updatedAt: "2026-03-14T09:00:00.000Z" },
  { id: "map-jeju", title: "제주 서쪽 드라이브", description: "바다 뷰와 식당 위주", theme: "#12B981", updatedAt: "2026-03-13T14:30:00.000Z" },
]

export const featuresSeed = [
  { id: "feat-bluebottle", mapId: "map-seongsu", type: "pin", title: "블루보틀 성수", emoji: "☕", lat: 37.544, lng: 127.056, tags: ["커피", "브런치"], note: "주말 오픈 직후가 가장 여유롭다.", highlight: true, updatedAt: "2026-03-14T09:10:00.000Z" },
  { id: "feat-seoulforest", mapId: "map-seongsu", type: "pin", title: "서울숲 남문", emoji: "🌳", lat: 37.544, lng: 127.038, tags: ["산책"], note: "해 질 때 가면 빛이 예쁘다.", highlight: false, updatedAt: "2026-03-14T09:15:00.000Z" },
  { id: "feat-daelim", mapId: "map-seongsu", type: "pin", title: "대림창고", emoji: "🏭", lat: 37.543, lng: 127.058, tags: ["카페"], note: "브랜드 팝업이 자주 열린다.", highlight: false, updatedAt: "2026-03-14T09:18:00.000Z" },
  { id: "feat-seongsu-route", mapId: "map-seongsu", type: "route", title: "카페에서 숲까지", emoji: "🚶", points: [[127.056, 37.544], [127.049, 37.541], [127.043, 37.542], [127.038, 37.544]], tags: ["도보"], note: "골목 구경하면서 15분 정도.", highlight: false, updatedAt: "2026-03-14T09:20:00.000Z" },
  { id: "feat-hyeopjae", mapId: "map-jeju", type: "pin", title: "협재해변", emoji: "🏖️", lat: 33.394, lng: 126.239, tags: ["바다"], note: "오후 늦게 가면 색이 더 진하다.", highlight: true, updatedAt: "2026-03-13T14:40:00.000Z" },
  { id: "feat-blackpork", mapId: "map-jeju", type: "pin", title: "흑돼지 거리", emoji: "🍽️", lat: 33.51, lng: 126.531, tags: ["식당"], note: "저녁 시간은 웨이팅이 길다.", highlight: false, updatedAt: "2026-03-13T14:50:00.000Z" },
]

export const communityMapFeaturesSeed = [
  { id: "cm1", mapId: "community-map", type: "pin", title: "모두가 좋아하는 카페", emoji: "☕", lat: 37.545, lng: 127.052, tags: ["카페"], note: "누구나 추천하는 곳", highlight: false, updatedAt: "2026-03-15T00:00:00.000Z", createdBy: "me", createdByName: "경주", memos: [] },
  { id: "cm2", mapId: "community-map", type: "pin", title: "성수 맛집", emoji: "🍜", lat: 37.541, lng: 127.060, tags: ["맛집"], note: "점심시간에 줄이 길다", highlight: false, updatedAt: "2026-03-14T00:00:00.000Z", createdBy: "me", createdByName: "경주", memos: [] },
  { id: "cm3", mapId: "community-map", type: "pin", title: "뚝섬 한강공원", emoji: "🌳", lat: 37.531, lng: 127.066, tags: ["산책"], note: "저녁 산책 추천", highlight: false, updatedAt: "2026-03-13T00:00:00.000Z", createdBy: "me", createdByName: "경주", memos: [] },
  { id: "cm4", mapId: "community-map", type: "pin", title: "성수 팝업스토어", emoji: "🏭", lat: 37.544, lng: 127.058, tags: ["팝업"], note: "이번 주말까지 진행", highlight: false, updatedAt: "2026-03-12T00:00:00.000Z", createdBy: "me", createdByName: "경주", memos: [] },
  { id: "cm5", mapId: "community-map", type: "pin", title: "서울숲 입구", emoji: "🌿", lat: 37.544, lng: 127.038, tags: ["공원"], note: "주말에 사람이 많다", highlight: false, updatedAt: "2026-03-11T00:00:00.000Z", createdBy: "me", createdByName: "경주", memos: [] },
]

export const sharesSeed = []

export const demoMaps = [
  { id: "demo-collection-seongsu", title: "성수 감성카페 7곳", description: "걷기 좋은 동선으로 묶은 카페 컬렉션", theme: "#F59E0B", updatedAt: "2026-03-15T00:00:00.000Z" },
  { id: "demo-collection-bts", title: "BTS 생일카페 투어", description: "홍대와 합정을 잇는 팬투어 코스", theme: "#7C3AED", updatedAt: "2026-03-15T00:00:00.000Z" },
  { id: "demo-collection-euljiro", title: "을지로 레트로 산책", description: "골목과 포차를 잇는 저녁 산책 코스", theme: "#14B8A6", updatedAt: "2026-03-15T00:00:00.000Z" },
  { id: "demo-post-seongsu-day", title: "성수동 하루", description: "카페부터 서울숲까지 이어지는 하루 코스", theme: "#635BFF", updatedAt: "2026-03-15T00:00:00.000Z" },
  { id: "demo-post-jeju-west", title: "제주 서쪽 하루 코스", description: "바다와 식당을 묶은 드라이브", theme: "#12B981", updatedAt: "2026-03-15T00:00:00.000Z" },
  { id: "demo-post-gongju-night", title: "공주 야간 문화산책", description: "야경과 문화유산이 이어지는 코스", theme: "#EF4444", updatedAt: "2026-03-15T00:00:00.000Z" },
  { id: "demo-post-seoul-night", title: "서울 야경 스팟", description: "밤에 걷기 좋은 서울 포인트", theme: "#0EA5E9", updatedAt: "2026-03-15T00:00:00.000Z" },
  { id: "demo-post-buyeo-history", title: "부여 역사 명소", description: "백제 문화유산 중심 산책 코스", theme: "#A855F7", updatedAt: "2026-03-15T00:00:00.000Z" },
  { id: "demo-post-cheonan-stage", title: "천안 공연장 하루", description: "공연장과 카페를 연결한 루트", theme: "#F97316", updatedAt: "2026-03-15T00:00:00.000Z" },
]

export const demoFeatures = [
  { id: "d1", mapId: "demo-collection-seongsu", type: "pin", title: "오르에르", emoji: "☕", lat: 37.544, lng: 127.055, tags: ["카페"], note: "오픈 직후가 가장 한적하다.", highlight: true, updatedAt: "2026-03-15T00:00:00.000Z" },
  { id: "d2", mapId: "demo-collection-seongsu", type: "pin", title: "LCDC 서울", emoji: "🖼️", lat: 37.541, lng: 127.056, tags: ["편집숍"], note: "전시와 소품 구경을 같이 할 수 있다.", highlight: false, updatedAt: "2026-03-15T00:00:00.000Z" },
  { id: "d3", mapId: "demo-collection-seongsu", type: "pin", title: "대림창고", emoji: "🏭", lat: 37.543, lng: 127.058, tags: ["카페"], note: "성수 대표 창고형 공간.", highlight: false, updatedAt: "2026-03-15T00:00:00.000Z" },
  { id: "d4", mapId: "demo-collection-bts", type: "pin", title: "합정 카페 A", emoji: "💜", lat: 37.549, lng: 126.914, tags: ["팬카페"], note: "생일컵홀더 이벤트가 자주 열린다.", highlight: true, updatedAt: "2026-03-15T00:00:00.000Z" },
  { id: "d5", mapId: "demo-collection-bts", type: "pin", title: "홍대 포토존", emoji: "🎤", lat: 37.556, lng: 126.923, tags: ["사진"], note: "굿즈샵과 가까워 동선이 편하다.", highlight: false, updatedAt: "2026-03-15T00:00:00.000Z" },
  { id: "d6", mapId: "demo-collection-euljiro", type: "pin", title: "노가리 골목", emoji: "🍢", lat: 37.566, lng: 126.991, tags: ["먹거리"], note: "저녁 시간대 분위기가 좋다.", highlight: true, updatedAt: "2026-03-15T00:00:00.000Z" },
  { id: "d7", mapId: "demo-collection-euljiro", type: "pin", title: "을지다방", emoji: "📷", lat: 37.567, lng: 126.992, tags: ["레트로"], note: "사진 찍기 좋은 빈티지 인테리어.", highlight: false, updatedAt: "2026-03-15T00:00:00.000Z" },
  { id: "d8", mapId: "demo-post-seongsu-day", type: "pin", title: "블루보틀 성수", emoji: "☕", lat: 37.544, lng: 127.056, tags: ["커피"], note: "여유롭게 시작하기 좋은 첫 장소.", highlight: true, updatedAt: "2026-03-15T00:00:00.000Z" },
  { id: "d9", mapId: "demo-post-seongsu-day", type: "pin", title: "서울숲", emoji: "🌳", lat: 37.544, lng: 127.038, tags: ["산책"], note: "도심 속 산책 마무리 지점.", highlight: false, updatedAt: "2026-03-15T00:00:00.000Z" },
  { id: "d10", mapId: "demo-post-jeju-west", type: "pin", title: "협재해변", emoji: "🏖️", lat: 33.394, lng: 126.239, tags: ["바다"], note: "햇빛 좋은 오후에 가장 예쁘다.", highlight: true, updatedAt: "2026-03-15T00:00:00.000Z" },
  { id: "d11", mapId: "demo-post-jeju-west", type: "pin", title: "흑돼지 거리", emoji: "🍽️", lat: 33.51, lng: 126.531, tags: ["식당"], note: "저녁 시간대 방문 추천.", highlight: false, updatedAt: "2026-03-15T00:00:00.000Z" },
  { id: "d12", mapId: "demo-post-gongju-night", type: "pin", title: "공산성", emoji: "🏛️", lat: 36.461, lng: 127.119, tags: ["문화"], note: "야간 조명이 들어오면 더 좋다.", highlight: true, updatedAt: "2026-03-15T00:00:00.000Z" },
  { id: "d13", mapId: "demo-post-gongju-night", type: "pin", title: "금강 산책로", emoji: "🌌", lat: 36.465, lng: 127.122, tags: ["야경"], note: "걷기 좋은 강변 구간.", highlight: false, updatedAt: "2026-03-15T00:00:00.000Z" },
  { id: "d14", mapId: "demo-post-seoul-night", type: "pin", title: "낙산공원", emoji: "🌙", lat: 37.580, lng: 127.007, tags: ["야경"], note: "서울 전경을 보기 좋은 포인트.", highlight: true, updatedAt: "2026-03-15T00:00:00.000Z" },
  { id: "d15", mapId: "demo-post-seoul-night", type: "pin", title: "한강대교 전망", emoji: "🌉", lat: 37.530, lng: 126.957, tags: ["사진"], note: "다리 불빛이 예쁘게 들어온다.", highlight: false, updatedAt: "2026-03-15T00:00:00.000Z" },
  { id: "d16", mapId: "demo-post-buyeo-history", type: "pin", title: "정림사지", emoji: "🏯", lat: 36.275, lng: 126.91, tags: ["역사"], note: "유적지 중심 코스 시작점.", highlight: true, updatedAt: "2026-03-15T00:00:00.000Z" },
  { id: "d17", mapId: "demo-post-buyeo-history", type: "pin", title: "궁남지", emoji: "🌿", lat: 36.278, lng: 126.912, tags: ["가족"], note: "걷기 편한 평지 산책.", highlight: false, updatedAt: "2026-03-15T00:00:00.000Z" },
  { id: "d18", mapId: "demo-post-cheonan-stage", type: "pin", title: "천안예술의전당", emoji: "🎭", lat: 36.815, lng: 127.113, tags: ["공연"], note: "공연 전후 동선의 중심.", highlight: true, updatedAt: "2026-03-15T00:00:00.000Z" },
  { id: "d19", mapId: "demo-post-cheonan-stage", type: "pin", title: "공연장 앞 카페", emoji: "☕", lat: 36.816, lng: 127.115, tags: ["카페"], note: "공연 후 쉬기 좋은 곳.", highlight: false, updatedAt: "2026-03-15T00:00:00.000Z" },
]
