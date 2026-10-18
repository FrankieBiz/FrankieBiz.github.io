// Real-GPU sanity sweep: walks the whole scroll timeline and flags NaN pixels in the
// scene render and black frames on screen. SwiftShader hides driver-specific shader
// undefined behaviour (pow of a negative base went NaN on Mesa and blacked out frames),
// so this runs on the machine's GPU. Exits 1 on any finding.
// Usage: node scripts/qa-gpu-sanity.mjs [baseUrl] [--tiers=high,medium] [--step=0.2]
import { chromium } from 'playwright'

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
    const gl = r.getContext()
    const isNaN16 = (h) => ((h >> 10) & 0x1f) === 31 && (h & 0x3ff) !== 0
    /** NaN pixels in a half-float render target, every pixel. */
    const scan = (t) => {
      if (!t || t.texture.type !== 1016) return 0 // only HalfFloat targets can hold NaN
      const buf = new Uint16Array(t.width * 4)
      let n = 0
      for (let y = 0; y < t.height; y++) {
        r.readRenderTargetPixels(t, 0, y, t.width, 1, buf)
        for (let i = 0; i < buf.length; i += 4) if (isNaN16(buf[i]) || isNaN16(buf[i + 1]) || isNaN16(buf[i + 2])) n++
      }
      return n
    }
    // On the next frame: NaNs in the scene render (where they're born) and in the last HDR buffer
    // (anything AO, depth of field or bloom made), then the canvas brightness the visitor sees.
    window.__probe = () =>
      new Promise((resolve) => {
        const passes = m.post.composer.passes.filter((p) => p.enabled)
        const first = passes[0]
        const last = passes[passes.length - 1]
        const out = { scene: 0, hdr: 0, mean: -1 }
        const renderFirst = first.render
        first.render = function (renderer, input, ...rest) {
          const result = renderFirst.call(this, renderer, input, ...rest)
          first.render = renderFirst
          out.scene = scan(input)
          return result
        }
        const renderLast = last.render
        last.render = function (renderer, input, ...rest) {
          out.hdr = scan(input)
          const result = renderLast.call(this, renderer, input, ...rest)
          last.render = renderLast
          // The frame is in the drawing buffer until it's composited: read it now.
          const w = gl.drawingBufferWidth
          const h = gl.drawingBufferHeight
          const px = new Uint8Array(w * h * 4)
          gl.bindFramebuffer(gl.FRAMEBUFFER, null)
          gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px)
          let sum = 0
          for (let i = 0; i < px.length; i += 4) sum += 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]
          out.mean = sum / (w * h)
          resolve(out)
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
    // A loop that throws every frame never resolves the probe: report it instead of hanging.
    const probe = await page.evaluate(() => Promise.race([window.__probe(), new Promise((r) => setTimeout(() => r(null), 15000))]))
    checked++
    if (!probe) {
      findings.push(`${tier} vu ${v}: no frame rendered within 15 s`)
      continue
    }
    if (probe.scene > 0) findings.push(`${tier} vu ${v}: ${probe.scene} NaN pixels in the scene render`)
    if (probe.hdr > 0) findings.push(`${tier} vu ${v}: ${probe.hdr} NaN pixels after AO / depth of field / bloom`)
    if (probe.mean < 2) findings.push(`${tier} vu ${v}: black canvas (mean ${probe.mean.toFixed(2)})`)
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
