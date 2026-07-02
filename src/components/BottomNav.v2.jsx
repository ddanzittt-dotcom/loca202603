import { LogIn, Map, MapPin, PenLine, User } from "lucide-react"

const NAV_ITEMS = [
  { id: "login", label: "로그인", description: "내 저장함", Icon: LogIn },
  { id: "create", label: "지도 제작", description: "같이 만들기", Icon: PenLine },
  { id: "maps", label: "지도 목록", description: "모아둔 지도", Icon: Map },
  { id: "places", label: "장소 목록", description: "최근 장소", Icon: MapPin },
  { id: "profile", label: "프로필", description: "공개 홈", Icon: User },
]

/**
 * BottomNav v2 — 웹용 5칸 (로그인 / 지도 제작 / 지도 목록 / 장소 목록 / 프로필)
 *
 * 시안: 참고자료/design-source/phone.jsx::BottomNav
 *
 * 통합은 Phase 1(Step 3~) 에서 화면 단위로 진행. 이 컴포넌트 자체는 dead-code-safe.
 *
 * Props:
 *   tab        — 'login' | 'create' | 'maps' | 'places' | 'profile'
 *   onTabChange(nextTab)
 */
export function BottomNavV2({ tab, onTabChange }) {
  return (
    <nav className="loca-v2-bottomnav" aria-label="주요 메뉴">
      <div className="loca-v2-bottomnav__brand" aria-hidden="true">
        <strong>loca<span>.</span></strong>
        <em>soft social web</em>
      </div>
      <div className="loca-v2-bottomnav__items">
        {NAV_ITEMS.map((item) => {
          const active = tab === item.id
          const { Icon } = item
          return (
            <button
              key={item.id}
              type="button"
              className={`loca-v2-bottomnav__tab${active ? " is-active" : ""}`}
              onClick={() => onTabChange?.(item.id)}
              aria-current={active ? "page" : undefined}
            >
              <Icon size={20} strokeWidth={active ? 2 : 1.7} />
              <span>
                <strong>{item.label}</strong>
                <small>{item.description}</small>
              </span>
            </button>
          )
        })}
      </div>
      <div className="loca-v2-bottomnav__foot" aria-hidden="true">
        <span>같이 저장 중</span>
        <strong>지도와 장소를 친구와 함께 모아요</strong>
      </div>
    </nav>
  )
}
