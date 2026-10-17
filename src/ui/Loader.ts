import gsap from 'gsap'
import { scramble } from './scramble'

/**
 * Pre-flight sequence. The counter chases real progress (fonts, scene build,
 * shader compilation) and never runs ahead of it; checklist items tick as
 * their thresholds pass.
 */
export class Loader {
  private root: HTMLElement
  private count: HTMLElement
  private status: HTMLElement
  private items: HTMLElement[]
  private shown = { p: 0 }
  private target = 0
  private started = performance.now()

  constructor(private reduced: boolean) {
    this.root = document.querySelector<HTMLElement>('.loader')!
    this.count = this.root.querySelector<HTMLElement>('.loader__count')!
    this.status = this.root.querySelector<HTMLElement>('.loader__status')!
    this.items = [...this.root.querySelectorAll<HTMLElement>('.loader__item')]
    gsap.ticker.add(this.tick)
  }

  set progress(p: number) {
    this.target = Math.max(this.target, Math.min(p, 1))
  }

  private tick = () => {
    // Chase the real target, but keep the count readable.
    this.shown.p += (this.target - this.shown.p) * 0.08
    if (this.target - this.shown.p < 0.002) this.shown.p = this.target
    const p = this.shown.p
    this.count.textContent = String(Math.round(p * 100)).padStart(3, '0')
    this.items.forEach((item, i) => {
      const threshold = (i + 1) / (this.items.length + 1)
      if (p >= threshold && !item.classList.contains('is-done')) {
        item.classList.add('is-done')
        const state = item.querySelector<HTMLElement>('.loader__state')
        if (state) {
          state.textContent = 'Go'
          scramble(state, { duration: 0.35, reduced: this.reduced })
        }
      }
    })
  }

  /** Resolves once the counter reaches 100 and the minimum dwell has passed. */
  async complete(minDuration = 1.6): Promise<void> {
    this.progress = 1
    const elapsed = (performance.now() - this.started) / 1000
    await new Promise<void>((resolve) => {
      const check = () => (this.shown.p >= 1 ? resolve() : requestAnimationFrame(check))
      setTimeout(check, Math.max(0, minDuration - elapsed) * 1000)
    })
    this.status.textContent = 'Go for launch'
    scramble(this.status, { duration: 0.5, reduced: this.reduced })
    await new Promise((r) => setTimeout(r, this.reduced ? 100 : 650))
  }

  /** Fade the loader away. */
  hide(): Promise<void> {
    gsap.ticker.remove(this.tick)
    return new Promise((resolve) => {
      gsap.to(this.root, {
        autoAlpha: 0,
        duration: this.reduced ? 0.3 : 0.9,
        ease: 'power2.inOut',
        onComplete: () => {
          this.root.remove()
          resolve()
        },
      })
    })
  }

  /** Tear down immediately (used when falling back to the static site). */
  dispose() {
    gsap.ticker.remove(this.tick)
    this.root.remove()
  }
}
