import { AdditiveBlending, BufferAttribute, BufferGeometry, LineSegments, ShaderMaterial } from 'three'
import { mulberry32 } from './textures'

/**
 * Sparks thrown off the pad at ignition: short streaks on ballistic arcs, cooling
 * from yellow-white to red. Each spark is a line from where it is now to where it
 * was a moment ago, so it streaks with its own velocity. Stateless like the exhaust.
 */
export class Sparks {
  readonly lines: LineSegments
  private material: ShaderMaterial

  constructor(count: number) {
    const rand = mulberry32(97)
    const seeds = new Float32Array(count * 2 * 4)
    const ends = new Float32Array(count * 2)
    for (let i = 0; i < count; i++) {
      const s = [rand(), rand(), rand(), rand()]
      for (let e = 0; e < 2; e++) {
        seeds.set(s, (i * 2 + e) * 4)
        ends[i * 2 + e] = e
      }
    }
    const geo = new BufferGeometry()
    geo.setAttribute('position', new BufferAttribute(new Float32Array(count * 2 * 3), 3))
    geo.setAttribute('aSeed', new BufferAttribute(seeds, 4))
    geo.setAttribute('aEnd', new BufferAttribute(ends, 1))
    this.material = new ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uAmount: { value: 0 } },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    })
    this.lines = new LineSegments(geo, this.material)
    this.lines.frustumCulled = false
    this.lines.renderOrder = 6
    this.lines.visible = false
  }

  /** `amount` 0..1: ignition, fading as the rocket leaves the pad. */
  update(time: number, amount: number) {
    this.lines.visible = amount > 0.01
    this.material.uniforms.uTime.value = time
    this.material.uniforms.uAmount.value = amount
  }
}

const VERT = /* glsl */ `
attribute vec4 aSeed;
attribute float aEnd;
uniform float uTime;
uniform float uAmount;
varying float vHeat;
varying float vAlpha;
const float TRAIL = 0.035;
vec3 at(float t, vec3 v, vec3 o) {
  // Ballistic with a little air drag, bouncing off nothing: sparks die before landing.
  float drag = 1.0 - exp(-1.6 * t);
  return o + v * drag / 1.6 + vec3(0.0, -4.9, 0.0) * t * t;
}
void main() {
  float life = mix(0.45, 1.25, aSeed.w);
  float period = life + mix(0.1, 0.9, fract(aSeed.x * 13.7));
  float t = mod(uTime + aSeed.x * 37.0, period);
  float alive = step(t, life) * step(fract(aSeed.y * 91.3), uAmount);
  // Thrown out of the mount and down the trench (-z), mostly sideways, some upward.
  float ang = aSeed.z * 6.2831853;
  vec3 dir = normalize(vec3(cos(ang), mix(0.25, 1.1, aSeed.y), sin(ang) - 0.6 * step(0.45, aSeed.w)));
  vec3 v = dir * mix(6.0, 17.0, fract(aSeed.z * 7.31 + aSeed.w));
  vec3 o = vec3((aSeed.x - 0.5) * 2.4, 0.5, -0.4 + (aSeed.y - 0.5) * 1.6);
  float tt = max(t - aEnd * TRAIL, 0.0);
  vec3 p = at(tt, v, o);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  vHeat = 1.0 - t / life;
  // The tail end is dimmer, so each streak tapers.
  vAlpha = alive * mix(1.0, 0.25, aEnd) * smoothstep(0.0, 0.04, t);
}
`

const FRAG = /* glsl */ `
varying float vHeat;
varying float vAlpha;
void main() {
  if (vAlpha < 0.01) discard;
  vec3 hot = vec3(1.0, 0.82, 0.5);
  vec3 cool = vec3(1.0, 0.28, 0.05);
  vec3 col = mix(cool, hot, vHeat * vHeat) * mix(1.2, 5.0, vHeat);
  gl_FragColor = vec4(col * vAlpha, 1.0);
}
`
