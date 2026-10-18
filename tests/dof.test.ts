import { PerspectiveCamera, type WebGLRenderTarget } from 'three'
import { describe, expect, it } from 'vitest'
import { ScaledDepthOfField } from '../src/post/ScaledDepthOfField'

type Targets = Record<'renderTargetFar' | 'renderTargetMasked' | 'renderTargetCoC' | 'renderTargetNear', WebGLRenderTarget>

describe('scaled depth of field', () => {
  it('renders the far-field bokeh and mask at the scaled resolution, keeping CoC full-size', () => {
    const dof = new ScaledDepthOfField(new PerspectiveCamera(), { resolutionScale: 0.5 })
    dof.setSize(2000, 1000)
    const t = dof as unknown as Targets
    // Guards against a postprocessing upgrade renaming the internals this relies on.
    for (const key of ['renderTargetFar', 'renderTargetMasked', 'renderTargetCoC', 'renderTargetNear'] as const) {
      expect(t[key], key).toBeDefined()
    }
    expect([t.renderTargetFar.width, t.renderTargetFar.height]).toEqual([1000, 500])
    expect([t.renderTargetMasked.width, t.renderTargetMasked.height]).toEqual([1000, 500])
    expect([t.renderTargetNear.width, t.renderTargetNear.height]).toEqual([1000, 500])
    // Sharp in-focus edges come from the full-resolution circle of confusion.
    expect([t.renderTargetCoC.width, t.renderTargetCoC.height]).toEqual([2000, 1000])
  })

  it('follows resolution-scale changes', () => {
    const dof = new ScaledDepthOfField(new PerspectiveCamera(), { resolutionScale: 0.5 })
    dof.setSize(2000, 1000)
    dof.resolution.scale = 0.25
    const t = dof as unknown as Targets
    expect([t.renderTargetFar.width, t.renderTargetFar.height]).toEqual([500, 250])
  })
})
