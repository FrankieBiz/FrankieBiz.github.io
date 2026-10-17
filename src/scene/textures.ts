import { CanvasTexture, ClampToEdgeWrapping, LinearFilter, RepeatWrapping, SRGBColorSpace, type Texture } from 'three'

/**
 * Procedural canvas textures. Everything is drawn at boot (after fonts load)
 * so the site ships without image assets.
 */

const DISPLAY_FONT = '"Archivo Variable", "Archivo", sans-serif'
const MONO_FONT = '"Geist Mono Variable", ui-monospace, monospace'

function canvas(w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')!
  return { c, ctx }
}

/** Seeded PRNG so textures look identical on every visit. */
export function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function setStretch(ctx: CanvasRenderingContext2D, stretch: CanvasFontStretch) {
  if ('fontStretch' in ctx) ctx.fontStretch = stretch
}

function setTracking(ctx: CanvasRenderingContext2D, value: string) {
  if ('letterSpacing' in ctx) ctx.letterSpacing = value
}

// ------------------------------------------------------------------ hull

/** Hull UV v runs from the hull bottom (y = 0.3) to the nose tip (y = 10). */
export const HULL_Y0 = 0.3
export const HULL_Y1 = 10

export interface HullTextures {
  map: Texture
  roughness: Texture
  bump: Texture
}

export function createHullTextures(): HullTextures {
  const W = 1024
  const H = 2048
  const rand = mulberry32(7)
  const row = (y: number) => (1 - (y - HULL_Y0) / (HULL_Y1 - HULL_Y0)) * H
  const col = (u: number) => u * W

  const color = canvas(W, H)
  const rough = canvas(W, H)
  const bump = canvas(W, H)
  const cc = color.ctx
  const rc = rough.ctx
  const bc = bump.ctx

  // Base ceramic, roughness, and neutral bump.
  cc.fillStyle = '#d9dee5'
  cc.fillRect(0, 0, W, H)
  rc.fillStyle = 'rgb(92,92,92)'
  rc.fillRect(0, 0, W, H)
  bc.fillStyle = 'rgb(160,160,160)'
  bc.fillRect(0, 0, W, H)

  // Long vertical tonal streaks — weathering on the tiles.
  for (let i = 0; i < 220; i++) {
    const x = rand() * W
    const w = 1 + rand() * 7
    cc.fillStyle = `rgba(110,122,138,${rand() * 0.035})`
    cc.fillRect(x, 0, w, H)
    rc.fillStyle = `rgba(${rand() > 0.5 ? 255 : 0},${rand() > 0.5 ? 255 : 0},${rand() > 0.5 ? 255 : 0},0.04)`
    rc.fillRect(x, 0, w, H)
  }

  // Interstage band.
  const bandTop = row(4.75)
  const bandBottom = row(4.3)
  cc.fillStyle = '#1a1f27'
  cc.fillRect(0, bandTop, W, bandBottom - bandTop)
  rc.fillStyle = 'rgb(150,150,150)'
  rc.fillRect(0, bandTop, W, bandBottom - bandTop)
  for (let x = 0; x < W; x += 8) {
    cc.fillStyle = 'rgba(255,255,255,0.035)'
    cc.fillRect(x, bandTop, 2, bandBottom - bandTop)
    bc.fillStyle = 'rgb(120,120,120)'
    bc.fillRect(x, bandTop, 2, bandBottom - bandTop)
  }

  // Roll pattern near the base: alternating quarters, two rows.
  const rows = [
    [0.95, 1.35],
    [1.35, 1.75],
  ] as const
  rows.forEach(([y0, y1], r) => {
    for (let q = 0; q < 4; q++) {
      if ((q + r) % 2 === 0) continue
      cc.fillStyle = '#151a21'
      cc.fillRect(col(q / 4), row(y1), W / 4, row(y0) - row(y1))
      rc.fillStyle = 'rgb(120,120,120)'
      rc.fillRect(col(q / 4), row(y1), W / 4, row(y0) - row(y1))
    }
  })

  // Panel seams: horizontal rings with staggered vertical joints between them.
  const rings = [0.8, 1.75, 2.7, 3.6, 4.3, 4.75, 5.5, 6.1, 6.6, 7.5, 8.4]
  const seam = (x: number, y: number, w: number, h: number) => {
    cc.fillStyle = 'rgba(28,34,44,0.42)'
    cc.fillRect(x, y, w, h)
    bc.fillStyle = 'rgb(118,118,118)'
    bc.fillRect(x, y, w, h)
    rc.fillStyle = 'rgb(170,170,170)'
    rc.fillRect(x, y, w, h)
  }
  rings.forEach((y) => seam(0, row(y) - 1, W, 2.5))
  for (let i = 0; i < rings.length - 1; i++) {
    const y0 = rings[i]
    const y1 = rings[i + 1]
    if (y0 === 4.3) continue
    const offset = i % 2 === 0 ? 0 : 0.125
    for (let q = 0; q < 4; q++) {
      seam(col(offset + q / 4) - 1, row(y1), 2.5, row(y0) - row(y1))
    }
    // Rivets along the ring.
    for (let x = 0; x < W; x += 16) {
      bc.fillStyle = 'rgb(205,205,205)'
      bc.beginPath()
      bc.arc(x + 8, row(y0) - 6, 1.6, 0, Math.PI * 2)
      bc.fill()
    }
  }
  // Payload fairing split line.
  seam(col(0.25) - 1, row(10), 2.5, row(6.6) - row(10))
  seam(col(0.75) - 1, row(10), 2.5, row(6.6) - row(10))

  // Name along the first stage, reading upward, facing the camera (u = 0.5).
  cc.save()
  cc.translate(col(0.5), row(1.95))
  cc.rotate(-Math.PI / 2)
  cc.fillStyle = '#141920'
  setStretch(cc, 'ultra-expanded')
  setTracking(cc, '6px')
  cc.font = `600 64px ${DISPLAY_FONT}`
  cc.textBaseline = 'middle'
  cc.fillText('BISIGNANO', 0, 0)
  cc.restore()

  // Callsign on the fairing.
  cc.save()
  cc.translate(col(0.5), row(7.0))
  cc.rotate(-Math.PI / 2)
  cc.fillStyle = '#141920'
  setStretch(cc, 'ultra-expanded')
  cc.font = `500 40px ${DISPLAY_FONT}`
  cc.textBaseline = 'middle'
  cc.fillText('FB-01', 0, 0)
  cc.restore()

  // Small stencils — only legible when the camera cranes close.
  const stencil = (text: string, u: number, y: number, size = 13) => {
    cc.fillStyle = 'rgba(20,25,32,0.78)'
    cc.font = `500 ${size}px ${MONO_FONT}`
    cc.textBaseline = 'top'
    cc.fillText(text, col(u), row(y))
  }
  stencil('LOX FILL / DRAIN', 0.535, 3.45)
  stencil('NO STEP', 0.42, 5.4)
  stencil('RP-1', 0.6, 2.55)
  stencil('ACCESS 04-B', 0.44, 6.0)
  stencil('FAIRING SEP PLANE', 0.53, 6.55, 11)
  stencil('VENT', 0.47, 8.3)

  // Soot and heat at the base.
  const sootTop = row(1.2)
  const soot = cc.createLinearGradient(0, sootTop, 0, H)
  soot.addColorStop(0, 'rgba(40,36,34,0)')
  soot.addColorStop(1, 'rgba(40,36,34,0.55)')
  cc.fillStyle = soot
  cc.fillRect(0, sootTop, W, H - sootTop)

  const tex = (c: HTMLCanvasElement, srgb: boolean) => {
    const t = new CanvasTexture(c)
    if (srgb) t.colorSpace = SRGBColorSpace
    t.wrapS = RepeatWrapping
    t.wrapT = ClampToEdgeWrapping
    t.anisotropy = 8
    return t
  }

  return { map: tex(color.c, true), roughness: tex(rough.c, false), bump: tex(bump.c, false) }
}

