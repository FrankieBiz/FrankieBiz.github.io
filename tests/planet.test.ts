import { SphereGeometry, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { latLonToLocal, orientation } from '../src/scene/Planet'

describe('globe placement', () => {
  it('matches three.js SphereGeometry UVs, so equirect texels land where they belong', () => {
    const geo = new SphereGeometry(1, 64, 32)
    const pos = geo.attributes.position
    const uv = geo.attributes.uv
    for (const i of [70, 400, 1111, 1700]) {
      const lon = uv.getX(i) * 360 - 180
      const lat = uv.getY(i) * 180 - 90
      const expected = new Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)).normalize()
      expect(latLonToLocal(lat, lon).distanceTo(expected), `vertex ${i}`).toBeLessThan(1e-6)
    }
  })

  it('puts the focal latitude/longitude at the requested direction, north up', () => {
    const dir = new Vector3(-0.1, 0.85, 0.5).normalize()
    const m = orientation(40, 15, dir, new Vector3(0, 0, -1))
    const placed = latLonToLocal(40, 15).applyMatrix4(m)
    expect(placed.distanceTo(dir)).toBeLessThan(1e-6)
    // A point slightly north must move toward the requested north (-z, away from camera).
    const north = latLonToLocal(41, 15).applyMatrix4(m).sub(placed)
    expect(north.z).toBeLessThan(0)
  })
})
