// Visual QA: captures each act at fixed scroll checkpoints.
// Usage: node scripts/qa-shots.mjs [baseUrl] [--mobile] [--only=4.6,5.0] [--quality=low]
//        [--query=motion=reduced] [--nowebgl]
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const args = process.argv.slice(2)
const base = args.find((a) => a.startsWith('http')) ?? 'http://localhost:5173/'
const mobile = args.includes('--mobile')
const only = args.find((a) => a.startsWith('--only='))?.slice(7).split(',').map(Number)
const quality = args.find((a) => a.startsWith('--quality='))?.slice(10) ?? 'high'
const extra = args.find((a) => a.startsWith('--query='))?.slice(8)
const noWebgl = args.includes('--nowebgl')
const variant = noWebgl ? '-nowebgl' : extra ? `-${extra.replace(/[^a-z0-9]+/gi, '-')}` : ''
const outDir = `qa-shots/${mobile ? 'mobile' : 'desktop'}${variant}`
mkdirSync(outDir, { recursive: true })

const checkpoints = only ?? [0, 0.9, 1.7, 2.6, 3.5, 4.05, 4.6, 5.0, 5.6, 6.3, 6.8, 7.4, 8.6, 9.8, 11.0, 12.2, 13.3, 13.8]

const browser = await chromium.launch({
  args: noWebgl
    ? ['--disable-webgl', '--disable-3d-apis']
    : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
})
const context = await browser.newContext(
  mobile
    ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
    : { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
)
const page = await context.newPage()
const problems = []
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') problems.push(`[${m.type()}] ${m.text()}`)
})
page.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}`))

await page.goto(`${base}?debug&quality=${quality}${extra ? `&${extra}` : ''}`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(400)
await page.screenshot({ path: `${outDir}/00-loader.png` })
await page.waitForFunction(() => document.documentElement.classList.contains('is-ready'), null, { timeout: 120000 })
await page.waitForTimeout(2600)

for (const vu of checkpoints) {
  await page.evaluate((v) => {
    if (window.__mission) window.__mission.scroll.jumpTo(v)
    else window.scrollTo(0, v * innerHeight)
  }, vu)
  await page.waitForTimeout(2500)
  const name = `${outDir}/vu-${vu.toFixed(2).padStart(5, '0')}.png`
  await page.screenshot({ path: name, timeout: 120000 })
  const texts = await page.evaluate(() =>
    [...document.querySelectorAll('.is-active [data-scramble], [data-scramble].is-active')].map((e) => e.textContent),
  )
  console.log('shot', name, texts.length ? JSON.stringify(texts) : '')
}

if (problems.length) {
  console.log('\nConsole problems:')
  for (const p of [...new Set(problems)]) console.log(' ', p)
} else {
  console.log('\nNo console errors or warnings.')
}
await browser.close()
