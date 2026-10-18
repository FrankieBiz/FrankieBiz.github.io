import { Mesh, MeshStandardMaterial, SRGBColorSpace, type Material, type Object3D, type Texture } from 'three'

/** Arm retraction in radians for overall progress 0..1; the lowest arm leads. */
export function armSwing(progress: number, index: number): number {
  const local = Math.min(Math.max(progress * 1.4 - index * 0.2, 0), 1)
  return local * local * (3 - 2 * local) * 1.35
}

/** Parts whose second UV set carries the baked AO atlas. */
const BAKED = ['Tower', 'Mount', 'Flood_0', 'Flood_1', 'Flood_2', 'Flood_3']

/**
 * The Blender-authored launch structures (tools/blender/pad.py): service tower,
 * launch mount, access arms and floodlight rigs. Ground, pad markings, beams,
 * fog and lights stay in LaunchPad.
 */
export class PadModel {
  readonly arms: Object3D[]
  private armBase: number[]

  private constructor(
    readonly group: Object3D,
    arms: Object3D[],
    readonly beacon: Object3D,
  ) {
    this.arms = arms
    this.armBase = arms.map((a) => a.rotation.y)
  }

  /** Returns null when a required part is missing, so callers can fall back. */
  static fromGltf(gltf: { scene: Object3D }, ao: Texture | null, lens: Material, castShadows: boolean): PadModel | null {
    const scene = gltf.scene
    const find = (name: string) => scene.getObjectByName(name)
    const arms = [0, 1, 2].map((i) => find(`Arm_${i}`))
    const beacon = find('Beacon')
    if (!find('Tower') || !find('Mount') || arms.some((a) => !a) || !beacon) return null

    if (ao) {
      // Baked on the "Lightmap" UV set (TEXCOORD_1); glTF UVs have a top-left origin.
      // Blender writes 8-bit bakes sRGB-encoded.
      ao.channel = 1
      ao.repeat.y = -1
      ao.offset.y = 1
      ao.colorSpace = SRGBColorSpace
    }
    for (const name of BAKED) {
      find(name)?.traverse((o) => {
        if (!(o instanceof Mesh) || !(o.material instanceof MeshStandardMaterial)) return
        // Materials are shared with the (un-baked) arms in the file, so copy before adding AO.
        const material = o.material.clone()
        material.aoMap = ao
        o.material = material
      })
    }
    for (let i = 0; i < 4; i++) {
      find(`FloodLens_${i}`)?.traverse((o) => {
        if (o instanceof Mesh) o.material = lens
      })
    }
    scene.traverse((o) => {
      if (o instanceof Mesh) {
        o.castShadow = castShadows
        o.receiveShadow = castShadows
      }
    })
    return new PadModel(scene, arms as Object3D[], beacon)
  }

  setArms(progress: number) {
    this.arms.forEach((arm, i) => {
      arm.rotation.y = this.armBase[i] + armSwing(progress, i)
    })
  }
}
