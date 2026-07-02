import { LogIn, Map, MapPin, User } from "lucide-react"

/**
 * BottomNav v2 — 웹용 하단 내비.
 * 비로그인: 로그인 / 지도 목록 / 장소 목록 / 프로필 (4칸)
 * 로그인 후: 지도 목록 / 장소 목록 / 프로필 (3칸 — 계정은 우상단 계정 버튼으로)
 * 지도 제작은 지도 목록 안의 "새 지도" 버튼으로 진입한다.
 *
 * Props:
 *   tab        — 'login' | 'maps' | 'places' | 'profile'
 *   onTabChange(nextTab)
 *   authed     — 로그인 여부
 */
export function BottomNavV2({ tab, onTabChange, authed = false }) {
  const items = [
    ...(authed ? [] : [{ id: "login", label: "로그인", Icon: LogIn }]),
    { id: "maps", label: "지도 목록", Icon: Map },
    { id: "places", label: "장소 목록", Icon: MapPin },
    { id: "profile", label: "프로필", Icon: User },
  ]

  return (
    <nav className="loca-v2-bottomnav" aria-label="주요 메뉴">
      <div className="loca-v2-bottomnav__brand" aria-hidden="true">
        <strong>loca<span>.</span></strong>
      </div>
      <div className="loca-v2-bottomnav__items">
        {items.map((item) => {
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
              </span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
