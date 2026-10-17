import Lenis from 'lenis'
import { damp } from './Loop'

/**
 * Scroll position expressed in viewport units (vu). Lenis smooths wheel input
 * on desktop; touch and reduced-motion use native scrolling with light damping
 * so the scene never stutters behind the finger.
 */
export class Scroll {
  vu = 0
  private lenis: Lenis | null = null
  private unitPx = innerHeight
  private probe: HTMLElement

  constructor(private reducedMotion: boolean) {
    this.probe = document.createElement('div')
    this.probe.setAttribute('aria-hidden', 'true')
    this.probe.style.cssText = 'position:absolute;top:0;left:0;width:1px;height:100svh;pointer-events:none;visibility:hidden'
    document.body.appendChild(this.probe)
    this.measure()
    addEventListener('resize', this.measure)

    if (!reducedMotion) {
      this.lenis = new Lenis({ lerp: 0.085, wheelMultiplier: 0.85, smoothWheel: true, autoRaf: false })
    }
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual'
  }

  get unit() {
    return this.unitPx
  }

  update(dt: number) {
    // Lenis needs the real clock: the loop's dt is capped, which would slow
    // every scroll animation down on devices running under 20fps.
    this.lenis?.raf(performance.now())
    const y = this.lenis ? this.lenis.scroll : scrollY
    const target = y / this.unitPx
    // Lenis already interpolates wheel input; damp lightly for native/touch input.
    this.vu = this.lenis?.isSmooth ? target : damp(this.vu, target, 14, dt)
    if (Math.abs(this.vu - target) < 1e-4) this.vu = target
  }

  lock() {
    this.lenis?.stop()
    document.documentElement.classList.add('is-locked')
  }

  unlock() {
    this.lenis?.start()
    document.documentElement.classList.remove('is-locked')
  }

  /** Fly to a scroll position in vu. Longer distances take longer, like a real trajectory. */
  toVu(vu: number) {
    const y = vu * this.unitPx
    if (this.lenis) {
      const distance = Math.abs(vu - this.vu)
      const duration = Math.min(1.2 + distance * 0.35, 4.2)
      this.lenis.scrollTo(y, { duration, easing: (t) => (t < 0.5 ? 8 * t ** 4 : 1 - (-2 * t + 2) ** 4 / 2) })
    } else {
      scrollTo({ top: y, behavior: this.reducedMotion ? 'auto' : 'smooth' })
    }
  }

  /** Jump instantly to a scroll position in vu. */
  jumpTo(vu: number) {
    const y = vu * this.unitPx
    if (this.lenis) this.lenis.scrollTo(y, { immediate: true, force: true })
    else scrollTo(0, y)
    this.vu = vu
  }

  jumpToTop() {
    this.jumpTo(0)
  }

  private measure = () => {
    const keep = this.vu
    const previous = this.unitPx
    this.unitPx = this.probe.getBoundingClientRect().height || innerHeight
    // Section heights scale with the viewport; keep the visitor at the same
    // point of the story rather than the same pixel offset.
    if (Math.abs(previous - this.unitPx) > 0.5) {
      this.lenis?.resize()
      this.jumpTo(keep)
    }
  }
}
