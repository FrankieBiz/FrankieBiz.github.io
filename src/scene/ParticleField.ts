import gsap from 'gsap'
import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, Group, Points, ShaderMaterial, Vector3 } from 'three'
import type { ShapeId } from '../content/site'
import { NOISE } from './shaders/noise'
import { buildShape, scatter } from './shapes'
import { mulberry32 } from './textures'

const DELAY = 0.35

function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

/**
 * The contact section's particle field. Formations morph on the GPU with a
 * per-particle stagger; a separate swirl envelope keeps interrupted morphs
 * continuous. Particles part around the pointer.
 */
export class ParticleField {
  readonly group = new Group()
  private points: Points
  private material: ShaderMaterial
  private geometry: BufferGeometry
  private shapes = new Map<ShapeId, Float32Array>()
  private rand: Float32Array
  private current: ShapeId = 'rocket'
  private morph = { m: 1 }
  private swirl = { v: 0 }
  private swirlTl: gsap.core.Timeline | null = null
  private morphTween: gsap.core.Tween | null = null
  private pointerLocal = new Vector3(999, 999, 999)
  private pointerStrength = 0
  private count: number

  constructor(count: number, position: readonly [number, number, number]) {
    this.count = count
    const ids: ShapeId[] = ['rocket', 'graph', 'ring', 'lattice', 'sheets']
    for (const id of ids) this.shapes.set(id, buildShape(id, count))

    const r = mulberry32(61)
    this.rand = new Float32Array(count * 4)
    for (let i = 0; i < this.rand.length; i++) this.rand[i] = r()

    const geo = new BufferGeometry()
    const rocket = this.shapes.get('rocket')!
    geo.setAttribute('position', new BufferAttribute(new Float32Array(rocket), 3))
    geo.setAttribute('aFrom', new BufferAttribute(new Float32Array(rocket), 3))
    geo.setAttribute('aTo', new BufferAttribute(new Float32Array(rocket), 3))
    geo.setAttribute('aScatter', new BufferAttribute(scatter(count), 3))
    geo.setAttribute('aRand', new BufferAttribute(this.rand, 4))
    this.geometry = geo

    this.material = new ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uMorph: { value: 1 },
        uSwirl: { value: 0 },
        uAssemble: { value: 0 },
        uPointer: { value: this.pointerLocal },
        uPointerStrength: { value: 0 },
        uScale: { value: 800 },
        uSize: { value: 0.024 },
        uFrost: { value: new Color('#dfe8f3') },
        uIgnite: { value: new Color('#ff6a1a') },
        uMotion: { value: 1 },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    })
    this.points = new Points(geo, this.material)
    this.points.frustumCulled = false
    this.group.add(this.points)
    this.group.position.set(...position)
    this.group.visible = false
  }

  setProjection(viewportHeight: number, fovDeg: number, dpr: number) {
    this.material.uniforms.uScale.value = (viewportHeight * dpr) / (2 * Math.tan((fovDeg * Math.PI) / 360))
  }

  setReducedMotion(reduced: boolean) {
    this.material.uniforms.uMotion.value = reduced ? 0.2 : 1
  }

  morphTo(id: ShapeId) {
    if (id === this.current) return
    const target = this.shapes.get(id)
    if (!target) return
    // Snapshot the current (un-swirled) positions as the new origin.
    const from = this.geometry.attributes.aFrom.array as Float32Array
    const to = this.geometry.attributes.aTo.array as Float32Array
    const m = this.morph.m
    for (let i = 0; i < this.count; i++) {
      const local = Math.min(Math.max((m - this.rand[i * 4] * DELAY) / (1 - DELAY), 0), 1)
      const e = easeInOutCubic(local)
      for (let k = 0; k < 3; k++) {
        const j = i * 3 + k
        from[j] = from[j] + (to[j] - from[j]) * e
      }
    }
    to.set(target)
    this.geometry.attributes.aFrom.needsUpdate = true
    this.geometry.attributes.aTo.needsUpdate = true
    this.current = id

    this.morph.m = 0
    this.morphTween?.kill()
    this.morphTween = gsap.to(this.morph, { m: 1, duration: 1.7, ease: 'none' })
    this.swirlTl?.kill()
    this.swirlTl = gsap
      .timeline()
      .to(this.swirl, { v: 1, duration: 0.45, ease: 'power2.out' })
      .to(this.swirl, { v: 0, duration: 1.3, ease: 'power2.inOut' })
  }

  /** `pointerWorld` is the pointer projected onto the field plane, or null. */
  update(dt: number, time: number, assemble: number, pointerWorld: Vector3 | null) {
    this.group.visible = assemble > 0.001
    if (!this.group.visible) return
    const u = this.material.uniforms
    u.uTime.value = time
    u.uMorph.value = this.morph.m
    u.uSwirl.value = this.swirl.v
    u.uAssemble.value = assemble
    this.points.rotation.y = Math.sin(time * 0.12) * 0.25

    if (pointerWorld) {
      this.pointerLocal.copy(pointerWorld)
      this.points.worldToLocal(this.pointerLocal)
    }
    const target = pointerWorld ? 1 : 0
    this.pointerStrength += (target - this.pointerStrength) * (1 - Math.exp(-dt * 4))
    u.uPointerStrength.value = this.pointerStrength
  }
}

