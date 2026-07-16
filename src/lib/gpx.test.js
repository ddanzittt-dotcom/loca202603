import { describe, expect, it } from "vitest"
import { downsample, parseGpxPoints } from "./gpx"

const SAMPLE_GPX = `<?xml version="1.0"?>
<gpx><trk><trkseg>
<trkpt lat="35.1531" lon="129.1187"><ele>10</ele></trkpt>
<trkpt lat="35.1534" lon="129.1190"/>
<trkpt lat="35.1540" lon="129.1195"/>
</trkseg></trk></gpx>`

describe("parseGpxPoints", () => {
  it("trkpt 를 [lng, lat] 표준형으로 추출", () => {
    expect(parseGpxPoints(SAMPLE_GPX)).toEqual([
      [129.1187, 35.1531],
      [129.1190, 35.1534],
      [129.1195, 35.1540],
    ])
  })

  it("rtept 도 허용, 잘못된 좌표는 제외", () => {
    const xml = '<gpx><rte><rtept lat="37.5" lon="127.0"/><rtept lat="abc" lon="127.1"/></rte></gpx>'
    expect(parseGpxPoints(xml)).toEqual([[127.0, 37.5]])
  })

  it("빈 입력 → []", () => {
    expect(parseGpxPoints("")).toEqual([])
    expect(parseGpxPoints(null)).toEqual([])
  })
})

describe("downsample (폴리라인 다운샘플)", () => {
  it("상한 이하는 그대로", () => {
    const points = [[0, 0], [1, 1]]
    expect(downsample(points, 400)).toBe(points)
  })

  it("상한 초과 시 첫/끝 점 보존 + 상한 이내", () => {
    const points = Array.from({ length: 5000 }, (_, i) => [i, i])
    const out = downsample(points, 400)
    expect(out.length).toBe(400)
    expect(out[0]).toEqual([0, 0])
    expect(out[out.length - 1]).toEqual([4999, 4999])
  })
})
