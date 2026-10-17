/**
 * World-space anchors shared by the scene and the choreography.
 * Units are loosely metres; the rocket is ~10.5 units tall.
 */

export type Vec3 = readonly [number, number, number]

/** Rocket group origin while standing on the launch mount. */
export const PAD_ROCKET_Y = 1.8

/** Where the upper stage coasts in the orbit world. */
export const ORBIT_ROCKET: Vec3 = [-14, 0.6, -6]

export const MODULE_SPACING = 14

export function modulePosition(index: number): Vec3 {
  const odd = index % 2 === 1
  return [8 + index * MODULE_SPACING, odd ? 0.9 : -0.3, odd ? -3.5 : 0]
}

export function fieldPosition(projectCount: number): Vec3 {
  return [8 + projectCount * MODULE_SPACING + 6, 1.1, -2]
}

export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
