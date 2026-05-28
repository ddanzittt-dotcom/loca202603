import { describe, expect, it } from "vitest"
import {
  COMMUNITY_SAMPLE_AUTHOR,
  COMMUNITY_SAMPLE_BATCH,
  COMMUNITY_SAMPLE_TAG,
  communitySampleFeatures,
} from "./communitySampleFeatures"
import { findPixelArt } from "../lib/pixelEmojiCatalog"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

describe("community sample features", () => {
  it("has stable ids and sample metadata", () => {
    const ids = new Set()
    const sampleKeys = new Set()

    expect(COMMUNITY_SAMPLE_BATCH).toBeTruthy()
    expect(COMMUNITY_SAMPLE_AUTHOR).toBe("LCOA 샘플")
    expect(communitySampleFeatures).toHaveLength(850)

    for (const feature of communitySampleFeatures) {
      expect(feature.id).toMatch(UUID_RE)
      expect(ids.has(feature.id)).toBe(false)
      ids.add(feature.id)

      expect(feature.sampleKey).toBeTruthy()
      expect(sampleKeys.has(feature.sampleKey)).toBe(false)
      sampleKeys.add(feature.sampleKey)

      expect(feature.type).toBe("pin")
      expect(feature.tags).toContain(COMMUNITY_SAMPLE_TAG)
      expect(feature.note).not.toContain("사용자 테스트용 샘플입니다")
      expect(feature.note).not.toContain("실제 사용자 기록이 아닙니다")
      expect(feature.emojiKind).toBe("pixel")
      expect(findPixelArt(feature.emojiPixelId)).toBeTruthy()
    }
  })

  it("keeps every sample as a valid place pin", () => {
    for (const feature of communitySampleFeatures) {
      expect(feature.type).toBe("pin")
      expect(Number.isFinite(feature.lat)).toBe(true)
      expect(Number.isFinite(feature.lng)).toBe(true)
      expect(feature.lat).toBeGreaterThan(32)
      expect(feature.lat).toBeLessThan(39)
      expect(feature.lng).toBeGreaterThan(124)
      expect(feature.lng).toBeLessThan(132)
      expect(feature.points).toBeUndefined()
    }
  })
})
