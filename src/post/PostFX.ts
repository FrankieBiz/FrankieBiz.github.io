import {
  BlendFunction,
  BloomEffect,
  EffectComposer,
  EffectPass,
  GodRaysEffect,
  KernelSize,
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
import { Color, HalfFloatType, Vector3, type Camera, type Mesh, type Scene, type WebGLRenderer } from 'three'
import type { QualityBudget } from '../core/Quality'
import { LensDirtEffect, StreakPass, type GradeAssets } from './Grade'
import { LensEffect } from './LensEffect'
import { guardBloomInput } from './nanGuard'
import { ScaledDepthOfField } from './ScaledDepthOfField'

/**
 * Two merged passes: [bloom → ACES tone mapping] in HDR, then
 * [lens/transition → lens dirt → colour grade → vignette → grain] on the
 * tone-mapped image. The lens effect samples its input directly, so anything
 * that must survive it comes after it in the pass.
 */
export interface PostFXOptions {
  grade?: GradeAssets
  /** The lazily imported N8AO pass class; without it AO stays off and MSAA stays on. */
  AOPass?: typeof N8AOPostPass
  /** Focus pulls (off under reduced motion). */
  depthOfField?: boolean
  /** Engine light-shaft source (transparent, no depth write); shafts are off without it. */
  shaftSource?: Mesh
}

export class PostFX {
  readonly composer: EffectComposer
  readonly lens: LensEffect
  private renderPass: RenderPass
  private aoPass: N8AOPostPass | null = null
  private dof: ScaledDepthOfField | null = null
  private dofPass: EffectPass | null = null
  private maxBokeh: number
  private shafts: GodRaysEffect | null = null
  private shaftPass: EffectPass | null = null
  private bloomPass: EffectPass
  private finishPass: EffectPass
  private aaPass: EffectPass | null = null

  constructor(renderer: WebGLRenderer, scene: Scene, camera: Camera, budget: QualityBudget, options: PostFXOptions = {}) {
    const { grade = {}, AOPass } = options
    // Ambient occlusion can't read multisampled depth, so AO tiers swap MSAA for SMAA.
    const ao = budget.ao !== 'off' && AOPass !== undefined
    this.composer = new EffectComposer(renderer, { frameBufferType: HalfFloatType, multisampling: ao ? 0 : budget.msaa })
    this.renderPass = new RenderPass(scene, camera)
    this.composer.addPass(this.renderPass)
    if (ao) {
      this.aoPass = new AOPass!(scene, camera, innerWidth, innerHeight)
      this.aoPass.setQualityMode(budget.ao === 'full' ? 'Medium' : 'Low')
      // Transparency awareness re-renders every transparent object (all the smoke) into two
      // full-res targets each frame: 6–10 ms at ignition on an iGPU, for a barely visible gain.
      this.aoPass.autoDetectTransparency = false
      Object.assign(this.aoPass.configuration, {
        transparencyAware: false,
        aoRadius: 1.6,
        distanceFalloff: 1.2,
        intensity: 2.2,
        color: new Color(0x000000),
        halfRes: budget.ao === 'half',
        depthAwareUpsampling: true,
      })
      this.composer.addPass(this.aoPass)
    }

    // Depth of field runs on the HDR image before bloom, so out-of-focus highlights bloom naturally.
    this.maxBokeh = budget.tier === 'high' ? 2.6 : 1.8
    if (options.depthOfField && budget.tier !== 'low') {
      this.dof = new ScaledDepthOfField(camera, { focusDistance: 10, focusRange: 4, bokehScale: 0, resolutionScale: budget.tier === 'high' ? 0.75 : 0.5 })
      this.dof.target = new Vector3()
      this.dofPass = new EffectPass(camera, this.dof)
      this.dofPass.enabled = false
      this.composer.addPass(this.dofPass)
    }

    // Engine light shafts: their own pass so it costs nothing while the engine is off.
    if (options.shaftSource && budget.tier !== 'low') {
      this.shafts = new GodRaysEffect(camera, options.shaftSource, {
        samples: budget.tier === 'high' ? 48 : 32,
        density: 0.95,
        decay: 0.93,
        weight: 0.3,
        exposure: 0.36,
        clampMax: 1,
        resolutionScale: 0.5,
        kernelSize: KernelSize.SMALL,
        blur: true,
      })
      this.shaftPass = new EffectPass(camera, this.shafts)
      this.shaftPass.enabled = false
      this.composer.addPass(this.shaftPass)
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
    if (bloom && !guardBloomInput(bloom) && import.meta.env.DEV) console.warn('Bloom NaN guard did not apply: postprocessing changed its luminance shader')
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

  /** Ambient occlusion on/off; SMAA keeps anti-aliasing either way. */
  setOcclusion(enabled: boolean) {
    if (this.aoPass) this.aoPass.enabled = enabled
  }

  /** Turn the engine light shafts on/off and scale them with thrust. */
  setShafts(enabled: boolean, strength: number) {
    if (!this.shafts || !this.shaftPass) return
    this.shaftPass.enabled = enabled
    this.shafts.blendMode.opacity.value = Math.min(strength, 1) * 0.85
  }

  /** Autofocus on `point` with blur strength `amount` (0..1); the pass sleeps at 0. */
  setFocus(point: Vector3, amount: number) {
    if (!this.dof || !this.dofPass) return
    this.dofPass.enabled = amount > 0.01
    if (!this.dofPass.enabled) return
    this.dof.target!.copy(point)
    this.dof.bokehScale = amount * this.maxBokeh
  }

  setCamera(camera: Camera) {
    this.renderPass.mainCamera = camera
    if (this.dofPass) this.dofPass.mainCamera = camera
    if (this.shaftPass) this.shaftPass.mainCamera = camera
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
