// Behavioural QA: loader timing, navigation, keyboard, focus, sound, contact
// morphs, resize, GPU resource stability, console errors and an axe scan.
// Usage: node scripts/qa-interact.mjs [baseUrl]   (AXE_PATH=/path/to/axe.min.js to enable axe)
import { chromium } from 'playwright'
import { existsSync, mkdirSync } from 'node:fs'

const base = process.argv.find((a) => a.startsWith('http')) ?? 'http://localhost:5173/'
const axePath = process.env.AXE_PATH
mkdirSync('qa-shots/interact', { recursive: true })

const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`)
}

const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
})
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await context.newPage()
const problems = []
page.on('console', (m) => {
  if (m.text().startsWith('[site.ts]') || m.text().startsWith('[projects.ts]')) return // dev guidance
  if (m.type() === 'error') problems.push(m.text())
  if (m.type() === 'warning' && !m.text().includes('KHR_parallel_shader_compile')) problems.push(`[warn] ${m.text()}`)
})
page.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}`))

const vu = () => page.evaluate(() => window.__mission.scroll.vu)
const settle = (ms = 2500) => page.waitForTimeout(ms)
/** Resolve after `n` frames have actually rendered in the page. */
const frames = (n) =>
  page.evaluate(
    (count) =>
      new Promise((resolve) => {
        let i = 0
        const step = () => (++i >= count ? resolve() : requestAnimationFrame(step))
        requestAnimationFrame(step)
      }),
    n,
  )
/**
 * Wait until a scroll flight comes to rest. Sampled per rendered frame, not per
 * wall-clock interval, so slow software rendering can't fake a standstill.
 */
const rest = async (timeout = 180000) => {
  const end = Date.now() + timeout
  let last = await vu()
  let stable = 0
  while (Date.now() < end) {
    await frames(3)
    const now = await vu()
    if (Math.abs(now - last) < 0.003) {
      if (++stable >= 3) return now
    } else stable = 0
    last = now
  }
  return last
}

// ---------------------------------------------------------------- loader
const t0 = Date.now()
// Behaviour doesn't depend on the render tier; low keeps software-GL frames cheap.
const quality = process.argv.find((a) => a.startsWith('--quality='))?.slice(10) ?? 'low'
await page.goto(`${base}?debug&quality=${quality}`, { waitUntil: 'domcontentloaded' })
await page.waitForFunction(() => document.documentElement.classList.contains('is-ready'), null, { timeout: 120000 })
const loadMs = Date.now() - t0
check('loader completes', true, `${(loadMs / 1000).toFixed(1)}s to ready (software GL)`)
const locked = await page.evaluate(() => document.documentElement.classList.contains('is-locked'))
check('scroll unlocked after loader', !locked)
await settle(2000)

// ------------------------------------------------------------- semantics
const sem = await page.evaluate(() => ({
  title: document.title,
  lang: document.documentElement.lang,
  desc: document.querySelector('meta[name="description"]')?.getAttribute('content') ?? '',
  h1: [...document.querySelectorAll('h1')].map((h) => h.textContent.trim()),
  headings: [...document.querySelectorAll('h1,h2,h3')].map((h) => h.tagName),
  landmarks: { main: !!document.querySelector('main'), nav: !!document.querySelector('nav'), header: !!document.querySelector('header') },
}))
check('one h1 with the name', sem.h1.length === 1 && sem.h1[0].includes('Bisignano'), JSON.stringify(sem.h1))
check('title, lang and description present', !!sem.title && sem.lang === 'en' && sem.desc.length > 40)
check('landmarks present', Object.values(sem.landmarks).every(Boolean))

