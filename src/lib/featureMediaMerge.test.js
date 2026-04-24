import { describe, expect, it } from "vitest"
import { mergeFeatureMediaFromLocal, mergeFeatureListWithLocalMedia } from "./featureMediaMerge"

describe("featureMediaMerge", () => {
  it("keeps local media when next feature media is empty", () => {
    const local = {
      id: "f1",
      photos: [{ id: "p1" }],
      voices: [{ id: "v1" }],
      memos: [{ id: "m1", text: "memo" }],
    }
    const next = { id: "f1", photos: [], voices: [], memos: [] }

    const merged = mergeFeatureMediaFromLocal(next, local)
    expect(merged.photos).toEqual(local.photos)
    expect(merged.voices).toEqual(local.voices)
    expect(merged.memos).toEqual(local.memos)
  })

  it("prefers next media when server media exists", () => {
    const local = { id: "f1", photos: [{ id: "local-photo" }] }
    const next = { id: "f1", photos: [{ id: "server-photo" }], voices: [], memos: [] }

    const merged = mergeFeatureMediaFromLocal(next, local)
    expect(merged.photos).toEqual([{ id: "server-photo" }])
  })

  it("merges list by feature id", () => {
    const localList = [{ id: "f1", photos: [{ id: "p1" }] }, { id: "f2", photos: [{ id: "p2" }] }]
    const nextList = [{ id: "f1", photos: [] }, { id: "f3", photos: [] }]

    const mergedList = mergeFeatureListWithLocalMedia(nextList, localList)
    expect(mergedList).toHaveLength(2)
    expect(mergedList[0].photos).toEqual([{ id: "p1" }])
    expect(mergedList[1].photos).toEqual([])
  })
})

