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
            {/* 픽셀 지도: 4px 그리드에 계단식 도로·블록 공원·강. crispEdges 로 도트 느낌 */}
            <svg viewBox="0 0 176 116" width="216" height="142" shapeRendering="crispEdges">
              {/* 지도 판 */}
              <rect x="2" y="2" width="172" height="112" fill="#EFE7CF" stroke="#1F1A12" strokeWidth="4" />
              {/* 강 (좌상단, 계단식) */}
              <rect x="4" y="4" width="36" height="16" fill="#9DC3E6" />
              <rect x="4" y="20" width="24" height="10" fill="#9DC3E6" />
              <rect x="4" y="30" width="12" height="8" fill="#9DC3E6" />
              <rect x="28" y="16" width="8" height="4" fill="#BAD6EE" />
              {/* 도로 (계단식 대각선) */}
              <rect x="4" y="78" width="26" height="10" fill="#FFFDF4" />
              <rect x="24" y="68" width="24" height="10" fill="#FFFDF4" />
              <rect x="44" y="58" width="24" height="10" fill="#FFFDF4" />
              <rect x="64" y="48" width="24" height="10" fill="#FFFDF4" />
              <rect x="84" y="40" width="24" height="10" fill="#FFFDF4" />
              <rect x="104" y="32" width="24" height="10" fill="#FFFDF4" />
              <rect x="124" y="24" width="24" height="10" fill="#FFFDF4" />
              <rect x="144" y="16" width="28" height="10" fill="#FFFDF4" />
              {/* 도로 점선 */}
              <rect x="12" y="82" width="8" height="2" fill="#D8CBA6" />
              <rect x="32" y="72" width="8" height="2" fill="#D8CBA6" />
              <rect x="52" y="62" width="8" height="2" fill="#D8CBA6" />
              <rect x="72" y="52" width="8" height="2" fill="#D8CBA6" />
              <rect x="92" y="44" width="8" height="2" fill="#D8CBA6" />
              <rect x="112" y="36" width="8" height="2" fill="#D8CBA6" />
              <rect x="132" y="28" width="8" height="2" fill="#D8CBA6" />
              <rect x="152" y="20" width="8" height="2" fill="#D8CBA6" />
              {/* 공원 (우하단 블록) */}
              <rect x="110" y="74" width="52" height="32" fill="#7FA05B" />
              <rect x="114" y="78" width="44" height="24" fill="#CBDCB4" />
              <rect x="120" y="84" width="6" height="6" fill="#7FA05B" />
              <rect x="134" y="90" width="6" height="6" fill="#7FA05B" />
              <rect x="146" y="82" width="6" height="6" fill="#7FA05B" />
              {/* 건물 블록 */}
              <rect x="48" y="12" width="18" height="14" fill="#FFFDF4" stroke="#B9A97F" strokeWidth="2" />
              <rect x="26" y="38" width="14" height="12" fill="#FFFDF4" stroke="#B9A97F" strokeWidth="2" />
              <rect x="70" y="70" width="16" height="12" fill="#FFFDF4" stroke="#B9A97F" strokeWidth="2" />
              <rect x="96" y="14" width="12" height="10" fill="#FFFDF4" stroke="#B9A97F" strokeWidth="2" />
              {/* 착지 파문 (픽셀 사각 파문) */}
              <rect className="loca-intro__ripple loca-intro__ripple--a" x="44" y="57" width="20" height="12" fill="none" stroke="#E5493A" strokeWidth="3" />
              <rect className="loca-intro__ripple loca-intro__ripple--b" x="122" y="41" width="20" height="12" fill="none" stroke="#2D6FD0" strokeWidth="3" />
              {/* 핀 A (빨강 픽셀 핀, 팁 = 54,63) */}
              <g className="loca-intro__drop loca-intro__drop--a">
                <rect x="45" y="41" width="18" height="14" fill="#1F1A12" />
                <rect x="47" y="43" width="14" height="10" fill="#E5493A" />
                <rect x="49" y="45" width="4" height="4" fill="#FFF6E8" />
                <rect x="49" y="55" width="10" height="4" fill="#1F1A12" />
                <rect x="52" y="59" width="4" height="4" fill="#1F1A12" />
              </g>
              {/* 핀 B (파랑 픽셀 핀, 팁 = 132,47) */}
              <g className="loca-intro__drop loca-intro__drop--b">
                <rect x="123" y="25" width="18" height="14" fill="#1F1A12" />
                <rect x="125" y="27" width="14" height="10" fill="#2D6FD0" />
                <rect x="127" y="29" width="4" height="4" fill="#FFF6E8" />
                <rect x="127" y="39" width="10" height="4" fill="#1F1A12" />
                <rect x="130" y="43" width="4" height="4" fill="#1F1A12" />
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