// ------------------------------------------------------------ navigation
const nav = async (label, selector, expect, tolerance = 0.35) => {
  await page.click(selector)
  await page.waitForTimeout(800)
  const v = await rest()
  check(`nav: ${label}`, Math.abs(v - expect) < tolerance, `vu ${v.toFixed(2)} (expected ≈ ${expect.toFixed(2)})`)
}
const dest = await page.evaluate(() => {
  const { layout } = window.__mission
  return { manifesto: layout.byId.manifesto.start + 0.45, scrollable: layout.scrollable, payloads: layout.byId.payloads.start }
})
await nav('Manifesto', '.hud__nav a[data-nav="manifesto"]', dest.manifesto)
await nav('Contact', '.hud__nav a[data-nav="contact"]', dest.scrollable, 0.4)
const current = await page.getAttribute('.hud__nav a[data-nav="contact"]', 'aria-current')
check('nav marks the current act', current !== null)
await nav('Return to pad (footer)', '.footer__top', 0, 0.05)
await nav('Payloads', '.hud__nav a[data-nav="payloads"]', dest.payloads + 1.6, 0.4)
await nav('Callsign mark → pad', '.hud__mark', 0, 0.05)

// -------------------------------------------------------------- keyboard
await page.evaluate(() => window.__mission.scroll.jumpTo(0))
await settle(1500)
await page.mouse.click(720, 450)
await settle(500)
const before = await vu()
for (let i = 0; i < 3; i++) {
  await page.keyboard.press('PageDown')
  await page.waitForTimeout(400)
}
const afterKeys = await rest()
check('keyboard scrolling (PageDown) moves the mission', afterKeys > before + 1, `vu ${before.toFixed(2)} → ${afterKeys.toFixed(2)}`)
await page.keyboard.press('Home')
await page.waitForTimeout(800)
const home = await rest()
check('Home returns to the pad', home < 0.1, `vu ${home.toFixed(2)}`)

// Tab order: every focusable element is reachable and has a visible focus style.
const focusables = await page.evaluate(() => {
  const els = [...document.querySelectorAll('a[href], button, [tabindex]:not([tabindex="-1"])')]
  return els.length
})
const visited = []
let invisibleFocus = 0
for (let i = 0; i < focusables + 1; i++) {
  await page.keyboard.press('Tab')
  await page.waitForTimeout(150)
  const info = await page.evaluate(() => {
    const el = document.activeElement
    if (!el || el === document.body) return null
    const cs = getComputedStyle(el)
    return { text: (el.textContent || '').trim().slice(0, 24), outline: cs.outlineStyle !== 'none' && cs.outlineWidth !== '0px' }
  })
  if (info) {
    visited.push(info.text)
    if (!info.outline) invisibleFocus++
  }
}
check('tab reaches every focusable element', new Set(visited).size >= focusables - 1, `${new Set(visited).size}/${focusables}: ${[...new Set(visited)].join(' | ')}`)
check('focused elements show an outline', invisibleFocus === 0, `${invisibleFocus} without outline`)

// Focusing a contact channel while at the top should fly to the contact act.
await page.evaluate(() => window.__mission.scroll.jumpTo(0))
await settle(1200)
await page.focus('.channel[data-shape="ring"]')
await page.waitForTimeout(800)
const afterFocus = await rest()
check('focusing hidden copy flies to it', afterFocus > dest.scrollable - 1.2, `vu ${afterFocus.toFixed(2)}`)

// ---------------------------------------------------------- contact morph
await page.evaluate((v) => window.__mission.scroll.jumpTo(v), dest.scrollable)
await settle(3000)
await page.hover('.channel[data-shape="graph"]')
await settle(400)
const shapeHover = await page.evaluate(() => window.__mission.world.field.current)
await page.screenshot({ path: 'qa-shots/interact/contact-hover-github.png', timeout: 120000 })
await page.mouse.move(1200, 120)
await settle(1500)
const shapeLeave = await page.evaluate(() => window.__mission.world.field.current)
check('hovering GitHub forms the commit graph, leaving restores the rocket', shapeHover === 'graph' && shapeLeave === 'rocket', `${shapeHover} → ${shapeLeave}`)
for (const s of ['ring', 'lattice', 'sheets']) {
  await page.hover(`.channel[data-shape="${s}"]`)
  await settle(2600)
  await page.screenshot({ path: `qa-shots/interact/contact-hover-${s}.png`, timeout: 120000 })
}

