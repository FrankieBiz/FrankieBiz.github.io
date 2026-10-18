import { Color, DoubleSide, Group, Mesh, MeshPhysicalMaterial, MeshStandardMaterial, type Object3D, type Texture } from 'three'
import type { HullTextures } from './textures'

/** What the rest of the scene needs from a rocket (procedural or authored). */
export interface RocketLike {
  readonly group: Group
  /** Inner group for vibration so the root transform stays clean. */
  readonly body: Group
  /** Anchor at the nozzle exit; the flame hangs from here. */
  readonly nozzle: Object3D
  setHeat(ignition: number): void
  vibrate(time: number, thrust: number): void
}

const HEAT = new Color('#ff6a1a')

/**
 * The Blender-authored rocket (tools/blender/rocket.py). Geometry and baked
 * hull AO come from the GLB; the painted markings stay browser-drawn so the
 * lettering is crisp and editable.
 */
export class RocketModel implements RocketLike {
  readonly group = new Group()
  readonly body = new Group()
  readonly nozzle: Object3D
  private bell: MeshStandardMaterial

  private constructor(scene: Object3D, nozzle: Object3D, bell: MeshStandardMaterial) {
    this.nozzle = nozzle
    this.bell = bell
    this.body.add(scene)
    this.group.add(this.body)
  }

  /** Returns null when a required part is missing, so callers can fall back. */
  static fromGltf(gltf: { scene: Object3D }, paint: HullTextures, ao: Texture | null, castShadows: boolean): RocketModel | null {
    const scene = gltf.scene
    const hull = scene.getObjectByName('Hull')
    const bellMesh = scene.getObjectByName('Nozzle')
    const exit = scene.getObjectByName('NozzleExit')
    if (!(hull instanceof Mesh) || !(bellMesh instanceof Mesh) || !exit) return null

    // glTF texture coordinates have a top-left origin; the painted canvas and the
    // baked AO use bottom-left, so flip them vertically.
    for (const texture of [paint.map, paint.roughness, paint.bump, ao]) {
      if (!texture) continue
      texture.repeat.y = -1
      texture.offset.y = 1
    }
    hull.material = new MeshPhysicalMaterial({
      map: paint.map,
      roughnessMap: paint.roughness,
      bumpMap: paint.bump,
      bumpScale: 0.6,
      aoMap: ao,
      roughness: 1,
      metalness: 0,
      clearcoat: 0.35,
      clearcoatRoughness: 0.35,
    })

    // The bell is seen from inside too, and glows when the engine burns.
    const source = bellMesh.material as MeshStandardMaterial
    const bell = new MeshStandardMaterial({
      color: source.color?.clone() ?? new Color('#3b4048'),
      roughness: source.roughness ?? 0.34,
      metalness: source.metalness ?? 0.92,
      side: DoubleSide,
    })
    bellMesh.material = bell

    scene.traverse((o) => {
      if (o instanceof Mesh) {
        o.castShadow = castShadows
        o.receiveShadow = castShadows
      }
    })
    return new RocketModel(scene, exit, bell)
  }

  setHeat(ignition: number) {
    this.bell.emissive.copy(HEAT).multiplyScalar(ignition * 0.9)
  }

  vibrate(time: number, thrust: number) {
    const a = thrust * 0.012
    this.body.position.x = Math.sin(time * 61.3) * a * 0.6
    this.body.position.z = Math.cos(time * 47.9) * a * 0.6
    this.body.rotation.z = Math.sin(time * 13.1) * a * 0.12
  }
}
