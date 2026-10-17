import {
  BoxGeometry,
  BufferGeometry,
  Color,
  DoubleSide,
  ExtrudeGeometry,
  Group,
  LatheGeometry,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Object3D,
  Shape,
  Vector2,
} from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { HULL_Y0, HULL_Y1, type HullTextures } from './textures'

export const ROCKET_RADIUS = 0.56
/** Local y of the engine bell exit plane. */
export const NOZZLE_EXIT_Y = -0.5

/** Tangent-ogive nose: radius R at the base, tip at height L above it. */
function ogive(R: number, L: number, baseY: number, steps: number): Vector2[] {
  const rho = (R * R + L * L) / (2 * R)
  const pts: Vector2[] = []
  for (let i = 1; i <= steps; i++) {
    const x = (i / steps) * L
    const r = Math.sqrt(Math.max(rho * rho - x * x, 0)) + R - rho
    pts.push(new Vector2(Math.max(r, 0), baseY + x))
  }
  pts[pts.length - 1].x = 0
  return pts
}

export function hullProfile(): Vector2[] {
  return [
    new Vector2(0, HULL_Y0),
    new Vector2(0.42, HULL_Y0),
    new Vector2(0.47, 0.36),
    new Vector2(0.53, 0.55),
    new Vector2(ROCKET_RADIUS, 0.8),
    new Vector2(ROCKET_RADIUS, 6.6),
    ...ogive(ROCKET_RADIUS, HULL_Y1 - 6.6, 6.6, 28),
  ]
}

export function createHullGeometry(segments = 96): BufferGeometry {
  const geo = new LatheGeometry(hullProfile(), segments)
  // Re-map v to height so the hull texture isn't stretched by point spacing.
  const pos = geo.attributes.position
  const uv = geo.attributes.uv
  for (let i = 0; i < pos.count; i++) {
    uv.setY(i, (pos.getY(i) - HULL_Y0) / (HULL_Y1 - HULL_Y0))
  }
  uv.needsUpdate = true
  return geo
}

export function createFinGeometry(): BufferGeometry {
  const s = new Shape()
  s.moveTo(0, 0.36)
  s.lineTo(0.92, 0.1)
  s.lineTo(0.95, 0.82)
  s.lineTo(0, 2.15)
  s.closePath()
  const geo = new ExtrudeGeometry(s, {
    depth: 0.05,
    bevelEnabled: true,
    bevelThickness: 0.018,
    bevelSize: 0.018,
    bevelSegments: 2,
  })
  geo.translate(0, 0, -0.025)
  return geo
}

/** Hull plus fins as a single geometry — used for particle sampling. */
export function createRocketSilhouette(): BufferGeometry {
  const hull = createHullGeometry(64)
  const flat = (g: BufferGeometry) => (g.index ? g.toNonIndexed() : g)
  const parts: BufferGeometry[] = [flat(hull)]
  for (let i = 0; i < 4; i++) {
    const fin = createFinGeometry()
    fin.translate(ROCKET_RADIUS - 0.08, 0, 0)
    fin.rotateY(i * (Math.PI / 2) + Math.PI / 4)
    parts.push(flat(fin))
  }
  for (const p of parts) {
    p.deleteAttribute('uv')
  }
  return mergeGeometries(parts)!
}

export class Rocket {
  readonly group = new Group()
  /** Inner group for vibration so the root transform stays clean. */
  readonly body = new Group()
  /** Anchor at the nozzle exit; the flame hangs from here. */
  readonly nozzle = new Object3D()
  private bellMaterial: MeshStandardMaterial
  private heat = new Color('#ff6a1a')

  constructor(textures: HullTextures, castShadows: boolean) {
    this.group.add(this.body)

    const hullMaterial = new MeshPhysicalMaterial({
      map: textures.map,
      roughnessMap: textures.roughness,
      bumpMap: textures.bump,
      bumpScale: 0.6,
      roughness: 1,
      metalness: 0,
      clearcoat: 0.35,
      clearcoatRoughness: 0.35,
    })
    const hull = new Mesh(createHullGeometry(), hullMaterial)
    // Rotate so the painted name (u = 0.5) faces +z.
    hull.rotation.y = Math.PI
    hull.castShadow = castShadows
    hull.receiveShadow = castShadows
    this.body.add(hull)

    const graphite = new MeshPhysicalMaterial({
      color: '#1a1f27',
      roughness: 0.42,
      metalness: 0.35,
      clearcoat: 0.5,
      clearcoatRoughness: 0.4,
    })

    const finGeo = createFinGeometry()
    for (let i = 0; i < 4; i++) {
      const pivot = new Group()
      pivot.rotation.y = i * (Math.PI / 2) + Math.PI / 4
      const fin = new Mesh(finGeo, graphite)
      fin.position.x = ROCKET_RADIUS - 0.08
      fin.castShadow = castShadows
      pivot.add(fin)
      this.body.add(pivot)
    }

    // Cable raceway running up the side.
    const raceway = new Mesh(new BoxGeometry(0.07, 5.5, 0.045), graphite)
    raceway.position.set(ROCKET_RADIUS + 0.012, 3.85, 0)
    const racewayPivot = new Group()
    racewayPivot.rotation.y = -Math.PI / 2 + 0.35
    racewayPivot.add(raceway)
    this.body.add(racewayPivot)

    // Engine bell.
    this.bellMaterial = new MeshStandardMaterial({
      color: '#3b4048',
      roughness: 0.34,
      metalness: 0.92,
      side: DoubleSide,
    })
    const bellProfile = [
      new Vector2(0.24, 0.34),
      new Vector2(0.2, 0.22),
      new Vector2(0.18, 0.12),
      new Vector2(0.22, 0.0),
      new Vector2(0.3, -0.18),
      new Vector2(0.38, -0.36),
      new Vector2(0.44, NOZZLE_EXIT_Y),
    ]
    const bell = new Mesh(new LatheGeometry(bellProfile, 48), this.bellMaterial)
    this.body.add(bell)

    this.nozzle.position.y = NOZZLE_EXIT_Y
    this.body.add(this.nozzle)
  }

  /** Engine heat glow on the bell. */
  setHeat(ignition: number) {
    this.bellMaterial.emissive.copy(this.heat).multiplyScalar(ignition * 0.9)
  }

  /** High-frequency vibration under thrust. */
  vibrate(time: number, thrust: number) {
    const a = thrust * 0.012
    this.body.position.x = Math.sin(time * 61.3) * a * 0.6
    this.body.position.z = Math.cos(time * 47.9) * a * 0.6
    this.body.rotation.z = Math.sin(time * 13.1) * a * 0.12
  }
}
