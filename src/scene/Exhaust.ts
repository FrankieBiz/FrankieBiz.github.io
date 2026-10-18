import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  NormalBlending,
  PointLight,
  Points,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
  type Texture,
} from 'three'
import type { QualityBudget } from '../core/Quality'
import type { DirectorState } from '../director/state'
import { NOISE } from './shaders/noise'
import { FLIPBOOK_GLSL } from './SmokeFlipbook'
import { mulberry32 } from './textures'

const IGNITE = new Color('#ff6a1a')

function seeds(count: number, seed: number) {
  const rand = mulberry32(seed)
  const data = new Float32Array(count * 4)
  for (let i = 0; i < data.length; i++) data[i] = rand()
  const geo = new BufferGeometry()
  // Positions are computed in the shader; a zero buffer satisfies three.js.
  geo.setAttribute('position', new BufferAttribute(new Float32Array(count * 3), 3))
  geo.setAttribute('aSeed', new BufferAttribute(data, 4))
  return geo
}

/**
 * Engine exhaust. Particles are stateless: every position is a pure function
 * of time and a per-particle seed, so scrubbing the scroll never desyncs them
 * and the CPU never touches a vertex. Smoke draws from the simulated flipbook
 * (src/scene/SmokeFlipbook.ts) when it loaded, else a painted puff.
 */
export class Exhaust {
  /** Attach to the rocket's nozzle anchor. */
  readonly flame = new Group()
  /** Add to the pad world (world-space particles). */
  readonly world = new Group()
  readonly light: PointLight
  /** Light-shaft source: a small hot core inside the flame (transparent, no depth write). */
  readonly shaftSource: Mesh
  private outer: ShaderMaterial
  private core: ShaderMaterial
  private smoke: ShaderMaterial
  private trail: ShaderMaterial
  private trailPoints: Points
  private smokePoints: Points

