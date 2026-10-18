import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CatmullRomCurve3,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  NormalBlending,
  Object3D,
  PlaneGeometry,
  Points,
  Quaternion,
  ShaderMaterial,
  SphereGeometry,
  SpotLight,
  TubeGeometry,
  Vector3,
  type Texture,
} from 'three'
import type { DirectorState } from '../director/state'
import { PAD_ROCKET_Y } from './layout'
import { armSwing, type PadModel } from './PadModel'
import { mulberry32 } from './textures'

const TOWER = { x: -3.0, z: -2.1, w: 1.5, h: 12.6, level: 1.05 }
const ARM_LEVELS = [3.1, 6.5, 8.95]
/** Floodlight poles (x, z), lamp height and aim point; tools/blender/pad.py mirrors these. */
const FLOODS: Array<[number, number]> = [
  [12.5, 9.5],
  [-13, 7.5],
  [11, -11],
  [-9.5, -12.5],
]
const FLOOD_HEAD_Y = 9.1
const AIM = new Vector3(0, 5.5, 0)

const FROST = new Color('#e8eef5')
const IGNITE = new Color('#ff6a1a')

/** Glowing lamp faces, shared by the authored and procedural floodlight rigs. */
export function createFloodLensMaterial() {
  return new MeshBasicMaterial({ color: FROST.clone().multiplyScalar(7) })
}

/** Beam between two points on a unit box instance. */
function beamMatrix(a: Vector3, b: Vector3, thickness: number, out: Matrix4) {
  const dir = new Vector3().subVectors(b, a)
  const len = dir.length()
  const q = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), dir.normalize())
  const mid = new Vector3().addVectors(a, b).multiplyScalar(0.5)
  return out.compose(mid, q, new Vector3(thickness, len, thickness))
}

export class LaunchPad {
  readonly group = new Group()
  readonly keyLight: SpotLight
  readonly rimLight: SpotLight
  private arms: Group[] = []
  private armBase: number[] = []
  private structures: PadModel | null
  private beacon: Mesh
  private beams: ShaderMaterial
  private fog: ShaderMaterial[] = []
  private lights: ShaderMaterial

