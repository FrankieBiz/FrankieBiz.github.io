import { describe, expect, it } from 'vitest'
import { formatAltitude, formatClock, formatPercent, formatVelocity } from '../src/ui/format'

describe('telemetry formatting', () => {
  it('formats the mission clock around liftoff', () => {
    expect(formatClock(-600)).toBe('T−00:10:00')
    expect(formatClock(-10)).toBe('T−00:00:10')
    expect(formatClock(0)).toBe('T+00:00:00')
    expect(formatClock(162)).toBe('T+00:02:42')
    expect(formatClock(5400)).toBe('T+01:30:00')
  })

  it('pads altitude and velocity to stable widths', () => {
    expect(formatAltitude(0)).toBe('000.0\u00a0km')
    expect(formatAltitude(104.63)).toBe('104.6\u00a0km')
    expect(formatAltitude(-3)).toBe('000.0\u00a0km')
    expect(formatVelocity(21.4)).toBe('0021\u00a0m/s')
    expect(formatVelocity(7660)).toBe('7660\u00a0m/s')
  })

  it('clamps percentages', () => {
    expect(formatPercent(0.094)).toBe('9%')
    expect(formatPercent(1.4)).toBe('100%')
    expect(formatPercent(-1)).toBe('0%')
  })
})
