import { BufferAttribute, BufferGeometry, Color, NormalBlending, Points, ShaderMaterial, Vector3, type Texture } from 'three'
import { FLOODS } from './LaunchPad'
import { FLIPBOOK_GLSL } from './SmokeFlipbook'
import { mulberry32 } from './textures'

const FLOOD_COLOR = new Color('#cfdcff')
const IGNITE = new Color('#ff6a1a')

/**
 * Low fog banks rolling around the pad, lit by the floodlights. Camera-facing
 * sprites from the simulated smoke flipbook's later, wispier frames, so the fog
 * reads as volume from the low hero angle where flat layers go edge-on.
 * Stateless like the exhaust: positions are pure functions of time and seed.
 */
export class GroundFog {
  readonly points: Points
  private material: ShaderMaterial

  constructor(count: number, atlas: Texture) {
    const rand = mulberry32(73)
    const seeds = new Float32Array(count * 4)
    for (let i = 0; i < seeds.length; i++) seeds[i] = rand()
    const geo = new BufferGeometry()
    geo.setAttribute('position', new BufferAttribute(new Float32Array(count * 3), 3))
    geo.setAttribute('aSeed', new BufferAttribute(seeds, 4))
    this.material = new ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uScale: { value: 800 },
        uIgnition: { value: 0 },
        uMap: { value: atlas },
        uFloods: { value: FLOODS.map(([x, z]) => new Vector3(x, 0, z)) },
        uFlood: { value: FLOOD_COLOR.clone() },
        uAmbient: { value: new Color('#1b2738') },
        uGlow: { value: IGNITE.clone() },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: NormalBlending,
      premultipliedAlpha: true,
    })
    this.points = new Points(geo, this.material)
    this.points.frustumCulled = false
    // Before the exhaust smoke (5), after the flat fog layers (1) and beams (2).
    this.points.renderOrder = 3
  }

  /** Projection scale for point sizes: pixels per world unit at distance 1. */
  setProjection(viewportHeight: number, fovDeg: number, dpr: number) {
    this.material.uniforms.uScale.value = (viewportHeight * dpr) / (2 * Math.tan((fovDeg * Math.PI) / 360))
  }

  update(time: number, ignition: number) {
    this.material.uniforms.uTime.value = time
    this.material.uniforms.uIgnition.value = ignition
  }
}

const VERT = /* glsl */ `
attribute vec4 aSeed;
uniform float uTime;
uniform float uScale;
uniform vec3 uFloods[4];
varying float vAge;
varying float vSeed;
varying float vLit;
varying float vNear;
varying float vAlpha;
void main() {
  // A loose ring around the mount, thicker toward the outside.
  float ang = aSeed.x * 6.2831853;
  float r = mix(3.5, 30.0, pow(aSeed.y, 0.7));
  vec3 p = vec3(cos(ang) * r, mix(0.5, 1.9, aSeed.w), sin(ang) * r);
  // Slow wander, never a wrap (a wrap would pop).
  p.x += sin(uTime * 0.045 + aSeed.z * 6.2831853) * 2.2;
  p.z += cos(uTime * 0.037 + aSeed.w * 6.2831853) * 2.2;
  // Floodlit near the masts, dim between them.
  float lit = 0.0;
  for (int i = 0; i < 4; i++) {
    vec2 d = p.xz - uFloods[i].xz;
    lit += exp(-dot(d, d) / 110.0);
  }
  vLit = lit;
  vNear = exp(-length(p.xz) * 0.16);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float size = mix(7.0, 14.0, aSeed.z);
  gl_PointSize = min(size * uScale / max(-mv.z, 0.5), 700.0);
  gl_Position = projectionMatrix * mv;
  // Thin out banks right at the lens so they never fill the frame, and banks seen from
  // steeply above: camera-facing sprites read as discs there (the flat layers cover it).
  float steep = abs(normalize((modelMatrix * vec4(p, 1.0)).xyz - cameraPosition).y);
  vAlpha = smoothstep(2.0, 9.0, -mv.z) * (1.0 - smoothstep(0.18, 0.45, steep));
  // Breathe back and forth through the wispy late frames (no wrap, no pop).
  vAge = 0.55 + 0.4 * (0.5 + 0.5 * sin(uTime * 0.03 + aSeed.x * 6.2831853));
  vSeed = aSeed.z;
}
`

const FRAG = /* glsl */ `
uniform sampler2D uMap;
uniform float uIgnition;
uniform vec3 uFlood;
uniform vec3 uAmbient;
uniform vec3 uGlow;
varying float vAge;
varying float vSeed;
varying float vLit;
varying float vNear;
varying float vAlpha;
${FLIPBOOK_GLSL}
const float OPACITY = 0.19;
void main() {
  // Squash each puff into a wide, low bank.
  vec2 c = (gl_PointCoord - 0.5) * vec2(1.0, 2.0);
  if (dot(c, c) > 0.25) discard;
  c.x *= vSeed > 0.5 ? -1.0 : 1.0;
  vec4 fog = sampleFlipbook(uMap, vAge, c + 0.5);
  fog.rgb *= smoothstep(0.0, 0.03, fog.a);
  float a = fog.a * OPACITY * vAlpha;
  if (a < 0.002) discard;
  // Mostly ambient and back-scatter: fog shouldn't shade like a cumulus.
  vec3 col = uAmbient * fog.a * 1.3
    + uFlood * (fog.r * 0.3 + fog.b * 0.55) * (0.15 + vLit)
    + uGlow * fog.g * uIgnition * vNear * 2.0;
  gl_FragColor = vec4(col * OPACITY * vAlpha, a);
}
`
