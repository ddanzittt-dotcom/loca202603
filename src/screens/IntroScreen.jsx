// 첫 방문 타이틀(입장) 화면 — 게임 카트리지 부팅 화면 감성.
// 크림 종이 + 잉크 프레임 + No.밴드 + 깜빡이는 카트리지 시작 버튼.
export function IntroScreen({ onEnter, onLogin }) {
  return (
    <div className="loca-intro" role="dialog" aria-modal="true" aria-label="LOCA 시작">
      <div className="loca-intro__card">
        <div className="loca-intro__band">
          <span>No.000</span>
          <i>LOCAL BINDER</i>
        </div>

        <div className="loca-intro__body">
          <h1 className="loca-intro__logo" aria-label="LOCA">LOCA</h1>
          <p className="loca-intro__tagline">내 동네를 기록하는 지도</p>

          <div className="loca-intro__scene" aria-hidden="true">
            {/* 대한민국 픽셀 지도 실루엣 — 잉크 외곽선(확장 rect) 뒤, 초록 셀 위.
                서울·부산 자리에 핀이 떨어진다. crispEdges 로 도트 유지. */}
            <svg viewBox="0 0 112 182" width="150" height="244" shapeRendering="crispEdges">
              {/* 외곽선: 각 행을 ±3 확장한 잉크 rect (union → 실루엣 테두리) */}
              <g fill="#1F1A12">
                <rect x="50" y="3" width="33" height="15" />
                <rect x="41" y="12" width="51" height="15" />
                <rect x="41" y="21" width="51" height="15" />
                <rect x="32" y="30" width="60" height="15" />
                <rect x="23" y="39" width="78" height="15" />
                <rect x="32" y="48" width="69" height="15" />
                <rect x="23" y="57" width="78" height="15" />
                <rect x="32" y="66" width="69" height="15" />
                <rect x="32" y="75" width="60" height="15" />
                <rect x="23" y="84" width="69" height="15" />
                <rect x="32" y="93" width="69" height="15" />
                <rect x="32" y="102" width="60" height="15" />
                <rect x="41" y="111" width="51" height="15" />
                <rect x="41" y="120" width="42" height="15" />
                <rect x="50" y="129" width="33" height="15" />
                <rect x="50" y="138" width="24" height="15" />
                <rect x="32" y="156" width="24" height="15" />
              </g>
              {/* 초록 국토 (행별 정확히 타일) */}
              <g fill="#7FB542">
                <rect x="53" y="6" width="27" height="9" />
                <rect x="44" y="15" width="45" height="9" />
                <rect x="44" y="24" width="45" height="9" />
                <rect x="35" y="33" width="54" height="9" />
                <rect x="26" y="42" width="72" height="9" />
                <rect x="35" y="51" width="63" height="9" />
                <rect x="26" y="60" width="72" height="9" />
                <rect x="35" y="69" width="63" height="9" />
                <rect x="35" y="78" width="54" height="9" />
                <rect x="26" y="87" width="63" height="9" />
                <rect x="35" y="96" width="63" height="9" />
                <rect x="35" y="105" width="54" height="9" />
                <rect x="44" y="114" width="45" height="9" />
                <rect x="44" y="123" width="36" height="9" />
                <rect x="53" y="132" width="27" height="9" />
                <rect x="53" y="141" width="18" height="9" />
                <rect x="35" y="159" width="18" height="9" />
              </g>
              {/* 명암 셀 (밝은/어두운 초록으로 도트 질감) */}
              <g fill="#A6D06A">
                <rect x="53" y="42" width="9" height="9" />
                <rect x="62" y="60" width="9" height="9" />
                <rect x="44" y="87" width="9" height="9" />
                <rect x="62" y="96" width="9" height="9" />
              </g>
              <g fill="#5E9A2E">
                <rect x="80" y="51" width="9" height="9" />
                <rect x="44" y="114" width="9" height="9" />
                <rect x="71" y="69" width="9" height="9" />
              </g>

              {/* 착지 파문 */}
              <rect className="loca-intro__ripple loca-intro__ripple--a" x="38" y="44" width="20" height="12" fill="none" stroke="#E5493A" strokeWidth="3" />
              <rect className="loca-intro__ripple loca-intro__ripple--b" x="76" y="86" width="20" height="12" fill="none" stroke="#2D6FD0" strokeWidth="3" />

              {/* 핀 A (빨강, 서울 자리 팁≈48,50) */}
              <g className="loca-intro__drop loca-intro__drop--a">
                <rect x="39" y="26" width="18" height="14" fill="#1F1A12" />
                <rect x="41" y="28" width="14" height="10" fill="#E5493A" />
                <rect x="43" y="30" width="4" height="4" fill="#FFF6E8" />
                <rect x="43" y="40" width="10" height="4" fill="#1F1A12" />
                <rect x="46" y="44" width="4" height="6" fill="#1F1A12" />
              </g>
              {/* 핀 B (파랑, 부산 자리 팁≈86,92) */}
              <g className="loca-intro__drop loca-intro__drop--b">
                <rect x="77" y="68" width="18" height="14" fill="#1F1A12" />
                <rect x="79" y="70" width="14" height="10" fill="#2D6FD0" />
                <rect x="81" y="72" width="4" height="4" fill="#FFF6E8" />
                <rect x="81" y="82" width="10" height="4" fill="#1F1A12" />
                <rect x="84" y="86" width="4" height="6" fill="#1F1A12" />
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
