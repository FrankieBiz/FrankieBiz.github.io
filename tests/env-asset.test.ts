import { readFileSync } from 'node:fs'
import { FloatType } from 'three'
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js'
import { describe, expect, it } from 'vitest'

// Must match tools/blender/environment.py and src/scene/LaunchPad.ts.
const PROBE = [0, 6, 0]
const FLOODS: Array<[number, number]> = [
  [12.5, 9.5],
  [-13, 7.5],
  [11, -11],
  [-9.5, -12.5],
]
const FLOOD_HEAD_Y = 9.1

function load(tier: string) {
  const buffer = readFileSync(`assets-src/blender/env-pad-${tier}.hdr`)
  const loader = new HDRLoader().setDataType(FloatType)
  const parsed = loader.parse(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength))
  const width = parsed.width ?? 0
  const height = parsed.height ?? 0
  const data = parsed.data
  const lum = (col: number, row: number) => {
    const i = (row * width + ((col + width) % width)) * 4
    const d = data as Float32Array
    return 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]
  }
  const peak = (col: number, row: number, r: number) => {
    let max = 0
    for (let y = row - r; y <= row + r; y++) for (let x = col - r; x <= col + r; x++) max = Math.max(max, lum(x, y))
    return max
  }
  return { width, height, lum, peak }
}

/** Pixel for a world direction in three.js's equirect layout (row 0 = top). */
function pixel(dir: [number, number, number], width: number, height: number) {
  const len = Math.hypot(...dir)
  const [x, y, z] = dir.map((v) => v / len)
  const u = Math.atan2(z, x) / (2 * Math.PI) + 0.5
  const v = Math.asin(y) / Math.PI + 0.5
  return { col: Math.floor(u * width), row: Math.floor((1 - v) * height) }
}

describe('pad environment map', () => {
  for (const [tier, size, bright] of [
    ['high', 1024, 2],
    ['medium', 512, 1],
    ['low', 512, 1],
  ] as const) {
    it(`${tier}: is a ${size}×${size / 2} equirect with the floodlamps where the site has them`, () => {
      const env = load(tier)
      expect(env.width).toBe(size)
      expect(env.height).toBe(size / 2)
      const r = Math.ceil(size / 128)
      for (const [x, z] of FLOODS) {
        const { col, row } = pixel([x - PROBE[0], FLOOD_HEAD_Y - PROBE[1], z - PROBE[2]], env.width, env.height)
        expect(env.peak(col, row, r), `flood (${x}, ${z})`).toBeGreaterThan(bright)
        // Nothing comparable at the mirrored azimuth: catches a flipped layout.
        expect(env.peak(env.width - 1 - col, row, 1), `mirror of (${x}, ${z})`).toBeLessThan(bright / 4)
      }
    })
  }

  it('is darker at the zenith than along the horizon', () => {
    const env = load('high')
    let zenith = 0
    let horizon = 0
    for (let col = 0; col < env.width; col++) {
      zenith += env.lum(col, 2)
      horizon += env.lum(col, env.height / 2 - 4)
    }
    expect(zenith).toBeLessThan(horizon)
  })
})
