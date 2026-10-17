/**
 * Text decode effect. Characters resolve roughly left to right; unresolved
 * characters cycle through glyphs of the same class (upper, lower, digit) so
 * proportional text keeps a stable width while it decodes.
 */

const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const LOWER = 'abcdefghijklmnopqrstuvwxyz'
const DIGIT = '0123456789'
const SYMBOL = '#%&*+-/<=>?'

export function glyphPool(ch: string): string | null {
  if (/\s/.test(ch)) return null
  if (ch >= 'A' && ch <= 'Z') return UPPER
  if (ch >= 'a' && ch <= 'z') return LOWER
  if (ch >= '0' && ch <= '9') return DIGIT
  if (/[.,:;'’"!?()\-–—]/.test(ch)) return null
  return ch.toUpperCase() !== ch.toLowerCase() ? (ch === ch.toUpperCase() ? UPPER : LOWER) : SYMBOL
}

/** Per-character reveal thresholds in 0..1, biased left to right. */
export function revealThresholds(length: number, rand: () => number): number[] {
  const out: number[] = []
  for (let i = 0; i < length; i++) {
    const order = length > 1 ? i / (length - 1) : 0
    out.push(Math.min(order * 0.65 + rand() * 0.35, 1))
  }
  return out
}

/** The text at `progress` (0..1). At 1 it always equals `final`. */
export function scrambleFrame(final: string, progress: number, thresholds: number[], rand: () => number): string {
  if (progress >= 1) return final
  let out = ''
  for (let i = 0; i < final.length; i++) {
    const ch = final[i]
    const pool = glyphPool(ch)
    if (!pool || progress >= thresholds[i]) out += ch
    else out += pool[Math.floor(rand() * pool.length)]
  }
  return out
}

const running = new WeakMap<HTMLElement, number>()

export interface ScrambleOptions {
  duration?: number
  delay?: number
  reduced?: boolean
}

/**
 * Decode an element's text. The final text is read from `data-text`
 * (captured on first run) so repeated calls never scramble garbage.
 */
export function scramble(el: HTMLElement, { duration, delay = 0, reduced = false }: ScrambleOptions = {}) {
  const final = (el.dataset.text ??= el.textContent ?? '')
  const prev = running.get(el)
  if (prev) cancelAnimationFrame(prev)
  if (reduced || !final) {
    el.textContent = final
    return
  }
  const total = duration ?? Math.min(0.45 + final.length * 0.012, 1.3)
  const thresholds = revealThresholds(final.length, Math.random)
  const start = performance.now() + delay * 1000
  let lastSwap = 0
  el.textContent = scrambleFrame(final, 0, thresholds, Math.random)

  const step = (now: number) => {
    const p = (now - start) / (total * 1000)
    if (p >= 1) {
      el.textContent = final
      running.delete(el)
      return
    }
    // Swap glyphs at ~30fps — faster reads as noise, slower as lag.
    if (p >= 0 && now - lastSwap > 33) {
      el.textContent = scrambleFrame(final, p, thresholds, Math.random)
      lastSwap = now
    }
    running.set(el, requestAnimationFrame(step))
  }
  running.set(el, requestAnimationFrame(step))
}
