import {
  BlendFunction,
  BloomEffect,
  EffectComposer,
  EffectPass,
  NoiseEffect,
  RenderPass,
  ToneMappingEffect,
  ToneMappingMode,
  VignetteEffect,
} from 'postprocessing'
import { HalfFloatType, type Camera, type Scene, type WebGLRenderer } from 'three'
import type { QualityBudget } from '../core/Quality'
import { LensEffect } from './LensEffect'

/**
 * Two merged passes: [bloom → ACES tone mapping] in HDR, then
 * [lens/transition → vignette → grain] on the tone-mapped image.
 */
export class PostFX {
  readonly composer: EffectComposer
  readonly lens: LensEffect
  private renderPass: RenderPass
  private bloomPass: EffectPass
  private finishPass: EffectPass

  constructor(renderer: WebGLRenderer, scene: Scene, camera: Camera, budget: QualityBudget) {
    this.composer = new EffectComposer(renderer, { frameBufferType: HalfFloatType, multisampling: budget.msaa })
    this.renderPass = new RenderPass(scene, camera)
    this.composer.addPass(this.renderPass)

    const tone = new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC })
    const effects = budget.bloom === 'off'
      ? [tone]
      : [
          new BloomEffect({
            mipmapBlur: true,
            intensity: 0.95,
            luminanceThreshold: 0.92,
            luminanceSmoothing: 0.22,
            radius: 0.78,
            resolutionScale: budget.bloom === 'half' ? 0.5 : 1,
          }),
          tone,
        ]
    this.bloomPass = new EffectPass(camera, ...effects)
    this.composer.addPass(this.bloomPass)

    this.lens = new LensEffect()
    const vignette = new VignetteEffect({ offset: 0.3, darkness: 0.66 })
    const grain = new NoiseEffect({ blendFunction: BlendFunction.OVERLAY })
    grain.blendMode.opacity.value = 0.11
    this.finishPass = new EffectPass(camera, this.lens, vignette, grain)
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
