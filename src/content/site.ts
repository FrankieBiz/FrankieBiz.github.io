/**
 * Site-wide copy. Everything here is placeholder until the real portfolio
 * content is ready — edit freely, the layout adapts.
 */

export type ShapeId = 'rocket' | 'graph' | 'ring' | 'lattice' | 'sheets'

export interface ContactLink {
  id: string
  label: string
  /** Short description shown next to the link. */
  detail: string
  href: string
  /** Particle formation shown while this link is hovered or focused. */
  shape: ShapeId
}

export const site = {
  name: { first: 'Frankie', last: 'Bisignano' },
  callsign: 'FB-01',
  role: 'Software engineer',
  intro: 'Projects, experiments and open-source work. The first payloads are being prepared for launch.',

  manifesto: [
    'I build software the way rockets get built: test it, break it, fix it, fly it again.',
    'Small, sharp tools. Interfaces that feel physical. Systems that survive contact with reality.',
    'Everything here is a work in progress, and that is the point.',
  ],

  /** Captions shown during the launch sequence, in order. */
  launch: ['Internal power', 'Ignition', 'Liftoff', 'Max-Q', 'Main engine cutoff'],

  payloadsIntro: {
    heading: 'Payloads',
    body: 'Selected work, in orbit soon. Each module below is a reserved slot for a project.',
  },

  contact: {
    heading: 'Open a channel',
    body: 'Collaborations, questions or a good idea. Pick a frequency.',
    links: [
      { id: 'github', label: 'GitHub', detail: 'Code and experiments', href: '#', shape: 'graph' },
      { id: 'email', label: 'Email', detail: 'The direct line', href: '#', shape: 'ring' },
      { id: 'linkedin', label: 'LinkedIn', detail: 'Work history', href: '#', shape: 'lattice' },
      { id: 'resume', label: 'Résumé', detail: 'One-page summary', href: '#', shape: 'sheets' },
    ] satisfies ContactLink[],
  },
} as const
