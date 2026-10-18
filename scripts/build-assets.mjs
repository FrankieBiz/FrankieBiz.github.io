// Builds shipped assets from assets-src/ into public/assets/ — one variant per
// quality tier — and writes public/assets/manifest.json with real sizes.
// Sources that don't exist yet are skipped, so the pipeline grows task by task.
// Usage: npm run assets
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import sharp from 'sharp'
import { cloudDensity, isWater, nightIntensity } from '../src/assets/earthMaps.ts'
import { validateManifest } from '../src/assets/manifest.ts'

const SRC = 'assets-src'
const OUT = 'public/assets'
const TIERS = ['high', 'medium', 'low']

/**
 * Asset definitions. `width` is the target texture width per tier.
 * Kinds: texture (image → WebP), gltf (GLB → meshopt + WebP), hdr (pre-rendered
 * per tier by Blender), lut (.cube, same file for every tier).
 */
const EARTH = { high: 4096, medium: 2048, low: 1024 }
export const ASSETS = [
  // NASA Earth (optional: the planet falls back to its procedural bake). Fetch with npm run assets:fetch.
  { id: 'earth-day', kind: 'texture', src: 'nasa/day/world.200407.3x5400x2700.jpg', width: EARTH, transform: 'earth-day', quality: 86 },
  { id: 'earth-night', kind: 'texture', src: 'nasa/night/BlackMarble_2016_3km.jpg', width: EARTH, transform: 'earth-night', quality: 82 },
  { id: 'earth-clouds', kind: 'texture', src: 'nasa/clouds/cloud_combined_8192.tif', width: EARTH, transform: 'earth-clouds', quality: 82 },
]

/** Per-pixel transforms over RGBA buffers (rules live in src/assets/earthMaps.ts). */
const TRANSFORMS = {
  // Day colour with an ocean mask in alpha for specular glint. Land is 96, never 0:
  // WebP discards the colour of fully transparent texels, which smears the continents.
  'earth-day': (d, i) => {
    d[i + 3] = isWater(d[i], d[i + 1], d[i + 2]) ? 255 : 96
  },
  // City-light intensity, background removed.
  'earth-night': (d, i) => {
    const v = nightIntensity(d[i], d[i + 1], d[i + 2])
    d[i] = d[i + 1] = d[i + 2] = v
  },
  // Cloud density with a clean floor.
  'earth-clouds': (d, i) => {
    const v = cloudDensity(d[i])
    d[i] = d[i + 1] = d[i + 2] = v
  },
}

const kb = (n) => `${(n / 1024).toFixed(0)} KB`

async function buildTexture(asset, tier) {
  const width = asset.width[tier]
  const out = join(OUT, `${asset.id}-${tier}.webp`)
  const resized = sharp(join(SRC, asset.src), { limitInputPixels: false }).resize({ width, withoutEnlargement: true })
  const transform = TRANSFORMS[asset.transform]
  let image = resized
  if (transform) {
    const { data, info } = await resized.ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    for (let i = 0; i < data.length; i += 4) transform(data, i)
    image = sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    if (asset.transform !== 'earth-day') image = image.removeAlpha()
  }
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
  // Clear the files, not the folder: deleting the folder confuses the dev server's public-file watcher.
  mkdirSync(OUT, { recursive: true })
  for (const file of readdirSync(OUT)) rmSync(join(OUT, file), { recursive: true, force: true })
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
