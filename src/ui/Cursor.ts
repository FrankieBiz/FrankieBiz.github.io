import { damp } from '../core/Loop'
import type { Pointer } from '../core/Pointer'

/** Crosshair reticle for fine pointers; widens over interactive elements. */
export class Cursor {
  private el: HTMLElement | null
  private x = innerWidth / 2
  private y = innerHeight / 2

  constructor(private pointer: Pointer) {
    this.el = matchMedia('(pointer: fine)').matches ? document.querySelector<HTMLElement>('.cursor') : null
    if (!this.el) return
    document.documentElement.classList.add('has-cursor')
    document.addEventListener('pointerover', (e) => {
      const hit = (e.target as Element | null)?.closest('a, button, [data-cursor]')
      this.el!.classList.toggle('is-hover', !!hit)
    })
    document.addEventListener('pointerdown', () => this.el!.classList.add('is-down'))
    document.addEventListener('pointerup', () => this.el!.classList.remove('is-down'))
  }

  update(dt: number) {
    if (!this.el) return
    this.x = damp(this.x, this.pointer.clientX, 22, dt)
    this.y = damp(this.y, this.pointer.clientY, 22, dt)
    this.el.style.transform = `translate3d(${this.x.toFixed(1)}px, ${this.y.toFixed(1)}px, 0)`
    this.el.classList.toggle('is-visible', this.pointer.active)
  }
}
