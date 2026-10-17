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

  it('budgets shrink monotonically from high to low', () => {
    for (const key of ['contact', 'stars', 'smoke', 'trail', 'dprCap'] as const) {
      expect(BUDGETS.high[key]).toBeGreaterThan(BUDGETS.medium[key])
      expect(BUDGETS.medium[key]).toBeGreaterThan(BUDGETS.low[key])
    }
  })
})
