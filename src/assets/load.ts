import type { AssetKind, AssetRequest } from './manifest'

export interface LoadOptions {
  decode: (kind: AssetKind, buffer: ArrayBuffer, id: string) => Promise<unknown>
  fetch?: (url: string, init?: RequestInit) => Promise<Response>
  /** Called with overall byte progress in 0..1. */
  onProgress?: (progress: number) => void
  /** Abort everything if no bytes arrive for this long. */
  stallMs?: number
}

export interface LoadResult {
  /** False when any required asset failed — the caller should use its fallback. */
  ok: boolean
  assets: Map<string, unknown>
  failed: string[]
}

/**
 * Fetches assets in parallel with streamed byte progress, a stall watchdog and
 * per-asset failure isolation. Decoding is injected so this stays testable
 * without a GPU.
 */
export async function loadAssets(items: AssetRequest[], options: LoadOptions): Promise<LoadResult> {
  const { decode, onProgress, stallMs = 20_000 } = options
  const doFetch = options.fetch ?? ((url, init) => fetch(url, init))
  const assets = new Map<string, unknown>()
  const failed: string[] = []

  if (items.length === 0) {
    onProgress?.(1)
    return { ok: true, assets, failed }
  }

  const total = items.reduce((sum, i) => sum + Math.max(i.bytes, 1), 0)
  const received = new Map<string, number>()
  let reported = 0
  const report = () => {
    let sum = 0
    for (const item of items) sum += Math.min(received.get(item.id) ?? 0, Math.max(item.bytes, 1))
    const p = Math.min(sum / total, 1)
    if (p > reported) {
      reported = p
      onProgress?.(p)
    }
  }

  // Watchdog: any received bytes re-arm it; if it fires, every pending read rejects.
  const controller = new AbortController()
  let watchdog: ReturnType<typeof setTimeout> | undefined
  let rearm: () => void = () => {}
  const stalled = new Promise<never>((_, reject) => {
    rearm = () => {
      clearTimeout(watchdog)
      watchdog = setTimeout(() => {
        controller.abort()
        reject(new Error('asset download stalled'))
      }, stallMs)
    }
    rearm()
  })
  stalled.catch(() => {})

  const loadOne = async (item: AssetRequest) => {
    const response = await doFetch(item.url, { signal: controller.signal })
    if (!response.ok || !response.body) throw new Error(`${item.url}: HTTP ${response.status}`)
    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let length = 0
    for (;;) {
      const { done, value } = await Promise.race([reader.read(), stalled])
      if (done) break
      chunks.push(value)
      length += value.byteLength
      received.set(item.id, length)
      rearm()
      report()
    }
    const buffer = new Uint8Array(length)
    let offset = 0
    for (const chunk of chunks) {
      buffer.set(chunk, offset)
      offset += chunk.byteLength
    }
    received.set(item.id, Math.max(item.bytes, length))
    report()
    assets.set(item.id, await decode(item.kind, buffer.buffer, item.id))
  }

  await Promise.all(
    items.map((item) =>
      loadOne(item).catch(() => {
        failed.push(item.id)
      }),
    ),
  )
  clearTimeout(watchdog)
  onProgress?.(1)

  const ok = !items.some((i) => i.required && failed.includes(i.id))
  return { ok, assets, failed }
}
