import { describe, expect, it } from 'vitest'
import { atlasUv, flipbookFrame, FLIPBOOK } from '../src/scene/SmokeFlipbook'

describe('smoke flipbook', () => {
  it('is 64 frames in an 8×8 grid', () => {
    expect(FLIPBOOK.frames).toBe(64)
    expect(FLIPBOOK.cols).toBe(8)
  })

  it('maps age to a frame pair and blend factor', () => {
    expect(flipbookFrame(0)).toEqual({ a: 0, b: 1, t: 0 })
    const mid = flipbookFrame(0.5)
    expect(mid.a).toBe(31)
    expect(mid.b).toBe(32)
    expect(mid.t).toBeCloseTo(0.5)
    // Just under 1 blends into the last frame, never past it.
    const end = flipbookFrame(0.9999)
    expect(end.a).toBe(62)
    expect(end.b).toBe(63)
    expect(end.t).toBeGreaterThan(0.99)
  })

  it('holds the blend factor in [0, 1) across the whole life', () => {
    for (let i = 0; i < 1000; i++) {
      const { a, b, t } = flipbookFrame(i / 1000)
      expect(b).toBe(a + 1)
      expect(b).toBeLessThanOrEqual(63)
      expect(t).toBeGreaterThanOrEqual(0)
      expect(t).toBeLessThan(1)
    }
  })

  it('lays frames out from the top-left of the image (v = 1 is the top row)', () => {
    // Frame 0 is the top-left cell; point coord (0, 0) is a sprite's top-left corner.
    expect(atlasUv(0, 0, 0)).toEqual([0, 1])
    expect(atlasUv(0, 1, 1)).toEqual([0.125, 0.875])
    // Frame 63 is the bottom-right cell.
    expect(atlasUv(63, 0, 0)).toEqual([0.875, 0.125])
    expect(atlasUv(63, 1, 1)).toEqual([1, 0])
    // Frame 9: second row, second column.
    expect(atlasUv(9, 0.5, 0.5)).toEqual([0.1875, 0.8125])
  })
})
