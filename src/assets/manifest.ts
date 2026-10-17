import type { Tier } from '../core/Quality'

/**
 * The asset manifest is written by `scripts/build-assets.mjs` to
 * `public/assets/manifest.json` with real compressed sizes. Each asset has one
 * variant per quality tier.
 */

export type AssetKind = 'texture' | 'gltf' | 'hdr' | 'lut'

export interface AssetVariant {
  url: string
  bytes: number
  /** Largest texture dimension in pixels (textures only). */
  width?: number
}

export interface AssetRecord {
  id: string
  kind: AssetKind
  /** A required asset that fails to load drops the site back to the procedural scene. */
  required: boolean
  tiers: Record<Tier, AssetVariant>
}

export interface AssetManifest {
  version: 1
  assets: AssetRecord[]
}

/** First-load download budget per tier (compressed bytes). */
export const BUDGET_BYTES: Record<Tier, number> = { high: 15_000_000, medium: 10_000_000, low: 6_000_000 }

/** Largest texture dimension allowed per tier. */
export const TEXTURE_CAP: Record<Tier, number> = { high: 4096, medium: 2048, low: 1024 }

const TIERS: Tier[] = ['high', 'medium', 'low']

export const EMPTY_MANIFEST: AssetManifest = { version: 1, assets: [] }

/** Human-readable problems; empty means the manifest ships. */
export function validateManifest(manifest: AssetManifest): string[] {
  const errors: string[] = []
  const ids = new Set<string>()
  for (const asset of manifest.assets) {
    if (ids.has(asset.id)) errors.push(`duplicate id "${asset.id}"`)
    ids.add(asset.id)
    for (const tier of TIERS) {
      const v = asset.tiers[tier]
      if (!v) {
        errors.push(`${asset.id}: missing ${tier} variant`)
        continue
      }
      if (!v.url.startsWith('assets/') || v.url.includes('..')) errors.push(`${asset.id} (${tier}): url "${v.url}" must live under assets/`)
      if (asset.kind === 'texture' && v.width !== undefined && v.width > TEXTURE_CAP[tier]) {
        errors.push(`${asset.id}: ${tier} texture is ${v.width}px, cap is ${TEXTURE_CAP[tier]}px`)
      }
    }
  }
  for (const tier of TIERS) {
    const total = manifest.assets.reduce((sum, a) => sum + (a.tiers[tier]?.bytes ?? 0), 0)
    if (total > BUDGET_BYTES[tier]) {
      errors.push(`${tier} tier is ${(total / 1e6).toFixed(1)} MB, over the ${(BUDGET_BYTES[tier] / 1e6).toFixed(0)} MB budget`)
    }
  }
  return errors
}

export interface AssetRequest {
  id: string
  kind: AssetKind
  required: boolean
  url: string
  bytes: number
}

/** The concrete files to fetch for one tier. */
export function selectTier(manifest: AssetManifest, tier: Tier): AssetRequest[] {
  return manifest.assets.map((a) => ({ id: a.id, kind: a.kind, required: a.required, url: a.tiers[tier].url, bytes: a.tiers[tier].bytes }))
}
