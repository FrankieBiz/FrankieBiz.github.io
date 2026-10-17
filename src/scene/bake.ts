import {
  DataTexture,
  LinearFilter,
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  RepeatWrapping,
  RGBAFormat,
  Scene,
  ShaderMaterial,
  ClampToEdgeWrapping,
  WebGLRenderTarget,
  type Texture,
  type WebGLRenderer,
} from 'three'
import { NOISE } from './shaders/noise'
import { mulberry32 } from './textures'

/**
 * Bakes an expensive per-direction function into an equirectangular texture
 * once at load. `body` must define `vec4 bake(vec3 dir)`.
 */
export function bakeEquirect(renderer: WebGLRenderer, body: string, width: number, height: number): Texture {
  const target = new WebGLRenderTarget(width, height, {
    format: RGBAFormat,
    generateMipmaps: false,
    minFilter: LinearFilter,
    magFilter: LinearFilter,
    depthBuffer: false,
  })
  target.texture.wrapS = RepeatWrapping
  target.texture.wrapT = ClampToEdgeWrapping
  const material = new ShaderMaterial({
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
    `,
    fragmentShader: /* glsl */ `
      varying vec2 vUv;
      ${NOISE}
      ${body}
      void main() {
        float lon = (vUv.x - 0.5) * 6.28318530718;
        float lat = (vUv.y - 0.5) * 3.14159265359;
        vec3 dir = vec3(cos(lat) * sin(lon), sin(lat), cos(lat) * cos(lon));
        gl_FragColor = bake(dir);
      }
    `,
    depthTest: false,
    depthWrite: false,
  })
  const quad = new Mesh(new PlaneGeometry(2, 2), material)
  const scene = new Scene()
  scene.add(quad)
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1)
  const previous = renderer.getRenderTarget()
  renderer.setRenderTarget(target)
  renderer.render(scene, camera)
  renderer.setRenderTarget(previous)
  material.dispose()
  quad.geometry.dispose()
  return target.texture
}

/** GLSL: equirect UV for a unit direction (matches `bakeEquirect`). */
export const EQUIRECT_UV = /* glsl */ `
vec2 equirectUv(vec3 d) {
  return vec2(atan(d.x, d.z) / 6.28318530718 + 0.5, asin(clamp(d.y, -1.0, 1.0)) / 3.14159265359 + 0.5);
}
`

/** Tileable fractal value noise on the CPU — cheap to sample for fog and dust. */
export function createNoiseTexture(size = 256, seed = 29): Texture {
  const rand = mulberry32(seed)
  const data = new Uint8Array(size * size * 4)
  const octaves = [8, 16, 32, 64]
  const lattices = octaves.map((n) => Float32Array.from({ length: n * n }, () => rand()))
  const sample = (lattice: Float32Array, n: number, x: number, y: number) => {
    const fx = (x / size) * n
    const fy = (y / size) * n
    const x0 = Math.floor(fx)
    const y0 = Math.floor(fy)
    const tx = fx - x0
    const ty = fy - y0
    const sx = tx * tx * (3 - 2 * tx)
    const sy = ty * ty * (3 - 2 * ty)
    const at = (i: number, j: number) => lattice[((j + n) % n) * n + ((i + n) % n)]
    const a = at(x0, y0)
    const b = at(x0 + 1, y0)
    const c = at(x0, y0 + 1)
    const d = at(x0 + 1, y0 + 1)
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy
  }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let v = 0
      let amp = 0.5
      let norm = 0
      octaves.forEach((n, o) => {
        v += sample(lattices[o], n, x, y) * amp
        norm += amp
        amp *= 0.5
      })
      // Second channel: offset field for decorrelated lookups.
      const w = sample(lattices[1], octaves[1], (x + size / 3) % size, (y + size / 2) % size)
      const i = (y * size + x) * 4
      data[i] = Math.round((v / norm) * 255)
      data[i + 1] = Math.round(w * 255)
      data[i + 2] = 0
      data[i + 3] = 255
    }
  }
  const tex = new DataTexture(data, size, size, RGBAFormat)
  tex.wrapS = RepeatWrapping
  tex.wrapT = RepeatWrapping
  tex.magFilter = LinearFilter
  tex.minFilter = LinearFilter
  tex.needsUpdate = true
  return tex
}
