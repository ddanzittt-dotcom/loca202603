export const me = {
  id: "me",
  name: "경주",
  handle: "@gyeongju_loca",
  emoji: "🧭",
  bio: "내 지도로 기록하는 로컬 산책과 주말 코스",
  followers: 12,
  following: 5,
  verified: false,
  type: "creator",
}

export const followedSeed = []

export const users = [me]

export const collections = [
  { id: "c1", mapId: "demo-seongsu", title: "성수 감성카페 7곳", creator: "@seongsu_lover", emojis: ["☕", "🖼️", "🏭"], places: 3, gradient: ["#fde68a", "#f59e0b"] },
  { id: "c2", mapId: "demo-ikseon", title: "익선동 골목 맛집", creator: "@hanok_walk", emojis: ["🍜", "🍵", "🏘️"], places: 4, gradient: ["#c4b5fd", "#7c3aed"] },
  { id: "c3", mapId: "demo-busan", title: "부산 해안 드라이브", creator: "@busan_wave", emojis: ["🌊", "🚗", "🌅"], places: 6, gradient: ["#67e8f9", "#0891b2"] },
  { id: "c4", mapId: "demo-gangwon", title: "강원 자연 힐링 코스", creator: "@mountain_air", emojis: ["🏔️", "🌲", "💧"], places: 5, gradient: ["#86efac", "#16a34a"] },
  { id: "c5", mapId: "demo-jeju", title: "제주 올레길 베스트", creator: "@jeju_daily", emojis: ["🍊", "🐴", "🌺"], places: 7, gradient: ["#fca5a5", "#dc2626"] },
  { id: "c6", mapId: "demo-buyeo", title: "부여 백제 역사탐방", creator: "@history_trip", emojis: ["🏛️", "👑", "🪷"], places: 5, gradient: ["#d8b4fe", "#9333ea"] },
]

export const communityPostsSeed = []

// ─── 내 지도 ───

