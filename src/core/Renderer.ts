import { NoToneMapping, PCFShadowMap, SRGBColorSpace, WebGLRenderer } from 'three'
import type { QualityBudget } from './Quality'

/**
 * WebGL renderer with a DPR cap and simple dynamic resolution: if frames run
 * long for a sustained period the pixel ratio steps down, and recovers when
 * there is headroom again.
 */
export class Renderer {
  readonly gl: WebGLRenderer
  width = innerWidth
  height = innerHeight
  pixelRatio: number
  private budget: QualityBudget
  private frameTimes: number[] = []
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
    this.pixelRatio = Math.min(devicePixelRatio, budget.dprCap)
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
    this.frameTimes.push(dt)
    if (this.frameTimes.length < 90) return
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length
    this.frameTimes.length = 0
    const max = Math.min(devicePixelRatio, this.budget.dprCap)
    let next = this.pixelRatio
    if (avg > 1 / 45) next = Math.max(this.budget.dprMin, this.pixelRatio - 0.15)
    else if (avg < 1 / 58 && this.pixelRatio < max) next = Math.min(max, this.pixelRatio + 0.1)
    if (Math.abs(next - this.pixelRatio) > 0.01) {
      this.pixelRatio = next
      this.applySize()
    }
  }

  private handleResize = () => {
    this.width = innerWidth
    this.height = innerHeight
    this.pixelRatio = Math.min(this.pixelRatio, devicePixelRatio, this.budget.dprCap)
    this.applySize()
  }

  private applySize() {
    this.gl.setPixelRatio(this.pixelRatio)
    this.gl.setSize(this.width, this.height, false)
    for (const fn of this.listeners) fn(this.width, this.height, this.pixelRatio)
  }
}
