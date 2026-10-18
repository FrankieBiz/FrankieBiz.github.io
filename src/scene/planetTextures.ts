import type { Texture } from 'three'

export interface PlanetTextures {
  day: Texture
  night: Texture
  clouds: Texture
}

/** NASA maps are all-or-nothing: a partial set falls back to the procedural planet. */
export function planetTextures(assets: Map<string, unknown>): PlanetTextures | null {
  const day = assets.get('earth-day')
  const night = assets.get('earth-night')
  const clouds = assets.get('earth-clouds')
  if (!day || !night || !clouds) return null
  return { day, night, clouds } as PlanetTextures
}
