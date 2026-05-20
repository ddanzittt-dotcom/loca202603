import { Home, Map, Compass, User, Plus } from "lucide-react"

/**
 * BottomNav v2 — 5칸 (홈 / 지도 / +FAB / 탐색 / 프로필)
 * 가운데 FAB 50px 엠버, blur 백드롭, active 탭 inkStrong.
 *
 * 시안: 참고자료/design-source/phone.jsx::BottomNav
 *
 * 통합은 Phase 1(Step 3~) 에서 화면 단위로 진행. 이 컴포넌트 자체는 dead-code-safe.
 *
 * Props:
 *   tab        — 'home' | 'map' | 'explore' | 'profile' (FAB 제외)
 *   onTabChange(nextTab)
 *   onFabClick — 가운데 + 버튼 탭 시 호출 (홈/지도에서는 신규 진입점, 지도상세에서는 FabTools)
 */
export function BottomNavV2({ tab, onTabChange, onFabClick }) {
  const items = [
    { id: "home",    label: "홈",    Icon: Home },
    { id: "maps",    label: "지도",  Icon: Map },
    { id: "fab" },
    { id: "explore", label: "탐색",  Icon: Compass },
    { id: "profile", label: "프로필", Icon: User },
  ]

  return (
    <nav className="loca-v2-bottomnav" aria-label="주요 메뉴">
      {items.map((item) => {
        if (item.id === "fab") {
          return (
            <div key="fab" className="loca-v2-bottomnav__fab-slot">
              <button
                type="button"
                className="loca-v2-bottomnav__fab"
                onClick={onFabClick}
                aria-label="새로 만들기"
              >
                <Plus size={22} strokeWidth={2.4} />
              </button>
            </div>
          )
        }
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
            <span>{item.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