  /** `structures` is the Blender-authored tower, mount, arms and floodlight rigs; without it they are built procedurally. */
  constructor(padTexture: Texture, noise: Texture, shadows: boolean, structures: PadModel | null = null) {
    // Ground and pad.
    const ground = new Mesh(
      new CircleGeometry(4000, 96),
      new MeshStandardMaterial({ color: '#0b0f15', roughness: 1, metalness: 0 }),
    )
    ground.rotation.x = -Math.PI / 2
    ground.receiveShadow = shadows
    this.group.add(ground)

    const pad = new Mesh(
      new CircleGeometry(16, 96),
      new MeshStandardMaterial({ map: padTexture, roughness: 0.9, metalness: 0.02 }),
    )
    pad.rotation.x = -Math.PI / 2
    pad.rotation.z = Math.PI / 2
    pad.position.y = 0.01
    pad.receiveShadow = shadows
    this.group.add(pad)

    this.structures = structures
    this.beacon = new Mesh(new SphereGeometry(0.075, 12, 8), new MeshBasicMaterial({ color: IGNITE.clone().multiplyScalar(6) }))
    if (structures) {
      this.group.add(structures.group)
      structures.beacon.add(this.beacon)
    } else {
      this.buildStructures(shadows)
    }

    // Work lights on each platform, at the corner facing the rocket.
    const stripMat = new MeshBasicMaterial({ color: FROST.clone().multiplyScalar(3.2) })
    const stripGeo = new BoxGeometry(0.5, 0.03, 0.03)
    const half = TOWER.w / 2
    for (const y of [...ARM_LEVELS, TOWER.h]) {
      const strip = new Mesh(stripGeo, stripMat)
      strip.position.set(TOWER.x + half + 0.18, y - 0.2, TOWER.z + half + 0.18)
      strip.rotation.y = -Math.PI / 4
      this.group.add(strip)
    }

    // Fake volumetric beams from the floodlight heads.
    this.beams = new ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uIntensity: { value: 1 }, uNoise: { value: noise }, uColor: { value: new Color('#cfdcff') } },
      vertexShader: BEAM_VERT,
      fragmentShader: BEAM_FRAG,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      side: DoubleSide,
    })
    const beamLength = 19
    const beamGeo = new CylinderGeometry(0.32, 3.6, beamLength, 40, 1, true)
    beamGeo.translate(0, -beamLength / 2, 0)
    for (const [x, z] of FLOODS) {
      const beam = new Mesh(beamGeo, this.beams)
      beam.position.set(x, FLOOD_HEAD_Y, z)
      const dir = new Vector3().subVectors(AIM, beam.position).normalize()
      beam.quaternion.setFromUnitVectors(new Vector3(0, -1, 0), dir)
      beam.renderOrder = 2
      this.group.add(beam)
    }

    const key = new SpotLight('#dfe8ff', 320, 70, 0.42, 0.55, 1.5)
    key.position.set(FLOODS[0][0], FLOOD_HEAD_Y, FLOODS[0][1])
    key.target.position.copy(AIM)
    key.castShadow = shadows
    key.shadow.mapSize.set(1024, 1024)
    key.shadow.bias = -0.0004
    key.shadow.normalBias = 0.02
    key.shadow.camera.near = 4
    key.shadow.camera.far = 60
    this.keyLight = key
    const rim = new SpotLight('#b9cbff', 300, 70, 0.4, 0.6, 1.5)
    rim.position.set(FLOODS[3][0], FLOOD_HEAD_Y, FLOODS[3][1])
    rim.target.position.copy(AIM)
    this.rimLight = rim
    this.group.add(key, key.target, rim, rim.target)

    // Ground fog layers.
    const fogGeo = new PlaneGeometry(90, 90, 1, 1)
    fogGeo.rotateX(-Math.PI / 2)
    ;[0.22, 0.65, 1.1].forEach((y, i) => {
      const mat = new ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uNoise: { value: noise },
          uOffset: { value: i * 17.3 },
          uOpacity: { value: 0.55 - i * 0.12 },
          uIgnition: { value: 0 },
          uColor: { value: new Color('#1d2a3d') },
          uGlow: { value: IGNITE.clone() },
        },
        vertexShader: FOG_VERT,
        fragmentShader: FOG_FRAG,
        transparent: true,
        depthWrite: false,
        blending: NormalBlending,
      })
      const layer = new Mesh(fogGeo, mat)
      layer.position.y = y
      layer.renderOrder = 1
      this.fog.push(mat)
      this.group.add(layer)
    })

    // Distant facility lights and the pad perimeter ring.
    const rand = mulberry32(41)
    const pts: number[] = []
    const cols: number[] = []
    const sizes: number[] = []
    const warm = new Color('#ffd9b0')
    for (let i = 0; i < 160; i++) {
      const a = rand() * Math.PI * 2
      const r = 70 + rand() * 180
      pts.push(Math.cos(a) * r, 0.3 + rand() * 4, Math.sin(a) * r)
      const c = rand() > 0.7 ? warm : FROST
      cols.push(c.r, c.g, c.b)
      sizes.push(1.5 + rand() * 2.5)
    }
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2
      pts.push(Math.cos(a) * 14.4, 0.08, Math.sin(a) * 14.4)
      cols.push(FROST.r, FROST.g, FROST.b)
      sizes.push(3.2)
    }
    const lightGeo = new BufferGeometry()
    lightGeo.setAttribute('position', new BufferAttribute(new Float32Array(pts), 3))
    lightGeo.setAttribute('color', new BufferAttribute(new Float32Array(cols), 3))
    lightGeo.setAttribute('aSize', new BufferAttribute(new Float32Array(sizes), 1))
    this.lights = new ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uPixelRatio: { value: 1 } },
      vertexShader: LIGHTS_VERT,
      fragmentShader: LIGHTS_FRAG,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      vertexColors: true,
    })
    this.group.add(new Points(lightGeo, this.lights))
  }

  /** Procedural stand-ins for the authored structures, used when pad.glb is unavailable. */
  private buildStructures(shadows: boolean) {
    const steel = new MeshStandardMaterial({ color: '#2a3039', roughness: 0.55, metalness: 0.65 })
    const concrete = new MeshStandardMaterial({ color: '#363c45', roughness: 0.88, metalness: 0.05 })

    // Launch mount: four legs and a square frame around the flame hole.
    const mount = new Group()
    const legGeo = new BoxGeometry(0.5, 1.05, 0.5)
    for (const [x, z] of [
      [1.25, 1.25],
      [-1.25, 1.25],
      [1.25, -1.25],
      [-1.25, -1.25],
    ]) {
      const leg = new Mesh(legGeo, concrete)
      leg.position.set(x, 0.525, z)
      leg.castShadow = shadows
      leg.receiveShadow = shadows
      mount.add(leg)
    }
    const top = PAD_ROCKET_Y - 0.5
    const slabs: Array<[number, number, number, number]> = [
      [3.2, 0.9, 0, 1.15],
      [3.2, 0.9, 0, -1.15],
      [0.9, 1.4, 1.15, 0],
      [0.9, 1.4, -1.15, 0],
    ]
    for (const [w, d, x, z] of slabs) {
      const slab = new Mesh(new BoxGeometry(w, 0.26, d), concrete)
      slab.position.set(x, top - 0.13, z)
      slab.castShadow = shadows
      slab.receiveShadow = shadows
      mount.add(slab)
    }
    const clampGeo = new BoxGeometry(0.2, 0.34, 0.26)
    for (let i = 0; i < 4; i++) {
      const a = i * (Math.PI / 2) + Math.PI / 4
      const clamp = new Mesh(clampGeo, steel)
      clamp.position.set(Math.cos(a) * 0.64, top + 0.17, Math.sin(a) * 0.64)
      clamp.rotation.y = -a
      mount.add(clamp)
    }
    const deflector = new Mesh(new BoxGeometry(2.2, 0.5, 1.3), concrete)
    deflector.rotation.y = Math.PI / 2
    deflector.position.set(0, 0.25, -0.7)
    deflector.rotation.z = -0.32
    mount.add(deflector)
    this.group.add(mount)

    // Service tower: instanced lattice.
    const beams: Matrix4[] = []
    const half = TOWER.w / 2
    const corners = [
      [-half, -half],
      [half, -half],
      [half, half],
      [-half, half],
    ]
    const levels = Math.floor(TOWER.h / TOWER.level)
    for (const [x, z] of corners) {
      beams.push(beamMatrix(new Vector3(x, 0, z), new Vector3(x, TOWER.h, z), 0.11, new Matrix4()))
    }
    for (let j = 0; j <= levels; j++) {
      const y0 = j * TOWER.level
      for (let c = 0; c < 4; c++) {
        const [ax, az] = corners[c]
        const [bx, bz] = corners[(c + 1) % 4]
        beams.push(beamMatrix(new Vector3(ax, y0, az), new Vector3(bx, y0, bz), 0.06, new Matrix4()))
        if (j < levels) {
          const y1 = y0 + TOWER.level
          beams.push(beamMatrix(new Vector3(ax, y0, az), new Vector3(bx, y1, bz), 0.035, new Matrix4()))
          beams.push(beamMatrix(new Vector3(bx, y0, bz), new Vector3(ax, y1, az), 0.035, new Matrix4()))
        }
      }
    }
    const tower = new InstancedMesh(new BoxGeometry(1, 1, 1), steel, beams.length)
    beams.forEach((m, i) => tower.setMatrixAt(i, m))
    tower.castShadow = shadows
    const towerGroup = new Group()
    towerGroup.position.set(TOWER.x, 0, TOWER.z)
    towerGroup.add(tower)

    // Platforms at the arm levels and the top.
    const platformGeo = new BoxGeometry(TOWER.w + 0.35, 0.07, TOWER.w + 0.35)
    for (const y of [...ARM_LEVELS, TOWER.h]) {
      const platform = new Mesh(platformGeo, steel)
      platform.position.y = y - 0.25
      platform.castShadow = shadows
      towerGroup.add(platform)
    }
    // Lightning mast and beacon.
    const mast = new Mesh(new CylinderGeometry(0.025, 0.05, 3.4, 8), steel)
    mast.position.y = TOWER.h + 1.7
    towerGroup.add(mast)
    this.beacon.position.y = TOWER.h + 3.45
    towerGroup.add(this.beacon)
    this.group.add(towerGroup)

    // Swing arms from the tower corner nearest the rocket.
    const pivotLocal = new Vector3(half, 0, half)
    const pivotWorld = new Vector3(TOWER.x + pivotLocal.x, 0, TOWER.z + pivotLocal.z)
    const toRocket = new Vector3(-pivotWorld.x, 0, -pivotWorld.z)
    const reach = toRocket.length() - 0.6
    const baseAngle = Math.atan2(-toRocket.z, toRocket.x)
    const railGeo = new BoxGeometry(reach, 0.05, 0.05)
    const postGeo = new BoxGeometry(0.04, 0.3, 0.04)
    const deckGeo = new BoxGeometry(reach, 0.03, 0.34)
    ARM_LEVELS.forEach((y, i) => {
      const arm = new Group()
      arm.position.set(pivotWorld.x, y, pivotWorld.z)
      arm.rotation.y = baseAngle
      const deck = new Mesh(deckGeo, steel)
      deck.position.set(reach / 2, -0.15, 0)
      arm.add(deck)
      for (const z of [-0.16, 0.16]) {
        const rail = new Mesh(railGeo, steel)
        rail.position.set(reach / 2, 0.15, z)
        arm.add(rail)
        for (let p = 0; p <= 4; p++) {
          const post = new Mesh(postGeo, steel)
          post.position.set((p / 4) * reach, 0, z)
          arm.add(post)
        }
      }
      if (i === 1) {
        const hose = new CatmullRomCurve3([
          new Vector3(0, -0.2, 0),
          new Vector3(reach * 0.5, -0.55, 0.05),
          new Vector3(reach, -0.25, 0),
        ])
        arm.add(new Mesh(new TubeGeometry(hose, 24, 0.045, 8), new MeshStandardMaterial({ color: '#0e1116', roughness: 0.6 })))
      }
      arm.traverse((o) => {
        if (o instanceof Mesh) o.castShadow = shadows
      })
      this.arms.push(arm)
      this.armBase.push(baseAngle)
      this.group.add(arm)
    })

    // Floodlight poles and lamp heads.
    const lens = createFloodLensMaterial()
    const poleGeo = new CylinderGeometry(0.09, 0.14, 9, 8)
    for (const [x, z] of FLOODS) {
      const pole = new Mesh(poleGeo, steel)
      pole.position.set(x, 4.5, z)
      this.group.add(pole)
      const head = new Group()
      head.position.set(x, FLOOD_HEAD_Y, z)
      head.lookAt(AIM)
      const housing = new Mesh(new BoxGeometry(1.25, 0.6, 0.28), steel)
      head.add(housing)
      const face = new Mesh(new PlaneGeometry(1.1, 0.46), lens)
      face.position.z = 0.145
      head.add(face)
      this.group.add(head)
    }
  }

  setPixelRatio(dpr: number) {
    this.lights.uniforms.uPixelRatio.value = dpr
  }

  update(_dt: number, time: number, state: DirectorState) {
    if (this.structures) this.structures.setArms(state.arms)
    else this.arms.forEach((arm, i) => (arm.rotation.y = this.armBase[i] + armSwing(state.arms, i)))
    const blink = Math.sin(time * 2.2) > 0.55 ? 1 : 0.08
    this.beacon.scale.setScalar(0.6 + blink * 0.4)
    ;(this.beacon.material as MeshBasicMaterial).color.copy(IGNITE).multiplyScalar(0.4 + blink * 7)
    this.beams.uniforms.uTime.value = time
    // Floods dim slightly as the engine outshines them.
    this.beams.uniforms.uIntensity.value = 1 - state.ignition * 0.35
    for (const mat of this.fog) {
      mat.uniforms.uTime.value = time
      mat.uniforms.uIgnition.value = state.ignition
    }
    this.lights.uniforms.uTime.value = time
  }

  /** Collect objects that should be hidden when leaving the pad world. */
  get root(): Object3D {
    return this.group
  }
}

