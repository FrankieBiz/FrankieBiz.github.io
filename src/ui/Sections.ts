import type { Beat } from '../director/timeline'
import { scramble } from './scramble'

/**
 * Toggles `is-active` on DOM copy as the scroll position enters each beat's
 * window, decoding `[data-scramble]` text on entry. CSS handles the fades.
 *
 * All copy stays in the accessibility tree; when keyboard focus lands inside a
 * beat that isn't on screen, the page flies to it.
 */
export class Sections {
  private entries: Array<{ beat: Beat; els: HTMLElement[]; active: boolean }>

  constructor(
    beats: Beat[],
    private reduced: boolean,
    goTo: (vu: number) => void,
  ) {
    this.entries = beats.map((beat) => ({
      beat,
      els: [...document.querySelectorAll<HTMLElement>(`[data-beat="${beat.id}"]`)],
      active: false,
    }))

    document.addEventListener('focusin', (e) => {
      const host = (e.target as Element | null)?.closest<HTMLElement>('[data-beat]')
      const entry = host && this.entries.find((x) => x.els.includes(host))
      if (!entry || entry.active) return
      const { start, end } = entry.beat
      const target = Number.isFinite(end) ? (Math.max(start, 0) + end) / 2 : start + 0.5
      goTo(target)
    })
  }

  update(vu: number) {
    for (const entry of this.entries) {
      const active = vu >= entry.beat.start && vu < entry.beat.end
      if (active === entry.active) continue
      entry.active = active
      for (const el of entry.els) {
        el.classList.toggle('is-active', active)
        if (active) {
          const targets = el.matches('[data-scramble]') ? [el] : [...el.querySelectorAll<HTMLElement>('[data-scramble]')]
          targets.forEach((t, i) => scramble(t, { delay: i * 0.08, reduced: this.reduced }))
        }
      }
    }
  }
}
