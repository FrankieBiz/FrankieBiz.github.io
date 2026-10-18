import {
  AdditiveBlending,
  BackSide,
  Color,
  Group,
  Matrix4,
  Mesh,
  ShaderMaterial,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
  type WebGLRenderer,
} from 'three'
import { bakeEquirect, EQUIRECT_UV } from './bake'
import type { PlanetTextures } from './planetTextures'
import { SUN_DIR } from './Sky'

export const PLANET_RADIUS = 150
export const PLANET_CENTER = new Vector3(40, -172, -95)

/** Surface fields baked once: R land, G highlands, B ice, A city lights. */
const SURFACE_BAKE = /* glsl */ `
vec4 bake(vec3 p) {
  float c = fbm5(p * 2.4 + vec3(3.1, 0.7, 5.3));
  float land = smoothstep(0.03, 0.09, c);
  float high = smoothstep(0.18, 0.36, c + fbm3(p * 9.0) * 0.12);
  float ice = smoothstep(0.78, 0.86, abs(p.y) + fbm3(p * 6.0) * 0.06);
  float grid = smoothstep(0.62, 0.92, gnoise(p * 70.0) * 0.5 + 0.5) * smoothstep(0.0, 0.5, gnoise(p * 9.0 + 2.0) * 0.5 + 0.5);
  return vec4(land, high, ice, grid * land * (1.0 - ice));
}
`

const CLOUD_BAKE = /* glsl */ `
vec4 bake(vec3 p) {
  vec3 q = p * 3.2;
  float clouds = smoothstep(0.05, 0.55, fbm5(q + swirl3(q * 0.8) * 0.35));
  return vec4(clouds, 0.0, 0.0, 1.0);
}
`

/** Where the camera path looks down onto the globe, and which way is "up-screen". */
const FOCAL_POINT = new Vector3(20, 0, 8)
/** The place on Earth under the focal point: southern Italy, looking north over Europe at night. */
const FOCAL_LAT = 40
const FOCAL_LON = 15

/** Unit direction on a three.js SphereGeometry for a latitude/longitude (matches equirect UVs). */
export function latLonToLocal(lat: number, lon: number): Vector3 {
  const phi = ((lon + 180) / 360) * Math.PI * 2
  const theta = ((90 - lat) / 180) * Math.PI
  return new Vector3(-Math.cos(phi) * Math.sin(theta), Math.cos(theta), Math.sin(phi) * Math.sin(theta))
}

/** Rotation that puts (lat, lon) at world direction `dir` with geographic north toward `north`. */
export function orientation(lat: number, lon: number, dir: Vector3, north: Vector3): Matrix4 {
  const t = latLonToLocal(lat, lon)
  const nLocal = new Vector3(0, 1, 0).addScaledVector(t, -t.y).normalize()
  const a = new Matrix4().makeBasis(t, nLocal, new Vector3().crossVectors(t, nLocal))
  const nWorld = north.clone().addScaledVector(dir, -north.dot(dir)).normalize()
  const b = new Matrix4().makeBasis(dir, nWorld, new Vector3().crossVectors(dir, nWorld))
  return b.multiply(a.transpose())
}

/**
 * The planet. With NASA imagery loaded it's a photoreal Earth (day colour,
 * drifting cloud with shadows, ocean glint, city lights, twilight scattering);
 * otherwise a stylized planet baked from noise.
 */
export class Planet {
  readonly group = new Group()
  private surface: ShaderMaterial
  private atmosphere: ShaderMaterial
  private mesh: Mesh
  private photoreal: boolean

