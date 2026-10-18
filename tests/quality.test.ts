import { describe, expect, it } from 'vitest'
import { BUDGETS, pickTier, type QualitySignals } from '../src/core/Quality'

const base: QualitySignals = { override: null, coarsePointer: false, viewportWidth: 1440, gpu: '' }

describe('quality tier selection', () => {
  it('honours a valid ?quality override and ignores junk', () => {
    expect(pickTier({ ...base, override: 'low', gpu: 'NVIDIA GeForce RTX 4090' })).toBe('low')
    expect(pickTier({ ...base, override: 'ultra' })).toBe('medium')
  })

  it('drops software renderers and phones to low', () => {
    expect(pickTier({ ...base, gpu: 'Google SwiftShader' })).toBe('low')
    expect(pickTier({ ...base, gpu: 'llvmpipe (LLVM 17.0.6, 256 bits)' })).toBe('low')
    expect(pickTier({ ...base, coarsePointer: true, gpu: 'Apple GPU' })).toBe('low')
    expect(pickTier({ ...base, viewportWidth: 600 })).toBe('low')
  })

  it('gives discrete and Apple silicon GPUs the high tier', () => {
    expect(pickTier({ ...base, gpu: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3070 Direct3D11)' })).toBe('high')
    expect(pickTier({ ...base, gpu: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M2 Pro)' })).toBe('high')
    expect(pickTier({ ...base, gpu: 'AMD Radeon RX 7800 XT' })).toBe('high')
  })

  it('defaults integrated or unknown GPUs to medium', () => {
    expect(pickTier({ ...base, gpu: 'Mesa Intel(R) Iris(R) Xe Graphics' })).toBe('medium')
    expect(pickTier({ ...base, gpu: '' })).toBe('medium')
  })

  it('enables ambient occlusion at full res on high, half res on medium, off on low', () => {
    expect(BUDGETS.high.ao).toBe('full')
    expect(BUDGETS.medium.ao).toBe('half')
    expect(BUDGETS.low.ao).toBe('off')
  })

  it('renders glass refraction at full res on high, half on medium, not at all on low', () => {
    // The transmission pass re-renders the scene behind glass; half res is invisible through dark glass
    // and keeps medium inside its frame budget on an iGPU (scripts/qa-gpu.mjs).
    expect(BUDGETS.high.transmission).toBe(1)
    expect(BUDGETS.medium.transmission).toBe(0.5)
    expect(BUDGETS.low.transmission).toBe(0)
  })

  it('budgets shrink monotonically from high to low', () => {
    for (const key of ['contact', 'stars', 'smoke', 'trail', 'groundFog', 'sparks', 'dprCap'] as const) {
      expect(BUDGETS.high[key]).toBeGreaterThan(BUDGETS.medium[key])
      expect(BUDGETS.medium[key]).toBeGreaterThan(BUDGETS.low[key])
    }
  })
})
