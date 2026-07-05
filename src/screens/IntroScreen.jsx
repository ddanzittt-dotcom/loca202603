// 첫 방문 타이틀(입장) 화면 — 게임 카트리지 부팅 화면 감성.
// 크림 종이 + 잉크 프레임 + No.밴드 + 깜빡이는 카트리지 시작 버튼.
export function IntroScreen({ onEnter, onLogin }) {
  return (
    <div className="loca-intro" role="dialog" aria-modal="true" aria-label="LOCA 시작">
      <div className="loca-intro__card">
        <div className="loca-intro__band">
          <span>No.000</span>
          <i>LOCAL DEX</i>
        </div>

        <div className="loca-intro__body">
          <h1 className="loca-intro__logo" aria-label="LOCA">LOCA</h1>
          <p className="loca-intro__tagline">내 동네를 기록하는 지도</p>

          <div className="loca-intro__scene" aria-hidden="true">
            <svg viewBox="0 0 132 88" width="150" height="100">
              {/* 미니 지도 판 */}
              <rect x="3" y="10" width="126" height="74" rx="9" fill="#EFE7CF" stroke="#1F1A12" strokeWidth="3" />
              {/* 길(도로) */}
              <path d="M10 62 L44 48 L74 58 L122 34" fill="none" stroke="#FFFDF4" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M10 62 L44 48 L74 58 L122 34" fill="none" stroke="#D8CBA6" strokeWidth="2.5" strokeDasharray="5 4" strokeLinecap="round" strokeLinejoin="round" />
              {/* 영역(공원) */}
              <path d="M88 66 q10 -9 22 -4 q8 4 4 11 q-6 8 -18 5 q-11 -3 -8 -12z" fill="#CBDCB4" stroke="#1F1A12" strokeWidth="2" />
              {/* 블록 */}
              <rect x="14" y="20" width="18" height="12" rx="2" fill="#FFFDF4" stroke="#D8CBA6" strokeWidth="2" />
              <rect x="52" y="18" width="14" height="10" rx="2" fill="#FFFDF4" stroke="#D8CBA6" strokeWidth="2" />
              {/* 착지 파문 */}
              <circle className="loca-intro__ripple loca-intro__ripple--a" cx="44" cy="48" r="5" fill="none" stroke="#E5493A" strokeWidth="2.5" />
              <circle className="loca-intro__ripple loca-intro__ripple--b" cx="100" cy="42" r="5" fill="none" stroke="#2D6FD0" strokeWidth="2.5" />
              {/* 핀 A (빨강) */}
              <g className="loca-intro__drop loca-intro__drop--a">
                <path d="M44 48 L38 34 A8.5 8.5 0 1 1 50 34 Z" fill="#E5493A" stroke="#1F1A12" strokeWidth="2.5" strokeLinejoin="round" />
                <circle cx="44" cy="29" r="3" fill="#FFF6E8" />
              </g>
              {/* 핀 B (파랑) */}
              <g className="loca-intro__drop loca-intro__drop--b">
                <path d="M100 42 L94 28 A8.5 8.5 0 1 1 106 28 Z" fill="#2D6FD0" stroke="#1F1A12" strokeWidth="2.5" strokeLinejoin="round" />
                <circle cx="100" cy="23" r="3" fill="#FFF6E8" />
              </g>
            </svg>
          </div>

          <button type="button" className="loca-intro__start" onClick={onEnter}>
            ▶ 입장하기
          </button>

          <button type="button" className="loca-intro__login" onClick={onLogin}>
            이미 계정이 있어요 · 로그인
          </button>
        </div>
      </div>
    </div>
  )
}
