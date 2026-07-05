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
            {/* 픽셀 동네 지도 — 4px 그리드, crispEdges 로 도트 느낌 유지.
                채워진 지붕 집·매끈한 도로 띠·나무 공원·강으로 정돈. */}
            <svg viewBox="0 0 200 128" width="230" height="147" shapeRendering="crispEdges">
              {/* 지도 판 */}
              <rect x="3" y="3" width="194" height="122" fill="#E9DFC4" stroke="#1F1A12" strokeWidth="4" />

              {/* 잔디 결(옅은 체크) */}
              <rect x="7" y="7" width="186" height="114" fill="#EDE4CB" />

              {/* 강 (좌하단 모서리, 계단형) */}
              <rect x="7" y="92" width="46" height="29" fill="#8FBCE0" />
              <rect x="7" y="80" width="30" height="12" fill="#8FBCE0" />
              <rect x="7" y="72" width="16" height="8" fill="#8FBCE0" />
              <rect x="41" y="96" width="10" height="6" fill="#AAD0EE" />
              <rect x="15" y="84" width="8" height="4" fill="#AAD0EE" />

              {/* 도로: 매끈한 대각선 띠 (16px 폭, 완만한 계단) */}
              <g fill="#FBF6E7">
                <rect x="18" y="96" width="40" height="16" />
                <rect x="50" y="84" width="36" height="16" />
                <rect x="80" y="72" width="36" height="16" />
                <rect x="110" y="58" width="36" height="16" />
                <rect x="140" y="44" width="36" height="16" />
                <rect x="166" y="30" width="28" height="16" />
              </g>
              {/* 도로 테두리(위·아래 얇은 선) */}
              <g fill="#D8C9A0">
                <rect x="18" y="96" width="40" height="2" />
                <rect x="50" y="84" width="36" height="2" />
                <rect x="80" y="72" width="36" height="2" />
                <rect x="110" y="58" width="36" height="2" />
                <rect x="140" y="44" width="36" height="2" />
                <rect x="166" y="30" width="28" height="2" />
              </g>
              {/* 도로 중앙 점선 */}
              <g fill="#C9B885">
                <rect x="34" y="103" width="8" height="3" />
                <rect x="64" y="91" width="8" height="3" />
                <rect x="94" y="79" width="8" height="3" />
                <rect x="122" y="65" width="8" height="3" />
                <rect x="152" y="51" width="8" height="3" />
              </g>

              {/* 공원 (우하단): 잔디 + 나무 도트 + 연못 */}
              <rect x="118" y="86" width="72" height="35" fill="#9DBE6E" />
              <rect x="122" y="90" width="64" height="27" fill="#B7D28C" />
              <g fill="#6E9046">
                <rect x="128" y="96" width="8" height="8" />
                <rect x="144" y="104" width="8" height="8" />
                <rect x="160" y="94" width="8" height="8" />
                <rect x="174" y="106" width="8" height="8" />
              </g>
              <rect x="150" y="96" width="14" height="8" fill="#8FBCE0" />

              {/* 건물: 채워진 지붕 블록(따뜻한 색 + 잉크 테두리 + 창문 도트) */}
              {/* 테라코타 */}
              <rect x="60" y="18" width="22" height="18" fill="#E0A96D" stroke="#1F1A12" strokeWidth="2" />
              <rect x="64" y="22" width="5" height="5" fill="#FBF6E7" />
              <rect x="73" y="22" width="5" height="5" fill="#FBF6E7" />
              {/* 청록 */}
              <rect x="30" y="34" width="20" height="16" fill="#6FB0A6" stroke="#1F1A12" strokeWidth="2" />
              <rect x="34" y="38" width="5" height="5" fill="#FBF6E7" />
              {/* 머스터드 */}
              <rect x="98" y="20" width="18" height="16" fill="#E8C15A" stroke="#1F1A12" strokeWidth="2" />
              <rect x="102" y="24" width="5" height="5" fill="#FBF6E7" />
              {/* 자주 */}
              <rect x="150" y="14" width="20" height="16" fill="#C98BB0" stroke="#1F1A12" strokeWidth="2" />
              <rect x="154" y="18" width="5" height="5" fill="#FBF6E7" />

              {/* 착지 파문 (픽셀 사각 파문) */}
              <rect className="loca-intro__ripple loca-intro__ripple--a" x="72" y="66" width="22" height="13" fill="none" stroke="#E5493A" strokeWidth="3" />
              <rect className="loca-intro__ripple loca-intro__ripple--b" x="147" y="38" width="22" height="13" fill="none" stroke="#2D6FD0" strokeWidth="3" />

              {/* 핀 A (빨강, 팁 = 83,72 도로 위) */}
              <g className="loca-intro__drop loca-intro__drop--a">
                <rect x="74" y="48" width="18" height="14" fill="#1F1A12" />
                <rect x="76" y="50" width="14" height="10" fill="#E5493A" />
                <rect x="78" y="52" width="4" height="4" fill="#FFF6E8" />
                <rect x="78" y="62" width="10" height="4" fill="#1F1A12" />
                <rect x="81" y="66" width="4" height="6" fill="#1F1A12" />
              </g>
              {/* 핀 B (파랑, 팁 = 158,44 도로 위) */}
              <g className="loca-intro__drop loca-intro__drop--b">
                <rect x="149" y="20" width="18" height="14" fill="#1F1A12" />
                <rect x="151" y="22" width="14" height="10" fill="#2D6FD0" />
                <rect x="153" y="24" width="4" height="4" fill="#FFF6E8" />
                <rect x="153" y="34" width="10" height="4" fill="#1F1A12" />
                <rect x="156" y="38" width="4" height="6" fill="#1F1A12" />
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
