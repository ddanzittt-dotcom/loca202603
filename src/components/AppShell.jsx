import { Bell } from "lucide-react"
import { BottomNavV2 } from "./BottomNav.v2"

/**
 * AppShell v2 — 새 디자인의 메인 4탭 셸.
 *
 * 시안: 참고자료/design-source/phone.jsx::Phone
 *
 * 구조 (위→아래):
 *   1. 헤더 (홈 탭에서만 loca. 로고 + 알림 벨)
 *   2. 본문 — children 슬롯 (스크롤 영역)
 *   3. BottomNavV2 — 5칸 + 가운데 FAB
 *
 * 통합은 Phase 1 에서 진행. 현재는 새 화면이 채택할 수 있도록 export만 한다.
 *
 * Props:
 *   tab               — 'home' | 'map' | 'explore' | 'profile'
 *   onTabChange
 *   onFabClick
 *   onBellClick       — 홈 탭 알림 벨 클릭
 *   notificationDot   — true 면 벨 우상단에 작은 점 표시
 *   children          — 본문
 */
export function AppShell({
  tab,
  onTabChange,
  onFabClick,
  onBellClick,
  notificationDot = false,
  children,
}) {
  const showBrand = tab === "home"
  return (
    <div className="loca-v2-shell">
      <header className="loca-v2-shell__header">
        <div className="loca-v2-shell__brand">
          {showBrand ? (
            <span>
              loca<span className="loca-v2-shell__brand-dot">.</span>
            </span>
          ) : null}
        </div>
        <div className="loca-v2-shell__actions">
          {showBrand ? (
            <button
              type="button"
              className="loca-v2-shell__icon-btn"
              onClick={onBellClick}
              aria-label="알림"
            >
              <Bell size={17} />
              {notificationDot ? <span className="loca-v2-shell__dot" /> : null}
            </button>
          ) : null}
        </div>
      </header>

      <main className="loca-v2-shell__body">{children}</main>

      <BottomNavV2 tab={tab} onTabChange={onTabChange} onFabClick={onFabClick} />
    </div>
  )
}