// ------------------------------------------------------------------- pad

/** Pad disc texture; the disc has radius 16 world units. */
export function createPadTexture(): Texture {
  const S = 2048
  const R = 16
  const px = S / (R * 2)
  const rand = mulberry32(19)
  const { c, ctx } = canvas(S, S)
  const cx = S / 2
  const toPx = (u: number) => cx + u * px

  ctx.fillStyle = '#272c33'
  ctx.fillRect(0, 0, S, S)

  // Concrete speckle and stains.
  for (let i = 0; i < 26000; i++) {
    const g = 30 + rand() * 30
    ctx.fillStyle = `rgba(${g},${g + 3},${g + 7},${0.25 + rand() * 0.3})`
    ctx.fillRect(rand() * S, rand() * S, 1 + rand() * 2, 1 + rand() * 2)
  }
  for (let i = 0; i < 40; i++) {
    const x = rand() * S
    const y = rand() * S
    const r = 40 + rand() * 220
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r)
    grad.addColorStop(0, `rgba(10,12,15,${0.12 + rand() * 0.15})`)
    grad.addColorStop(1, 'rgba(10,12,15,0)')
    ctx.fillStyle = grad
    ctx.fillRect(x - r, y - r, r * 2, r * 2)
  }

  // Expansion joints every 2 units.
  ctx.strokeStyle = 'rgba(8,10,13,0.55)'
  ctx.lineWidth = 2
  for (let u = -R; u <= R; u += 2) {
    ctx.beginPath()
    ctx.moveTo(toPx(u), 0)
    ctx.lineTo(toPx(u), S)
    ctx.moveTo(0, toPx(u))
    ctx.lineTo(S, toPx(u))
    ctx.stroke()
  }

  // Soot bloom around the mount, biased toward the trench exit (+x).
  const soot = ctx.createRadialGradient(toPx(1.2), cx, 0, toPx(1.2), cx, 7 * px)
  soot.addColorStop(0, 'rgba(6,7,9,0.85)')
  soot.addColorStop(0.5, 'rgba(6,7,9,0.35)')
  soot.addColorStop(1, 'rgba(6,7,9,0)')
  ctx.fillStyle = soot
  ctx.fillRect(0, 0, S, S)

  // Flame trench running toward +x.
  ctx.fillStyle = '#050608'
  ctx.fillRect(toPx(0.4), toPx(-1.5), (R - 0.4) * px, 3 * px)
  const lip = ctx.createLinearGradient(0, toPx(-1.8), 0, toPx(1.8))
  lip.addColorStop(0, 'rgba(70,76,86,0.0)')
  lip.addColorStop(0.08, 'rgba(70,76,86,0.6)')
  lip.addColorStop(0.11, 'rgba(70,76,86,0.0)')
  lip.addColorStop(0.89, 'rgba(70,76,86,0.0)')
  lip.addColorStop(0.92, 'rgba(70,76,86,0.6)')
  lip.addColorStop(1, 'rgba(70,76,86,0.0)')
  ctx.fillStyle = lip
  ctx.fillRect(toPx(0.4), toPx(-1.8), (R - 0.4) * px, 3.6 * px)

  // Painted markings, worn.
  ctx.strokeStyle = 'rgba(214,222,232,0.22)'
  ctx.lineWidth = 0.14 * px
  ctx.beginPath()
  ctx.arc(cx, cx, 13.6 * px, 0, Math.PI * 2)
  ctx.stroke()
  ctx.lineWidth = 0.08 * px
  for (let a = 0; a < 48; a++) {
    if (a % 2) continue
    const a0 = (a / 48) * Math.PI * 2
    ctx.beginPath()
    ctx.arc(cx, cx, 4.6 * px, a0, a0 + Math.PI / 48)
    ctx.stroke()
  }
  ctx.save()
  ctx.translate(toPx(-6.5), toPx(8.6))
  ctx.rotate(-0.12)
  ctx.fillStyle = 'rgba(214,222,232,0.16)'
  setStretch(ctx, 'ultra-expanded')
  ctx.font = `700 ${1.8 * px}px ${DISPLAY_FONT}`
  ctx.fillText('LC-01', 0, 0)
  ctx.restore()

  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  t.anisotropy = 8
  return t
}

