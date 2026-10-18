import { BufferAttribute, BufferGeometry, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, Object3D, SRGBColorSpace, Texture } from 'three'
import { describe, expect, it } from 'vitest'
import { armSwing, PadModel } from '../src/scene/PadModel'

function fakePad(omit: string[] = []) {
  const scene = new Group()
  const mesh = (name: string) => {
    const geo = new BufferGeometry()
    geo.setAttribute('position', new BufferAttribute(new Float32Array(9), 3))
    const m = new Mesh(geo, new MeshStandardMaterial())
    m.name = name
    return m
  }
  const names = ['Tower', 'Mount', 'Arm_0', 'Arm_1', 'Arm_2', 'Flood_0', 'Flood_1', 'Flood_2', 'Flood_3', 'FloodLens_0', 'FloodLens_1', 'FloodLens_2', 'FloodLens_3']
  for (const name of names) {
    if (omit.includes(name)) continue
    const m = mesh(name)
    if (name.startsWith('Arm_')) m.rotation.y = -0.54
    scene.add(m)
  }
  if (!omit.includes('Beacon')) {
    const beacon = new Object3D()
    beacon.name = 'Beacon'
    beacon.position.set(-3, 16.05, -2.1)
    scene.add(beacon)
  }
  return { scene }
}

describe('arm swing', () => {
  it('stays attached at 0 and retracts 1.35 rad at 1', () => {
    for (const i of [0, 1, 2]) {
      expect(armSwing(0, i)).toBe(0)
      expect(armSwing(1, i)).toBeCloseTo(1.35)
    }
  })

  it('staggers the arms: the lowest moves first', () => {
    expect(armSwing(0.3, 0)).toBeGreaterThan(armSwing(0.3, 1))
    expect(armSwing(0.3, 1)).toBeGreaterThan(armSwing(0.3, 2))
  })
})

describe('PadModel', () => {
  const lens = new MeshBasicMaterial()

  it('wraps the authored pad and finds arms and the beacon anchor', () => {
    const pad = PadModel.fromGltf(fakePad(), null, lens, false)!
    expect(pad).not.toBeNull()
    expect(pad.arms.map((a) => a.name)).toEqual(['Arm_0', 'Arm_1', 'Arm_2'])
    expect(pad.beacon.position.y).toBeCloseTo(16.05)
  })

  it('swings each arm from its authored angle', () => {
    const pad = PadModel.fromGltf(fakePad(), null, lens, false)!
    pad.setArms(1)
    for (const arm of pad.arms) expect(arm.rotation.y).toBeCloseTo(-0.54 + 1.35)
    pad.setArms(0)
    for (const arm of pad.arms) expect(arm.rotation.y).toBeCloseTo(-0.54)
  })

  it('applies the AO atlas on the second UV set, flipped for glTF', () => {
    const ao = new Texture()
    const gltf = fakePad()
    PadModel.fromGltf(gltf, ao, lens, false)
    expect(ao.channel).toBe(1)
    expect(ao.repeat.y).toBe(-1)
    expect(ao.offset.y).toBe(1)
    // Blender writes 8-bit bakes sRGB-encoded; decoding as linear would weaken the occlusion.
    expect(ao.colorSpace).toBe(SRGBColorSpace)
    const tower = gltf.scene.getObjectByName('Tower') as Mesh
    expect((tower.material as MeshStandardMaterial).aoMap).toBe(ao)
  })

  it('lights the floodlight lenses with the emissive material', () => {
    const gltf = fakePad()
    PadModel.fromGltf(gltf, null, lens, false)
    expect((gltf.scene.getObjectByName('FloodLens_2') as Mesh).material).toBe(lens)
  })

  it('returns null so the site falls back when required parts are missing', () => {
    expect(PadModel.fromGltf(fakePad(['Tower']), null, lens, false)).toBeNull()
    expect(PadModel.fromGltf(fakePad(['Arm_2']), null, lens, false)).toBeNull()
    expect(PadModel.fromGltf(fakePad(['Beacon']), null, lens, false)).toBeNull()
  })
})
