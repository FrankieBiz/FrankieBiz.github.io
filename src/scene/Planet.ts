import { AdditiveBlending, BackSide, Color, Group, Mesh, ShaderMaterial, SphereGeometry, Vector3, type WebGLRenderer } from 'three'
import { bakeEquirect, EQUIRECT_UV } from './bake'
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

/**
 * A stylized planet: cool slate continents, drifting cloud, a soft terminator,
 * ignition-orange city lights on the night side and a fresnel atmosphere.
 */
export class Planet {
  readonly group = new Group()
  private surface: ShaderMaterial
  private atmosphere: ShaderMaterial

  constructor(renderer: WebGLRenderer, bakeWidth: number) {
    const surfaceMap = bakeEquirect(renderer, SURFACE_BAKE, bakeWidth, bakeWidth / 2)
    const cloudMap = bakeEquirect(renderer, CLOUD_BAKE, bakeWidth, bakeWidth / 2)
    this.surface = new ShaderMaterial({
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
    const planet = new Mesh(new SphereGeometry(PLANET_RADIUS, 128, 80), this.surface)
    // Tilt so temperate latitudes, not the polar cap, face the orbit path.
    planet.rotation.set(1.3, 0.2, -0.25)
    this.group.add(planet)

    this.atmosphere = new ShaderMaterial({
      uniforms: { uSunDir: { value: SUN_DIR.clone() }, uColor: { value: new Color('#86b6ff') } },
      vertexShader: ATMO_VERT,
      fragmentShader: ATMO_FRAG,
      side: BackSide,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    })
    this.group.add(new Mesh(new SphereGeometry(PLANET_RADIUS * 1.045, 96, 48), this.atmosphere))
    this.group.position.copy(PLANET_CENTER)
  }

  update(time: number) {
    this.surface.uniforms.uTime.value = time
    this.group.children[0].rotation.y = 0.2 + time * 0.0025
  }
}

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
varying vec3 vNormalW;
varying vec3 vWorld;
void main() {
  vec3 n = normalize(vNormalW);
  vec3 v = normalize(cameraPosition - vWorld);
  float rim = 1.0 - abs(dot(n, v));
  float glow = pow(smoothstep(0.0, 1.0, rim), 7.0);
  float lit = smoothstep(-0.45, 0.5, dot(n, uSunDir)) + 0.04;
  vec3 col = uColor * glow * lit * 2.2;
  gl_FragColor = vec4(col, glow * lit);
}
`
