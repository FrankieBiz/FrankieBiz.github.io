import { Color, Mesh, PlaneGeometry, ShaderMaterial } from 'three'
import { NOISE } from './shaders/noise'
import { createNameTexture, type NameTexture } from './textures'

/** Depth of the name: just behind the rocket, in front of the service tower. */
const PLATE_Z = -1.25
const PLATE_Y = 6.3
/** Stacked (portrait) layout sits above the nose cone instead of behind the body. */
const PLATE_Y_STACKED = 13.9

/**
 * The owner's name set inside the world, just behind the rocket, so the
 * vehicle genuinely occludes it. On landscape screens the rocket
 * stands in the gap between the two words; on portrait the words stack
 * above the nose so no letter is hidden.
 */
export class NamePlate {
  readonly mesh: Mesh
  private material: ShaderMaterial
  private stacked: boolean | null = null
  private name: NameTexture | null = null

  constructor(
    private first: string,
    private last: string,
  ) {
    this.material = new ShaderMaterial({
      uniforms: {
        uMap: { value: null },
        uReveal: { value: 0 },
        uOpacity: { value: 1 },
        uColor: { value: new Color('#e8eef5').multiplyScalar(0.78) },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      premultipliedAlpha: true,
    })
    this.mesh = new Mesh(new PlaneGeometry(1, 1), this.material)
    this.mesh.position.set(0, PLATE_Y, PLATE_Z)
    this.mesh.renderOrder = 0
  }

  /**
   * Size the plate to the hero framing: `cameraZ`/`fov` describe the opening
   * shot, `aspect` the viewport.
   */
  layout(aspect: number, cameraZ: number, fovDeg: number) {
    const stacked = aspect < 1
    if (stacked !== this.stacked) {
      this.name?.texture.dispose()
      this.name = createNameTexture(this.first, this.last, stacked)
      this.material.uniforms.uMap.value = this.name.texture
      this.stacked = stacked
    }
    const name = this.name!
    const depth = cameraZ - PLATE_Z
    const visibleH = 2 * depth * Math.tan((fovDeg * Math.PI) / 360)
    const visibleW = visibleH * aspect
    let width = visibleW * (stacked ? 0.94 : 0.9)
    let height = width / name.aspect
    const maxH = visibleH * (stacked ? 0.15 : 0.24)
    if (height > maxH) {
      height = maxH
      width = height * name.aspect
    }
    this.mesh.scale.set(width, height, 1)
    // Put the anchor (gap between words) at x = 0, where the rocket stands.
    this.mesh.position.x = (0.5 - name.anchor) * width
    this.mesh.position.y = stacked ? PLATE_Y_STACKED : PLATE_Y
  }

  set reveal(v: number) {
    this.material.uniforms.uReveal.value = v
  }

  get reveal() {
    return this.material.uniforms.uReveal.value
  }

  setOpacity(v: number) {
    this.material.uniforms.uOpacity.value = v
    this.mesh.visible = v > 0.001
  }
}

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const FRAG = /* glsl */ `
uniform sampler2D uMap;
uniform float uReveal;
uniform float uOpacity;
uniform vec3 uColor;
varying vec2 vUv;
${NOISE}
void main() {
  float glyph = texture2D(uMap, vUv).a;
  // Blocky decode sweep from left to right with a bright leading edge.
  float cell = nzHash12(floor(vUv * vec2(180.0, 14.0)));
  float x = vUv.x + (cell - 0.5) * 0.1;
  float edge = uReveal * 1.25 - 0.1;
  float shown = 1.0 - smoothstep(edge - 0.02, edge, x);
  float lead = (1.0 - smoothstep(0.0, 0.06, abs(x - edge + 0.03))) * step(0.001, uReveal) * step(uReveal, 0.999);
  vec3 col = uColor * (1.0 + lead * 4.0);
  float a = glyph * max(shown, lead * 0.8) * uOpacity;
  gl_FragColor = vec4(col * a, a);
}
`
