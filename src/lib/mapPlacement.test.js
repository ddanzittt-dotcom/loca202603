import { describe, expect, it } from "vitest"
import { findPlacementForMap, getProfilePlacementState } from "./mapPlacement"

const draftMap = {
  id: "m1",
  title: "저장용",
  category: "personal",
  isPublished: false,
  slug: null,
}

const publishedMap = {
  id: "m2",
  title: "발행된",
  category: "personal",
  isPublished: true,
  slug: "hello",
}

const placementRow = { id: "p1", mapId: "m2", caption: "" }

describe("getProfilePlacementState", () => {
  it("저장용 지도: canPublish 만 true", () => {
    const s = getProfilePlacementState(draftMap, null)
    expect(s.isDraft).toBe(true)
    expect(s.isPublished).toBe(false)
    expect(s.isOnProfile).toBe(false)
    expect(s.canPublish).toBe(true)
    expect(s.canUnpublish).toBe(false)
    expect(s.canAddToProfile).toBe(false)
    expect(s.canRemoveFromProfile).toBe(false)
  })

  it("발행된 일반 지도 + 프로필 미노출: canUnpublish + canAddToProfile", () => {
    const s = getProfilePlacementState(publishedMap, null)
    expect(s.isPublished).toBe(true)
    expect(s.isOnProfile).toBe(false)
    expect(s.canPublish).toBe(false)
    expect(s.canUnpublish).toBe(true)
    expect(s.canAddToProfile).toBe(true)
    expect(s.canRemoveFromProfile).toBe(false)
  })

  it("발행된 일반 지도 + 프로필 노출: canUnpublish + canRemoveFromProfile", () => {
    const s = getProfilePlacementState(publishedMap, placementRow)
    expect(s.isOnProfile).toBe(true)
    expect(s.canPublish).toBe(false)
    expect(s.canUnpublish).toBe(true)
    expect(s.canAddToProfile).toBe(false)
    expect(s.canRemoveFromProfile).toBe(true)
  })

  it("slug 만 있고 is_published 가 undefined 여도 발행 상태로 판단", () => {
    const s = getProfilePlacementState({ id: "m5", category: "personal", slug: "abc" })
    expect(s.isPublished).toBe(true)
    expect(s.canAddToProfile).toBe(true)
  })

  it("null map 도 예외 없이 처리 (호출부에서 map 유효성 먼저 확인 필요)", () => {
    const s = getProfilePlacementState(null, null)
    expect(s.isDraft).toBe(true)
    expect(s.isOnProfile).toBe(false)
    // canPublish 는 isDraft 로 단순 계산되므로 null map 에서도 true 가 된다.
    // 호출부는 map 유효성을 먼저 체크해야 한다. 여기서는 예외 없이 계산되는지만 검증.
    expect(s.canPublish).toBe(true)
  })
})

describe("findPlacementForMap", () => {
  it("매칭되는 placement 를 반환한다", () => {
    expect(findPlacementForMap("m2", [placementRow])).toEqual(placementRow)
  })
  it("매칭이 없으면 null", () => {
    expect(findPlacementForMap("m999", [placementRow])).toBeNull()
  })
  it("빈 배열도 안전", () => {
    expect(findPlacementForMap("m2", [])).toBeNull()
  })
  it("mapId 가 없으면 null", () => {
    expect(findPlacementForMap(null, [placementRow])).toBeNull()
  })
})
