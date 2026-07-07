import { describe, it, expect } from "vitest"
import { addPlacements, removePlacement, featureInMap } from "./featurePlacements"

describe("addPlacements", () => {
  it("빈 상태에 카드들을 새 지도 배치로 추가한다", () => {
    const next = addPlacements({}, "m-A", ["c1", "c2"])
    expect(next).toEqual({ "m-A": ["c1", "c2"] })
  })

  it("기존 배치 뒤에 이어붙이고 순서를 보존한다", () => {
    const next = addPlacements({ "m-A": ["c1"] }, "m-A", ["c2", "c3"])
    expect(next).toEqual({ "m-A": ["c1", "c2", "c3"] })
  })

  it("이미 담긴 카드는 중복 추가하지 않는다", () => {
    const next = addPlacements({ "m-A": ["c1", "c2"] }, "m-A", ["c2", "c3"])
    expect(next).toEqual({ "m-A": ["c1", "c2", "c3"] })
  })

  it("한 카드가 여러 지도에 담길 수 있다(M:N)", () => {
    let state = addPlacements({}, "m-A", ["c1"])
    state = addPlacements(state, "m-B", ["c1"])
    expect(state).toEqual({ "m-A": ["c1"], "m-B": ["c1"] })
  })

  it("추가할 것이 없으면 원본 참조를 그대로 반환한다", () => {
    const before = { "m-A": ["c1"] }
    expect(addPlacements(before, "m-A", ["c1"])).toBe(before)
    expect(addPlacements(before, "m-A", [])).toBe(before)
    expect(addPlacements(before, null, ["c9"])).toBe(before)
  })

  it("falsy id는 무시한다", () => {
    const next = addPlacements({}, "m-A", ["c1", "", null, undefined])
    expect(next).toEqual({ "m-A": ["c1"] })
  })
})

describe("removePlacement", () => {
  it("대상 지도 배치에서 카드를 뺀다", () => {
    const next = removePlacement({ "m-A": ["c1", "c2"] }, "m-A", "c1")
    expect(next).toEqual({ "m-A": ["c2"] })
  })

  it("배치가 비면 지도 키 자체를 제거한다", () => {
    const next = removePlacement({ "m-A": ["c1"], "m-B": ["c9"] }, "m-A", "c1")
    expect(next).toEqual({ "m-B": ["c9"] })
  })

  it("다른 지도의 배치는 유지한다(M:N 한쪽만 제거)", () => {
    const next = removePlacement({ "m-A": ["c1"], "m-B": ["c1"] }, "m-A", "c1")
    expect(next).toEqual({ "m-B": ["c1"] })
  })

  it("없는 카드/지도면 원본 참조를 그대로 반환한다", () => {
    const before = { "m-A": ["c1"] }
    expect(removePlacement(before, "m-A", "c9")).toBe(before)
    expect(removePlacement(before, "m-Z", "c1")).toBe(before)
    expect(removePlacement(before, null, "c1")).toBe(before)
  })
})

describe("featureInMap", () => {
  it("스칼라 홈 지도(mapId)가 일치하면 true", () => {
    expect(featureInMap({}, { id: "c1", mapId: "m-A" }, "m-A")).toBe(true)
  })

  it("배치(placements)에만 있어도 true (M:N)", () => {
    expect(featureInMap({ "m-B": ["c1"] }, { id: "c1", mapId: "m-A" }, "m-B")).toBe(true)
  })

  it("스칼라도 배치도 아니면 false", () => {
    expect(featureInMap({ "m-B": ["c2"] }, { id: "c1", mapId: "m-A" }, "m-B")).toBe(false)
  })

  it("mapless 카드는 배치로만 소속을 가진다", () => {
    expect(featureInMap({ "m-B": ["c1"] }, { id: "c1", mapId: null }, "m-B")).toBe(true)
    expect(featureInMap({}, { id: "c1", mapId: null }, "m-B")).toBe(false)
  })

  it("feature_id / map_id 스네이크 케이스도 인식한다", () => {
    expect(featureInMap({ "m-B": ["c1"] }, { feature_id: "c1", map_id: "m-A" }, "m-B")).toBe(true)
    expect(featureInMap({}, { feature_id: "c1", map_id: "m-A" }, "m-A")).toBe(true)
  })

  it("feature 또는 mapId 가 없으면 false", () => {
    expect(featureInMap({}, null, "m-A")).toBe(false)
    expect(featureInMap({}, { id: "c1", mapId: "m-A" }, null)).toBe(false)
  })
})
