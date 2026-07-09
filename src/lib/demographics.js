// 인구통계 상수 — 회원가입 직후 온보딩(연령대·지역) 및 향후 집계에서 공용으로 쓴다.
// 저장값(value)은 DB profiles.age_band / region_sido 에 그대로 들어가는 정규 토큰.
// 라벨(label)은 UI 표기용. 집계 안정성을 위해 value 는 함부로 바꾸지 말 것.

export const AGE_BANDS = [
  { value: "10s", label: "10대" },
  { value: "20s", label: "20대" },
  { value: "30s", label: "30대" },
  { value: "40s", label: "40대" },
  { value: "50s", label: "50대" },
  { value: "60s+", label: "60대 이상" },
]

// 광역시도 17개 (기초 시군구까지는 받지 않음 — 저항·재식별 위험 최소화)
export const SIDO_LIST = [
  "서울", "부산", "대구", "인천", "광주", "대전", "울산", "세종",
  "경기", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주",
]

const AGE_VALUES = new Set(AGE_BANDS.map((a) => a.value))
const SIDO_SET = new Set(SIDO_LIST)

export function isValidAgeBand(value) {
  return typeof value === "string" && AGE_VALUES.has(value)
}

export function isValidSido(value) {
  return typeof value === "string" && SIDO_SET.has(value)
}

export function ageBandLabel(value) {
  return AGE_BANDS.find((a) => a.value === value)?.label ?? ""
}
