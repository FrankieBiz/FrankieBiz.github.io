import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// GLSL ES leaves pow(x, y) undefined for x < 0 and smoothstep(e0, e1, x) undefined for e0 >= e1.
// Mesa on Intel returns NaN for them where SwiftShader doesn't, and a single NaN pixel
// spreads through the bloom mip chain into a fully black frame. These rules catch the
// patterns that produced exactly that (a varying interpolated a hair past 1.0 in pow(1.0 - v, k)).

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? sources(path) : path.endsWith('.ts') ? [path] : []
  })
}

/** GLSL bodies of the /* glsl *\/ template literals in a file. */
function shaders(file: string): string[] {
  return [...readFileSync(file, 'utf8').matchAll(/\/\* glsl \*\/ `([^`]*)`/g)].map((m) => m[1])
}

/** Arguments of every call to `fn` (balanced parentheses). */
function calls(src: string, fn: string): string[][] {
  const out: string[][] = []
  const re = new RegExp(`\\b${fn}\\s*\\(`, 'g')
  for (let m = re.exec(src); m; m = re.exec(src)) {
    let depth = 1
    let i = m.index + m[0].length
    const args: string[] = []
    let start = i
    for (; i < src.length && depth > 0; i++) {
      const c = src[i]
      if (c === '(') depth++
      else if (c === ')') depth--
      if ((c === ',' && depth === 1) || depth === 0) {
        args.push(src.slice(start, i).trim())
        start = i + 1
      }
    }
    out.push(args)
  }
  return out
}

const GUARDED = /^(max|clamp|abs|exp|saturate)\s*\(/
const files = sources('src')

describe('GLSL undefined-behaviour lint', () => {
  it('finds the project shaders', () => {
    expect(files.flatMap(shaders).length).toBeGreaterThan(10)
  })

  it('never takes pow() of a difference that can dip below zero', () => {
    const bad: string[] = []
    for (const file of files) {
      for (const src of shaders(file)) {
        for (const [base] of calls(src, 'pow')) {
          if (/\s-\s|^-/.test(base) && !GUARDED.test(base)) bad.push(`${file}: pow(${base}, …)`)
        }
      }
    }
    expect(bad).toEqual([])
  })

  it('never calls smoothstep() with literal edges in reverse order', () => {
    const bad: string[] = []
    for (const file of files) {
      for (const src of shaders(file)) {
        for (const [e0, e1] of calls(src, 'smoothstep')) {
          const a = Number(e0)
          const b = Number(e1)
          if (Number.isFinite(a) && Number.isFinite(b) && a >= b) bad.push(`${file}: smoothstep(${e0}, ${e1}, …)`)
        }
      }
    }
    expect(bad).toEqual([])
  })
})
