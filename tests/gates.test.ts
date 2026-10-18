import { describe, expect, it } from 'vitest'
import { heatIntensity, shaftsEnabled } from '../src/post/gates'

describe('engine effect gates', () => {
  const base = { ignition: 1, orbit: false, reduced: false, tier: 'high' as const }

  it('shimmers with the engine on the pad', () => {
    expect(heatIntensity(base)).toBe(1)
    expect(heatIntensity({ ...base, ignition: 0.4 })).toBeCloseTo(0.4)
  })

  it('never shimmers in orbit, on the low tier or under reduced motion', () => {
    expect(heatIntensity({ ...base, orbit: true })).toBe(0)
    expect(heatIntensity({ ...base, tier: 'low' })).toBe(0)
    expect(heatIntensity({ ...base, reduced: true })).toBe(0)
  })

  it('runs light shafts only while the engine burns on the pad, above the low tier', () => {
    expect(shaftsEnabled(base)).toBe(true)
    expect(shaftsEnabled({ ...base, ignition: 0 })).toBe(false)
    expect(shaftsEnabled({ ...base, orbit: true })).toBe(false)
    expect(shaftsEnabled({ ...base, tier: 'low' })).toBe(false)
    // Shafts are light, not motion: they stay under reduced motion.
    expect(shaftsEnabled({ ...base, reduced: true })).toBe(true)
  })
})