  constructor(renderer: WebGLRenderer, bakeWidth: number, textures: PlanetTextures | null = null) {
    this.photoreal = textures !== null
    this.surface = textures ? this.earthMaterial(textures) : this.bakedMaterial(renderer, bakeWidth)
    this.mesh = new Mesh(new SphereGeometry(PLANET_RADIUS, 160, 96), this.surface)
    if (textures) {
      const pivot = new Group()
      const dir = FOCAL_POINT.clone().sub(PLANET_CENTER).normalize()
      pivot.quaternion.setFromRotationMatrix(orientation(FOCAL_LAT, FOCAL_LON, dir, new Vector3(0, 0, -1)))
      pivot.add(this.mesh)
      this.group.add(pivot)
    } else {
      // Tilt so temperate latitudes, not the polar cap, face the orbit path.
      this.mesh.rotation.set(1.3, 0.2, -0.25)
      this.group.add(this.mesh)
    }

    this.atmosphere = new ShaderMaterial({
      uniforms: { uSunDir: { value: SUN_DIR.clone() }, uColor: { value: new Color('#86b6ff') }, uWarm: { value: new Color('#ff8a4a') } },
      vertexShader: ATMO_VERT,
      fragmentShader: ATMO_FRAG,
      side: BackSide,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    })
    this.group.add(new Mesh(new SphereGeometry(PLANET_RADIUS * (this.photoreal ? 1.028 : 1.045), 96, 48), this.atmosphere))
    this.group.position.copy(PLANET_CENTER)
  }

  private earthMaterial(t: PlanetTextures): ShaderMaterial {
    t.day.colorSpace = SRGBColorSpace
    for (const tex of [t.day, t.night, t.clouds]) tex.anisotropy = 8
    return new ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uDay: { value: t.day },
        uNight: { value: t.night },
        uClouds: { value: t.clouds },
        uSunDir: { value: SUN_DIR.clone() },
        uCity: { value: new Color('#ffad66') },
        uAtmo: { value: new Color('#6fa6ff') },
        uTwilight: { value: new Color('#ff7a3a') },
      },
      vertexShader: EARTH_VERT,
      fragmentShader: EARTH_FRAG,
    })
  }

  private bakedMaterial(renderer: WebGLRenderer, bakeWidth: number): ShaderMaterial {
    const surfaceMap = bakeEquirect(renderer, SURFACE_BAKE, bakeWidth, bakeWidth / 2)
    const cloudMap = bakeEquirect(renderer, CLOUD_BAKE, bakeWidth, bakeWidth / 2)
    return new ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uSurface: { value: surfaceMap },
        uClouds: { value: cloudMap },
        uSunDir: { value: SUN_DIR.clone() },
        uOcean: { value: new Color('#071626') },
        uLand: { value: new Color('#3a4652') },
        uHigh: { value: new Color('#6c7885') },
        uCity: { value: new Color('#ff6a1a') },
        uAtmo: { value: new Color('#7fb2ff') },
      },
      vertexShader: SURFACE_VERT,
      fragmentShader: SURFACE_FRAG,
    })
  }

  update(time: number) {
    this.surface.uniforms.uTime.value = time
    // The Earth turns imperceptibly; its clouds drift a little faster in the shader.
    if (this.photoreal) this.mesh.rotation.y = time * 0.0004
    else this.mesh.rotation.y = 0.2 + time * 0.0025
  }
}

const EARTH_VERT = /* glsl */ `
varying vec2 vUv;
varying vec3 vNormalW;
varying vec3 vWorld;
void main() {
  vUv = uv;
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * world;
}
`

const EARTH_FRAG = /* glsl */ `
uniform float uTime;
uniform sampler2D uDay;
uniform sampler2D uNight;
uniform sampler2D uClouds;
uniform vec3 uSunDir;
uniform vec3 uCity;
uniform vec3 uAtmo;
uniform vec3 uTwilight;
varying vec2 vUv;
varying vec3 vNormalW;
varying vec3 vWorld;
void main() {
  vec3 n = normalize(vNormalW);
  vec3 v = normalize(cameraPosition - vWorld);
  float ndl = dot(n, uSunDir);
  float lit = smoothstep(-0.06, 0.2, ndl);

  vec4 day = texture2D(uDay, vUv);
  float water = smoothstep(0.55, 0.9, day.a);
  vec2 cloudUv = vUv + vec2(uTime * 0.00025, 0.0);
  float clouds = texture2D(uClouds, cloudUv).r;
  // Cloud shadows fall slightly away from the sun on the surface below.
  float shadow = texture2D(uClouds, cloudUv + vec2(0.0018, 0.0009)).r;

  vec3 albedo = day.rgb * (1.0 - shadow * 0.45 * (1.0 - clouds));
  albedo = mix(albedo, vec3(0.9, 0.92, 0.95), clouds * 0.92);
  vec3 col = albedo * max(ndl, 0.0) * 1.7 * lit + albedo * 0.003;

  // Sun glint on open water, softened by cloud.
  vec3 h = normalize(uSunDir + v);
  float glint = pow(max(dot(n, h), 0.0), 140.0) * water * (1.0 - clouds) * lit;
  col += vec3(1.0, 0.9, 0.78) * glint * 3.0;

  // City lights only where it's night and the sky is clear.
  float night = 1.0 - smoothstep(-0.22, 0.04, ndl);
  float lights = texture2D(uNight, vUv).r;
  col += uCity * pow(lights, 2.0) * night * (1.0 - clouds * 0.9) * 2.6;

  // Atmosphere seen through: blue on the lit limb; a thin warm band only where the
  // terminator meets the limb (real twilight is a sliver, not a hemisphere-wide tint).
  float fres = pow(1.0 - max(dot(n, v), 0.0), 3.5);
  float twilight = smoothstep(-0.06, 0.0, ndl) * (1.0 - smoothstep(0.0, 0.06, ndl));
  col += uAtmo * fres * (smoothstep(-0.2, 0.6, ndl) * 1.3 + 0.015);
  col += uTwilight * twilight * fres * 0.12;
  gl_FragColor = vec4(col, 1.0);
}
`

