// GPU profile on the real GPU: mean GPU milliseconds per post-processing pass at
// each checkpoint (EXT_disjoint_timer_query_webgl2), plus the scene pass with each
// world group hidden, to see what the frame is spent on.
// Laptop iGPUs throttle under sustained load (package power limit PL1), which skews
// back-to-back numbers, so on Intel xe GPUs the actual clock is sampled during each
// measurement and times are also reported normalised to the full clock.
// Usage: node scripts/qa-gpu.mjs [baseUrl] [--tier=medium] [--dpr=1.5] [--only=8.6,13.8] [--cooldown=15]
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { chromium } from 'playwright'

const args = process.argv.slice(2)
const base = args.find((a) => a.startsWith('http')) ?? 'http://localhost:5173/'
const tier = args.find((a) => a.startsWith('--tier='))?.slice(7) ?? 'medium'
const dpr = Number(args.find((a) => a.startsWith('--dpr='))?.slice(6) ?? 1.5)
const only = args.find((a) => a.startsWith('--only='))?.slice(7).split(',').map(Number)
const cooldown = Number(args.find((a) => a.startsWith('--cooldown='))?.slice(11) ?? 0)

// Intel xe sysfs: actual GPU clock (0 when idle) and its maximum.
const freqDir = (() => {
  if (!existsSync('/sys/class/drm')) return null
  for (const card of readdirSync('/sys/class/drm')) {
    const dir = `/sys/class/drm/${card}/device/tile0/gt0/freq0`
    if (existsSync(`${dir}/act_freq`)) return dir
  }
  return null
})()
const maxMhz = freqDir ? Number(readFileSync(`${freqDir}/rp0_freq`, 'utf8')) : 0
const readMhz = () => (freqDir ? Number(readFileSync(`${freqDir}/act_freq`, 'utf8')) : 0)
const checkpoints = (only ?? [0, 4.6, 8.6, 13.8]).map((vu) => [vu, { 0: 'pad', 4.6: 'ignition', 5: 'liftoff', 8.6: 'orbit', 13.8: 'contact' }[vu] ?? `vu ${vu}`])

const browser = await chromium.launch({ args: ['--enable-gpu', '--ignore-gpu-blocklist'] })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: dpr })
await page.goto(`${base}?debug&quality=${tier}`, { waitUntil: 'domcontentloaded' })
await page.waitForFunction(() => document.documentElement.classList.contains('is-ready'), null, { timeout: 120000 })

const ok = await page.evaluate(() => {
  const m = window.__mission
  const gl = m.renderer.gl.getContext()
  const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2')
  if (!ext) return false
  const pending = []
  const samples = {}
  m.post.composer.passes.forEach((pass, i) => {
    const label = `${i} ${pass.name || pass.constructor.name}`
    const render = pass.render
    pass.render = function (...a) {
      const q = gl.createQuery()
      gl.beginQuery(ext.TIME_ELAPSED_EXT, q)
      try {
        return render.apply(this, a)
      } finally {
        gl.endQuery(ext.TIME_ELAPSED_EXT)
        pending.push([q, label])
      }
    }
  })
  const poll = () => {
    const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT)
    for (let i = pending.length - 1; i >= 0; i--) {
      const [q, label] = pending[i]
      if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) continue
      if (!disjoint) (samples[label] ||= []).push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6)
      gl.deleteQuery(q)
      pending.splice(i, 1)
    }
    requestAnimationFrame(poll)
  }
  requestAnimationFrame(poll)
  window.__gpu = {
    reset: () => Object.keys(samples).forEach((k) => delete samples[k]),
    read: () => Object.fromEntries(Object.entries(samples).map(([k, v]) => [k, v.reduce((a, b) => a + b, 0) / v.length])),
  }
  return true
})
if (!ok) {
  console.log('EXT_disjoint_timer_query_webgl2 unavailable')
  process.exit(1)
}

let lastMhz = 0
const measure = async (ms = 2500) => {
  if (cooldown) await page.waitForTimeout(cooldown * 1000)
  await page.evaluate(() => window.__gpu.reset())
  const mhz = []
  const timer = setInterval(() => mhz.push(readMhz()), 100)
  await page.waitForTimeout(ms)
  clearInterval(timer)
  const busy = mhz.filter((f) => f > 0)
  lastMhz = busy.length ? busy.reduce((a, b) => a + b, 0) / busy.length : 0
  return page.evaluate(() => window.__gpu.read())
}
/** Total GPU ms, plus the clock it ran at and the time normalised to the full clock. */
const describe = (r) => {
  const total = Object.values(r).reduce((a, b) => a + b, 0)
  if (!lastMhz || !maxMhz) return `GPU ${total.toFixed(2)} ms/frame`
  return `GPU ${total.toFixed(2)} ms/frame @ ${lastMhz.toFixed(0)} MHz (≈ ${((total * lastMhz) / maxMhz).toFixed(2)} ms at ${maxMhz} MHz)`
}
const sceneMs = (r) => Object.entries(r).find(([k]) => /RenderPass/.test(k))?.[1] ?? NaN

console.log(`tier ${tier} @ dpr ${dpr} (1440x900 CSS)`)
for (const [vu, name] of checkpoints) {
  await page.evaluate((v) => window.__mission.scroll.jumpTo(v), vu)
  await page.waitForTimeout(3000)
  const r = await measure()
  console.log(`\n${name} — ${describe(r)}`)
  for (const [k, v] of Object.entries(r)) console.log(`  ${v.toFixed(2).padStart(6)} ms  ${k}`)
  // Scene pass with each world group hidden: the drop is that group's cost.
  const groups = await page.evaluate(() => {
    const w = window.__mission.world
    const all = { planet: w.planet.group, payloads: w.payloads.group, field: w.field.group, sky: w.sky.group, launchPad: w.launchPad.group, rocket: w.rocket.group, exhaust: w.exhaust.world }
    window.__groups = all
    return Object.keys(all).filter((k) => all[k].visible && all[k].parent?.visible !== false)
  })
  for (const g of groups) {
    await page.evaluate((key) => (window.__groups[key].visible = false), g)
    const hidden = await measure(1500)
    await page.evaluate((key) => (window.__groups[key].visible = true), g)
    console.log(`  scene without ${g.padEnd(9)} ${(sceneMs(r) - sceneMs(hidden)).toFixed(2).padStart(6)} ms saved`)
  }
}
await browser.close()
