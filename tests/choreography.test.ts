import { describe, expect, it } from 'vitest'
import { actIndexAt, layoutActs } from '../src/director/acts'
import { createState, warpIntensity, worldForWarp } from '../src/director/state'
import { buildTimeline, computeBeats, keyTimes } from '../src/director/timeline'

const N = 4

/** Numeric fields only — GSAP attaches an internal `_gsap` cache to tweened objects. */
function numbers(obj: object): Record<string, number> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => typeof v === 'number'))
}

function snapshot(state: ReturnType<typeof createState>) {
  return { ...numbers(state), cam: numbers(state.cam) }
}

describe('act layout', () => {
  it('stacks acts end to end and leaves one viewport of overscroll', () => {
    const layout = layoutActs(N)
    expect(layout.acts.map((a) => a.id)).toEqual(['pad', 'manifesto', 'launch', 'payloads', 'contact'])
    for (let i = 1; i < layout.acts.length; i++) {
      expect(layout.acts[i].start).toBeCloseTo(layout.acts[i - 1].end)
    }
    expect(layout.scrollable).toBeCloseTo(layout.total - 1)
  })

  it('grows the payload act with the project count', () => {
    expect(layoutActs(6).byId.payloads.length).toBeGreaterThan(layoutActs(2).byId.payloads.length)
  })

  it('finds the act at a scroll position', () => {
    const layout = layoutActs(N)
    expect(layout.acts[actIndexAt(layout, 0)].id).toBe('pad')
    expect(layout.acts[actIndexAt(layout, layout.byId.launch.start + 0.1)].id).toBe('launch')
    expect(layout.acts[actIndexAt(layout, layout.scrollable)].id).toBe('contact')
  })
})

describe('master timeline', () => {
  const layout = layoutActs(N)
  const k = keyTimes(layout, N)

  it('lasts exactly as long as the scrollable range', () => {
    const tl = buildTimeline(createState(), layout, N)
    expect(tl.duration()).toBeCloseTo(layout.scrollable, 5)
  })

  it('opens on the hero shot and ends with the contact field formed', () => {
    const state = createState()
    const tl = buildTimeline(state, layout, N)
    tl.time(0)
    expect(state.cam.pz).toBeCloseTo(21)
    expect(state.ignition).toBe(0)
    tl.time(layout.scrollable)
    expect(state.assemble).toBeCloseTo(1)
    expect(state.altKm).toBeGreaterThan(400)
  })

  it('swaps worlds at the peak of the transition', () => {
    const state = createState()
    const tl = buildTimeline(state, layout, N)
    tl.time(k.swap - 0.02)
    expect(worldForWarp(state.warp)).toBe('pad')
    expect(state.ignition).toBeCloseTo(1)
    tl.time(k.swap + 0.02)
    expect(worldForWarp(state.warp)).toBe('orbit')
    expect(state.ignition).toBe(0)
    expect(warpIntensity(0)).toBe(0)
    expect(warpIntensity(0.5)).toBeCloseTo(1)
  })

  it('is deterministic no matter how the scroll got there', () => {
    const probe = k.liftoff + 0.4
    const a = createState()
    const tlA = buildTimeline(a, layout, N)
    tlA.time(probe)

    const b = createState()
    const tlB = buildTimeline(b, layout, N)
    // A fling to the end, back to the top, then to the probe.
    tlB.time(layout.scrollable)
    tlB.time(0)
    tlB.time(k.moduleStart(2))
    tlB.time(probe)

    expect(snapshot(b)).toEqual(snapshot(a))
  })

  it('pulls focus on close-ups and keeps wide shots and the climb in deep focus', () => {
    const state = createState()
    const tl = buildTimeline(state, layout, N)
    const at = (t: number) => {
      tl.time(t)
      return state.dofAmount
    }
    expect(at(0)).toBe(0) // hero: everything sharp
    expect(at(k.manifestoStart + 1.0)).toBeGreaterThan(0.5) // crane close-up on the hull
    expect(at(k.liftoff + 0.8)).toBeLessThanOrEqual(0.2) // climb: keep the flame crisp
    expect(at(k.moduleStart(0) + 0.8)).toBeGreaterThan(0.5) // capsule dwell
    expect(at(layout.scrollable)).toBeGreaterThan(0) // contact
  })

  it('counts down before liftoff and up after it', () => {
    const state = createState()
    const tl = buildTimeline(state, layout, N)
    tl.time(k.liftoff - 0.2)
    expect(state.missionT).toBeLessThan(0)
    tl.time(k.liftoff + 0.2)
    expect(state.missionT).toBeGreaterThan(0)
  })
})

describe('copy beats', () => {
  const layout = layoutActs(N)
  const beats = computeBeats(layout, N, 3, 5)

  it('gives every manifesto line, launch caption and payload a window', () => {
    for (const id of ['manifesto-0', 'manifesto-2', 'launch-0', 'launch-4', 'payload-0', `payload-${N - 1}`, 'contact']) {
      const beat = beats.find((b) => b.id === id)
      expect(beat, id).toBeDefined()
      expect(beat!.end).toBeGreaterThan(beat!.start)
    }
  })

  it('never shows two lines of the same group at once', () => {
    for (const group of ['manifesto', 'launch', 'payload']) {
      const windows = beats.filter((b) => b.id.startsWith(`${group}-`)).sort((x, y) => x.start - y.start)
      for (let i = 1; i < windows.length; i++) {
        expect(windows[i].start, `${windows[i].id}`).toBeGreaterThanOrEqual(windows[i - 1].end)
      }
    }
  })

  it('gives every caption a window even beyond the five launch events', () => {
    const many = computeBeats(layout, N, 3, 7).filter((b) => b.id.startsWith('launch-'))
    expect(many).toHaveLength(7)
    for (const b of many) expect(b.end, b.id).toBeGreaterThan(b.start)
  })

  it('keeps the contact copy reachable at the end of the page', () => {
    const contact = beats.find((b) => b.id === 'contact')!
    expect(contact.start).toBeLessThan(layout.scrollable)
  })
})
