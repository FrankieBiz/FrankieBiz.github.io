import {
  BlendFunction,
  BloomEffect,
  EffectComposer,
  EffectPass,
  LUT3DEffect,
  NoiseEffect,
  RenderPass,
  SMAAEffect,
  ToneMappingEffect,
  ToneMappingMode,
  VignetteEffect,
  type Effect,
} from 'postprocessing'
import type { N8AOPostPass } from 'n8ao'
import { Color, HalfFloatType, type Camera, type Scene, type WebGLRenderer } from 'three'
import type { QualityBudget } from '../core/Quality'
import { LensDirtEffect, StreakPass, type GradeAssets } from './Grade'
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
  private aoPass: N8AOPostPass | null = null
  private bloomPass: EffectPass
  private finishPass: EffectPass
  private aaPass: EffectPass | null = null

  /**
   * `AOPass` is the lazily imported N8AO pass class (only fetched on tiers that
   * use ambient occlusion); without it AO stays off and MSAA stays on.
   */
  constructor(
    renderer: WebGLRenderer,
    scene: Scene,
    camera: Camera,
    budget: QualityBudget,
    grade: GradeAssets = {},
    AOPass?: typeof N8AOPostPass,
  ) {
    // Ambient occlusion can't read multisampled depth, so AO tiers swap MSAA for SMAA.
    const ao = budget.ao !== 'off' && AOPass !== undefined
    this.composer = new EffectComposer(renderer, { frameBufferType: HalfFloatType, multisampling: ao ? 0 : budget.msaa })
    this.renderPass = new RenderPass(scene, camera)
    this.composer.addPass(this.renderPass)
    if (ao) {
      this.aoPass = new AOPass!(scene, camera, innerWidth, innerHeight)
      this.aoPass.setQualityMode(budget.ao === 'full' ? 'Medium' : 'Low')
      Object.assign(this.aoPass.configuration, {
        aoRadius: 1.6,
        distanceFalloff: 1.2,
        intensity: 2.2,
        color: new Color(0x000000),
        halfRes: budget.ao === 'half',
        depthAwareUpsampling: true,
      })
      this.composer.addPass(this.aoPass)
    }

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
    // Anamorphic streaks (high tier): blurred from the bloom between the two effect passes.
    const streak = bloom && grade.dirt && budget.tier === 'high' ? new StreakPass(bloom.texture) : null
    if (streak) this.composer.addPass(streak)

    this.lens = new LensEffect()
    const finish: Effect[] = [this.lens]
    // Lens dirt needs bloom to light it; anamorphic streaks only on the high tier.
    if (bloom && grade.dirt) finish.push(new LensDirtEffect(bloom.texture, grade.dirt, streak?.texture ?? null))
    if (grade.lut) finish.push(new LUT3DEffect(grade.lut, { tetrahedralInterpolation: budget.tier !== 'low' }))
    const vignette = new VignetteEffect({ offset: 0.3, darkness: 0.66 })
    const grain = new NoiseEffect({ blendFunction: BlendFunction.OVERLAY })
    grain.blendMode.opacity.value = 0.11
    finish.push(vignette, grain)
    this.finishPass = new EffectPass(camera, ...finish)
    this.composer.addPass(this.finishPass)
    if (ao) {
      this.aaPass = new EffectPass(camera, new SMAAEffect())
      this.composer.addPass(this.aaPass)
    }
  }

  setCamera(camera: Camera) {
    this.renderPass.mainCamera = camera
    this.bloomPass.mainCamera = camera
    this.finishPass.mainCamera = camera
    if (this.aaPass) this.aaPass.mainCamera = camera
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
