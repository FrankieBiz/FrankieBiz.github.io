import { BlendFunction, Effect } from 'postprocessing'
import { Uniform, Vector2, type Data3DTexture, type Texture } from 'three'

export interface GradeAssets {
  lut?: Data3DTexture
  dirt?: Texture
}

/** Picks the colour-grade LUT and lens-dirt map out of the loaded assets (either may be missing). */
export function gradeAssets(assets: Map<string, unknown>): GradeAssets {
  const cube = assets.get('grade-lut') as { texture3D?: Data3DTexture } | undefined
  return { lut: cube?.texture3D, dirt: assets.get('lens-dirt') as Texture | undefined }
}

/**
 * Lens dirt and anamorphic streaks, driven by the bloom result: smudges only
 * light up where bright sources (floods, flame, sun) bloom across them, and the
 * streak stretches that bloom horizontally like an anamorphic lens.
 */
const FRAGMENT = /* glsl */ `
uniform sampler2D uBloom;
uniform sampler2D uDirt;
uniform float uDirtStrength;
uniform float uStreak;
uniform vec2 uTexel;

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec3 bloom = texture2D(uBloom, uv).rgb;
  float dirt = texture2D(uDirt, uv).r;
  vec3 col = inputColor.rgb + bloom * dirt * uDirtStrength;

  if (uStreak > 0.0) {
    // Dense, evenly spaced taps with a Gaussian falloff: the copies overlap into
    // one continuous streak instead of separate ghosts.
    vec3 sum = vec3(0.0);
    for (int i = 1; i <= 12; i++) {
      float fi = float(i);
      float offset = fi * uTexel.x * 11.0;
      float weight = exp(-(fi * fi) / 40.0);
      sum += (texture2D(uBloom, uv + vec2(offset, 0.0)).rgb + texture2D(uBloom, uv - vec2(offset, 0.0)).rgb) * weight;
    }
    float energy = dot(sum, vec3(0.2126, 0.7152, 0.0722));
    col += vec3(0.55, 0.7, 1.0) * energy * uStreak;
  }
  outputColor = vec4(col, inputColor.a);
}
`

export class LensDirtEffect extends Effect {
  constructor(bloom: Texture, dirt: Texture, streak: boolean) {
    super('LensDirtEffect', FRAGMENT, {
      blendFunction: BlendFunction.SRC,
      uniforms: new Map<string, Uniform>([
        ['uBloom', new Uniform(bloom)],
        ['uDirt', new Uniform(dirt)],
        ['uDirtStrength', new Uniform(0.55)],
        ['uStreak', new Uniform(streak ? 0.03 : 0)],
        ['uTexel', new Uniform(new Vector2(1 / 1440, 1 / 900))],
      ]),
    })
  }

  override setSize(width: number, height: number) {
    ;(this.uniforms.get('uTexel')!.value as Vector2).set(1 / width, 1 / height)
  }
}
