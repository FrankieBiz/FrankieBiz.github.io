import gsap from 'gsap'
import type { ActLayout } from './acts'
import { PAYLOAD_INTRO, PAYLOAD_SLOT } from './acts'
import type { CameraKey, DirectorState } from './state'
import { add, fieldPosition, modulePosition, type Vec3 } from '../scene/layout'

/**
 * All choreography lives here. The timeline is paused and its time is set to
 * the current scroll position (in viewport units) every frame, so scrubbing
 * backwards and forwards is exact. Every segment is an explicit fromTo, which
 * keeps jumps (nav links, fast flings) deterministic.
 */

type Point = [time: number, value: number, ease?: string]
type Shot = [time: number, key: CameraKey, ease?: string]

const cam = (pos: Vec3, target: Vec3, fov: number, shift = 0, roll = 0): CameraKey => ({
  px: pos[0],
  py: pos[1],
  pz: pos[2],
  tx: target[0],
  ty: target[1],
  tz: target[2],
  fov,
  roll,
  shift,
})

/** Key times derived from the act layout. Shared with the DOM beats. */
export function keyTimes(layout: ActLayout, projectCount: number) {
  const { pad, manifesto, launch, payloads, contact } = layout.byId
  const L = launch.start
  const P = payloads.start
  return {
    padEnd: pad.end,
    manifestoStart: manifesto.start,
    launchStart: L,
    armsStart: L + 0.1,
    ignitionStart: L + 0.5,
    liftoff: L + 1.0,
    maxQ: L + 1.9,
    meco: L + 2.6,
    swap: L + 3.05,
    warpStart: L + 2.75,
    warpEnd: L + 3.35,
    payloadsStart: P,
    moduleStart: (i: number) => P + PAYLOAD_INTRO + i * PAYLOAD_SLOT,
    contactStart: P + PAYLOAD_INTRO + projectCount * PAYLOAD_SLOT,
    contactActStart: contact.start,
    end: layout.scrollable,
  }
}

export function buildTimeline(state: DirectorState, layout: ActLayout, projectCount: number): gsap.core.Timeline {
  const tl = gsap.timeline({ paused: true, defaults: { ease: 'none' } })
  const k = keyTimes(layout, projectCount)

  const track = (target: object, prop: string, points: Point[]) => {
    for (let i = 0; i < points.length - 1; i++) {
      const [t0, v0] = points[i]
      const [t1, v1, ease = 'none'] = points[i + 1]
      tl.fromTo(target, { [prop]: v0 }, { [prop]: v1, duration: Math.max(t1 - t0, 0), ease, immediateRender: false }, t0)
    }
  }

  const camera = (shots: Shot[]) => {
    for (let i = 0; i < shots.length - 1; i++) {
      const [t0, a] = shots[i]
      const [t1, b, ease = 'sine.inOut'] = shots[i + 1]
      tl.fromTo(state.cam, { ...a }, { ...b, duration: Math.max(t1 - t0, 0), ease, immediateRender: false }, t0)
    }
  }

  // ---------------------------------------------------------------- camera
  const shots: Shot[] = [
    // Act 1 — pad hero: rocket splits the name, wide and low.
    [0, cam([0, 1.6, 21], [0, 6.2, 0], 34)],
    [0.25, cam([0, 1.6, 21], [0, 6.2, 0], 34)],
    [k.padEnd, cam([1.2, 2.8, 15.5], [0, 6.6, 0], 36, 0.12)],
    // Act 2 — crane up the fuselage while the manifesto plays.
    [k.manifestoStart + 0.9, cam([4.4, 5.6, 9.8], [0, 6.1, 0], 38, 0.18)],
    [k.manifestoStart + 1.8, cam([4.8, 9.9, 7.0], [0, 8.9, 0], 38, 0.18)],
    [k.launchStart, cam([2.5, 14.8, 4.8], [0, 9.6, 0], 42, 0.16, -0.04)],
    // Act 3 — pull wide for the countdown, drop low for ignition, then track the climb.
    [k.ignitionStart, cam([15, 3.6, 24], [0, 6.2, 0], 34), 'power2.inOut'],
    [k.liftoff - 0.05, cam([8.6, 1.1, 13.8], [0, 4.6, 0], 36, 0, 0.02)],
    [k.liftoff + 0.6, cam([7.5, -1.2, 14.5], [0, 6.4, 0], 38, 0, 0.03)],
    [k.swap - 0.01, cam([3.6, -7.5, 9.5], [0, 7.0, 0], 46, 0, 0.08)],
    // Orbit world — appears at the peak of the transition.
    [k.swap, cam([-23.5, 1.4, 5], [-13.5, 0.4, -6], 38), 'none'],
    [k.moduleStart(0), cam([-6, 2.8, 9], [3, 0, -3], 38), 'sine.inOut'],
  ]

  for (let i = 0; i < projectCount; i++) {
    const m = modulePosition(i)
    const t = k.moduleStart(i)
    shots.push([t + 0.45, cam(add(m, [0, 0.6, 9.4]), m, 34, 0.2), 'power2.inOut'])
    shots.push([t + PAYLOAD_SLOT, cam(add(m, [0.45, 0.45, 8.5]), m, 34, 0.2), 'none'])
  }

  const f = fieldPosition(projectCount)
  shots.push([k.contactStart + 0.6, cam(add(f, [0, 0.3, 11.5]), f, 34, 0.2), 'power2.inOut'])
  shots.push([k.end, cam(add(f, [0.5, 0.2, 10.4]), f, 34, 0.2), 'none'])
  camera(shots)

  // ------------------------------------------------------------- scalars
  track(state, 'parallax', [
    [0, 1],
    [k.padEnd, 0.6, 'sine.inOut'],
    [k.launchStart, 0.35],
    [k.liftoff, 0.08],
    [k.swap, 0.08],
    [k.swap + 0.01, 0.6],
    [k.contactStart, 0.9],
  ])

  track(state, 'hero', [
    [0.15, 1],
    [k.padEnd - 0.1, 0, 'power1.in'],
  ])

  track(state, 'fuel', [
    [k.manifestoStart, 0],
    [k.launchStart, 1, 'sine.inOut'],
  ])

  track(state, 'arms', [
    [k.armsStart, 0],
    [k.armsStart + 0.55, 1, 'power2.inOut'],
  ])

  track(state, 'ignition', [
    [k.ignitionStart, 0],
    [k.liftoff - 0.05, 1, 'power2.in'],
    [k.swap, 1],
    [k.swap + 0.001, 0],
  ])

  track(state, 'smoke', [
    [k.ignitionStart + 0.05, 0],
    [k.liftoff + 0.15, 1, 'power1.out'],
  ])

  track(state, 'thrust', [
    [k.ignitionStart, 0],
    [k.liftoff - 0.05, 0.55, 'power2.in'],
    [k.liftoff + 0.25, 1, 'power2.out'],
    [k.swap - 0.3, 0.3, 'sine.inOut'],
    [k.swap, 0.55, 'power2.in'],
    [k.swap + 0.001, 0],
  ])

  track(state, 'follow', [
    [k.liftoff + 0.05, 0],
    [k.liftoff + 0.6, 1, 'power1.inOut'],
    [k.swap, 1],
    [k.swap + 0.001, 0],
  ])

  track(state, 'altitude', [
    [k.liftoff, 0],
    [k.swap, 560, 'power2.in'],
  ])

  track(state, 'sky', [
    [k.liftoff + 0.8, 0],
    [k.swap - 0.05, 1, 'sine.inOut'],
  ])

  track(state, 'warp', [
    [k.warpStart, 0],
    [k.warpEnd, 1],
  ])

  // Payload focus: travels between modules, rests on each during its dwell.
  const focus: Point[] = [[k.payloadsStart, -1], [k.moduleStart(0), -1]]
  for (let i = 0; i < projectCount; i++) {
    const t = k.moduleStart(i)
    focus.push([t + 0.45, i, 'power2.inOut'])
    focus.push([t + PAYLOAD_SLOT, i])
  }
  focus.push([k.contactStart + 0.5, -1, 'power2.in'])
  track(state, 'focus', focus)

  track(state, 'assemble', [
    [k.contactStart + 0.1, 0],
    [k.contactStart + 0.8, 1, 'power2.out'],
  ])

  // ----------------------------------------------------------- telemetry
  track(state, 'missionT', [
    [0, -600],
    [k.launchStart, -10],
    [k.liftoff, 0],
    [k.swap, 162],
    [k.moduleStart(0), 540],
    [k.contactStart, 540 + projectCount * 720],
    [k.end, 5400],
  ])

  track(state, 'altKm', [
    [k.liftoff, 0],
    [k.swap, 104.6, 'power2.in'],
    [k.swap + 0.001, 408],
    [k.end, 412],
  ])

  track(state, 'velMs', [
    [k.liftoff, 0],
    [k.swap, 2240, 'power1.in'],
    [k.swap + 0.001, 7660],
    [k.end, 7664],
  ])

  // Make the timeline exactly as long as the scrollable range.
  tl.set({}, {}, k.end)
  return tl
}

