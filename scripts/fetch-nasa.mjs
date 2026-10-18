// Downloads the NASA Earth imagery the asset build needs into assets-src/nasa/.
// Each source goes in its own directory; existing files with the expected size are kept.
// Credits: Blue Marble NG — NASA Earth Observatory (Reto Stöckli). Black Marble 2016 —
// NASA Earth Observatory images by Joshua Stevens, Suomi NPP VIIRS data from Miguel Román,
// NASA GSFC. Usage: npm run assets:fetch
import { createWriteStream, existsSync, mkdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

const BASE = 'https://eoimages.gsfc.nasa.gov/images/imagerecords'
// Plain base map (no bathymetry shading): oceans read as they do from orbit.
const BMNG = 'https://assets.science.nasa.gov/content/dam/science/esd/eo/images/bmng/bmng-base'
const SOURCES = [
  { dir: 'day', file: 'world.200407.3x5400x2700.jpg', url: `${BMNG}/july/world.200407.3x5400x2700.jpg`, bytes: 1617810 },
  { dir: 'night', file: 'BlackMarble_2016_3km.jpg', url: `${BASE}/144000/144898/BlackMarble_2016_3km.jpg`, bytes: 8106233 },
  { dir: 'clouds', file: 'cloud_combined_8192.tif', url: `${BASE}/57000/57747/cloud_combined_8192.tif`, bytes: 35870468 },
]

for (const source of SOURCES) {
  const dir = join('assets-src', 'nasa', source.dir)
  const out = join(dir, source.file)
  if (existsSync(out) && statSync(out).size === source.bytes) {
    console.log(`ok    ${out}`)
    continue
  }
  mkdirSync(dir, { recursive: true })
  process.stdout.write(`fetch ${source.url} … `)
  const response = await fetch(source.url)
  if (!response.ok || !response.body) throw new Error(`${source.url}: HTTP ${response.status}`)
  await pipeline(Readable.fromWeb(response.body), createWriteStream(out))
  const size = statSync(out).size
  if (size !== source.bytes) throw new Error(`${out}: expected ${source.bytes} bytes, got ${size}`)
  console.log(`${(size / 1e6).toFixed(1)} MB`)
}
