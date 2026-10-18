import { NodeIO, type Document } from '@gltf-transform/core'
import { existsSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'

const FILE = 'assets-src/blender/rocket.glb'
// Must match HULL_Y0 / HULL_Y1 and NOZZLE_EXIT_Y used by the site (src/scene/textures.ts, Rocket.ts).
const HULL_Y0 = 0.3
const HULL_Y1 = 10
const NOZZLE_EXIT_Y = -0.5

// Blender's raw export lives in gitignored assets-src/: these checks run where the assets are
// built and skip in CI; the built-asset checks below run everywhere.
const HAS_SOURCE = existsSync(FILE)

let doc: Document
beforeAll(async () => {
  if (HAS_SOURCE) doc = await new NodeIO().read(FILE)
})

const meshNodes = () => doc.getRoot().listNodes().filter((n) => n.getMesh())

describe.skipIf(!HAS_SOURCE)('authored rocket asset', () => {
  it('has the parts the site drives by name', () => {
    const names = doc.getRoot().listNodes().map((n) => n.getName())
    for (const name of ['Hull', 'Fin_0', 'Fin_1', 'Fin_2', 'Fin_3', 'Nozzle', 'NozzleExit', 'Raceway']) {
      expect(names, name).toContain(name)
    }
  })

  it('stays within the 60k triangle budget', () => {
    let tris = 0
    for (const node of meshNodes()) {
      for (const prim of node.getMesh()!.listPrimitives()) {
        const indices = prim.getIndices()
        tris += (indices ? indices.getCount() : prim.getAttribute('POSITION')!.getCount()) / 3
      }
    }
    expect(tris).toBeGreaterThan(5000) // real detail, not a placeholder
    expect(tris).toBeLessThanOrEqual(60000)
  })

  it('stands from the nozzle exit to the nose tip like the procedural rocket', () => {
    let minY = Infinity
    let maxY = -Infinity
    for (const node of meshNodes()) {
      const ty = node.getTranslation()[1]
      for (const prim of node.getMesh()!.listPrimitives()) {
        const pos = prim.getAttribute('POSITION')!
        minY = Math.min(minY, pos.getMin([0, 0, 0])[1] + ty)
        maxY = Math.max(maxY, pos.getMax([0, 0, 0])[1] + ty)
      }
    }
    expect(minY).toBeCloseTo(NOZZLE_EXIT_Y, 1)
    expect(maxY).toBeCloseTo(HULL_Y1, 1)
  })

  it('maps hull UVs like three.js LatheGeometry so the painted markings line up', () => {
    const hull = doc.getRoot().listNodes().find((n) => n.getName() === 'Hull')!
    const prim = hull.getMesh()!.listPrimitives()[0]
    const pos = prim.getAttribute('POSITION')!
    const uv = prim.getAttribute('TEXCOORD_0')!
    const p = [0, 0, 0]
    const t = [0, 0]
    let worst = 0
    for (let i = 0; i < pos.getCount(); i++) {
      pos.getElement(i, p)
      uv.getElement(i, t)
      // glTF UVs are top-left origin: v_gltf = 1 - v_three.
      const vThree = 1 - t[1]
      const expected = (p[1] - HULL_Y0) / (HULL_Y1 - HULL_Y0)
      if (expected >= 0) worst = Math.max(worst, Math.abs(vThree - expected))
      expect(t[0]).toBeGreaterThanOrEqual(-1e-4)
      expect(t[0]).toBeLessThanOrEqual(1 + 1e-4)
    }
    expect(worst).toBeLessThan(2e-3)
  })

  it('places the flame anchor at the nozzle exit', () => {
    const exit = doc.getRoot().listNodes().find((n) => n.getName() === 'NozzleExit')!
    expect(exit.getTranslation()[1]).toBeCloseTo(NOZZLE_EXIT_Y, 2)
  })
})

describe('built (compressed) rocket asset', () => {
  it('keeps every named part after compression (no joining or flattening)', async () => {
    const { ALL_EXTENSIONS } = await import('@gltf-transform/extensions')
    const { MeshoptDecoder } = await import('meshoptimizer')
    await MeshoptDecoder.ready
    const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder })
    for (const tier of ['high', 'low']) {
      const built = await io.read(`public/assets/rocket-${tier}.glb`)
      const names = built.getRoot().listNodes().map((n) => n.getName())
      for (const name of ['Hull', 'Fin_0', 'Fin_1', 'Fin_2', 'Fin_3', 'Nozzle', 'NozzleExit', 'Raceway']) {
        expect(names, `${tier}: ${name}`).toContain(name)
      }
    }
  })
})
