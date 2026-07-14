import { describe, expect, it } from "vitest"
import {
  getPendingFeatureMediaSyncKeys,
  inferStoragePathFromPublicUrl,
  isCloudMediaRecord,
} from "./mediaCloudSync"

const featureId = "11111111-1111-4111-8111-111111111111"
const mediaId = "22222222-2222-4222-8222-222222222222"

describe("mediaCloudSync", () => {
  it("detects local-only media that still needs a cloud record", () => {
    const keys = getPendingFeatureMediaSyncKeys([
      {
        id: featureId,
        photos: [{ id: "photo-local" }, { id: mediaId, url: "https://cdn.example/photo.jpg" }],
      },
      {
        id: "local-feature",
        photos: [{ id: "photo-skipped" }],
      },
    ])

    expect(keys).toEqual([
      `${featureId}:photo:photo-local`,
    ])
  })

  it("infers Supabase storage paths from public URLs", () => {
    expect(inferStoragePathFromPublicUrl(
      "https://example.supabase.co/storage/v1/object/public/media/photos/photo-1.jpg?t=1",
    )).toBe("photos/photo-1.jpg")
  })

  it("treats UUID media rows with remote metadata as cloud records", () => {
    expect(isCloudMediaRecord({ id: mediaId, storagePath: "photos/photo.jpg" })).toBe(true)
    expect(isCloudMediaRecord({ id: "photo-local", url: "https://cdn.example/photo.jpg" })).toBe(false)
  })
})
