import { Compass, LayoutDashboard, LogIn, Map, MapPin } from "lucide-react"
import { PixelWordmark } from "./PixelWordmark"

/**
 * BottomNav v2 — 모바일: 하단 내비 / 데스크톱(≥960px): 상단 풀블리드 배너(탭 정중앙).
 * 배치는 전부 app-shell.css가 결정하고, 이 컴포넌트는 마크업만 담당한다.
 * 비로그인: 탐색 / 로그인 (구경 먼저, 개인 영역은 로그인 후)
 * 로그인 후: 탐색 / 내 지도 / 내 장소 / 내 대시보드 (내 정보 관리는 우상단 계정 버튼)
 * 지도 제작은 지도 목록 안의 "새 지도" 버튼으로 진입한다.
 *
 * Props:
 *   tab         — 'explore' | 'login' | 'maps' | 'places' | 'profile'(대시보드) | 'account'(내비 미노출)
 *   onTabChange(nextTab)
 *   authed      — 로그인 여부
 *   onBrandClick — loca. 로고 클릭 시 (타이틀 화면 진입). 없으면 로고는 장식.
 */
export function BottomNavV2({ tab, onTabChange, authed = false, onBrandClick }) {
  const items = authed
    ? [
      { id: "explore", label: "탐색", Icon: Compass },
      { id: "maps", label: "내 지도", Icon: Map },
      { id: "places", label: "내 장소", Icon: MapPin },
      { id: "profile", label: "내 대시보드", Icon: LayoutDashboard },
    ]
    : [
      { id: "explore", label: "탐색", Icon: Compass },
      { id: "login", label: "로그인", Icon: LogIn },
    ]

  return (
    <nav className="loca-v2-bottomnav" aria-label="주요 메뉴">
      {onBrandClick ? (
        <button
          type="button"
          className="loca-v2-bottomnav__brand loca-v2-bottomnav__brand--btn"
          onClick={onBrandClick}
          aria-label="LOCA 시작 화면"
        >
          <PixelWordmark height={22} shadow="#E3DCC9" />
        </button>
      ) : (
        <div className="loca-v2-bottomnav__brand" aria-hidden="true">
          <PixelWordmark height={22} shadow="#E3DCC9" />
        </div>
      )}
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
