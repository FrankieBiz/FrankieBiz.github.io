import {
  BlendFunction,
  BloomEffect,
  EffectComposer,
  EffectPass,
  LUT3DEffect,
  NoiseEffect,
  RenderPass,
  ToneMappingEffect,
  ToneMappingMode,
  VignetteEffect,
  type Effect,
} from 'postprocessing'
import { HalfFloatType, type Camera, type Scene, type WebGLRenderer } from 'three'
import type { QualityBudget } from '../core/Quality'
import { LensDirtEffect, type GradeAssets } from './Grade'
import { LensEffect } from './LensEffect'

/**
 * Two merged passes: [bloom → ACES tone mapping] in HDR, then
 * [lens/transition → lens dirt → colour grade → vignette → grain] on the
 * tone-mapped image. The lens effect samples its input directly, so anything
 * that must survive it comes after it in the pass.
 */
export class PostFX {
  readonly composer: EffectComposer
  readonly lens: LensEffect
  private renderPass: RenderPass
  private bloomPass: EffectPass
  private finishPass: EffectPass

  constructor(renderer: WebGLRenderer, scene: Scene, camera: Camera, budget: QualityBudget, grade: GradeAssets = {}) {
    this.composer = new EffectComposer(renderer, { frameBufferType: HalfFloatType, multisampling: budget.msaa })
    this.renderPass = new RenderPass(scene, camera)
    this.composer.addPass(this.renderPass)

    const tone = new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC })
    const bloom =
      budget.bloom === 'off'
        ? null
        : new BloomEffect({
            mipmapBlur: true,
            intensity: 0.95,
            luminanceThreshold: 0.92,
            luminanceSmoothing: 0.22,
            radius: 0.78,
            resolutionScale: budget.bloom === 'half' ? 0.5 : 1,
          })
    this.bloomPass = new EffectPass(camera, ...(bloom ? [bloom, tone] : [tone]))
    this.composer.addPass(this.bloomPass)

    this.lens = new LensEffect()
    const finish: Effect[] = [this.lens]
    // Lens dirt needs bloom to light it; anamorphic streaks only on the high tier.
    if (bloom && grade.dirt) finish.push(new LensDirtEffect(bloom.texture, grade.dirt, budget.tier === 'high'))
    if (grade.lut) finish.push(new LUT3DEffect(grade.lut, { tetrahedralInterpolation: budget.tier !== 'low' }))
    const vignette = new VignetteEffect({ offset: 0.3, darkness: 0.66 })
    const grain = new NoiseEffect({ blendFunction: BlendFunction.OVERLAY })
    grain.blendMode.opacity.value = 0.11
    finish.push(vignette, grain)
    this.finishPass = new EffectPass(camera, ...finish)
    this.composer.addPass(this.finishPass)
  }

  setCamera(camera: Camera) {
    this.renderPass.mainCamera = camera
    this.bloomPass.mainCamera = camera
    this.finishPass.mainCamera = camera
  }

  setSize(width: number, height: number) {
    this.composer.setSize(width, height, false)
    this.lens.aspect = width / height
  }

  render(dt: number, time: number) {
    this.lens.time = time
    this.composer.render(dt)
  }
}
