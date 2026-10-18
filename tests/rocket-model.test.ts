import { BufferAttribute, BufferGeometry, Group, Mesh, MeshStandardMaterial, Object3D, Texture } from 'three'
import { describe, expect, it } from 'vitest'
import { RocketModel } from '../src/scene/RocketModel'

function fakeRocketScene(omit: string[] = []) {
  const scene = new Group()
  const mesh = (name: string) => {
    const geo = new BufferGeometry()
    geo.setAttribute('position', new BufferAttribute(new Float32Array(9), 3))
    geo.setAttribute('uv', new BufferAttribute(new Float32Array(6), 2))
    const m = new Mesh(geo, new MeshStandardMaterial())
    m.name = name
    return m
  }
  for (const name of ['Hull', 'Fin_0', 'Fin_1', 'Fin_2', 'Fin_3', 'Raceway', 'Nozzle']) {
    if (!omit.includes(name)) scene.add(mesh(name))
  }
  if (!omit.includes('NozzleExit')) {
    const exit = new Object3D()
    exit.name = 'NozzleExit'
    exit.position.y = -0.5
    scene.add(exit)
  }
  return { scene }
}

const paint = () => ({ map: new Texture(), roughness: new Texture(), bump: new Texture() })

describe('RocketModel', () => {
  it('wraps the authored scene and anchors the flame at the nozzle exit', () => {
    const gltf = fakeRocketScene()
    const rocket = RocketModel.fromGltf(gltf, paint(), new Texture(), false)!
    expect(rocket).not.toBeNull()
    expect(rocket.nozzle.name).toBe('NozzleExit')
    expect(rocket.group.children).toContain(rocket.body)
  })

  it('flips the painted maps vertically to match glTF texture coordinates', () => {
    const textures = paint()
    const ao = new Texture()
    RocketModel.fromGltf(fakeRocketScene(), textures, ao, false)
    for (const t of [textures.map, textures.roughness, textures.bump, ao]) {
      expect(t.repeat.y).toBe(-1)
      expect(t.offset.y).toBe(1)
    }
  })

  it('heats the engine bell under thrust', () => {
    const rocket = RocketModel.fromGltf(fakeRocketScene(), paint(), null, false)!
    rocket.setHeat(1)
    const bell = rocket.body.getObjectByName('Nozzle') as Mesh
    expect((bell.material as MeshStandardMaterial).emissive.r).toBeGreaterThan(0.3)
  })

  it('returns null (so the site falls back to the procedural rocket) when key parts are missing', () => {
    expect(RocketModel.fromGltf(fakeRocketScene(['Hull']), paint(), null, false)).toBeNull()
    expect(RocketModel.fromGltf(fakeRocketScene(['NozzleExit']), paint(), null, false)).toBeNull()
    expect(RocketModel.fromGltf(fakeRocketScene(['Nozzle']), paint(), null, false)).toBeNull()
  })
})
