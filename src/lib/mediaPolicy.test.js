import { describe, expect, it } from "vitest"
import { MEDIA_POLICY, assertPhotoFileAllowed, assertStoredMediaAllowed, formatBytes } from "./mediaPolicy"

describe("mediaPolicy", () => {
  it("formats byte sizes for user-facing messages", () => {
    expect(formatBytes(500)).toBe("500B")
    expect(formatBytes(2048)).toBe("2KB")
    expect(formatBytes(2 * 1024 * 1024)).toBe("2.0MB")
  })

  it("accepts normal photo files", () => {
    const file = new File(["x"], "place.jpg", { type: "image/jpeg" })
    expect(() => assertPhotoFileAllowed(file)).not.toThrow()
  })

  it("rejects non-image photo uploads", () => {
    const file = new File(["x"], "memo.txt", { type: "text/plain" })
    expect(() => assertPhotoFileAllowed(file)).toThrow("이미지 파일만")
  })

  it("rejects original photos above the pre-compression limit", () => {
    const file = new File([new Uint8Array(MEDIA_POLICY.photo.maxOriginalBytes + 1)], "large.jpg", { type: "image/jpeg" })
    expect(() => assertPhotoFileAllowed(file)).toThrow("사진은")
  })

  it("rejects stored photos above the limit", () => {
    const photo = new Blob([new Uint8Array(MEDIA_POLICY.photo.maxStoredBytes + 1)], { type: "image/jpeg" })
    expect(() => assertStoredMediaAllowed(photo, "photo")).toThrow("사진 파일")
  })
})
