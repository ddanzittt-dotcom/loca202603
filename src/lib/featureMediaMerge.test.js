import { describe, expect, it } from "vitest"
import { mergeFeatureMediaFromLocal, mergeFeatureListWithLocalMedia } from "./featureMediaMerge"

describe("featureMediaMerge", () => {
  it("keeps local media when next feature media is empty", () => {
    const local = {
      id: "f1",
      photos: [{ id: "p1" }],
      memos: [{ id: "m1", text: "memo" }],
    }
    const next = { id: "f1", photos: [], memos: [] }

    const merged = mergeFeatureMediaFromLocal(next, local)
    expect(merged.photos).toEqual(local.photos)
    expect(merged.memos).toEqual(local.memos)
  })

  it("keeps localId when matching server media arrives", () => {
    const local = {
      id: "f1",
      photos: [{ id: "server-photo", localId: "local-photo", url: "https://cdn/photo.jpg" }],
    }
    const next = {
      id: "f1",
      photos: [{ id: "server-photo", url: "https://cdn/photo.jpg" }],
      memos: [],
    }

    const merged = mergeFeatureMediaFromLocal(next, local)
    expect(merged.photos).toEqual([{ id: "server-photo", localId: "local-photo", url: "https://cdn/photo.jpg" }])
  })

  it("keeps local-only media when server media exists", () => {
    const local = { id: "f1", photos: [{ id: "local-photo" }] }
    const next = { id: "f1", photos: [{ id: "server-photo" }], memos: [] }

    const merged = mergeFeatureMediaFromLocal(next, local)
    expect(merged.photos).toEqual([{ id: "server-photo" }, { id: "local-photo" }])
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

