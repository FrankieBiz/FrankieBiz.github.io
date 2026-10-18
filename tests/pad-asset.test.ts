import { NodeIO, type Document, type Node } from '@gltf-transform/core'
import { existsSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'

const FILE = 'assets-src/blender/pad.glb'
// Must match the site's layout (src/scene/LaunchPad.ts): tower centre and arm levels in three.js coordinates.
const TOWER = { x: -3.0, z: -2.1, half: 0.75 }
const ARM_LEVELS = [3.1, 6.5, 8.95]

let doc: Document
beforeAll(async () => {
  doc = await new NodeIO().read(FILE)
})

const node = (name: string) => doc.getRoot().listNodes().find((n) => n.getName() === name)

/** Direction of a node's local +X axis in its parent's (scene) space. */
function localX(n: Node): [number, number, number] {
  const [x, y, z, w] = n.getRotation()
  return [1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w)]
}

describe('authored launch pad asset', () => {
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

  it('carries a second UV set on baked parts for the AO atlas', () => {
    for (const name of ['Tower', 'Mount']) {
      const prim = node(name)!.getMesh()!.listPrimitives()[0]
      expect(prim.getAttribute('TEXCOORD_1'), name).not.toBeNull()
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
