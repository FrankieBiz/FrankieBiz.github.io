import { damp } from './Loop'

/** Normalized pointer (-1..1, y up) with a smoothed copy for parallax. */
export class Pointer {
  x = 0
  y = 0
  smoothX = 0
  smoothY = 0
  clientX = innerWidth / 2
  clientY = innerHeight / 2
  active = false

  constructor() {
    addEventListener('pointermove', this.handleMove, { passive: true })
    document.addEventListener('pointerleave', () => {
      this.active = false
      this.x = 0
      this.y = 0
    })
  }

  update(dt: number) {
    this.smoothX = damp(this.smoothX, this.x, 3.2, dt)
    this.smoothY = damp(this.smoothY, this.y, 3.2, dt)
  }

  private handleMove = (e: PointerEvent) => {
    this.active = true
    this.clientX = e.clientX
    this.clientY = e.clientY
    this.x = (e.clientX / innerWidth) * 2 - 1
    this.y = -((e.clientY / innerHeight) * 2 - 1)
  }
}
