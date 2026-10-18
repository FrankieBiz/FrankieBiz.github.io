import { readFileSync } from 'node:fs'
import { LUTCubeLoader } from 'three/addons/loaders/LUTCubeLoader.js'
import { describe, expect, it } from 'vitest'
import type { AssetManifest } from '../src/assets/manifest'

// The shipped copy (byte-identical to assets-src/grade/grade.cube, which is gitignored).
const CUBE = 'public/assets/grade.cube'

describe('colour grade LUT', () => {
  const text = readFileSync(CUBE, 'utf8')
  const lut = new LUTCubeLoader().parse(text)

  it('is a valid 17³ cube that three.js can load (small enough to ship)', () => {
    expect(lut.size).toBe(17)
    expect(lut.texture3D.image.width).toBe(17)
    expect(text.length).toBeLessThan(150_000)
  })

  /** Sample the cube's raw table at grid coordinates (r fastest, as in the .cube format). */
  const rows = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => /^[0-9.\-e]+\s+[0-9.\-e]+\s+[0-9.\-e]+$/.test(l))
    .map((l) => l.split(/\s+/).map(Number))
  const N = 17
  const at = (r: number, g: number, b: number) => rows[r + g * N + b * N * N]

  it('keeps the grey ramp monotonic (no banding or inversions)', () => {
    let previous = -1
    for (let i = 0; i < N; i++) {
      const [r, g, b] = at(i, i, i)
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b
      expect(luma, `step ${i}`).toBeGreaterThan(previous)
      previous = luma
    }
  })

  it('cools the shadows and warms the highlights', () => {
    const [sr, , sb] = at(3, 3, 3)
    const [hr, , hb] = at(15, 15, 15)
    expect(sb).toBeGreaterThan(sr)
    expect(hr).toBeGreaterThan(hb)
  })

  it('stays inside 0..1', () => {
    for (const row of rows) for (const v of row) expect(v >= 0 && v <= 1).toBe(true)
  })
})

describe('grade assets in the manifest', () => {
  const manifest = JSON.parse(readFileSync('public/assets/manifest.json', 'utf8')) as AssetManifest

  it('ships the LUT and the lens-dirt texture', () => {
    const lut = manifest.assets.find((a) => a.id === 'grade-lut')
    const dirt = manifest.assets.find((a) => a.id === 'lens-dirt')
    expect(lut?.kind).toBe('lut')
    expect(dirt?.kind).toBe('texture')
    expect(dirt!.tiers.high.width).toBe(2048)
    expect(dirt!.tiers.low.width).toBe(1024)
  })
})

describe('grade asset selection', () => {
  it('extracts the LUT texture and dirt map when present, tolerating either missing', async () => {
    const { gradeAssets } = await import('../src/post/Grade')
    const lut3d = { isData3DTexture: true }
    const dirt = { isTexture: true }
    expect(gradeAssets(new Map<string, unknown>([['grade-lut', { texture3D: lut3d }], ['lens-dirt', dirt]]))).toEqual({ lut: lut3d, dirt })
    expect(gradeAssets(new Map<string, unknown>([['lens-dirt', dirt]]))).toEqual({ lut: undefined, dirt })
    expect(gradeAssets(new Map())).toEqual({ lut: undefined, dirt: undefined })
  })
})