const SURFACE_VERT = /* glsl */ `
varying vec3 vLocal;
varying vec3 vNormalW;
varying vec3 vWorld;
void main() {
  vLocal = normalize(position);
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * world;
}
`

const SURFACE_FRAG = /* glsl */ `
uniform float uTime;
uniform sampler2D uSurface;
uniform sampler2D uClouds;
uniform vec3 uSunDir;
uniform vec3 uOcean;
uniform vec3 uLand;
uniform vec3 uHigh;
uniform vec3 uCity;
uniform vec3 uAtmo;
varying vec3 vLocal;
varying vec3 vNormalW;
varying vec3 vWorld;
${EQUIRECT_UV}
void main() {
  vec3 n = normalize(vNormalW);
  vec3 v = normalize(cameraPosition - vWorld);
  float ndl = dot(n, uSunDir);
  vec2 uv = equirectUv(normalize(vLocal));
  vec4 s = texture2D(uSurface, uv);
  float clouds = texture2D(uClouds, uv + vec2(uTime * 0.0006, 0.0)).r;

  vec3 albedo = mix(uOcean, mix(uLand, uHigh, s.g), s.r);
  albedo = mix(albedo, vec3(0.82, 0.86, 0.9), s.b);
  albedo = mix(albedo, vec3(0.8, 0.84, 0.9), clouds * 0.62);

  float day = smoothstep(-0.12, 0.3, ndl);
  vec3 col = albedo * (day * 0.72 + 0.012);

  vec3 r = reflect(-uSunDir, n);
  float glint = pow(max(dot(r, v), 0.0), 70.0) * (1.0 - s.r) * (1.0 - clouds) * day;
  col += vec3(1.0, 0.95, 0.88) * glint * 1.8;

  float night = 1.0 - smoothstep(-0.2, 0.05, ndl);
  col += uCity * s.a * night * (1.0 - clouds * 0.8) * 2.4;

  float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
  col += uAtmo * fres * (smoothstep(-0.3, 0.4, ndl) * 1.1 + 0.05);
  gl_FragColor = vec4(col, 1.0);
}
`

const ATMO_VERT = /* glsl */ `
varying vec3 vNormalW;
varying vec3 vWorld;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * world;
}
`

const ATMO_FRAG = /* glsl */ `
uniform vec3 uSunDir;
uniform vec3 uColor;
uniform vec3 uWarm;
varying vec3 vNormalW;
varying vec3 vWorld;
void main() {
  vec3 n = normalize(vNormalW);
  vec3 v = normalize(cameraPosition - vWorld);
  float rim = 1.0 - abs(dot(n, v));
  float glow = pow(smoothstep(0.0, 1.0, rim), 7.0);
  float sun = dot(n, uSunDir);
  float lit = smoothstep(-0.45, 0.5, sun) + 0.04;
  // Sunset band: the limb turns warm right where day meets night.
  float band = smoothstep(-0.25, -0.02, sun) * (1.0 - smoothstep(-0.02, 0.2, sun));
  vec3 col = mix(uColor, uWarm, band * 0.85) * glow * lit * 2.2;
  gl_FragColor = vec4(col, glow * lit);
}
`
