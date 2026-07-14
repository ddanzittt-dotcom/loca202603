import { describe, expect, it } from "vitest"
import { buildFeatureRecordGroups, summarizeRecordGroup } from "./featureRecordGroups"

describe("featureRecordGroups", () => {
  it("groups memo and photo records created close together", () => {
    const feature = {
      memos: [{ id: "memo-1", date: "2026-05-28T10:05:00.000Z", text: "좋았던 자리" }],
      photos: [{ id: "photo-1", date: "2026-05-28T10:01:00.000Z", url: "https://example.com/photo.jpg" }],
    }

    const groups = buildFeatureRecordGroups(feature)

    expect(groups).toHaveLength(1)
    expect(groups[0].memos).toHaveLength(1)
    expect(groups[0].photos).toHaveLength(1)
    expect(summarizeRecordGroup(groups[0])).toEqual({
      text: "좋았던 자리",
      assetLabel: "사진 1 · 메모",
    })
  })

  it("keeps records apart when they are not part of the same session", () => {
    const feature = {
      memos: [
        { id: "memo-1", date: "2026-05-28T10:00:00.000Z", text: "오전 기록" },
        { id: "memo-2", date: "2026-05-28T13:00:00.000Z", text: "오후 기록" },
      ],
      photos: [{ id: "photo-1", date: "2026-05-28T13:03:00.000Z", url: "https://example.com/photo.jpg" }],
    }

    const groups = buildFeatureRecordGroups(feature)

    expect(groups).toHaveLength(2)
    expect(groups[0].memos[0].id).toBe("memo-2")
    expect(groups[0].photos).toHaveLength(1)
    expect(groups[1].memos[0].id).toBe("memo-1")
  })

  it("uses record ids to keep close-together entries separate", () => {
    const feature = {
      memos: [
        { id: "memo-1", recordId: "record-a", date: "2026-05-28T10:00:00.000Z", text: "첫 번째 기록" },
        { id: "memo-2", recordId: "record-b", date: "2026-05-28T10:02:00.000Z", text: "두 번째 기록" },
      ],
      photos: [
        { id: "photo-1", recordId: "record-a", date: "2026-05-28T10:01:00.000Z" },
        { id: "photo-2", recordId: "record-b", date: "2026-05-28T10:03:00.000Z" },
      ],
    }

    const groups = buildFeatureRecordGroups(feature)

    expect(groups).toHaveLength(2)
    expect(groups.map((group) => group.recordId)).toEqual(["record-b", "record-a"])
    expect(groups[0].memos[0].id).toBe("memo-2")
    expect(groups[0].photos[0].id).toBe("photo-2")
    expect(groups[1].memos[0].id).toBe("memo-1")
    expect(groups[1].photos[0].id).toBe("photo-1")
  })
})
