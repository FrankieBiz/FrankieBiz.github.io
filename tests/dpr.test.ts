import { describe, expect, it } from 'vitest'
import { DprGovernor } from '../src/core/dpr'

/** Feed `seconds` of frames at `fps` (with an optional 200 ms hitch every `spikeEvery` frames). */
function run(g: DprGovernor, fps: number, seconds: number, spikeEvery = 0) {
  const changes: Array<{ frame: number; ratio: number }> = []
  const frames = Math.round(seconds * 60)
  for (let i = 0; i < frames; i++) {
    const dt = spikeEvery && i % spikeEvery === spikeEvery - 1 ? 0.2 : 1 / fps
    const next = g.sample(dt)
    if (next !== null) changes.push({ frame: i, ratio: next })
  }
  return changes
}

/** Feed frames at `fps` until the governor changes the ratio (or `limit` frames pass). */
function runUntilChange(g: DprGovernor, fps: number, limit = 600) {
  for (let i = 0; i < limit; i++) if (g.sample(1 / fps) !== null) return i
  return -1
}

const policy = { min: 0.85, max: 1.5 }

describe('DPR governor', () => {
  it('leaves a steady 60 fps alone', () => {
    const g = new DprGovernor(1.5, policy)
    expect(run(g, 60, 30)).toEqual([])
    expect(g.ratio).toBe(1.5)
  })

  it('steps down when frames run below ~55 fps, not only below 45', () => {
    const g = new DprGovernor(1.5, policy)
    expect(runUntilChange(g, 50)).toBeGreaterThan(0)
    expect(g.ratio).toBeCloseTo(1.35)
  })

  it('keeps stepping down while still slow, never below the floor', () => {
    const g = new DprGovernor(1.5, policy)
    run(g, 20, 60)
    expect(g.ratio).toBeCloseTo(0.85)
  })

  it('ignores isolated hitches (GC, shader compiles)', () => {
    const g = new DprGovernor(1.5, policy)
    expect(run(g, 60, 30, 120)).toEqual([])
  })

  it('ignores the resize hitch right after a change, so one drop does not cascade', () => {
    const g = new DprGovernor(1.5, policy)
    runUntilChange(g, 50)
    expect(g.ratio).toBeCloseTo(1.35)
    // Reallocating every render target costs one long frame; the lower resolution then holds 60.
    g.sample(0.19)
    expect(run(g, 60, 5)).toEqual([])
    expect(g.ratio).toBeCloseTo(1.35)
  })

  it('waits ~10 s after a drop before trying a higher resolution again', () => {
    const g = new DprGovernor(1.5, policy)
    runUntilChange(g, 50)
    const changes = run(g, 60, 30)
    expect(changes[0].ratio).toBeCloseTo(1.45)
    expect(changes[0].frame).toBeGreaterThanOrEqual(600)
    // Sustained headroom earns the full resolution back.
    expect(g.ratio).toBeCloseTo(1.5)
  })

  it('needs sustained headroom to raise, not the odd fast second', () => {
    const g = new DprGovernor(1.2, policy)
    // Alternate fast and borderline seconds: never three calm windows in a row.
    for (let s = 0; s < 20; s++) run(g, s % 2 ? 60 : 57, 1)
    expect(g.ratio).toBeCloseTo(1.2)
  })

  it('never exceeds the cap', () => {
    const g = new DprGovernor(1.2, policy)
    run(g, 60, 120)
    expect(g.ratio).toBeCloseTo(1.5)
  })
})
