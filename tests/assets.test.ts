import { describe, expect, it } from 'vitest'
import { selectTier, validateManifest, type AssetManifest } from '../src/assets/manifest'
import { loadAssets } from '../src/assets/load'

const variant = (url: string, bytes: number, width?: number) => ({ url, bytes, width })

function manifest(overrides: Partial<AssetManifest['assets'][number]>[] = []): AssetManifest {
  const base = {
    id: 'earth-day',
    kind: 'texture' as const,
    required: false,
    tiers: {
      high: variant('assets/earth-day-high.webp', 1_200_000, 4096),
      medium: variant('assets/earth-day-medium.webp', 500_000, 2048),
      low: variant('assets/earth-day-low.webp', 140_000, 1024),
    },
  }
  return { version: 1, assets: overrides.length ? overrides.map((o) => ({ ...base, ...o })) : [base] }
}

describe('asset manifest', () => {
  it('accepts a manifest within caps and budgets', () => {
    expect(validateManifest(manifest())).toEqual([])
  })

  it('rejects textures above the tier cap', () => {
    const m = manifest([{ tiers: { ...manifest().assets[0].tiers, low: variant('assets/x-low.webp', 1000, 2048) } }])
    expect(validateManifest(m).join('\n')).toMatch(/low.*2048.*1024/)
  })

  it('rejects tiers over the download budget', () => {
    const huge = variant('assets/huge.webp', 7_000_000, 1024)
    const m = manifest([{ id: 'a', tiers: { high: huge, medium: huge, low: huge } }])
    expect(validateManifest(m).join('\n')).toMatch(/low.*budget/)
  })

  it('rejects URLs outside assets/ and duplicate ids', () => {
    const m = manifest([{ id: 'dup' }, { id: 'dup', tiers: { ...manifest().assets[0].tiers, high: variant('../secret', 1, 1) } }])
    const errors = validateManifest(m).join('\n')
    expect(errors).toMatch(/duplicate id "dup"/)
    expect(errors).toMatch(/must live under assets\//)
  })

  it('selects the variant for a tier', () => {
    const items = selectTier(manifest(), 'medium')
    expect(items).toEqual([{ id: 'earth-day', kind: 'texture', required: false, url: 'assets/earth-day-medium.webp', bytes: 500_000 }])
  })
})

/** A fetch stand-in serving fixed bodies in chunks, or never finishing. */
function fakeFetch(files: Record<string, { status?: number; chunks?: Uint8Array[]; hang?: boolean }>) {
  return async (url: string | URL | Request) => {
    const file = files[String(url)]
    if (!file) return new Response(null, { status: 404 })
    if (file.status && file.status !== 200) return new Response(null, { status: file.status })
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        if (file.hang) return // never enqueues, never closes
        for (const chunk of file.chunks ?? []) controller.enqueue(chunk)
        controller.close()
      },
    })
    return new Response(stream, { status: 200 })
  }
}

const bytes = (n: number) => new Uint8Array(n).fill(7)
const decode = async (_kind: string, buffer: ArrayBuffer) => buffer.byteLength

describe('asset loader', () => {
  it('decodes every asset and reports progress up to 1', async () => {
    const progress: number[] = []
    const result = await loadAssets(
      [
        { id: 'a', kind: 'texture', required: true, url: 'assets/a', bytes: 300 },
        { id: 'b', kind: 'gltf', required: false, url: 'assets/b', bytes: 100 },
      ],
      {
        fetch: fakeFetch({ 'assets/a': { chunks: [bytes(100), bytes(200)] }, 'assets/b': { chunks: [bytes(100)] } }),
        decode,
        onProgress: (p) => progress.push(p),
      },
    )
    expect(result.ok).toBe(true)
    expect(result.assets.get('a')).toBe(300)
    expect(result.assets.get('b')).toBe(100)
    expect(progress.at(-1)).toBeCloseTo(1)
    for (let i = 1; i < progress.length; i++) expect(progress[i]).toBeGreaterThanOrEqual(progress[i - 1])
  })

  it('fails the load when a required asset is missing', async () => {
    const result = await loadAssets([{ id: 'a', kind: 'texture', required: true, url: 'assets/missing', bytes: 10 }], {
      fetch: fakeFetch({}),
      decode,
    })
    expect(result.ok).toBe(false)
    expect(result.failed).toEqual(['a'])
  })

  it('tolerates a missing optional asset', async () => {
    const result = await loadAssets(
      [
        { id: 'a', kind: 'texture', required: true, url: 'assets/a', bytes: 10 },
        { id: 'b', kind: 'texture', required: false, url: 'assets/missing', bytes: 10 },
      ],
      { fetch: fakeFetch({ 'assets/a': { chunks: [bytes(10)] } }), decode },
    )
    expect(result.ok).toBe(true)
    expect(result.failed).toEqual(['b'])
  })

  it('gives up on a stalled download instead of hanging', async () => {
    const started = Date.now()
    const result = await loadAssets([{ id: 'a', kind: 'texture', required: true, url: 'assets/a', bytes: 10 }], {
      fetch: fakeFetch({ 'assets/a': { hang: true } }),
      decode,
      stallMs: 60,
    })
    expect(result.ok).toBe(false)
    expect(Date.now() - started).toBeLessThan(2000)
  })

  it('treats a decode error as a failed asset', async () => {
    const result = await loadAssets([{ id: 'a', kind: 'texture', required: true, url: 'assets/a', bytes: 4 }], {
      fetch: fakeFetch({ 'assets/a': { chunks: [bytes(4)] } }),
      decode: async () => {
        throw new Error('corrupt')
      },
    })
    expect(result.ok).toBe(false)
  })

  it('resolves immediately with nothing to load', async () => {
    const progress: number[] = []
    const result = await loadAssets([], { fetch: fakeFetch({}), decode, onProgress: (p) => progress.push(p) })
    expect(result.ok).toBe(true)
    expect(progress).toEqual([1])
  })
})
