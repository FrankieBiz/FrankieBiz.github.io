// Real-GPU sanity sweep: walks the whole scroll timeline and flags NaN pixels in the
// scene render and black frames on screen. SwiftShader hides driver-specific shader
// undefined behaviour (pow of a negative base went NaN on Mesa and blacked out frames),
// so this runs on the machine's GPU. Exits 1 on any finding.
// Usage: node scripts/qa-gpu-sanity.mjs [baseUrl] [--tiers=high,medium] [--step=0.2]
import { chromium } from 'playwright'
import sharp from 'sharp'

const args = process.argv.slice(2)
const base = args.find((a) => a.startsWith('http')) ?? 'http://localhost:5173/'
const tiers = (args.find((a) => a.startsWith('--tiers='))?.slice(8) ?? 'high,medium').split(',')
const step = Number(args.find((a) => a.startsWith('--step='))?.slice(7) ?? 0.2)

const browser = await chromium.launch({ args: ['--enable-gpu', '--ignore-gpu-blocklist'] })
const findings = []
for (const tier of tiers) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`${base}?debug&quality=${tier}`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => document.documentElement.classList.contains('is-ready'), null, { timeout: 120000 })
  const end = await page.evaluate(() => {
    const m = window.__mission
    const r = m.renderer.gl
    const isNaN16 = (h) => ((h >> 10) & 0x1f) === 31 && (h & 0x3ff) !== 0
    // Count NaN pixels in the scene render (the RenderPass output) on the next frame.
    window.__nanPixels = () =>
      new Promise((resolve) => {
        const pass = m.post.composer.passes[0]
        const render = pass.render
        pass.render = function (renderer, input, ...rest) {
          const result = render.call(this, renderer, input, ...rest)
          pass.render = render
          const t = input
          const buf = new Uint16Array(t.width * 4)
          let n = 0
          for (let y = 0; y < t.height; y += 2) {
            r.readRenderTargetPixels(t, 0, y, t.width, 1, buf)
            for (let i = 0; i < buf.length; i += 8) if (isNaN16(buf[i]) || isNaN16(buf[i + 1]) || isNaN16(buf[i + 2])) n++
          }
          resolve(n)
          return result
        }
      })
    return m.layout.scrollable
  })
  let checked = 0
  for (let vu = 0; vu <= end + 1e-6; vu += step) {
    const v = Math.round(vu * 100) / 100
    await page.evaluate((x) => window.__mission.scroll.jumpTo(x), v)
    await page.waitForTimeout(700)
    const nan = await page.evaluate(() => window.__nanPixels())
    const { channels } = await sharp(await page.screenshot()).stats()
    const brightness = (channels[0].mean + channels[1].mean + channels[2].mean) / 3
    checked++
    if (nan > 0) findings.push(`${tier} vu ${v}: ${nan} NaN pixels in the scene render`)
    if (brightness < 2) findings.push(`${tier} vu ${v}: black frame (mean ${brightness.toFixed(2)})`)
  }
  if (errors.length) findings.push(`${tier}: page errors: ${errors.join(' || ')}`)
  console.log(`${tier}: checked ${checked} points across vu 0–${end.toFixed(1)}`)
  await page.close()
}
await browser.close()
if (findings.length) {
  console.log(`\n${findings.length} finding(s):\n  ${findings.join('\n  ')}`)
  process.exit(1)
}
console.log('\nNo NaN pixels or black frames.')