export const mapsSeed = [
  // 일반 지도 (B2C)
  {
    id: "map-seongsu",
    title: "성수 반나절 코스",
    description: "카페와 산책 위주로 빠르게 도는 코스",
    theme: "#4F46E5",
    category: "personal",
    config: {},
    updatedAt: "2026-03-14T09:00:00.000Z",
  },
  {
    id: "map-yeonnam",
    title: "연남동 주말 산책",
    description: "경의선숲길 따라 카페와 소품샵 탐방",
    theme: "#12B981",
    category: "personal",
    config: {},
    updatedAt: "2026-03-20T14:00:00.000Z",
  },
  {
    id: "map-jongno",
    title: "종로 한옥마을 투어",
    description: "익선동부터 북촌까지 한옥 골목 산책",
    theme: "#0EA5E9",
    category: "personal",
    config: {},
    updatedAt: "2026-03-25T11:00:00.000Z",
  },
  {
    id: "map-hangang",
    title: "한강 자전거 코스",
    description: "여의도에서 뚝섬까지 한강 따라 라이딩",
    theme: "#F97316",
    category: "personal",
    config: {},
    updatedAt: "2026-03-28T16:00:00.000Z",
  },
  {
    id: "map-itaewon",
    title: "이태원 맛집 지도",
    description: "세계 음식 맛집 모음 — 멕시칸부터 태국까지",
    theme: "#EF4444",
    category: "personal",
    config: {},
    updatedAt: "2026-03-30T10:00:00.000Z",
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
  {
    id: "map-event-campus",
    title: "서울대 캠퍼스 투어",
    description: "신입생 오리엔테이션 캠퍼스 스탬프 투어",
    theme: "#4F46E5",
    category: "event",
    config: { checkin_enabled: true, survey_enabled: true, announcements_enabled: true },
    updatedAt: "2026-04-02T09:00:00.000Z",
  },
]

export const featuresSeed = [
  // ── 일반 지도: 성수 반나절 코스 ──
  { id: "feat-bluebottle", mapId: "map-seongsu", type: "pin", title: "블루보틀 성수", emoji: "☕", lat: 37.5445, lng: 127.0560, tags: ["커피", "브런치"], note: "주말 오픈 직후가 가장 여유롭다.", highlight: true, updatedAt: "2026-03-14T09:10:00.000Z" },
  { id: "feat-seoulforest", mapId: "map-seongsu", type: "pin", title: "서울숲 남문", emoji: "🌳", lat: 37.5440, lng: 127.0380, tags: ["산책"], note: "해 질 때 가면 빛이 예쁘다.", highlight: false, updatedAt: "2026-03-14T09:15:00.000Z" },
  { id: "feat-daelim", mapId: "map-seongsu", type: "pin", title: "대림창고", emoji: "🏭", lat: 37.5430, lng: 127.0580, tags: ["카페"], note: "브랜드 팝업이 자주 열린다.", highlight: false, updatedAt: "2026-03-14T09:18:00.000Z" },
  { id: "feat-seongsu-route", mapId: "map-seongsu", type: "route", title: "카페에서 숲까지", emoji: "🚶", points: [[127.056, 37.5445], [127.049, 37.541], [127.043, 37.542], [127.038, 37.5440]], tags: ["도보"], note: "골목 구경하면서 15분 정도.", highlight: false, updatedAt: "2026-03-14T09:20:00.000Z" },
  { id: "feat-seongsu-onion", mapId: "map-seongsu", type: "pin", title: "어니언 성수", emoji: "🥐", lat: 37.5448, lng: 127.0565, tags: ["베이커리", "카페"], note: "앙버터가 시그니처. 줄이 길지만 회전 빠름.", highlight: true, updatedAt: "2026-03-14T09:25:00.000Z" },

  // ── 연남동 주말 산책 ──
  { id: "feat-yn-gyeongui", mapId: "map-yeonnam", type: "pin", title: "경의선숲길 입구", emoji: "🌿", lat: 37.5597, lng: 126.9235, tags: ["산책"], note: "연남동 진입 포인트. 주말엔 버스킹도 있다.", highlight: true, updatedAt: "2026-03-20T14:05:00.000Z" },
  { id: "feat-yn-cafe1", mapId: "map-yeonnam", type: "pin", title: "연남살롱", emoji: "☕", lat: 37.5610, lng: 126.9248, tags: ["카페"], note: "2층 창가석이 분위기 좋음.", highlight: false, updatedAt: "2026-03-20T14:10:00.000Z" },
  { id: "feat-yn-shop", mapId: "map-yeonnam", type: "pin", title: "오브젝트", emoji: "🛍️", lat: 37.5605, lng: 126.9255, tags: ["소품샵"], note: "독립 서적과 문구류가 많다.", highlight: false, updatedAt: "2026-03-20T14:15:00.000Z" },
  { id: "feat-yn-food", mapId: "map-yeonnam", type: "pin", title: "연남토마", emoji: "🍝", lat: 37.5615, lng: 126.9220, tags: ["맛집", "파스타"], note: "토마토 크림 파스타 강추.", highlight: true, updatedAt: "2026-03-20T14:20:00.000Z" },
  { id: "feat-yn-route", mapId: "map-yeonnam", type: "route", title: "숲길 산책 코스", emoji: "🚶", points: [[126.9235, 37.5597], [126.9248, 37.5605], [126.9255, 37.5610], [126.9220, 37.5615]], tags: ["도보"], note: "천천히 걸으면 30분 코스.", highlight: false, updatedAt: "2026-03-20T14:25:00.000Z" },

  // ── 종로 한옥마을 투어 ──
  { id: "feat-jn-ikseon", mapId: "map-jongno", type: "pin", title: "익선동 한옥거리", emoji: "🏘️", lat: 37.5738, lng: 126.9880, tags: ["한옥", "골목"], note: "서울에서 가장 오래된 한옥마을.", highlight: true, updatedAt: "2026-03-25T11:05:00.000Z" },
  { id: "feat-jn-chawon", mapId: "map-jongno", type: "pin", title: "열린 찻집", emoji: "🍵", lat: 37.5742, lng: 126.9875, tags: ["차", "한옥카페"], note: "전통차와 다과를 즐길 수 있다.", highlight: false, updatedAt: "2026-03-25T11:10:00.000Z" },
  { id: "feat-jn-bukchon", mapId: "map-jongno", type: "pin", title: "북촌 한옥마을", emoji: "📸", lat: 37.5825, lng: 126.9850, tags: ["한옥", "포토"], note: "가회동 31번지 뷰포인트가 유명.", highlight: true, updatedAt: "2026-03-25T11:15:00.000Z" },
  { id: "feat-jn-samcheong", mapId: "map-jongno", type: "pin", title: "삼청동 거리", emoji: "🎨", lat: 37.5800, lng: 126.9825, tags: ["갤러리", "산책"], note: "작은 갤러리와 공방이 많다.", highlight: false, updatedAt: "2026-03-25T11:20:00.000Z" },
  { id: "feat-jn-changdeok", mapId: "map-jongno", type: "pin", title: "창덕궁", emoji: "🏛️", lat: 37.5794, lng: 126.9910, tags: ["궁궐", "문화재"], note: "후원 비밀의 정원은 예약 필수!", highlight: true, updatedAt: "2026-03-25T11:25:00.000Z" },
  { id: "feat-jn-route", mapId: "map-jongno", type: "route", title: "익선동→북촌 코스", emoji: "🚶", points: [[126.988, 37.5738], [126.9875, 37.5742], [126.985, 37.5800], [126.985, 37.5825]], tags: ["도보"], note: "오르막이 있지만 경치가 좋다. 약 40분.", highlight: false, updatedAt: "2026-03-25T11:30:00.000Z" },

  // ── 한강 자전거 코스 ──
  { id: "feat-hg-yeouido", mapId: "map-hangang", type: "pin", title: "여의도 한강공원", emoji: "🚲", lat: 37.5284, lng: 126.9326, tags: ["자전거", "출발"], note: "따릉이 대여소가 바로 옆에 있다.", highlight: true, updatedAt: "2026-03-28T16:05:00.000Z" },
  { id: "feat-hg-banpo", mapId: "map-hangang", type: "pin", title: "반포 달빛무지개분수", emoji: "🌈", lat: 37.5090, lng: 126.9960, tags: ["야경", "포토"], note: "4~10월 야간 분수 운영. 해 질 때 추천.", highlight: true, updatedAt: "2026-03-28T16:10:00.000Z" },
  { id: "feat-hg-ttukseom", mapId: "map-hangang", type: "pin", title: "뚝섬 한강공원", emoji: "⛱️", lat: 37.5315, lng: 127.0660, tags: ["휴식", "도착"], note: "수영장과 잔디밭. 치맥 스팟.", highlight: false, updatedAt: "2026-03-28T16:15:00.000Z" },
  { id: "feat-hg-route", mapId: "map-hangang", type: "route", title: "여의도→뚝섬 라이딩", emoji: "🚲", points: [[126.9326, 37.5284], [126.960, 37.518], [126.996, 37.509], [127.020, 37.515], [127.045, 37.525], [127.066, 37.5315]], tags: ["자전거"], note: "편도 약 20km. 한강 따라 평탄한 코스.", highlight: true, updatedAt: "2026-03-28T16:20:00.000Z" },

  // ── 이태원 맛집 지도 ──
  { id: "feat-it-taco", mapId: "map-itaewon", type: "pin", title: "비바 멕시코", emoji: "🌮", lat: 37.5345, lng: 126.9945, tags: ["멕시칸", "타코"], note: "정통 멕시칸 타코. 화요일 타코 할인.", highlight: true, updatedAt: "2026-03-30T10:05:00.000Z" },
  { id: "feat-it-thai", mapId: "map-itaewon", type: "pin", title: "수완나홍", emoji: "🍛", lat: 37.5340, lng: 126.9930, tags: ["태국", "커리"], note: "그린커리가 현지 맛에 가장 가깝다.", highlight: false, updatedAt: "2026-03-30T10:10:00.000Z" },
  { id: "feat-it-burger", mapId: "map-itaewon", type: "pin", title: "레프트오버스", emoji: "🍔", lat: 37.5350, lng: 126.9955, tags: ["버거", "브런치"], note: "수제버거 맛집. 주말 브런치도 좋음.", highlight: true, updatedAt: "2026-03-30T10:15:00.000Z" },
  { id: "feat-it-wine", mapId: "map-itaewon", type: "pin", title: "르뱅 내추럴", emoji: "🍷", lat: 37.5338, lng: 126.9920, tags: ["와인바"], note: "내추럴 와인 전문. 치즈 플레이트 강추.", highlight: false, updatedAt: "2026-03-30T10:20:00.000Z" },
  { id: "feat-it-kebab", mapId: "map-itaewon", type: "pin", title: "이스탄불 케밥", emoji: "🥙", lat: 37.5355, lng: 126.9940, tags: ["터키", "케밥"], note: "양고기 되네르가 시그니처.", highlight: false, updatedAt: "2026-03-30T10:25:00.000Z" },

  // ── 이벤트 지도: 2026 성수 봄 축제 (5개 체크포인트) ──
  { id: "feat-ev1", mapId: "map-event-festival", type: "pin", title: "축제 본부", emoji: "1️⃣", lat: 37.5448, lng: 127.0555, tags: ["스탬프"], note: "축제 안내 부스에서 시작하세요.", highlight: true, updatedAt: "2026-04-01T10:01:00.000Z" },
  { id: "feat-ev2", mapId: "map-event-festival", type: "pin", title: "성수 연방", emoji: "2️⃣", lat: 37.5425, lng: 127.0590, tags: ["스탬프"], note: "리노베이션된 공장 건물 카페.", highlight: false, updatedAt: "2026-04-01T10:02:00.000Z" },
  { id: "feat-ev3", mapId: "map-event-festival", type: "pin", title: "아트벙커", emoji: "3️⃣", lat: 37.5410, lng: 127.0565, tags: ["스탬프"], note: "현대미술 전시를 무료로 관람하세요.", highlight: false, updatedAt: "2026-04-01T10:03:00.000Z" },
  { id: "feat-ev4", mapId: "map-event-festival", type: "pin", title: "뚝섬 수제맥주", emoji: "4️⃣", lat: 37.5380, lng: 127.0610, tags: ["스탬프"], note: "축제 참여자 10% 할인 이벤트.", highlight: false, updatedAt: "2026-04-01T10:04:00.000Z" },
  { id: "feat-ev5", mapId: "map-event-festival", type: "pin", title: "서울숲 피크닉", emoji: "5️⃣", lat: 37.5440, lng: 127.0375, tags: ["스탬프"], note: "완주 후 여기서 경품을 수령하세요!", highlight: true, updatedAt: "2026-04-01T10:05:00.000Z" },

  // ── 이벤트 지도: 서울대 캠퍼스 투어 (4개 체크포인트) ──
  { id: "feat-snu1", mapId: "map-event-campus", type: "pin", title: "정문 집합", emoji: "1️⃣", lat: 37.4597, lng: 126.9510, tags: ["스탬프"], note: "투어 시작! 가이드북을 받으세요.", highlight: true, updatedAt: "2026-04-02T09:01:00.000Z" },
  { id: "feat-snu2", mapId: "map-event-campus", type: "pin", title: "중앙도서관", emoji: "2️⃣", lat: 37.4605, lng: 126.9530, tags: ["스탬프"], note: "관악산 전망이 멋진 6층 열람실.", highlight: false, updatedAt: "2026-04-02T09:02:00.000Z" },
  { id: "feat-snu3", mapId: "map-event-campus", type: "pin", title: "학생회관", emoji: "3️⃣", lat: 37.4590, lng: 126.9545, tags: ["스탬프"], note: "동아리 부스와 학식 체험.", highlight: false, updatedAt: "2026-04-02T09:03:00.000Z" },
  { id: "feat-snu4", mapId: "map-event-campus", type: "pin", title: "샤 연못", emoji: "4️⃣", lat: 37.4580, lng: 126.9520, tags: ["스탬프"], note: "투어 완료! 기념품을 수령하세요.", highlight: true, updatedAt: "2026-04-02T09:04:00.000Z" },
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
  { id: "demo-ikseon", title: "익선동 골목 맛집", description: "한옥마을 사이사이 숨은 맛집 4곳", theme: "#7C3AED", updatedAt: "2026-03-18T00:00:00.000Z" },
  { id: "demo-mangwon", title: "망원동 로컬 산책", description: "망리단길 중심 카페·빵집 코스", theme: "#12B981", updatedAt: "2026-03-22T00:00:00.000Z" },
]

export const demoFeatures = [
  // 성수 감성카페
  { id: "d1", mapId: "demo-seongsu", type: "pin", title: "오르에르", emoji: "☕", lat: 37.5445, lng: 127.0550, tags: ["카페"], note: "오픈 직후가 가장 한적하다.", highlight: true, updatedAt: "2026-03-15T00:00:00.000Z" },
  { id: "d2", mapId: "demo-seongsu", type: "pin", title: "LCDC 서울", emoji: "🖼️", lat: 37.5410, lng: 127.0560, tags: ["편집숍"], note: "전시와 소품 구경을 같이 할 수 있다.", highlight: false, updatedAt: "2026-03-15T00:00:00.000Z" },
  { id: "d3", mapId: "demo-seongsu", type: "pin", title: "대림창고", emoji: "🏭", lat: 37.5430, lng: 127.0580, tags: ["카페"], note: "성수 대표 창고형 공간.", highlight: false, updatedAt: "2026-03-15T00:00:00.000Z" },
  // 익선동 골목 맛집
  { id: "d4", mapId: "demo-ikseon", type: "pin", title: "익선동 칼국수", emoji: "🍜", lat: 37.5740, lng: 126.9882, tags: ["맛집"], note: "수요미식회 출연. 멸치 육수가 깊다.", highlight: true, updatedAt: "2026-03-18T00:00:00.000Z" },
  { id: "d5", mapId: "demo-ikseon", type: "pin", title: "동백꽃 필 무렵", emoji: "🍵", lat: 37.5735, lng: 126.9878, tags: ["한옥카페"], note: "마당이 예쁜 한옥 찻집.", highlight: false, updatedAt: "2026-03-18T00:00:00.000Z" },
  { id: "d6", mapId: "demo-ikseon", type: "pin", title: "열두달 떡볶이", emoji: "🌶️", lat: 37.5745, lng: 126.9870, tags: ["분식"], note: "쫄깃한 밀떡 + 튀김 조합.", highlight: false, updatedAt: "2026-03-18T00:00:00.000Z" },
  { id: "d7", mapId: "demo-ikseon", type: "pin", title: "호밀빵 제과", emoji: "🍞", lat: 37.5738, lng: 126.9888, tags: ["베이커리"], note: "소금빵이 시그니처.", highlight: true, updatedAt: "2026-03-18T00:00:00.000Z" },
  // 망원동 로컬 산책
  { id: "d8", mapId: "demo-mangwon", type: "pin", title: "카페 레이어드", emoji: "☕", lat: 37.5565, lng: 126.9095, tags: ["카페"], note: "루프탑 뷰가 좋은 대형 카페.", highlight: true, updatedAt: "2026-03-22T00:00:00.000Z" },
  { id: "d9", mapId: "demo-mangwon", type: "pin", title: "망원시장", emoji: "🛒", lat: 37.5558, lng: 126.9085, tags: ["시장"], note: "떡볶이와 호떡이 유명.", highlight: false, updatedAt: "2026-03-22T00:00:00.000Z" },
  { id: "d10", mapId: "demo-mangwon", type: "pin", title: "퍼센트 커피", emoji: "☕", lat: 37.5570, lng: 126.9105, tags: ["카페"], note: "드립 커피 전문. 원두 구매 가능.", highlight: false, updatedAt: "2026-03-22T00:00:00.000Z" },
]