// ------------------------------------------------------------------ sound
await page.click('.sound')
await settle(500)
const sound = await page.evaluate(() => ({
  pressed: document.querySelector('.sound').getAttribute('aria-pressed'),
  label: document.querySelector('.sound__label').textContent,
}))
check('sound toggle updates state and label', sound.pressed === 'true' && sound.label === 'Sound on', JSON.stringify(sound))
await page.click('.sound')

// --------------------------------------------------------- GPU resources
const sweep = async () => {
  for (const v of [0, 3, 5, 7.5, 9, 11, dest.scrollable, 6, 2, 0]) {
    await page.evaluate((x) => window.__mission.scroll.jumpTo(x), v)
    await page.waitForTimeout(500)
  }
}
// World keeps its WebGLRenderer; TS `private` is still reachable at runtime.
const infoMem = () => page.evaluate(() => ({ ...window.__mission.world.renderer.info.memory }))
await sweep() // warm-up: first draws upload buffers once
const m1 = await infoMem()
await sweep()
await sweep()
const m2 = await infoMem()
check('no GPU resource growth after two full sweeps', m2.geometries <= m1.geometries && m2.textures <= m1.textures, `${JSON.stringify(m1)} → ${JSON.stringify(m2)}`)

// ----------------------------------------------------------------- resize
await page.evaluate(() => window.__mission.scroll.jumpTo(8.6))
await settle(1500)
await page.setViewportSize({ width: 390, height: 844 })
await settle(3000)
await page.screenshot({ path: 'qa-shots/interact/resize-to-phone.png', timeout: 120000 })
const afterResize = await vu()
check('resize keeps the visitor in the same act', Math.abs(afterResize - 8.6) < 0.6, `vu ${afterResize.toFixed(2)}`)
await page.setViewportSize({ width: 1440, height: 900 })
await settle(2000)

// -------------------------------------------------------------------- axe
if (axePath && existsSync(axePath)) {
  await page.evaluate(() => window.__mission.scroll.jumpTo(0))
  await settle(1500)
  await page.addScriptTag({ path: axePath })
  const axe = await page.evaluate(async () => {
    // eslint-disable-next-line no-undef
    const r = await axe.run(document, { resultTypes: ['violations'] })
    return r.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, sample: v.nodes[0]?.target?.join(' ') }))
  })
  check('axe: no serious/critical violations', !axe.some((v) => v.impact === 'serious' || v.impact === 'critical'), JSON.stringify(axe))
}

check('no console errors during the session', problems.length === 0, [...new Set(problems)].join(' || '))

// ------------------------------------------------- assets blocked → fallback
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const p = await ctx.newPage()
  const errors = []
  p.on('pageerror', (e) => errors.push(e.message))
  // Chromium logs every deliberately aborted request; those are expected here.
  p.on('console', (m) => m.type() === 'error' && !m.text().startsWith('Failed to load resource') && errors.push(m.text()))
  // Block only the shipped asset folder (/assets/…), not source modules under /src/assets/.
  await p.route((url) => url.pathname.startsWith('/assets/'), (route) => route.abort())
  await p.goto(`${base}?quality=low`, { waitUntil: 'domcontentloaded' })
  const booted = await p
    .waitForFunction(() => document.documentElement.classList.contains('is-ready'), null, { timeout: 120000 })
    .then(() => true)
    .catch(() => false)
  const webgl = await p.evaluate(() => document.documentElement.classList.contains('webgl'))
  check('assets blocked → procedural scene still boots', booted && webgl && errors.length === 0, `booted=${booted} webgl=${webgl} ${errors.join(' || ')}`)
  await ctx.close()
}

