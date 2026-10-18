import type { Tier } from '../core/Quality'

export interface EngineEffectInputs {
  ignition: number
  orbit: boolean
  reduced: boolean
  tier: Tier
}

/** Heat shimmer around the plume: pad only, above the low tier, never under reduced motion. */
export function heatIntensity({ ignition, orbit, reduced, tier }: EngineEffectInputs): number {
  if (orbit || reduced || tier === 'low') return 0
  return ignition
}

/** Engine light shafts: while the engine burns on the pad, above the low tier. Light, not motion, so reduced motion doesn't affect it. */
export function shaftsEnabled({ ignition, orbit, tier }: Omit<EngineEffectInputs, 'reduced'> & { reduced?: boolean }): boolean {
  return ignition > 0.02 && !orbit && tier !== 'low'
}

/** Ambient occlusion: the pad only, where structures meet the ground. In orbit there is nothing to occlude against, and it is a quarter of the medium frame. */
export function occlusionEnabled({ orbit }: { orbit: boolean }): boolean {
  return !orbit
}
