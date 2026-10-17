/**
 * Scroll layout. All choreography is expressed in "viewport units" (vu):
 * 1 vu = one small-viewport height of scrolling. Act lengths here drive both
 * the DOM section heights and the master timeline, so they never drift apart.
 */

export type ActId = 'pad' | 'manifesto' | 'launch' | 'payloads' | 'contact'

export interface Act {
  id: ActId
  label: string
  start: number
  length: number
  end: number
}

export interface ActLayout {
  acts: Act[]
  byId: Record<ActId, Act>
  /** Sum of all act lengths (document height in vu). */
  total: number
  /** Maximum reachable scroll position in vu (total minus one viewport). */
  scrollable: number
}

export const PAYLOAD_INTRO = 1.0
export const PAYLOAD_SLOT = 1.2

const LABELS: Record<ActId, string> = {
  pad: 'Pad',
  manifesto: 'Manifesto',
  launch: 'Launch',
  payloads: 'Payloads',
  contact: 'Contact',
}

export function actLengths(projectCount: number): Record<ActId, number> {
  return {
    pad: 1.2,
    manifesto: 2.6,
    launch: 3.2,
    payloads: PAYLOAD_INTRO + projectCount * PAYLOAD_SLOT,
    contact: 2.0,
  }
}

export function layoutActs(projectCount: number): ActLayout {
  const lengths = actLengths(projectCount)
  const order: ActId[] = ['pad', 'manifesto', 'launch', 'payloads', 'contact']
  let cursor = 0
  const acts = order.map((id) => {
    const act: Act = { id, label: LABELS[id], start: cursor, length: lengths[id], end: cursor + lengths[id] }
    cursor = act.end
    return act
  })
  const byId = Object.fromEntries(acts.map((a) => [a.id, a])) as Record<ActId, Act>
  return { acts, byId, total: cursor, scrollable: cursor - 1 }
}

/** Index of the act containing scroll position `vu` (clamped to the valid range). */
export function actIndexAt(layout: ActLayout, vu: number): number {
  const { acts } = layout
  for (let i = acts.length - 1; i >= 0; i--) {
    if (vu >= acts[i].start) return i
  }
  return 0
}