  constructor(budget: QualityBudget, puff: Texture, flipbook: Texture | null = null) {
    const flameMat = (core: boolean) =>
      new ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uIntensity: { value: 0 },
          uCore: { value: core ? 1 : 0 },
          uMid: { value: IGNITE.clone() },
          uTail: { value: new Color('#7a1d05') },
        },
        vertexShader: FLAME_VERT,
        fragmentShader: FLAME_FRAG,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        side: DoubleSide,
      })

    const outerGeo = new CylinderGeometry(0.42, 1.0, 1, 40, 32, true)
    outerGeo.translate(0, -0.5, 0)
    this.outer = flameMat(false)
    const outer = new Mesh(outerGeo, this.outer)
    outer.renderOrder = 3
    outer.frustumCulled = false
    this.flame.add(outer)

    const coreGeo = new CylinderGeometry(0.34, 0.1, 1, 32, 24, true)
    coreGeo.translate(0, -0.5, 0)
    this.core = flameMat(true)
    const core = new Mesh(coreGeo, this.core)
    core.renderOrder = 4
    core.frustumCulled = false
    this.flame.add(core)
    this.flame.visible = false
    this.shaftSource = new Mesh(
      new SphereGeometry(0.24, 16, 12),
      new MeshBasicMaterial({ color: new Color(3.6, 2.5, 1.4), transparent: true, depthWrite: false }),
    )
    this.shaftSource.position.y = -0.55
    this.flame.add(this.shaftSource)

    const common = {
      uTime: { value: 0 },
      uAmount: { value: 0 },
      uIgnition: { value: 0 },
      uScale: { value: 800 },
      uMap: { value: flipbook ?? puff },
      uDark: { value: new Color('#1c232d') },
      uLit: { value: new Color('#7a8696') },
      uGlow: { value: IGNITE.clone() },
    }

    // The flipbook bakes light from above and below, so its sprites only sway and mirror instead of spinning freely.
    const defines = flipbook ? { FLIPBOOK: '' } : {}
    const fragmentShader = flipbook ? FLIPBOOK_FRAG : PUFF_FRAG
    this.smoke = new ShaderMaterial({
      uniforms: { ...common },
      defines,
      vertexShader: SMOKE_VERT,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      blending: NormalBlending,
      premultipliedAlpha: true,
    })
    this.smokePoints = new Points(seeds(budget.smoke, 11), this.smoke)
    this.smokePoints.frustumCulled = false
    this.smokePoints.renderOrder = 5
    this.world.add(this.smokePoints)

    this.trail = new ShaderMaterial({
      uniforms: {
        ...cloneUniforms(common),
        uNozzle: { value: new Vector3() },
        uTrailLen: { value: 0 },
      },
      defines,
      vertexShader: TRAIL_VERT,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      blending: NormalBlending,
      premultipliedAlpha: true,
    })
    this.trailPoints = new Points(seeds(budget.trail, 23), this.trail)
    this.trailPoints.frustumCulled = false
    this.trailPoints.renderOrder = 5
    this.world.add(this.trailPoints)

    this.light = new PointLight('#ff7a2e', 0, 45, 1.3)
    this.world.add(this.light)
  }

  /** Projection scale for point sizes: pixels per world unit at distance 1. */
  setProjection(viewportHeight: number, fovDeg: number, dpr: number) {
    const scale = (viewportHeight * dpr) / (2 * Math.tan((fovDeg * Math.PI) / 360))
    this.smoke.uniforms.uScale.value = scale
    this.trail.uniforms.uScale.value = scale
  }

  update(_dt: number, time: number, state: DirectorState, nozzleWorld: Vector3, climb: number) {
    const ign = state.ignition
    this.flame.visible = ign > 0.001
    if (this.flame.visible) {
      const flicker = 1 + Math.sin(time * 37) * 0.04 + Math.sin(time * 91) * 0.03
      const length = (2.2 + 6.5 * ign) * flicker
      this.flame.children[0].scale.set(1 + ign * 0.15, length, 1 + ign * 0.15)
      this.flame.children[1].scale.set(1, length * 0.42, 1)
      this.outer.uniforms.uTime.value = time
      this.core.uniforms.uTime.value = time
      this.outer.uniforms.uIntensity.value = ign
      this.core.uniforms.uIntensity.value = ign
    }

    this.smokePoints.visible = state.smoke > 0.001
    this.smoke.uniforms.uTime.value = time
    this.smoke.uniforms.uAmount.value = state.smoke
    this.smoke.uniforms.uIgnition.value = ign

    this.trailPoints.visible = ign > 0.001
    this.trail.uniforms.uTime.value = time
    this.trail.uniforms.uAmount.value = ign
    this.trail.uniforms.uIgnition.value = ign
    this.trail.uniforms.uNozzle.value.copy(nozzleWorld)
    this.trail.uniforms.uTrailLen.value = Math.min(climb + 2.5, 170)

    this.light.position.copy(nozzleWorld).y -= 2.6
    const flick = 0.85 + Math.sin(time * 43) * 0.08 + Math.sin(time * 17) * 0.07
    this.light.intensity = ign * 340 * flick
  }
}

/** Shallow-clone a uniforms object so two materials don't share value refs. */
function cloneUniforms<T extends Record<string, { value: unknown }>>(u: T): T {
  const out: Record<string, { value: unknown }> = {}
  for (const [k, v] of Object.entries(u)) {
    const val = v.value as { clone?: () => unknown }
    out[k] = { value: val && typeof val.clone === 'function' && !(val as unknown as Texture).isTexture ? val.clone() : v.value }
  }
  return out as T
}

const FLAME_VERT = /* glsl */ `
varying float vAlong;
varying vec2 vUv;
varying vec3 vNormalV;
varying vec3 vViewPos;
void main() {
  vAlong = clamp(-position.y, 0.0, 1.0);
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vViewPos = mv.xyz;
  vNormalV = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * mv;
}
`

