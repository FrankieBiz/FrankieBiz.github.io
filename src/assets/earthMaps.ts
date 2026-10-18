/**
 * Per-pixel rules used by the asset build to turn NASA imagery into shader
 * inputs. Pure functions over 0..255 channels so they're unit-testable.
 */

/** Blue Marble colours → ocean (for the specular mask). Open ocean in the base map is near-black navy. */
export function isWater(r: number, g: number, b: number): boolean {
  return b > r + 8 && b >= g && (r + g + b) / 3 < 120
}

/** Black Marble colours → city-light intensity, with the navy background removed. */
export function nightIntensity(r: number, g: number, b: number): number {
  const warm = 0.6 * r + 0.4 * g - 0.2 * b
  return Math.round(Math.min(Math.max(((warm - 18) * 255) / 182, 0), 255))
}

/** Grey cloud layer → density with a clean floor so clear sky stays clear. */
export function cloudDensity(grey: number): number {
  return Math.round(Math.min(Math.max(((grey - 24) * 255) / 231, 0), 255))
}
