import { NoToneMapping, PCFShadowMap, SRGBColorSpace, WebGLRenderer } from 'three'
import { DprGovernor } from './dpr'
import type { QualityBudget } from './Quality'

/**
 * WebGL renderer with a DPR cap and dynamic resolution (DprGovernor): the pixel
 * ratio steps down while frames run slow and recovers after sustained headroom.
 */
export class Renderer {
  readonly gl: WebGLRenderer
  width = innerWidth
  height = innerHeight
  pixelRatio: number
  private budget: QualityBudget
  private governor: DprGovernor
  private listeners: Array<(w: number, h: number, dpr: number) => void> = []

  constructor(canvas: HTMLCanvasElement, budget: QualityBudget) {
    this.budget = budget
    this.gl = new WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      stencil: false,
      powerPreference: 'high-performance',
    })
    this.gl.setClearColor(0x05070b, 1)
    this.gl.outputColorSpace = SRGBColorSpace
    this.gl.toneMapping = NoToneMapping
    this.gl.toneMappingExposure = 0.95
    // Post-processing renders several passes per frame; reset stats manually.
    this.gl.info.autoReset = false
    this.gl.shadowMap.enabled = budget.shadows
    this.gl.shadowMap.type = PCFShadowMap
    if (budget.transmission > 0) this.gl.transmissionResolutionScale = budget.transmission
    this.pixelRatio = Math.min(devicePixelRatio, budget.dprCap)
    this.governor = this.createGovernor()
    this.gl.setPixelRatio(this.pixelRatio)
    this.gl.setSize(this.width, this.height, false)
    addEventListener('resize', this.handleResize)
  }

  onResize(fn: (w: number, h: number, dpr: number) => void) {
    this.listeners.push(fn)
    fn(this.width, this.height, this.pixelRatio)
  }

  /** Feed the last frame duration (seconds). */
  adapt(dt: number) {
    const next = this.governor.sample(dt)
    if (next === null) return
    this.pixelRatio = next
    this.applySize()
  }

  /** Ratio range for this display: up to its devicePixelRatio (capped by tier). */
  private policy() {
    const max = Math.min(devicePixelRatio, this.budget.dprCap)
    return { min: Math.min(this.budget.dprMin, max), max }
  }

  private createGovernor() {
    return new DprGovernor(this.pixelRatio, this.policy())
  }

  private handleResize = () => {
    this.width = innerWidth
    this.height = innerHeight
    // Most resizes (a phone's URL bar) keep the governor's state; a move to a display with
    // another pixel ratio only changes its bounds.
    const clamped = this.governor.setPolicy(this.policy())
    if (clamped !== null) this.pixelRatio = clamped
    this.applySize()
  }

  private applySize() {
    this.gl.setPixelRatio(this.pixelRatio)
    this.gl.setSize(this.width, this.height, false)
    for (const fn of this.listeners) fn(this.width, this.height, this.pixelRatio)
  }
}