const FLAME_FRAG = /* glsl */ `
uniform float uTime;
uniform float uIntensity;
uniform float uCore;
uniform vec3 uMid;
uniform vec3 uTail;
varying float vAlong;
varying vec2 vUv;
varying vec3 vNormalV;
varying vec3 vViewPos;
${NOISE}
void main() {
  float y = vAlong;
  vec3 V = normalize(-vViewPos);
  float facing = abs(dot(normalize(vNormalV), V));
  float body = pow(facing, mix(1.5, 2.4, uCore));
  float n = gnoise(vec3(vUv.x * 9.0, y * 5.0 - uTime * 9.0, uTime * 1.3)) * 0.5 + 0.5;
  float n2 = gnoise(vec3(vUv.x * 23.0, y * 14.0 - uTime * 19.0, 3.0)) * 0.5 + 0.5;
  // Shock diamonds in the first half of the core.
  float diamonds = pow(0.5 + 0.5 * cos(y * 30.0), 8.0) * (1.0 - smoothstep(0.05, 0.6, y));
  float fade = (1.0 - smoothstep(0.22, 1.0, y)) * smoothstep(0.0, 0.025, y);
  float a = body * fade * (0.5 + 0.5 * n) * (0.75 + 0.5 * n2);
  a += diamonds * body * 0.9 * uCore;
  a *= uIntensity * mix(0.55, 1.0, uCore);
  vec3 hot = vec3(1.0, 0.93, 0.82) * mix(2.6, 4.2, uCore);
  vec3 col = mix(hot, uMid * mix(1.7, 2.6, uCore), smoothstep(0.0, mix(0.18, 0.6, uCore), y));
  col = mix(col, uTail * 1.2, smoothstep(0.35, 0.9, y));
  gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
}
`

const SMOKE_VERT = /* glsl */ `
attribute vec4 aSeed;
uniform float uTime;
uniform float uAmount;
uniform float uScale;
varying float vAlpha;
varying float vAge;
varying float vRot;
varying float vSeed;
varying vec3 vWorld;
${NOISE}
void main() {
  float extra = fract(aSeed.x * 7.13 + aSeed.y * 3.71);
  float life = 7.0 * (0.75 + aSeed.w * 0.5);
  float age = fract(uTime / life + aSeed.x);
  // 70% race down the flame trench (-z, away from camera); the rest billow out around the mount.
  float trench = step(0.3, aSeed.y);
  float ang = aSeed.z * 6.2831853;
  vec3 radial = vec3(cos(ang), 0.0, sin(ang));
  vec3 down = normalize(vec3((aSeed.z - 0.5) * 0.9, 0.0, -1.0));
  vec3 dir = normalize(mix(radial, down, trench));
  float reach = mix(4.0, 19.0, aSeed.w) * mix(0.55, 1.0, trench);
  float travel = 1.0 - pow(1.0 - age, 2.4);
  vec3 p = vec3(0.0, 0.5, -0.6) + dir * reach * travel;
  p.y += pow(age, 1.25) * mix(1.5, 10.0, extra);
  p += swirl3(p * 0.22 + aSeed.xyz * 10.0 + uTime * 0.08) * 1.4 * age;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float size = mix(0.8, 5.2, pow(age, 0.6)) * (0.55 + extra * 0.7);
  gl_PointSize = min(size * uScale / max(-mv.z, 0.5), 900.0);
  gl_Position = projectionMatrix * mv;
  float alive = step(extra, uAmount);
  vAlpha = smoothstep(0.0, 0.07, age) * (1.0 - smoothstep(0.5, 1.0, age)) * alive;
  vAge = age;
#ifdef FLIPBOOK
  vRot = (aSeed.z - 0.5) * 0.7 + age * (aSeed.y - 0.5) * 0.5;
#else
  vRot = aSeed.z * 6.28 + uTime * (aSeed.y - 0.5) * 0.35;
#endif
  vSeed = aSeed.y;
  vWorld = p;
}
`

