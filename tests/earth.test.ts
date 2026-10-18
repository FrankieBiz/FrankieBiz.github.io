import { readFileSync } from 'node:fs'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { cloudDensity, isWater, nightIntensity } from '../src/assets/earthMaps'
import { validateManifest, type AssetManifest } from '../src/assets/manifest'
import { planetTextures } from '../src/scene/planetTextures'

describe('ocean mask from Blue Marble colours', () => {
  it('marks deep and shallow ocean as water', () => {
    expect(isWater(8, 22, 62)).toBe(true) // deep Pacific
    expect(isWater(22, 58, 96)).toBe(true) // shelf / bathymetry shading
    expect(isWater(3, 5, 20)).toBe(true) // base-map open ocean (sampled from the built map)
  })

  it('classifies most of the built day map\'s mid-ocean texels as water', async () => {
    // Open-ocean points (lat, lon) on the medium 2048×1024 equirect map.
    const px = (lat: number, lon: number) => [Math.round(((lon + 180) / 360) * 2048), Math.round(((90 - lat) / 180) * 1024)]
    for (const [x, y] of [px(-20, -20), px(0, -150), px(-20, 80)]) {
      const { data } = await sharp('public/assets/earth-day-medium.webp').extract({ left: x, top: y, width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true })
      expect(data[3], `alpha at ${x},${y}`).toBe(255)
    }
  })

  it('keeps land, ice and desert out of the mask', () => {
    expect(isWater(196, 164, 112)).toBe(false) // Sahara
    expect(isWater(38, 62, 30)).toBe(false) // forest
    expect(isWater(236, 240, 244)).toBe(false) // Antarctic ice
    expect(isWater(70, 72, 60)).toBe(false) // mountains / shadowed land
    expect(isWater(15, 18, 20)).toBe(false) // dark shadowed land
    expect(isWater(20, 40, 30)).toBe(false) // dense jungle
  })
})

describe('night lights from Black Marble colours', () => {
  it('drops the dark blue background to zero', () => {
    expect(nightIntensity(6, 10, 30)).toBe(0)
    expect(nightIntensity(12, 18, 48)).toBe(0)
  })

  it('keeps city lights, brightest for the brightest pixels', () => {
    const dim = nightIntensity(120, 100, 60)
    const bright = nightIntensity(255, 240, 190)
    expect(dim).toBeGreaterThan(0)
    expect(bright).toBeGreaterThan(dim)
    expect(bright).toBeLessThanOrEqual(255)
  })
})

describe('cloud density', () => {
  it('maps the grey cloud layer to 0..255 with a clean floor', () => {
    expect(cloudDensity(10)).toBe(0)
    expect(cloudDensity(255)).toBe(255)
    expect(cloudDensity(140)).toBeGreaterThan(cloudDensity(90))
  })
})

describe('planet texture selection', () => {
  it('uses NASA imagery only when day, night and clouds all loaded', () => {
    const t = { isTexture: true }
    expect(planetTextures(new Map([['earth-day', t], ['earth-night', t], ['earth-clouds', t]]))).toEqual({ day: t, night: t, clouds: t })
    expect(planetTextures(new Map([['earth-day', t], ['earth-night', t]]))).toBeNull()
    expect(planetTextures(new Map())).toBeNull()
  })
})

describe('built asset manifest', () => {
  const manifest = JSON.parse(readFileSync('public/assets/manifest.json', 'utf8')) as AssetManifest

  it('passes validation (budgets, caps, paths)', () => {
    expect(validateManifest(manifest)).toEqual([])
  })

  it('never writes fully transparent texels into the day map (WebP would discard their colour)', async () => {
    for (const tier of ['high', 'medium', 'low']) {
      // Read raw bytes: sharp's stats() ignores pipeline ops and reports the source image.
      const { data } = await sharp(`public/assets/earth-day-${tier}.webp`).extractChannel('alpha').raw().toBuffer({ resolveWithObject: true })
      let min = 255
      for (const v of data) if (v < min) min = v
      expect(min, tier).toBeGreaterThan(0)
    }
  })

  it('keeps land colour intact: the Sahara is sand, not a smeared streak', async () => {
    // lat 23°N, lon 10°E on the medium (2048×1024) map.
    const { data } = await sharp('public/assets/earth-day-medium.webp').extract({ left: 1081, top: 381, width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true })
    const [r, , b] = data
    expect(r - b).toBeGreaterThan(30)
  })

  it('ships the Earth maps at 4K / 2K / 1K', () => {
    for (const id of ['earth-day', 'earth-night', 'earth-clouds']) {
      const asset = manifest.assets.find((a) => a.id === id)
      expect(asset, id).toBeDefined()
      expect(asset!.tiers.high.width).toBe(4096)
      expect(asset!.tiers.medium.width).toBe(2048)
      expect(asset!.tiers.low.width).toBe(1024)
    }
  })
})
