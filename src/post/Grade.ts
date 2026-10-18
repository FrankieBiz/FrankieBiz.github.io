import { BlendFunction, Effect, Pass } from 'postprocessing'
import {
  HalfFloatType,
  LinearFilter,
  ShaderMaterial,
  Uniform,
  Vector2,
  WebGLRenderTarget,
  type Data3DTexture,
  type Texture,
  type WebGLRenderer,
} from 'three'

export interface GradeAssets {
  lut?: Data3DTexture
  dirt?: Texture
}

/** Picks the colour-grade LUT and lens-dirt map out of the loaded assets (either may be missing). */
export function gradeAssets(assets: Map<string, unknown>): GradeAssets {
  const cube = assets.get('grade-lut') as { texture3D?: Data3DTexture } | undefined
  return { lut: cube?.texture3D, dirt: assets.get('lens-dirt') as Texture | undefined }
}

const STREAK_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 1.0, 1.0);
}
`

const STREAK_FRAG = /* glsl */ `
uniform sampler2D uSource;
uniform vec2 uTexel;
uniform float uSpread;
varying vec2 vUv;
void main() {
  vec3 sum = vec3(0.0);
  float total = 0.0;
  for (int i = -4; i <= 4; i++) {
    float fi = float(i);
    float w = exp(-fi * fi / 8.0);
    sum += texture2D(uSource, vUv + vec2(fi * uSpread * uTexel.x, 0.0)).rgb * w;
    total += w;
  }
  gl_FragColor = vec4(sum / total, 1.0);
}
`

/**
 * Anamorphic streak source: the bloom blurred horizontally in three
 * quarter-resolution passes with growing spacing (1, 3, 9 texels). Each pass
 * blurs an already-smooth signal, so even pinpoint glints streak cleanly.
 */
export class StreakPass extends Pass {
  private a: WebGLRenderTarget
  private b: WebGLRenderTarget
  private material: ShaderMaterial

  constructor(private source: Texture) {
    super('StreakPass')
    this.needsSwap = false
    const options = { type: HalfFloatType, depthBuffer: false, minFilter: LinearFilter, magFilter: LinearFilter }
    this.a = new WebGLRenderTarget(1, 1, options)
    this.b = new WebGLRenderTarget(1, 1, options)
    this.material = new ShaderMaterial({
      uniforms: { uSource: new Uniform(source), uTexel: new Uniform(new Vector2(1, 1)), uSpread: new Uniform(1) },
      vertexShader: STREAK_VERT,
      fragmentShader: STREAK_FRAG,
      depthTest: false,
      depthWrite: false,
    })
    this.fullscreenMaterial = this.material
  }

  get texture(): Texture {
    return this.a.texture
  }

  override render(renderer: WebGLRenderer) {
    const u = this.material.uniforms
    const steps: Array<[Texture, WebGLRenderTarget, number]> = [
      [this.source, this.a, 1],
      [this.a.texture, this.b, 3],
      [this.b.texture, this.a, 9],
    ]
    for (const [src, dst, spread] of steps) {
      u.uSource.value = src
      u.uSpread.value = spread
      renderer.setRenderTarget(dst)
      renderer.render(this.scene, this.camera)
    }
  }

  override setSize(width: number, height: number) {
    const w = Math.max(1, Math.round(width / 4))
    const h = Math.max(1, Math.round(height / 4))
    this.a.setSize(w, h)
    this.b.setSize(w, h)
    ;(this.material.uniforms.uTexel.value as Vector2).set(1 / w, 1 / h)
  }

  override dispose() {
    this.a.dispose()
    this.b.dispose()
    this.material.dispose()
    super.dispose()
  }
}

/**
 * Lens dirt and anamorphic streaks, driven by the bloom result: smudges only
 * light up where bright sources (floods, flame, sun) bloom across them, and the
 * streak (from StreakPass) stretches that light horizontally.
 */
const FRAGMENT = /* glsl */ `
uniform sampler2D uBloom;
uniform sampler2D uDirt;
uniform sampler2D uStreak;
uniform float uDirtStrength;
uniform float uStreakStrength;

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec3 bloom = texture2D(uBloom, uv).rgb;
  float dirt = texture2D(uDirt, uv).r;
  vec3 col = inputColor.rgb + bloom * dirt * uDirtStrength;
  float streak = dot(texture2D(uStreak, uv).rgb, vec3(0.2126, 0.7152, 0.0722));
  col += vec3(0.55, 0.7, 1.0) * streak * uStreakStrength;
  outputColor = vec4(col, inputColor.a);
}
`

export class LensDirtEffect extends Effect {
  /** Pass `streak` (StreakPass.texture) on tiers that afford it, or null. */
  constructor(bloom: Texture, dirt: Texture, streak: Texture | null) {
    super('LensDirtEffect', FRAGMENT, {
      blendFunction: BlendFunction.SRC,
      uniforms: new Map<string, Uniform>([
        ['uBloom', new Uniform(bloom)],
        ['uDirt', new Uniform(dirt)],
        ['uStreak', new Uniform(streak ?? dirt)],
        ['uDirtStrength', new Uniform(0.55)],
        ['uStreakStrength', new Uniform(streak ? 0.55 : 0)],
      ]),
    })
  }
}