const VERT = /* glsl */ `
attribute vec3 aFrom;
attribute vec3 aTo;
attribute vec3 aScatter;
attribute vec4 aRand;
uniform float uTime;
uniform float uMorph;
uniform float uSwirl;
uniform float uAssemble;
uniform vec3 uPointer;
uniform float uPointerStrength;
uniform float uScale;
uniform float uSize;
uniform float uMotion;
varying float vHeat;
varying float vAlpha;
${NOISE}
float easeInOutCubic(float t) {
  return t < 0.5 ? 4.0 * t * t * t : 1.0 - pow(max(2.0 - 2.0 * t, 0.0), 3.0) / 2.0;
}
void main() {
  float local = clamp((uMorph - aRand.x * ${DELAY.toFixed(2)}) / ${(1 - DELAY).toFixed(2)}, 0.0, 1.0);
  vec3 p = mix(aFrom, aTo, easeInOutCubic(local));
  float travel = sin(local * 3.14159265);
  p += swirl3(p * 0.55 + aRand.xyz * 3.0 + uTime * 0.25) * (uSwirl * 1.1 + travel * 0.35) * uMotion;

  float a = smoothstep(aRand.y * 0.55, aRand.y * 0.55 + 0.45, uAssemble);
  vec3 drift = swirl3(aScatter * 0.12 + uTime * 0.05) * 1.5;
  p = mix(aScatter + drift, p, a);

  p += 0.035 * swirl3(p * 1.4 + uTime * 0.35) * uMotion;

  vec3 d = p - uPointer;
  float dist = length(d);
  float push = (1.0 - smoothstep(0.0, 1.5, dist)) * uPointerStrength;
  p += normalize(d + 1e-4) * push * 0.55;

  vHeat = clamp(uSwirl * 0.8 + travel * 0.6 + push * 0.9 + (1.0 - a) * 0.4, 0.0, 1.0);
  vAlpha = mix(0.25, 1.0, a) * (0.55 + aRand.w * 0.45);

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = uSize * (0.6 + aRand.z * 0.9) * uScale / max(-mv.z, 0.5);
  gl_Position = projectionMatrix * mv;
}
`

const FRAG = /* glsl */ `
uniform vec3 uFrost;
uniform vec3 uIgnite;
varying float vHeat;
varying float vAlpha;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = (1.0 - smoothstep(0.1, 0.5, d)) * vAlpha;
  if (a < 0.01) discard;
  vec3 col = mix(uFrost * 0.85, uIgnite * 3.0, vHeat);
  gl_FragColor = vec4(col * a * 0.7, a);
}
`
