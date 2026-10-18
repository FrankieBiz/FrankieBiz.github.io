/**
 * The Director state: a flat bag of numbers written only by the scroll
 * timeline and read every frame by scene systems, post-processing and HUD.
 */

export interface CameraKey {
  px: number
  py: number
  pz: number
  tx: number
  ty: number
  tz: number
  fov: number
  roll: number
  /** Framing offset as a fraction of the viewport (+ pushes the subject right on landscape, up on portrait). */
  shift: number
}

export interface DirectorState {
  cam: CameraKey
  /** 0..1 — how much the camera tracks the rocket's displacement from its pad position. */
  follow: number
  /** Pointer parallax amplitude. */
  parallax: number
  /** Visibility of the in-world name (1 on the opening shot). */
  hero: number
  /** Propellant load shown in the HUD during the manifesto (0..1). */
  fuel: number
  /** Gantry swing arms: 0 attached, 1 retracted. */
  arms: number
  /** Engine flame intensity (0..1). */
  ignition: number
  /** Launch smoke density (0..1). */
  smoke: number
  /** Thrust felt by the camera as shake (0..1). */
  thrust: number
  /** Rocket climb above the pad in world units. */
  altitude: number
  /** Night sky → space (0..1). */
  sky: number
  /** Atmosphere-exit transition progress (0..1). The world swaps at 0.5. */
  warp: number
  /** Index of the payload module in focus (fractional while travelling, -1 for none). */
  focus: number
  /** Contact particles: scattered (0) → formed (1). */
  assemble: number
  /** Depth-of-field strength (0 = deep focus). Focus follows the camera's look-at point. */
  dofAmount: number
  /** Mission clock in seconds relative to liftoff. */
  missionT: number
  /** Telemetry readouts. */
  altKm: number
  velMs: number
}

export function createState(): DirectorState {
  return {
    cam: { px: 0, py: 1.6, pz: 21, tx: 0, ty: 6.2, tz: 0, fov: 34, roll: 0, shift: 0 },
    follow: 0,
    parallax: 1,
    hero: 1,
    fuel: 0,
    arms: 0,
    ignition: 0,
    smoke: 0,
    thrust: 0,
    altitude: 0,
    sky: 0,
    warp: 0,
    focus: -1,
    assemble: 0,
    dofAmount: 0,
    missionT: -600,
    altKm: 0,
    velMs: 0,
  }
}

/** Intensity of the transition effect for a given warp progress: 0 → 1 → 0. */
export function warpIntensity(warp: number): number {
  const w = Math.min(Math.max(warp, 0), 1)
  return Math.pow(Math.sin(w * Math.PI), 1.5)
}

/** Which world is visible for a given warp progress. */
export function worldForWarp(warp: number): 'pad' | 'orbit' {
  return warp >= 0.5 ? 'orbit' : 'pad'
}