const BEAM_VERT = /* glsl */ `
varying float vAlong;
varying vec3 vNormalW;
varying vec3 vWorld;
void main() {
  vAlong = clamp(-position.y / 19.0, 0.0, 1.0);
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * world;
}
`

const BEAM_FRAG = /* glsl */ `
uniform float uTime;
uniform float uIntensity;
uniform sampler2D uNoise;
uniform vec3 uColor;
varying float vAlong;
varying vec3 vNormalW;
varying vec3 vWorld;
void main() {
  vec3 view = normalize(cameraPosition - vWorld);
  float facing = abs(dot(normalize(vNormalW), view));
  float soft = pow(facing, 2.2);
  float falloff = pow(1.0 - vAlong, 1.7) * smoothstep(0.0, 0.06, vAlong);
  float n = texture2D(uNoise, vWorld.xy * 0.06 + vec2(uTime * 0.01, -uTime * 0.012)).r;
  n *= texture2D(uNoise, vWorld.zy * 0.05 + vec2(-uTime * 0.008, uTime * 0.01)).g * 2.0;
  float dust = 0.55 + 0.45 * n;
  // Fade before the hull and the ground so intersections never draw hard lines.
  float nearRocket = smoothstep(0.8, 3.2, length(vWorld.xz));
  float nearGround = smoothstep(0.0, 1.4, vWorld.y);
  float a = soft * falloff * dust * 0.075 * uIntensity * nearRocket * nearGround;
  gl_FragColor = vec4(uColor * a * 3.0, a);
}
`

