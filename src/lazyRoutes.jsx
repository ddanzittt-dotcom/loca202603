// 앱 탭 밖의 별도 표면(/community-web, /admin) — main.jsx 에서 경로가 맞을 때만 로드한다.
//
// ⚠️ 정적 import 금지. 이 둘은 앱 탭에서 진입 경로가 없는 화면이라, 정적으로 묶으면
//    일반 방문자 전원이 쓰지 않는 코드를 메인 청크로 내려받는다.
//    (2026-07-23 lazy 전환: 메인 청크 496KB → 384KB)
//    main.jsx 는 export 가 없는 엔트리 파일이라 컴포넌트를 그 안에 두면 react-refresh
//    규칙에 걸린다 — 그래서 이 모듈로 분리했다.
import { lazy } from "react"

export const PublicCommunityPage = lazy(() =>
  import("./screens/PublicCommunityPage").then((m) => ({ default: m.PublicCommunityPage }))
)

export const AdminScreen = lazy(() => import("./screens/AdminScreen").then((m) => ({ default: m.AdminScreen })))

// lazy 청크 로딩 중 표시 (App.jsx 의 ScreenFallback 과 동일한 톤)
export function BootFallback() {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh", color: "#999" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 22, fontWeight: 900, marginBottom: 8 }}>LOCA</div>
        <span style={{ fontSize: 14 }}>로딩 중...</span>
      </div>
    </div>
  )
}
