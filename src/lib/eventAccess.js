import { isEventMap } from "./mapPlacement"

// 메인 앱에서 event map 은 항상 participant viewer(SharedMapViewer) 로만 열린다.
// 편집·관리 어포던스는 대시보드 책임이므로 role/source 와 무관하게 editor 분기가 없다.
export function resolveEventAccess({ activeMap }) {
  const activeMapRole = activeMap?.userRole || (activeMap?.canEditFeatures === false ? "viewer" : "owner")

  return {
    activeMapRole,
    shouldOpenEventViewer: isEventMap(activeMap),
  }
}