export interface Beat {
  /** Group the beat belongs to; used to find the DOM element. */
  id: string
  start: number
  end: number
}

/** Visibility windows (in vu) for the DOM copy that decodes in as you scroll. */
export function computeBeats(
  layout: ActLayout,
  projectCount: number,
  manifestoCount: number,
  launchCount: number,
): Beat[] {
  const k = keyTimes(layout, projectCount)
  const beats: Beat[] = [
    { id: 'hero', start: -1, end: 0.3 },
    { id: 'gauge', start: k.manifestoStart + 0.05, end: k.launchStart },
    { id: 'scrim', start: k.swap + 0.1, end: Infinity },
  ]

  const mStart = k.manifestoStart + 0.15
  const mSpan = (k.launchStart - 0.15 - mStart) / manifestoCount
  for (let i = 0; i < manifestoCount; i++) {
    beats.push({ id: `manifesto-${i}`, start: mStart + i * mSpan, end: mStart + (i + 1) * mSpan - 0.12 })
  }

  const events = [k.launchStart + 0.05, k.ignitionStart, k.liftoff, k.maxQ, k.meco]
  const launchTimes =
    launchCount <= events.length
      ? events.slice(0, launchCount)
      : Array.from({ length: launchCount }, (_, i) => k.launchStart + 0.05 + (i / launchCount) * (k.warpStart - k.launchStart))
  for (let i = 0; i < launchCount; i++) {
    const start = launchTimes[i]
    const next = i + 1 < launchCount ? launchTimes[i + 1] : k.warpStart + 0.2
    beats.push({ id: `launch-${i}`, start, end: next - 0.05 })
  }

  beats.push({ id: 'payloads-intro', start: k.swap + 0.25, end: k.moduleStart(0) + 0.1 })
  for (let i = 0; i < projectCount; i++) {
    const t = k.moduleStart(i)
    beats.push({ id: `payload-${i}`, start: t + 0.35, end: t + PAYLOAD_SLOT - 0.08 })
  }
  beats.push({ id: 'contact', start: k.contactStart + 0.35, end: Infinity })
  return beats
}
