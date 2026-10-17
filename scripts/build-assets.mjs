// Builds shipped assets from assets-src/ into public/assets/ — one variant per
// quality tier — and writes public/assets/manifest.json with real sizes.
// Sources that don't exist yet are skipped, so the pipeline grows task by task.
// Usage: npm run assets
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import sharp from 'sharp'
import { validateManifest } from '../src/assets/manifest.ts'

const SRC = 'assets-src'
const OUT = 'public/assets'
const TIERS = ['high', 'medium', 'low']

/**
 * Asset definitions. `width` is the target texture width per tier.
 * Kinds: texture (image → WebP), gltf (GLB → meshopt + WebP), hdr (pre-rendered
 * per tier by Blender), lut (.cube, same file for every tier).
 */
export const ASSETS = [
  // Added by later tasks (NASA Earth, grade LUT, lens dirt, Blender models, smoke).
]

const kb = (n) => `${(n / 1024).toFixed(0)} KB`

async function buildTexture(asset, tier) {
  const width = asset.width[tier]
  const out = join(OUT, `${asset.id}-${tier}.webp`)
  const image = sharp(join(SRC, asset.src), { limitInputPixels: false }).resize({ width, withoutEnlargement: true })
  if (asset.alpha) image.ensureAlpha()
  await image.webp({ quality: asset.quality ?? 82, alphaQuality: 90, effort: 6 }).toFile(out)
  const meta = await sharp(out).metadata()
  return { url: `assets/${basename(out)}`, bytes: statSync(out).size, width: Math.max(meta.width ?? 0, meta.height ?? 0) }
}

function buildGltf(asset, tier) {
  const out = join(OUT, `${asset.id}-${tier}.glb`)
  execFileSync(
    'npx',
    ['gltf-transform', 'optimize', join(SRC, asset.src), out, '--compress', 'meshopt', '--texture-compress', 'webp', '--texture-size', String(asset.width[tier])],
    { stdio: 'pipe' },
  )
  return { url: `assets/${basename(out)}`, bytes: statSync(out).size }
}

function copyPerTier(asset, tier) {
  const src = join(SRC, asset.src.replace('{tier}', tier))
  const out = join(OUT, basename(src))
  copyFileSync(src, out)
  return { url: `assets/${basename(out)}`, bytes: statSync(out).size }
}

const sourceExists = (asset) => existsSync(join(SRC, asset.src.replace('{tier}', 'high')))

async function main() {
  rmSync(OUT, { recursive: true, force: true })
  mkdirSync(OUT, { recursive: true })
  const manifest = { version: 1, assets: [] }
  for (const asset of ASSETS) {
    if (!sourceExists(asset)) {
      console.warn(`skip ${asset.id}: ${join(SRC, asset.src)} not found`)
      continue
    }
    const tiers = {}
    for (const tier of TIERS) {
      tiers[tier] =
        asset.kind === 'texture' ? await buildTexture(asset, tier) : asset.kind === 'gltf' ? buildGltf(asset, tier) : copyPerTier(asset, tier)
    }
    manifest.assets.push({ id: asset.id, kind: asset.kind, required: asset.required ?? false, tiers })
  }

  writeFileSync(join(OUT, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)

  console.log('\nasset            high       medium     low')
  for (const a of manifest.assets) console.log(`${a.id.padEnd(16)} ${TIERS.map((t) => kb(a.tiers[t].bytes).padStart(9)).join('  ')}`)
  const totals = TIERS.map((t) => manifest.assets.reduce((s, a) => s + a.tiers[t].bytes, 0))
  console.log(`${'total'.padEnd(16)} ${totals.map((b) => kb(b).padStart(9)).join('  ')}`)
  console.log(`files: ${readdirSync(OUT).length}`)

  const errors = validateManifest(manifest)
  if (errors.length) {
    console.error(`\nmanifest invalid:\n  ${errors.join('\n  ')}`)
    process.exit(1)
  }
}

await main()
