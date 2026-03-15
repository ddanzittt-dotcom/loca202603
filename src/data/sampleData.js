export const me = {
  id: "me",
  name: "경주",
  handle: "@gyeongju_loca",
  emoji: "🧭",
  bio: "내 지도로 기록하는 로컬 산책과 주말 코스",
  followers: 128,
  following: 45,
  verified: false,
  type: "creator",
}

export const followedSeed = ["u1", "u5"]

export const users = [
  { id: "u1", name: "성수러버", handle: "@seongsu_lover", emoji: "🏙️", bio: "성수동 카페와 전시 위주 로컬 큐레이터", type: "creator", maps: 12, followers: 1240, following: 89, verified: true },
  { id: "u2", name: "제주탐험대", handle: "@jeju_explore", emoji: "🏝️", bio: "제주 구석구석 드라이브 기록", type: "creator", maps: 8, followers: 3200, following: 156, verified: true },
  { id: "u3", name: "김민지", handle: "@minji_food", emoji: "🍜", bio: "맛집 찾아다니는 친구", type: "friend", maps: 3, followers: 45, following: 120, verified: false },
  { id: "u4", name: "부여군청", handle: "@buyeo_gun", emoji: "🏯", bio: "백제의 시간을 담아내는 부여군 공식 계정", type: "org", maps: 6, followers: 2800, following: 35, verified: true },
  { id: "u5", name: "공주시", handle: "@gongju_city", emoji: "🏛️", bio: "공주시 관광홍보 공식 계정", type: "org", maps: 8, followers: 3400, following: 28, verified: true },
  { id: "u6", name: "올드서울", handle: "@oldseoul", emoji: "🌙", bio: "오래된 골목의 레트로 감성", type: "creator", maps: 15, followers: 5600, following: 201, verified: true },
  { id: "u7", name: "박서연", handle: "@hiking_yeon", emoji: "🥾", bio: "등산부터 둘레길까지 기록 중", type: "friend", maps: 6, followers: 180, following: 95, verified: false },
  { id: "u8", name: "천안문화재단", handle: "@ca_culture", emoji: "🎭", bio: "천안 문화예술 진행 공식 계정", type: "org", maps: 7, followers: 1900, following: 45, verified: true },
]

export const collections = [
  { id: "c1", mapId: "demo-collection-seongsu", title: "성수 감성카페 7곳", creator: "@seongsu_lover", emojis: ["☕", "🖼️", "🏭"], places: 7, gradient: ["#fde68a", "#f59e0b"] },
  { id: "c2", mapId: "demo-collection-bts", title: "BTS 생일카페 투어", creator: "@army_seoul", emojis: ["🎤", "💜", "🌙"], places: 5, gradient: ["#c4b5fd", "#7c3aed"] },
  { id: "c3", mapId: "demo-collection-euljiro", title: "을지로 레트로 산책", creator: "@oldseoul", emojis: ["🍢", "🌙", "📷"], places: 6, gradient: ["#99f6e4", "#14b8a6"] },
]

