import { describe, expect, it } from 'vitest'
import { within } from '../src/core/within'

describe('within', () => {
  it('resolves to the value when it arrives in time', async () => {
    await expect(within(Promise.resolve(7), 50, 0)).resolves.toBe(7)
  })

  it('falls back when the promise stalls', async () => {
    const stalled = new Promise<number>(() => {})
    await expect(within(stalled, 20, -1)).resolves.toBe(-1)
  })

  it('falls back when the promise rejects (a chunk that fails to load)', async () => {
    await expect(within(Promise.reject(new Error('net::ERR_FAILED')), 50, null)).resolves.toBeNull()
  })

  it('ignores a rejection that lands after the timeout', async () => {
    let fail!: (e: Error) => void
    const late = new Promise<number>((_, reject) => (fail = reject))
    await expect(within(late, 10, 0)).resolves.toBe(0)
    fail(new Error('too late')) // must not surface as an unhandled rejection
    await new Promise((r) => setTimeout(r, 10))
  })
})