const TRAIL_VERT = /* glsl */ `
attribute vec4 aSeed;
uniform float uTime;
uniform float uAmount;
uniform float uScale;
uniform vec3 uNozzle;
uniform float uTrailLen;
varying float vAlpha;
varying float vAge;
varying float vRot;
varying float vSeed;
varying vec3 vWorld;
${NOISE}
void main() {
  float life = 2.8 * (0.8 + aSeed.w * 0.4);
  float age = fract(uTime / life + aSeed.x);
  vec3 p = uNozzle;
  p.y -= 0.3 + pow(age, 0.85) * uTrailLen;
  float grow = clamp(uTrailLen / 50.0, 0.25, 1.0);
  float spread = 0.2 + age * (1.2 + aSeed.y * 3.2) * grow;
  float ang = aSeed.z * 6.2831853 + age * 1.7;
  p.x += cos(ang) * spread;
  p.z += sin(ang) * spread;
  p += swirl3(vec3(p.x * 0.2, p.y * 0.07, p.z * 0.2) + aSeed.xyz * 7.0 + uTime * 0.12) * age * 2.2 * grow;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float size = mix(0.7, 5.5, pow(age, 0.7)) * (0.6 + aSeed.y * 0.8) * mix(0.6, 1.0, grow);
  gl_PointSize = min(size * uScale / max(-mv.z, 0.5), 900.0);
  gl_Position = projectionMatrix * mv;
  vAlpha = smoothstep(0.0, 0.02, age) * (1.0 - smoothstep(0.4, 1.0, age)) * uAmount;
  vAge = age;
#ifdef FLIPBOOK
  vRot = (aSeed.z - 0.5) * 0.7 + age * (aSeed.w - 0.5) * 0.5;
#else
  vRot = aSeed.z * 6.28 + uTime * (aSeed.w - 0.5) * 0.4;
#endif
  vSeed = aSeed.y;
  vWorld = p;
}
`

const PUFF_FRAG = /* glsl */ `
uniform sampler2D uMap;
uniform float uIgnition;
uniform vec3 uDark;
uniform vec3 uLit;
uniform vec3 uGlow;
varying float vAlpha;
varying float vAge;
varying float vRot;
varying vec3 vWorld;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float s = sin(vRot);
  float co = cos(vRot);
  vec2 uv = vec2(co * c.x - s * c.y, s * c.x + co * c.y) + 0.5;
  float tex = texture2D(uMap, uv).a;
  float a = tex * vAlpha * 0.5;
  if (a < 0.002) discard;
  float near = exp(-length(vWorld - vec3(0.0, 1.0, -0.4)) * 0.42);
  float young = 1.0 - smoothstep(0.0, 0.12, vAge);
  float glow = uIgnition * (near * 1.1 + young * 0.6);
  float height = clamp(vWorld.y / 12.0, 0.0, 1.0);
  float tone = fract(vRot * 7.31);
  vec3 col = mix(uDark, uLit, 0.12 + height * 0.4 + tone * 0.22) + uGlow * glow * 1.35;
  gl_FragColor = vec4(col * a, a);
}
`

const FLIPBOOK_FRAG = /* glsl */ `
uniform sampler2D uMap;
uniform float uIgnition;
uniform vec3 uDark;
uniform vec3 uLit;
uniform vec3 uGlow;
varying float vAlpha;
varying float vAge;
varying float vRot;
varying float vSeed;
varying vec3 vWorld;
${FLIPBOOK_GLSL}
void main() {
  vec2 c = gl_PointCoord - 0.5;
  // The baked frames fade out inside this circle, so rotation never reaches a neighbouring cell.
  if (dot(c, c) > 0.25) discard;
  float s = sin(vRot);
  float co = cos(vRot);
  vec2 r = vec2(co * c.x - s * c.y, s * c.x + co * c.y);
  // Mirror half the puffs: keeps light from above above. Offset each puff's frame for variety.
  r.x *= vSeed > 0.5 ? -1.0 : 1.0;
  float age = clamp(vAge * 0.82 + fract(vSeed * 13.7) * 0.18, 0.0, 1.0);
  vec4 smoke = sampleFlipbook(uMap, age, r + 0.5);
  // Light only where there is smoke (guards against encoder noise under zero alpha).
  smoke.rgb *= smoothstep(0.0, 0.03, smoke.a);
  float a = smoke.a * vAlpha * 0.55;
  if (a < 0.002) discard;
  float near = exp(-length(vWorld - vec3(0.0, 1.0, -0.4)) * 0.42);
  float young = 1.0 - smoothstep(0.0, 0.12, vAge);
  float glow = uIgnition * (near * 1.1 + young * 0.6);
  float height = clamp(vWorld.y / 12.0, 0.0, 1.0);
  vec3 col = uDark * smoke.a * 1.4
    + uLit * (smoke.r * (0.55 + height * 0.6) + smoke.b * 0.3)
    + uGlow * smoke.g * glow * 2.4;
  gl_FragColor = vec4(col * vAlpha * 0.55, a);
}
`
