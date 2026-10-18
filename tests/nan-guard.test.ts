import { BloomEffect } from 'postprocessing'
import { ShaderMaterial } from 'three'
import { describe, expect, it } from 'vitest'
import { guardBloomInput } from '../src/post/nanGuard'

describe('bloom NaN guard', () => {
  it('sanitises the bloom luminance input of the installed postprocessing', () => {
    const bloom = new BloomEffect({ mipmapBlur: true, luminanceThreshold: 0.92 })
    // Fails on a postprocessing upgrade that changes the shader: the guard must be re-anchored.
    expect(guardBloomInput(bloom)).toBe(true)
    const frag = (bloom.luminancePass.fullscreenMaterial as ShaderMaterial).fragmentShader
    expect(frag).toContain('isnan(texel)')
    expect(frag.indexOf('isnan(texel)')).toBeGreaterThan(frag.indexOf('texture2D(inputBuffer,vUv)'))
  })

  it('is idempotent', () => {
    const bloom = new BloomEffect({ mipmapBlur: true })
    guardBloomInput(bloom)
    guardBloomInput(bloom)
    const frag = (bloom.luminancePass.fullscreenMaterial as ShaderMaterial).fragmentShader
    expect(frag.split('isnan(texel)').length - 1).toBe(1)
  })

  it('reports, rather than throws, when the shader no longer matches', () => {
    const fake = { luminancePass: { fullscreenMaterial: new ShaderMaterial({ fragmentShader: 'void main(){}' }) } }
    expect(guardBloomInput(fake as unknown as BloomEffect)).toBe(false)
  })
})
