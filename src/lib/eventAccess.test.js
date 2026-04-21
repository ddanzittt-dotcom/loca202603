import { describe, expect, it } from "vitest"
import { resolveEventAccess } from "./eventAccess"

describe("resolveEventAccess", () => {
  it("event + owner 라도 participant viewer 로만 연다", () => {
    const result = resolveEventAccess({
      activeMap: { category: "event", userRole: "owner" },
    })

    expect(result.shouldOpenEventViewer).toBe(true)
    expect(result.activeMapRole).toBe("owner")
  })

  it("event + operator 는 participant viewer 로만 연다", () => {
    const result = resolveEventAccess({
      activeMap: { category: "event", userRole: "operator" },
    })

    expect(result.shouldOpenEventViewer).toBe(true)
    expect(result.activeMapRole).toBe("operator")
  })

  it("event + editor 는 participant viewer 로만 연다", () => {
    const result = resolveEventAccess({
      activeMap: { category: "event", userRole: "editor" },
    })

    expect(result.shouldOpenEventViewer).toBe(true)
    expect(result.activeMapRole).toBe("editor")
  })

  it("event + viewer 도 participant viewer 로 연다", () => {
    const result = resolveEventAccess({
      activeMap: { category: "event", userRole: "viewer", canEditFeatures: false },
    })

    expect(result.shouldOpenEventViewer).toBe(true)
    expect(result.activeMapRole).toBe("viewer")
  })

  it("event map + shared 소스도 participant viewer", () => {
    const result = resolveEventAccess({
      activeMap: { category: "event", userRole: "owner" },
    })

    expect(result.shouldOpenEventViewer).toBe(true)
  })

  it("non-event map 은 event viewer 분기를 타지 않는다", () => {
    const result = resolveEventAccess({
      activeMap: { category: "personal", userRole: "owner" },
    })

    expect(result.shouldOpenEventViewer).toBe(false)
    expect(result.activeMapRole).toBe("owner")
  })

  it("activeMap 이 없으면 event viewer 아님", () => {
    const result = resolveEventAccess({ activeMap: null })
    expect(result.shouldOpenEventViewer).toBe(false)
  })
})
