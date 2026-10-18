import { PerspectiveCamera, Vector3 } from 'three'
import type { Pointer } from '../core/Pointer'
import type { DirectorState } from '../director/state'

/**
 * Turns the Director's camera key into the final camera: rocket follow,
 * pointer parallax, idle drift, thrust shake, portrait dolly and framing
 * shift (via a view offset, so composition changes without moving the lens).
 */
export class CameraRig {
  readonly camera: PerspectiveCamera
  private pos = new Vector3()
  private target = new Vector3()
  private offset = new Vector3()
  private width = innerWidth
  private height = innerHeight
  private lastFov = 0
  private lastShift = NaN

  constructor(private reducedMotion: boolean) {
    this.camera = new PerspectiveCamera(34, innerWidth / innerHeight, 0.1, 2500)
  }

  resize(width: number, height: number) {
    this.width = width
    this.height = height
    this.camera.aspect = width / height
    this.lastShift = NaN
    this.camera.updateProjectionMatrix()
  }

  get aspect() {
    return this.width / this.height
  }

  /** The point the camera is looking at this frame (after rocket follow) — the focus target. */
  get focusPoint(): Vector3 {
    return this.target
  }

  /** `minY` keeps the camera above the ground in the pad world. */
  update(time: number, state: DirectorState, pointer: Pointer, follow: Vector3, minY = -Infinity) {
    const c = state.cam
    this.pos.set(c.px, c.py, c.pz)
    this.target.set(c.tx, c.ty, c.tz)

    // Portrait screens: pull back horizontally so tall subjects still fit,
    // keeping the camera's height (a straight dolly would sink it underground).
    const aspect = this.aspect
    if (aspect < 1) {
      const k = 1 + (1 - aspect) * 0.95
      this.pos.x = this.target.x + (this.pos.x - this.target.x) * k
      this.pos.z = this.target.z + (this.pos.z - this.target.z) * k
    }

    this.offset.copy(follow).multiplyScalar(state.follow)
    this.pos.add(this.offset)
    this.target.add(this.offset)

    const motion = this.reducedMotion ? 0 : 1
    const par = state.parallax * motion
    this.pos.x += pointer.smoothX * 0.9 * par
    this.pos.y += pointer.smoothY * 0.45 * par
    this.pos.x += Math.sin(time * 0.13) * 0.12 * motion
    this.pos.y += Math.sin(time * 0.17 + 1.3) * 0.08 * motion

    const shake = state.thrust * state.ignition * motion
    let roll = c.roll
    if (shake > 0.001) {
      const s = shake * 0.07
      this.pos.x += (Math.sin(time * 47.1) + Math.sin(time * 23.7) * 0.6) * s
      this.pos.y += (Math.sin(time * 53.3) + Math.sin(time * 19.1) * 0.6) * s
      roll += Math.sin(time * 31.9) * s * 0.06
    }

    this.pos.y = Math.max(this.pos.y, minY)
    this.camera.position.copy(this.pos)
    this.camera.lookAt(this.target)
    if (roll !== 0) this.camera.rotateZ(roll)

    const fov = c.fov
    const shift = c.shift
    if (Math.abs(fov - this.lastFov) > 1e-3 || Math.abs(shift - this.lastShift) > 1e-4 || Number.isNaN(this.lastShift)) {
      this.camera.fov = fov
      const w = this.width
      const h = this.height
      if (aspect >= 1) this.camera.setViewOffset(w, h, -shift * w, 0, w, h)
      else this.camera.setViewOffset(w, h, 0, Math.min(Math.abs(shift), 0.22) * 0.9 * h, w, h)
      this.camera.updateProjectionMatrix()
      this.lastFov = fov
      this.lastShift = shift
    }
  }
}
