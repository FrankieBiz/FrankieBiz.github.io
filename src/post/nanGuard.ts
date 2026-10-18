import type { BloomEffect } from 'postprocessing'
import type { ShaderMaterial } from 'three'

const ANCHOR = 'vec4 texel=texture2D(inputBuffer,vUv);'
// max() drops NaN on drivers whose min/max return the non-NaN operand (Mesa); the explicit
// test covers the rest. Negative and infinite input never belongs in a bloom source anyway.
const GUARD = 'texel=max(texel,vec4(0.0));if(any(isnan(texel))||any(isinf(texel)))texel=vec4(0.0);'

/**
 * Bloom blurs its source down a mip chain and back up, so a single NaN pixel from any
 * material ends up in every pixel of the bloom texture and blacks out the whole frame
 * (seen on Intel/Mesa). Sanitise the luminance pass input so a bad pixel stays one pixel.
 * Returns false (and changes nothing) if postprocessing's shader no longer matches.
 */
export function guardBloomInput(bloom: BloomEffect): boolean {
  const material = bloom.luminancePass.fullscreenMaterial as ShaderMaterial
  const frag = material.fragmentShader
  if (frag.includes(GUARD)) return true
  if (!frag.includes(ANCHOR)) return false
  material.fragmentShader = frag.replace(ANCHOR, ANCHOR + GUARD)
  material.needsUpdate = true
  return true
}
