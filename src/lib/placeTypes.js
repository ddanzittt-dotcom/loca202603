// 카드 타입 = 지오메트리 3종 (핀=장소 / 경로=길 / 영역=영역).
// 2026-07: 이모지 기반 세부 타입(카페/밥집/단골 등) 유추는 폐기.
//   - 새발견 핀(px-star)이 '단골(heart)'로 오분류되던 문제
//   - 배지가 카드마다 제각각이던 것을 장소/길/영역으로 단일화
// 카드 헤더 배지·아트 틴트·이름판 서브에 쓰인다.

export const PLACE_TYPES = [
  { id: "place", label: "장소", color: "#C56B3E" },
  { id: "walk", label: "길", color: "#39836F" },
  { id: "area", label: "영역", color: "#44759F" },
]

const TYPE_BY_ID = new Map(PLACE_TYPES.map((type) => [type.id, type]))

export function getPlaceType(feature) {
  if (feature?.type === "route") return TYPE_BY_ID.get("walk")
  if (feature?.type === "area") return TYPE_BY_ID.get("area")
  return TYPE_BY_ID.get("place")
}
