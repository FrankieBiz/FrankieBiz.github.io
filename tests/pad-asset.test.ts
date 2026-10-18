import { NodeIO, type Document, type Node } from '@gltf-transform/core'
import { existsSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'

const FILE = 'assets-src/blender/pad.glb'
// Must match the site's layout (src/scene/LaunchPad.ts): tower centre and arm levels in three.js coordinates.
const TOWER = { x: -3.0, z: -2.1, half: 0.75 }
const ARM_LEVELS = [3.1, 6.5, 8.95]

// Blender's raw export lives in gitignored assets-src/: these checks run where the assets are
// built and skip in CI; the built-asset checks below run everywhere.
const HAS_SOURCE = existsSync(FILE)

let doc: Document
beforeAll(async () => {
  if (HAS_SOURCE) doc = await new NodeIO().read(FILE)
})

const node = (name: string) => doc.getRoot().listNodes().find((n) => n.getName() === name)

/** Direction of a node's local +X axis in its parent's (scene) space. */
function localX(n: Node): [number, number, number] {
  const [x, y, z, w] = n.getRotation()
  return [1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w)]
}

describe.skipIf(!HAS_SOURCE)('authored launch pad asset', () => {
  it('has the parts the site drives by name', () => {
    const names = doc.getRoot().listNodes().map((n) => n.getName())
    for (const name of ['Tower', 'Mount', 'Arm_0', 'Arm_1', 'Arm_2', 'Beacon']) expect(names, name).toContain(name)
    for (let i = 0; i < 4; i++) {
      expect(names).toContain(`Flood_${i}`)
      expect(names).toContain(`FloodLens_${i}`)
    }
  })

  it('pivots each access arm at the tower corner and points it at the rocket', () => {
    const pivot = [TOWER.x + TOWER.half, TOWER.z + TOWER.half]
    const len = Math.hypot(pivot[0], pivot[1])
    const toRocket = [-pivot[0] / len, -pivot[1] / len]
    ARM_LEVELS.forEach((level, i) => {
      const arm = node(`Arm_${i}`)!
      const [tx, ty, tz] = arm.getTranslation()
      expect(tx).toBeCloseTo(pivot[0], 2)
      expect(ty).toBeCloseTo(level, 2)
      expect(tz).toBeCloseTo(pivot[1], 2)
      const [dx, dy, dz] = localX(arm)
      expect(dy).toBeCloseTo(0, 3)
      expect(dx).toBeCloseTo(toRocket[0], 2)
      expect(dz).toBeCloseTo(toRocket[1], 2)
    })
  })

  it('puts the AO atlas UVs in TEXCOORD_1, inside each part\'s tile', () => {
    // Tiles from pad.py unwrap_lightmap, in glTF UV space (v = 0 at the top of the image).
    const tiles: Record<string, [number, number, number, number]> = {
      Tower: [0, 0, 0.5, 1],
      Mount: [0.5, 0, 1, 0.5],
    }
    for (const [name, [u0, v0, u1, v1]] of Object.entries(tiles)) {
      const prim = node(name)!.getMesh()!.listPrimitives()[0]
      // Exactly two UV sets: three samples aoMap from uv1, so a stray extra set would shadow it.
      expect(prim.listSemantics().filter((s) => s.startsWith('TEXCOORD')), name).toEqual(['TEXCOORD_0', 'TEXCOORD_1'])
      const uv = prim.getAttribute('TEXCOORD_1')!
      const [minU, minV] = uv.getMin([])
      const [maxU, maxV] = uv.getMax([])
      expect(minU, `${name} u min`).toBeGreaterThanOrEqual(u0 - 1e-3)
      expect(maxU, `${name} u max`).toBeLessThanOrEqual(u1 + 1e-3)
      expect(minV, `${name} v min`).toBeGreaterThanOrEqual(v0 - 1e-3)
      expect(maxV, `${name} v max`).toBeLessThanOrEqual(v1 + 1e-3)
    }
  })

  it('stays within the triangle budget', () => {
    let tris = 0
    for (const n of doc.getRoot().listNodes()) {
      for (const prim of n.getMesh()?.listPrimitives() ?? []) {
        const idx = prim.getIndices()
        tris += (idx ? idx.getCount() : prim.getAttribute('POSITION')!.getCount()) / 3
      }
    }
    expect(tris).toBeGreaterThan(8000)
    expect(tris).toBeLessThanOrEqual(90000)
  })

  it('ships the baked AO atlas and the ground contact-shadow map', () => {
    expect(existsSync('assets-src/blender/pad-ao.png')).toBe(true)
    expect(existsSync('assets-src/blender/ground-ao.png')).toBe(true)
  })
})

describe('built (compressed) pad asset', () => {
  it('keeps each access arm pivoting on its tower hinge after compression', async () => {
    const { ALL_EXTENSIONS } = await import('@gltf-transform/extensions')
    const { MeshoptDecoder } = await import('meshoptimizer')
    await MeshoptDecoder.ready
    const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder })
    for (const tier of ['high', 'low']) {
      const built = await io.read(`public/assets/pad-${tier}.glb`)
      ARM_LEVELS.forEach((level, i) => {
        // Quantization folds offsets into mesh node transforms; the node the site rotates must not move.
        const arm = built.getRoot().listNodes().find((n) => n.getName() === `Arm_${i}`)!
        const [tx, ty, tz] = arm.getTranslation()
        expect(tx, `${tier} Arm_${i} x`).toBeCloseTo(TOWER.x + TOWER.half, 2)
        expect(ty, `${tier} Arm_${i} y`).toBeCloseTo(level, 2)
        expect(tz, `${tier} Arm_${i} z`).toBeCloseTo(TOWER.z + TOWER.half, 2)
        for (const s of arm.getScale()) expect(s, `${tier} Arm_${i} scale`).toBeCloseTo(1, 4)
      })
    }
  })
})
