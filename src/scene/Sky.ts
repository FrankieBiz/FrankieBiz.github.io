import {
  AdditiveBlending,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  Color,
  Group,
  Mesh,
  Points,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
} from 'three'
import type { WebGLRenderer } from 'three'
import { bakeEquirect, EQUIRECT_UV } from './bake'
import { mulberry32 } from './textures'

/** Galactic band and dust lanes, baked once. */
const SPACE_BAKE = /* glsl */ `
vec4 bake(vec3 d) {
  vec3 bandN = normalize(vec3(0.3, 0.85, 0.42));
  float b = dot(d, bandN) * 3.2;
  float band = exp(-b * b);
  float dust = fbm5(d * 3.5) * 0.5 + 0.5;
  float lanes = smoothstep(0.35, 0.7, fbm3(d * 9.0 + 4.0) * 0.5 + 0.5);
  float glow = band * dust * (1.0 - lanes * 0.6);
  return vec4(vec3(0.05, 0.065, 0.09) * glow * 0.5 * 8.0, 1.0);
}
`

/** Direction toward the sun in the orbit world (low over the planet limb). */
export const SUN_DIR = new Vector3(0.75, 0.16, -1).normalize()
const SPACE_HORIZON = new Color('#020305')

/**
 * Sky dome and stars. The group follows the camera so both read as infinitely
 * far away; the dome blends from a light-polluted night sky to deep space.
 */
export class Sky {
  readonly group = new Group()
  private dome: ShaderMaterial
  private stars: ShaderMaterial

  constructor(renderer: WebGLRenderer, starCount: number, bakeWidth: number) {
    const spaceMap = bakeEquirect(renderer, SPACE_BAKE, bakeWidth, bakeWidth / 2)
    this.dome = new ShaderMaterial({
      uniforms: {
        uSpaceMap: { value: spaceMap },
        uSpace: { value: 0 },
        uSun: { value: 0 },
        uSunDir: { value: SUN_DIR.clone() },
        uHorizon: { value: new Color('#1a2b42') },
        uZenith: { value: new Color('#04070d') },
        uGlow: { value: new Color('#2d4566') },
      },
      vertexShader: DOME_VERT,
      fragmentShader: DOME_FRAG,
      side: BackSide,
      depthWrite: false,
      fog: false,
    })
    const dome = new Mesh(new SphereGeometry(900, 48, 32), this.dome)
    dome.renderOrder = -10
    dome.frustumCulled = false
    this.group.add(dome)

    const rand = mulberry32(5)
    const pos = new Float32Array(starCount * 3)
    const data = new Float32Array(starCount * 3)
    const bandNormal = new Vector3(0.3, 0.85, 0.42).normalize()
    for (let i = 0; i < starCount; i++) {
      // Bias ~35% of stars toward the galactic band.
      let v = new Vector3(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1).normalize()
      if (rand() < 0.35) {
        v.addScaledVector(bandNormal, -v.dot(bandNormal) * (0.85 + rand() * 0.15)).normalize()
      }
      v = v.multiplyScalar(850)
      pos.set([v.x, v.y, v.z], i * 3)
      const mag = Math.pow(rand(), 6)
      data.set([0.6 + mag * 3.4, rand(), rand()], i * 3)
    }
    const geo = new BufferGeometry()
    geo.setAttribute('position', new BufferAttribute(pos, 3))
    geo.setAttribute('aData', new BufferAttribute(data, 3))
    this.stars = new ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uSpace: { value: 0 }, uPixelRatio: { value: 1 } },
      vertexShader: STAR_VERT,
      fragmentShader: STAR_FRAG,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      fog: false,
    })
    const stars = new Points(geo, this.stars)
    stars.renderOrder = -9
    stars.frustumCulled = false
    this.group.add(stars)
  }

  setPixelRatio(dpr: number) {
    this.stars.uniforms.uPixelRatio.value = dpr
  }

  /** `space` blends night → space; `orbit` enables the sun. */
  update(time: number, cameraPosition: Vector3, space: number, orbit: boolean) {
    this.group.position.copy(cameraPosition)
    this.dome.uniforms.uSpace.value = space
    this.dome.uniforms.uSun.value = orbit ? 1 : 0
    this.stars.uniforms.uTime.value = time
    this.stars.uniforms.uSpace.value = space
  }

  /** Horizon colour for scene fog at the current blend. */
  horizonColor(space: number, out: Color) {
    return out.copy(this.dome.uniforms.uHorizon.value).lerp(SPACE_HORIZON, space)
  }
}

const DOME_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}
`

const DOME_FRAG = /* glsl */ `
uniform sampler2D uSpaceMap;
uniform float uSpace;
uniform float uSun;
uniform vec3 uSunDir;
uniform vec3 uHorizon;
uniform vec3 uZenith;
uniform vec3 uGlow;
varying vec3 vDir;
${EQUIRECT_UV}
float skyHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 night = mix(uHorizon, uZenith, smoothstep(-0.02, 0.55, h));
  night += uGlow * exp(-abs(h) * 16.0) * 0.55;
  night = mix(night, uZenith * 0.6, 1.0 - smoothstep(-0.3, 0.0, h));

  vec3 space = vec3(0.0025, 0.0035, 0.006) + texture2D(uSpaceMap, equirectUv(d)).rgb / 8.0;

  // Sun: tight disc, wide soft corona.
  float sd = max(dot(d, uSunDir), 0.0);
  space += uSun * (vec3(1.0, 0.96, 0.9) * pow(sd, 24000.0) * 40.0 + vec3(0.9, 0.86, 0.8) * (pow(sd, 2500.0) * 0.5 + pow(sd, 90.0) * 0.07 + pow(sd, 8.0) * 0.05));

  vec3 col = mix(night, space, uSpace);
  col += (skyHash(gl_FragCoord.xy) - 0.5) / 255.0;
  gl_FragColor = vec4(col, 1.0);
}
`

const STAR_VERT = /* glsl */ `
attribute vec3 aData;
uniform float uTime;
uniform float uSpace;
uniform float uPixelRatio;
varying float vBright;
varying vec3 vTint;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float tw = 0.75 + 0.25 * sin(uTime * (0.6 + aData.y * 2.4) + aData.z * 60.0);
  float horizonFade = smoothstep(-0.02, 0.18, normalize(position).y);
  float vis = mix(0.22 * horizonFade, 1.0, uSpace);
  vBright = tw * vis * clamp(aData.x / 2.0, 0.35, 1.6);
  vTint = mix(vec3(0.75, 0.85, 1.0), vec3(1.0, 0.9, 0.78), aData.z);
  gl_PointSize = aData.x * uPixelRatio * mix(0.9, 1.25, uSpace);
  gl_Position = projectionMatrix * mv;
}
`

const STAR_FRAG = /* glsl */ `
varying float vBright;
varying vec3 vTint;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = 1.0 - smoothstep(0.0, 0.5, d);
  gl_FragColor = vec4(vTint * vBright * a * 1.6, a);
}
`
