// Performance QA on the real GPU (not SwiftShader): fps, p95 frame time and the
// adaptive DPR each tier settles at, per checkpoint.
// Usage: node scripts/qa-perf.mjs [baseUrl] [--tiers=high,medium,low] [--dpr=1.5] [--seconds=4] [--uncapped]
// --uncapped lifts the 60 Hz frame cap so fps shows real frame cost (headroom), not vsync.
import { chromium } from 'playwright'

const args = process.argv.slice(2)
const base = args.find((a) => a.startsWith('http')) ?? 'http://localhost:5173/'
const tiers = (args.find((a) => a.startsWith('--tiers='))?.slice(8) ?? 'high,medium,low').split(',')
const dpr = Number(args.find((a) => a.startsWith('--dpr='))?.slice(6) ?? 1.5)
const seconds = Number(args.find((a) => a.startsWith('--seconds='))?.slice(10) ?? 4)
const uncapped = args.includes('--uncapped')
const checkpoints = [
  ['pad', 0],
  ['ignition', 4.6],
  ['liftoff', 5.0],
  ['orbit', 8.6],
  ['contact', 13.8],
]

const browser = await chromium.launch({
  args: ['--enable-gpu', '--ignore-gpu-blocklist', ...(uncapped ? ['--disable-gpu-vsync', '--disable-frame-rate-limit'] : [])],
})
const rows = []
for (const tier of tiers) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: dpr })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`${base}?debug&quality=${tier}`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => document.documentElement.classList.contains('is-ready'), null, { timeout: 120000 })
  const gpu = await page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2')
    const ext = gl?.getExtension('WEBGL_debug_renderer_info')
    return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown'
  })
  await page.waitForTimeout(1500)
  for (const [name, vu] of checkpoints) {
    await page.evaluate((v) => window.__mission.scroll.jumpTo(v), vu)
    // Let shaders compile and the adaptive DPR settle before measuring.
    await page.waitForTimeout(2500)
    const m = await page.evaluate(
      (ms) =>
        new Promise((resolve) => {
          const deltas = []
          let last = performance.now()
          const end = last + ms
          const step = (t) => {
            deltas.push(t - last)
            last = t
            if (t < end) requestAnimationFrame(step)
            else {
              deltas.sort((a, b) => a - b)
              const mean = deltas.reduce((a, b) => a + b, 0) / deltas.length
              const overlay = [...document.querySelectorAll('body *')].map((e) => e.textContent?.match(/^fps[\s\S]*dpr\s+([\d.]+)/)).find(Boolean)
              resolve({ fps: 1000 / mean, p95: deltas[Math.floor(deltas.length * 0.95)], dpr: overlay ? Number(overlay[1]) : NaN })
            }
          }
          requestAnimationFrame(step)
        }),
      seconds * 1000,
    )
    rows.push({ tier, name, ...m })
    console.log(`${tier.padEnd(7)} ${name.padEnd(9)} ${m.fps.toFixed(1).padStart(5)} fps  p95 ${m.p95.toFixed(1).padStart(5)} ms  dpr ${m.dpr.toFixed(2)}`)
  }
  if (errors.length) console.log(`  errors: ${errors.join(' || ')}`)
  console.log(`  gpu: ${gpu}`)
  await page.close()
}
await browser.close()
