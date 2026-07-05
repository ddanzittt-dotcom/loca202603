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

          <div className="loca-intro__pin" aria-hidden="true">
            <span className="loca-intro__pin-dot" />
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
