import { BlendFunction, Effect, EffectAttribute } from 'postprocessing'
import { Uniform } from 'three'

/**
 * Lens + transition in one pass: radial chromatic aberration that is always
 * on (subtly), plus a transition driven by `amount` that combines horizontal
 * slice displacement, a heat-haze warp, a stronger chroma split and a frost
 * that creeps in from the edges before whiting out at the peak.
 */
const FRAGMENT = /* glsl */ `
uniform float uAmount;
uniform float uTime;
uniform float uAberration;
uniform float uAspect;

float lnHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float lnNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(lnHash(i), lnHash(i + vec2(1.0, 0.0)), u.x), mix(lnHash(i + vec2(0.0, 1.0)), lnHash(i + vec2(1.0, 1.0)), u.x), u.y);
}

vec2 distort(vec2 uv) {
  if (uAmount < 0.001) return uv;
  float rows = mix(16.0, 96.0, uAmount);
  float row = floor(uv.y * rows);
  float tick = floor(uTime * 24.0);
  float pick = step(1.0 - uAmount * 0.8, lnHash(vec2(row, tick)));
  uv.x += (lnHash(vec2(row * 1.7, tick + 3.0)) - 0.5) * 0.1 * uAmount * pick;
  vec2 c = uv - 0.5;
  uv -= c * uAmount * 0.16 * (lnNoise(uv * 5.0 + uTime * 1.5) - 0.35);
  return uv;
}

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec2 duv = distort(uv);
  vec2 dir = duv - 0.5;
  float d = length(dir);
  float amt = uAberration * d * d + uAmount * 0.014;
  vec2 off = dir / max(d, 1e-4) * amt;
  vec3 col = vec3(
    texture2D(inputBuffer, duv + off).r,
    texture2D(inputBuffer, duv).g,
    texture2D(inputBuffer, duv - off).b
  );

  vec2 fp = vec2(uv.x * uAspect, uv.y);
  float crystal = lnNoise(fp * 16.0) * 0.55 + lnNoise(fp * 48.0) * 0.3 + lnNoise(fp * 140.0) * 0.15;
  float creep = smoothstep(0.0, 1.0, uAmount * 1.5 - (0.72 - d));
  float frost = clamp(creep * (0.4 + crystal * 0.8), 0.0, 1.0) * smoothstep(0.05, 0.55, uAmount);
  vec3 ice = vec3(0.86, 0.91, 0.96);
  col = mix(col, ice, frost * 0.88);
  col += ice * pow(uAmount, 4.0) * 0.9;
  outputColor = vec4(col, inputColor.a);
}
`

export class LensEffect extends Effect {
  constructor() {
    super('LensEffect', FRAGMENT, {
      blendFunction: BlendFunction.SRC,
      attributes: EffectAttribute.CONVOLUTION,
      uniforms: new Map<string, Uniform>([
        ['uAmount', new Uniform(0)],
        ['uTime', new Uniform(0)],
        ['uAberration', new Uniform(0.0055)],
        ['uAspect', new Uniform(1)],
      ]),
    })
  }

  set amount(v: number) {
    this.uniforms.get('uAmount')!.value = v
  }

  get amount() {
    return this.uniforms.get('uAmount')!.value as number
  }

  set time(v: number) {
    this.uniforms.get('uTime')!.value = v
  }

  set aspect(v: number) {
    this.uniforms.get('uAspect')!.value = v
  }
}