export const communityPostsSeed = [
  { id: "cp1", mapId: "demo-post-seongsu-day", userId: "u1", title: "성수동 하루", description: "성수의 무드가 좋은 장소들", caption: "카페부터 서울숲까지 한 번에 이어지는 동선을 정리했어요.", date: "2026-03-13", likes: 132, saves: 31, placeCount: 7, tags: ["카페", "산책"], emojis: ["☕", "🌳", "🏭", "🖼️"], gradient: ["#667eea", "#764ba2"] },
  { id: "cp2", mapId: "demo-post-jeju-west", userId: "u2", title: "제주 서쪽 하루 코스", description: "바다와 식당을 묶은 드라이브", caption: "협재에서 시작해서 노을 보고 저녁까지 이어지는 일정이에요.", date: "2026-03-11", likes: 248, saves: 72, placeCount: 9, tags: ["제주", "드라이브"], emojis: ["🏖️", "🍽️", "🚗", "🌅"], gradient: ["#43e97b", "#38f9d7"] },
  { id: "cp3", mapId: "demo-post-gongju-night", userId: "u5", title: "공주 야간 문화산책", description: "야경이 아름다운 문화유산 코스", caption: "주말 야간 개장 기준으로 다시 묶어봤어요.", date: "2026-03-10", likes: 89, saves: 24, placeCount: 5, tags: ["야경", "문화"], emojis: ["🏛️", "🌌", "🏯"], gradient: ["#fa709a", "#fee140"] },
  { id: "cp4", mapId: "demo-post-seoul-night", userId: "u6", title: "서울 야경 스팟", description: "서울에서 밤이 예쁜 곳", caption: "차 없이도 갈 수 있는 야경 포인트만 모았어요.", date: "2026-03-08", likes: 316, saves: 90, placeCount: 8, tags: ["야경", "사진"], emojis: ["🌙", "🌉", "📸", "🏙️"], gradient: ["#4facfe", "#00f2fe"] },
  { id: "cp5", mapId: "demo-post-buyeo-history", userId: "u4", title: "부여 역사 명소", description: "백제 문화유산 코스", caption: "아이와 함께 걷기 좋은 동선으로 업데이트했습니다.", date: "2026-03-06", likes: 74, saves: 28, placeCount: 6, tags: ["가족", "역사"], emojis: ["🏯", "🌿", "👣"], gradient: ["#a18cd1", "#fbc2eb"] },
  { id: "cp6", mapId: "demo-post-cheonan-stage", userId: "u8", title: "천안 공연장 하루", description: "공연 보고 산책하는 코스", caption: "공연장과 카페를 묶은 주말 루트예요.", date: "2026-03-05", likes: 58, saves: 12, placeCount: 4, tags: ["공연", "문화"], emojis: ["🎭", "☕", "🎟️"], gradient: ["#fccb90", "#d57eeb"] },
]

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
  { id: "cm1", mapId: "community-map", type: "pin", title: "모두가 좋아하는 카페", emoji: "☕", lat: 37.545, lng: 127.052, tags: ["카페"], note: "누구나 추천하는 곳", highlight: false, updatedAt: "2026-03-15T00:00:00.000Z", createdBy: "u1", createdByName: "성수러버", memos: [
    { id: "memo1", userId: "u1", userName: "성수러버", date: "2026-03-15T09:00:00.000Z", text: "라떼가 정말 맛있어요! 꼭 가보세요" },
    { id: "memo2", userId: "u6", userName: "올드서울", date: "2026-03-14T15:30:00.000Z", text: "주말 오전이 한적해서 좋아요" },
  ] },
  { id: "cm2", mapId: "community-map", type: "pin", title: "성수 맛집", emoji: "🍜", lat: 37.541, lng: 127.060, tags: ["맛집"], note: "점심시간에 줄이 길다", highlight: false, updatedAt: "2026-03-14T00:00:00.000Z", createdBy: "u3", createdByName: "김민지", memos: [
    { id: "memo3", userId: "u3", userName: "김민지", date: "2026-03-13T12:00:00.000Z", text: "여기 된장찌개 진짜 맛있음" },
  ] },
  { id: "cm3", mapId: "community-map", type: "pin", title: "뚝섬 한강공원", emoji: "🌳", lat: 37.531, lng: 127.066, tags: ["산책"], note: "저녁 산책 추천", highlight: false, updatedAt: "2026-03-13T00:00:00.000Z", createdBy: "u2", createdByName: "제주탐험대", memos: [] },
  { id: "cm4", mapId: "community-map", type: "pin", title: "성수 팝업스토어", emoji: "🏭", lat: 37.544, lng: 127.058, tags: ["팝업"], note: "이번 주말까지 진행", highlight: false, updatedAt: "2026-03-12T00:00:00.000Z", createdBy: "u6", createdByName: "올드서울", memos: [] },
  { id: "cm5", mapId: "community-map", type: "pin", title: "서울숲 입구", emoji: "🌿", lat: 37.544, lng: 127.038, tags: ["공원"], note: "주말에 사람이 많다", highlight: false, updatedAt: "2026-03-11T00:00:00.000Z", createdBy: "me", createdByName: "경주", memos: [] },
]

export const sharesSeed = [
  { id: "share-seongsu", mapId: "map-seongsu", caption: "성수동 카페랑 산책 코스를 한 장으로 정리했어요 ☕", date: "2026-03-12", likes: 24, saves: 8 },
  { id: "share-jeju", mapId: "map-jeju", caption: "제주 서쪽 드라이브 동선 추천 🏖️", date: "2026-02-25", likes: 67, saves: 19 },
]

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
