import { NaverMap } from "./NaverMap"
import { KakaoMap } from "./KakaoMap"

// 한국 지도 렌더러 단일 선택 지점.
// 기본 네이버, VITE_MAP_PROVIDER=kakao 일 때 카카오맵으로 전환.
// (카카오 JS 키 세팅 + 시각 테스트 완료 후 env 로 스위치)
export const KoreaMap = import.meta.env.VITE_MAP_PROVIDER === "kakao" ? KakaoMap : NaverMap
