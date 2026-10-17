import gsap from 'gsap'

export type Tick = (dt: number, time: number) => void

/**
 * The single animation loop. Rides GSAP's ticker so tweens, Lenis and the
 * renderer all advance on the same requestAnimationFrame.
 */
export class Loop {
  private ticks: Tick[] = []
  private time = 0

  add(tick: Tick) {
    this.ticks.push(tick)
  }

  start() {
    gsap.ticker.lagSmoothing(0)
    gsap.ticker.add(this.frame)
  }

  private frame = (_time: number, deltaMs: number) => {
    const dt = Math.min(deltaMs / 1000, 1 / 20)
    this.time += dt
    for (const tick of this.ticks) tick(dt, this.time)
  }
}

/** Frame-rate independent exponential smoothing. */
export function damp(current: number, target: number, lambda: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-lambda * dt))
}
