export interface DprPolicy {
  min: number
  max: number
}

/** Frames per decision (~1 s at 60 Hz). */
const WINDOW = 60
/** Frames ignored after a change: the resize reallocates every render target and hitches. */
const SETTLE = 10
/** No raise for this many frames after a drop (~10 s): stops drop/raise flip-flopping. */
const HOLD = 600
/** Consecutive fast windows needed before a raise. */
const CALM_WINDOWS = 3
const DROP = 0.15
const RAISE = 0.1
/** Slower than ~55 fps (after trimming hitches) steps down; faster than ~59 counts as headroom. */
const SLOW = 1 / 55
const FAST = 1 / 59
/** Relative to the display's own refresh: 50 Hz panels never count as slow, 120 Hz never chase 120. */
const SLOW_VS_REFRESH = 1.1
const FAST_VS_REFRESH = 1.03

/**
 * Adaptive render resolution. Steps the pixel ratio down while frames run slow and
 * back up after sustained headroom, judged on a trimmed mean so isolated hitches
 * (GC, shader compiles, the resize itself) never trigger a change. Laptop GPUs
 * throttle under sustained load (package power limit), so this is what holds 60.
 * The display's refresh interval is learned as the fastest window's 10th-percentile
 * frame time: even a struggling GPU on vsync lands some frames on time.
 */
export class DprGovernor {
  private times: number[] = []
  private frame = 0
  private settle = 0
  private holdUntil = 0
  private calm = 0
  private refresh = Infinity

  constructor(
    public ratio: number,
    private policy: DprPolicy,
  ) {}

  /** Feed one frame's duration (seconds). Returns the new ratio when it changes, else null. */
  sample(dt: number): number | null {
    this.frame++
    if (this.settle > 0) {
      this.settle--
      return null
    }
    this.times.push(dt)
    if (this.times.length < WINDOW) return null
    const sorted = this.times.sort((a, b) => a - b)
    const kept = sorted.slice(0, Math.floor(sorted.length * 0.9))
    const avg = kept.reduce((a, b) => a + b, 0) / kept.length
    this.refresh = Math.min(this.refresh, Math.max(sorted[Math.floor(sorted.length * 0.1)], 1 / 240))
    this.times = []

    const { min, max } = this.policy
    const slow = Math.max(SLOW, this.refresh * SLOW_VS_REFRESH)
    const fast = Math.max(FAST, this.refresh * FAST_VS_REFRESH)
    let next = this.ratio
    if (avg > slow && this.ratio > min) {
      next = Math.max(min, this.ratio - DROP)
      this.holdUntil = this.frame + HOLD
      this.calm = 0
    } else if (avg < fast && this.ratio < max) {
      this.calm++
      if (this.calm >= CALM_WINDOWS && this.frame >= this.holdUntil) {
        next = Math.min(max, this.ratio + RAISE)
        this.calm = 0
      }
    } else {
      this.calm = 0
    }
    return this.apply(next)
  }

  /**
   * New bounds (the window moved to a display with another pixel ratio). Keeps the
   * hold-off and learned refresh; returns the clamped ratio if it changes, else null.
   */
  setPolicy(policy: DprPolicy): number | null {
    this.policy = policy
    return this.apply(Math.min(Math.max(this.ratio, policy.min), policy.max))
  }

  private apply(next: number): number | null {
    if (Math.abs(next - this.ratio) < 0.001) return null
    this.ratio = next
    this.settle = SETTLE
    return next
  }
}