// ----------------------------------------------------------------- smoke

export function createPuffTexture(): Texture {
  const S = 128
  const rand = mulberry32(3)
  const { c, ctx } = canvas(S, S)
  ctx.clearRect(0, 0, S, S)
  for (let i = 0; i < 14; i++) {
    const r = S * (0.14 + rand() * 0.22)
    const x = S / 2 + (rand() - 0.5) * S * 0.36
    const y = S / 2 + (rand() - 0.5) * S * 0.36
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(0, 'rgba(255,255,255,0.32)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, S, S)
  }
  // Keep the sprite inside a soft circle.
  ctx.globalCompositeOperation = 'destination-in'
  const mask = ctx.createRadialGradient(S / 2, S / 2, S * 0.2, S / 2, S / 2, S / 2)
  mask.addColorStop(0, 'rgba(0,0,0,1)')
  mask.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = mask
  ctx.fillRect(0, 0, S, S)
  const t = new CanvasTexture(c)
  t.minFilter = LinearFilter
  t.generateMipmaps = false
  return t
}

// ------------------------------------------------------------------ name

export interface NameTexture {
  texture: Texture
  /** Width / height of the drawn texture. */
  aspect: number
  /**
   * Horizontal position (0..1 across the texture) where the rocket should
   * stand — the gap between the two words on a single line, or 0.5 when stacked.
   */
  anchor: number
}

export function createNameTexture(first: string, last: string, stacked: boolean): NameTexture {
  const size = 300
  const tracking = size * 0.02
  const measure = canvas(8, 8).ctx
  setStretch(measure, 'ultra-expanded')
  setTracking(measure, `${tracking}px`)
  measure.font = `200 ${size}px ${DISPLAY_FONT}`
  const a = measure.measureText(first.toUpperCase()).width
  const b = measure.measureText(last.toUpperCase()).width
  const gap = size * 1.25
  const padX = size * 0.2

  const W = Math.ceil(stacked ? Math.max(a, b) + padX * 2 : a + gap + b + padX * 2)
  const H = Math.ceil(stacked ? size * 2.25 : size * 1.3)
  const { c, ctx } = canvas(W, H)
  setStretch(ctx, 'ultra-expanded')
  setTracking(ctx, `${tracking}px`)
  ctx.font = `200 ${size}px ${DISPLAY_FONT}`
  ctx.fillStyle = '#ffffff'
  ctx.textBaseline = 'middle'

  let anchor = 0.5
  if (stacked) {
    ctx.textAlign = 'center'
    ctx.fillText(first.toUpperCase(), W / 2, H * 0.27)
    ctx.fillText(last.toUpperCase(), W / 2, H * 0.73)
  } else {
    ctx.textAlign = 'left'
    ctx.fillText(first.toUpperCase(), padX, H / 2)
    ctx.fillText(last.toUpperCase(), padX + a + gap, H / 2)
    anchor = (padX + a + gap / 2) / W
  }

  const texture = new CanvasTexture(c)
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = 8
  return { texture, aspect: W / H, anchor }
}