// ------------------------------------------- slow network → loader completes
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const p = await ctx.newPage()
  const errors = []
  p.on('pageerror', (e) => errors.push(e.message))
  p.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  const cdp = await ctx.newCDPSession(p)
  await cdp.send('Network.enable')
  // ~3 Mbit/s: the medium tier's assets take several seconds to stream.
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 40, downloadThroughput: 400 * 1024, uploadThroughput: 200 * 1024 })
  // The dev server ships modules unbundled, so DOMContentLoaded alone can take tens of seconds
  // at this rate; the readiness loop below has its own budget.
  await p.goto(`${base}?quality=medium`, { waitUntil: 'commit', timeout: 120000 })
  // The counter should creep through the asset band (10–50%) as bytes arrive, not jump.
  const seen = new Set()
  const started = Date.now()
  let booted = false
  while (Date.now() - started < 180000) {
    const state = await p.evaluate(() => ({
      ready: document.documentElement.classList.contains('is-ready'),
      count: Number(document.querySelector('.loader__count')?.textContent ?? 'NaN'),
    }))
    if (state.count > 10 && state.count < 50) seen.add(state.count)
    if (state.ready) {
      booted = true
      break
    }
    await p.waitForTimeout(150)
  }
  const assets = await p.evaluate(() => performance.getEntriesByType('resource').filter((r) => new URL(r.name).pathname.startsWith('/assets/')).length)
  check(
    'slow network → loader shows byte progress and completes',
    booted && seen.size >= 3 && assets > 0 && errors.length === 0,
    `booted=${booted} progress steps in asset band=${seen.size} asset requests=${assets} ${errors.join(' || ')}`,
  )
  await ctx.close()
}

/** A fresh page on its own context, booted to the ready state. */
const boot = async (url, options = {}) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, ...options })
  const p = await ctx.newPage()
  await p.goto(url, { waitUntil: 'domcontentloaded' })
  const ready = await p
    .waitForFunction(() => document.documentElement.classList.contains('is-ready'), null, { timeout: 120000 })
    .then(() => true)
    .catch(() => false)
  return { ctx, p, ready }
}
const renderedFrames = (p, n) =>
  p.evaluate((count) => new Promise((res) => { let i = 0; const step = () => (++i >= count ? res() : requestAnimationFrame(step)); requestAnimationFrame(step) }), n)

// ------------------------------------- reduced motion → no depth of field, no shimmer
{
  const { ctx, p, ready } = await boot(`${base}?debug&quality=high`, { reducedMotion: 'reduce' })
  let detail = `ready=${ready}`
  let ok = ready
  if (ready) {
    await p.evaluate(() => window.__mission.scroll.jumpTo(2.6)) // manifesto close-up: the deepest focus pull
    await renderedFrames(p, 6)
    const dof = await p.evaluate(() => window.__mission.post.dofPass !== null)
    await p.evaluate(() => window.__mission.scroll.jumpTo(4.6)) // ignition: where the shimmer would run
    await renderedFrames(p, 6)
    const heat = await p.evaluate(() => window.__mission.post.lens.uniforms.get('uHeat').value)
    ok = !dof && heat === 0
    detail = `depth-of-field pass=${dof} shimmer=${heat}`
  }
  check('reduced motion → no depth of field, no heat shimmer', ok, detail)
  await ctx.close()
}

// ---------------------------------- lost WebGL context → reload, resume where you were
{
  const { ctx, p, ready } = await boot(`${base}?debug&quality=low`)
  let detail = `ready=${ready}`
  let ok = ready
  if (ready) {
    await p.evaluate(() => window.__mission.scroll.jumpTo(8.6))
    await renderedFrames(p, 4)
    const reloaded = p.waitForEvent('load', { timeout: 120000 }).then(() => true).catch(() => false)
    await p.evaluate(() => {
      const ext = window.__mission.renderer.gl.getContext().getExtension('WEBGL_lose_context')
      ext.loseContext()
      setTimeout(() => ext.restoreContext(), 300)
    })
    const back = (await reloaded) && (await p
      .waitForFunction(() => document.documentElement.classList.contains('is-ready'), null, { timeout: 120000 })
      .then(() => true)
      .catch(() => false))
    const at = back ? await p.evaluate(() => window.__mission.scroll.vu) : NaN
    ok = back && Math.abs(at - 8.6) < 0.6
    detail = `reloaded=${back} vu after=${Number.isNaN(at) ? 'n/a' : at.toFixed(2)} (was 8.60)`
  }
  check('lost WebGL context → reloads and resumes in place', ok, detail)
  await ctx.close()
}

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
await browser.close()
process.exit(failed.length ? 1 : 0)
