import { DepthOfFieldEffect } from 'postprocessing'
import type { WebGLRenderTarget } from 'three'

/** Internals postprocessing sizes at full resolution whatever `resolutionScale` says. */
type FullSizeTargets = Partial<Record<'renderTargetFar' | 'renderTargetMasked', WebGLRenderTarget>>

/**
 * postprocessing's depth of field, with the far-field bokeh and its mask rendered
 * at the scaled resolution too. The far field is a blur, so it upsamples cleanly;
 * the circle of confusion stays full-size for sharp in-focus edges. Halves the
 * pass on an Intel iGPU at DPR 1.5 (scripts/qa-gpu.mjs: 4.8 → 2.4 ms in orbit).
 */
export class ScaledDepthOfField extends DepthOfFieldEffect {
  override setSize(width: number, height: number) {
    super.setSize(width, height)
    const { width: w, height: h } = this.resolution
    const targets = this as unknown as FullSizeTargets
    targets.renderTargetFar?.setSize(w, h)
    targets.renderTargetMasked?.setSize(w, h)
  }
}