const FOG_VERT = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`

const FOG_FRAG = /* glsl */ `
uniform float uTime;
uniform sampler2D uNoise;
uniform float uOffset;
uniform float uOpacity;
uniform float uIgnition;
uniform vec3 uColor;
uniform vec3 uGlow;
varying vec3 vWorld;
void main() {
  vec2 p = vWorld.xz * 0.012 + uOffset;
  float a1 = texture2D(uNoise, p + vec2(uTime * 0.003, uTime * 0.002)).r;
  float a2 = texture2D(uNoise, p * 2.3 - vec2(uTime * 0.004, -uTime * 0.003)).r;
  float n = a1 * 0.65 + a2 * 0.35;
  float d = length(vWorld.xz);
  float radial = 1.0 - smoothstep(10.0, 44.0, d);
  float a = smoothstep(0.42, 0.72, n) * radial * uOpacity;
  vec3 col = uColor + uGlow * uIgnition * exp(-d * 0.14) * 2.4;
  gl_FragColor = vec4(col, a);
}
`

const LIGHTS_VERT = /* glsl */ `
attribute float aSize;
uniform float uTime;
uniform float uPixelRatio;
varying vec3 vColor;
varying float vTw;
void main() {
  vColor = color;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float seed = fract(sin(dot(position.xz, vec2(12.9898, 78.233))) * 43758.5453);
  vTw = 0.7 + 0.3 * sin(uTime * (1.0 + seed * 2.0) + seed * 40.0);
  gl_PointSize = aSize * uPixelRatio * clamp(40.0 / -mv.z, 0.6, 4.0);
  gl_Position = projectionMatrix * mv;
}
`

const LIGHTS_FRAG = /* glsl */ `
varying vec3 vColor;
varying float vTw;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = 1.0 - smoothstep(0.0, 0.5, d);
  a = a * a;
  gl_FragColor = vec4(vColor * 2.5 * vTw * a, a);
}
`
