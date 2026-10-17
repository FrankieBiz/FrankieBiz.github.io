import { actIndexAt, type ActLayout } from '../director/acts'
import type { DirectorState } from '../director/state'
import { formatAltitude, formatClock, formatPercent, formatVelocity } from './format'

/** Fixed HUD: telemetry readouts, act index, progress rail and fuel gauge. */
export class Hud {
  private alt = document.querySelector<HTMLElement>('[data-telemetry="alt"]')!
  private vel = document.querySelector<HTMLElement>('[data-telemetry="vel"]')!
  private clock = document.querySelector<HTMLElement>('[data-telemetry="clock"]')!
  private actIndex = document.querySelector<HTMLElement>('.hud__act-index')!
  private actLabel = document.querySelector<HTMLElement>('.hud__act-label')!
  private rail = document.querySelector<HTMLElement>('.hud__rail-fill')!
  private gaugeFill = document.querySelector<HTMLElement>('.gauge__fill')
  private gaugeValue = document.querySelector<HTMLElement>('.gauge__value')
  private navLinks = [...document.querySelectorAll<HTMLAnchorElement>('[data-nav]')]
  private cache = new Map<HTMLElement, string>()
  private lastAct = -1

  constructor(private layout: ActLayout) {}

  private set(el: HTMLElement | null, text: string) {
    if (!el || this.cache.get(el) === text) return
    this.cache.set(el, text)
    el.textContent = text
  }

  update(state: DirectorState, vu: number) {
    this.set(this.alt, formatAltitude(state.altKm))
    this.set(this.vel, formatVelocity(state.velMs))
    this.set(this.clock, formatClock(state.missionT))

    const i = actIndexAt(this.layout, vu)
    if (i !== this.lastAct) {
      this.lastAct = i
      const act = this.layout.acts[i]
      this.set(this.actIndex, `${String(i + 1).padStart(2, '0')} / ${String(this.layout.acts.length).padStart(2, '0')}`)
      this.set(this.actLabel, act.label)
      for (const link of this.navLinks) {
        // An empty aria-current value means "false" to assistive tech.
        if (link.dataset.nav === act.id) link.setAttribute('aria-current', 'location')
        else link.removeAttribute('aria-current')
      }
    }
    const progress = Math.min(Math.max(vu / this.layout.scrollable, 0), 1)
    this.rail.style.transform = `scaleX(${progress.toFixed(4)})`

    if (this.gaugeFill && this.gaugeValue) {
      this.gaugeFill.style.transform = `scaleX(${state.fuel.toFixed(4)})`
      this.set(this.gaugeValue, formatPercent(state.fuel))
    }
  }
}
