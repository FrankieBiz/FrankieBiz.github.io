import { describe, expect, it } from 'vitest'
import { glyphPool, revealThresholds, scrambleFrame } from '../src/ui/scramble'
import { mulberry32 } from '../src/scene/textures'

describe('scramble', () => {
  it('keeps whitespace and punctuation unscrambled', () => {
    expect(glyphPool(' ')).toBeNull()
    expect(glyphPool(',')).toBeNull()
    expect(glyphPool('—')).toBeNull()
  })

  it('maps letters and digits to same-class pools', () => {
    expect(glyphPool('A')).toMatch(/^[A-Z]+$/)
    expect(glyphPool('q')).toMatch(/^[a-z]+$/)
    expect(glyphPool('7')).toMatch(/^[0-9]+$/)
  })

  it('always resolves to the final text at progress 1', () => {
    const text = 'Payload 01 of 04'
    const t = revealThresholds(text.length, mulberry32(1))
    expect(scrambleFrame(text, 1, t, mulberry32(2))).toBe(text)
  })

  it('preserves length, spacing and character classes mid-decode', () => {
    const text = 'Open a channel, 2026'
    const rand = mulberry32(3)
    const t = revealThresholds(text.length, rand)
    const frame = scrambleFrame(text, 0.2, t, rand)
    expect(frame).toHaveLength(text.length)
    for (let i = 0; i < text.length; i++) {
      const pool = glyphPool(text[i])
      if (!pool) expect(frame[i]).toBe(text[i])
      else expect(pool).toContain(frame[i])
    }
  })

  it('reveal thresholds stay within 0..1 and trend left to right', () => {
    const t = revealThresholds(40, mulberry32(4))
    expect(Math.min(...t)).toBeGreaterThanOrEqual(0)
    expect(Math.max(...t)).toBeLessThanOrEqual(1)
    const firstHalf = t.slice(0, 20).reduce((a, b) => a + b, 0)
    const secondHalf = t.slice(20).reduce((a, b) => a + b, 0)
    expect(firstHalf).toBeLessThan(secondHalf)
  })
})
