// Fails the build if the JavaScript needed for first paint exceeds the budget.
// Lazily imported chunks (loaded during the pre-flight sequence) are reported but not counted.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'

const BUDGET_KB = 300
const html = readFileSync('dist/index.html', 'utf8')
const entries = [...html.matchAll(/<script[^>]+src="\.?\/?(assets\/[^"]+\.js)"/g)].map((m) => m[1])
const preloads = [...html.matchAll(/<link[^>]+rel="modulepreload"[^>]+href="\.?\/?(assets\/[^"]+\.js)"/g)].map((m) => m[1])
const initial = new Set([...entries, ...preloads])
const kb = (file) => gzipSync(readFileSync(join('dist', file))).length / 1024

let total = 0
for (const file of readdirSync('dist/assets').filter((f) => f.endsWith('.js'))) {
  const path = `assets/${file}`
  const size = kb(path)
  const counted = initial.has(path)
  if (counted) total += size
  console.log(`${counted ? 'initial' : 'lazy   '}  ${size.toFixed(1).padStart(7)} KB gz  ${file}`)
}
console.log(`initial JS: ${total.toFixed(1)} KB gz (budget ${BUDGET_KB} KB)`)
if (total > BUDGET_KB) {
  console.error('Initial JavaScript is over budget.')
  process.exit(1)
}
