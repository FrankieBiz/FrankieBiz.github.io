/** Telemetry formatting — pure functions, unit tested. */

const pad = (n: number, width = 2) => String(Math.floor(n)).padStart(width, '0')

/** Mission clock relative to liftoff: T−00:10:00 before, T+00:02:42 after. */
export function formatClock(seconds: number): string {
  const sign = seconds < 0 ? '−' : '+'
  const s = Math.abs(Math.round(seconds))
  return `T${sign}${pad(s / 3600)}:${pad((s % 3600) / 60)}:${pad(s % 60)}`
}

export function formatAltitude(km: number): string {
  return `${Math.max(km, 0).toFixed(1).padStart(5, '0')}\u00a0km`
}

export function formatVelocity(ms: number): string {
  return `${String(Math.round(Math.max(ms, 0))).padStart(4, '0')}\u00a0m/s`
}

export function formatPercent(v: number): string {
  return `${Math.round(Math.min(Math.max(v, 0), 1) * 100)}%`
}
