export type Tier = 'high' | 'medium' | 'low'

export interface QualityBudget {
  tier: Tier
  dprCap: number
  dprMin: number
  smoke: number
  trail: number
  contact: number
  stars: number
  /** Render scale of the refraction pass behind glass (three's transmissionResolutionScale); 0 = frosted, no transmission. */
  transmission: number
  bloom: 'full' | 'half' | 'off'
  /** Ambient occlusion (N8AO). When on, hardware MSAA is replaced by SMAA. */
  ao: 'full' | 'half' | 'off'
  msaa: number
  shadows: boolean
}

export const BUDGETS: Record<Tier, Omit<QualityBudget, 'tier'>> = {
  high: { dprCap: 1.75, dprMin: 1, smoke: 1400, trail: 4600, contact: 20000, stars: 6000, transmission: 1, bloom: 'full', ao: 'full', msaa: 4, shadows: true },
  medium: { dprCap: 1.5, dprMin: 0.85, smoke: 1000, trail: 3000, contact: 14000, stars: 4000, transmission: 0.5, bloom: 'half', ao: 'half', msaa: 2, shadows: true },
  low: { dprCap: 1.25, dprMin: 0.75, smoke: 420, trail: 1100, contact: 6000, stars: 2000, transmission: 0, bloom: 'off', ao: 'off', msaa: 0, shadows: false },
}

export interface QualitySignals {
  override: string | null
  coarsePointer: boolean
  viewportWidth: number
  gpu: string
}

const SOFTWARE = /swiftshader|llvmpipe|softpipe|software|basic render/i
const STRONG = /nvidia|geforce|rtx|gtx|quadro|radeon|amd|apple m\d/i

export function pickTier(s: QualitySignals): Tier {
  if (s.override === 'high' || s.override === 'medium' || s.override === 'low') return s.override
  if (SOFTWARE.test(s.gpu)) return 'low'
  if (s.coarsePointer || s.viewportWidth < 820) return 'low'
  if (STRONG.test(s.gpu)) return 'high'
  return 'medium'
}

export function readGpuString(): string {
  try {
    const gl = document.createElement('canvas').getContext('webgl2')
    if (!gl) return ''
    const ext = gl.getExtension('WEBGL_debug_renderer_info')
    const name = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    return String(name ?? '')
  } catch {
    return ''
  }
}

export function webglAvailable(): boolean {
  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl2')
    const ok = !!gl
    gl?.getExtension('WEBGL_lose_context')?.loseContext()
    return ok
  } catch {
    return false
  }
}

export interface Quality {
  budget: QualityBudget
  reducedMotion: boolean
  coarsePointer: boolean
  gpu: string
}

export function detectQuality(): Quality {
  const params = new URLSearchParams(location.search)
  const coarsePointer = matchMedia('(pointer: coarse)').matches
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches || params.get('motion') === 'reduced'
  const gpu = readGpuString()
  const tier = pickTier({ override: params.get('quality'), coarsePointer, viewportWidth: innerWidth, gpu })
  return { budget: { tier, ...BUDGETS[tier] }, reducedMotion, coarsePointer, gpu }
}
