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

/** True when the whole expression is one call to a function that can't return a negative. */
function wholeGuardCall(expr: string): boolean {
  const m = /^(max|clamp|abs|exp|saturate)\(/.exec(expr)
  if (!m) return false
  let depth = 0
  for (let i = m[0].length - 1; i < expr.length; i++) {
    if (expr[i] === '(') depth++
    else if (expr[i] === ')' && --depth === 0) return i === expr.length - 1
  }
  return false
}

/** Could this pow() base go negative? Any subtraction or negation that isn't wrapped whole in a guard. */
function riskyBase(base: string): boolean {
  const expr = base.replace(/\s+/g, '').replace(/([\d.])[eE]-(\d)/g, '$1e+$2')
  return expr.includes('-') && !wholeGuardCall(expr)
}

const files = sources('src')

describe('GLSL undefined-behaviour lint', () => {
  it('finds the project shaders', () => {
    expect(files.flatMap(shaders).length).toBeGreaterThan(10)
  })

  it('recognises the risky spellings, not just the spaced one', () => {
    for (const base of ['1.0 - vAlong', '1.0-vAlong', '1.0 -vAlong', '-x', 'max(x, 0.0) - 0.1', 'abs(a) - b']) {
      expect(riskyBase(base), base).toBe(true)
    }
    for (const base of ['max(1.0 - vAlong, 0.0)', 'clamp(1.0-d,0.0,1.0)', 'facing', '1.0e-3 * x', 'abs(a - b)']) {
      expect(riskyBase(base), base).toBe(false)
    }
  })

  it('never takes pow() of a difference that can dip below zero', () => {
    const bad: string[] = []
    for (const file of files) {
      for (const src of shaders(file)) {
        for (const [base] of calls(src, 'pow')) {
          if (riskyBase(base)) bad.push(`${file}: pow(${base}, …)`)
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
