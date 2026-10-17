/**
 * Payload manifest — the single place to swap placeholder projects for real
 * GitHub work. Add, remove or reorder entries; the orbit scene, scroll length
 * and cards are generated from this list (1–6 entries supported).
 */

export type PayloadForm = 'knot' | 'gyroscope' | 'cluster' | 'lattice'

export interface Project {
  id: string
  title: string
  summary: string
  tags: string[]
  year: string
  status: string
  /** Repository URL. Leave empty to render the link as unavailable. */
  repo: string
  /** Live demo URL. Leave empty to render the link as unavailable. */
  live: string
  /** The object suspended inside this project's glass module. */
  form: PayloadForm
}

export const projects: Project[] = [
  {
    id: 'telemetry',
    title: 'Telemetry',
    summary:
      'Placeholder for a flagship project. Describe the problem it solves, what makes it interesting and what you learned building it.',
    tags: ['TypeScript', 'WebGL'],
    year: '2026',
    status: 'Slot reserved',
    repo: '',
    live: '',
    form: 'knot',
  },
  {
    id: 'groundstation',
    title: 'Groundstation',
    summary:
      'Placeholder for a tool or library. A sentence on who uses it and why, then a sentence on how it works under the hood.',
    tags: ['Rust', 'CLI'],
    year: '2026',
    status: 'Slot reserved',
    repo: '',
    live: '',
    form: 'gyroscope',
  },
  {
    id: 'starchart',
    title: 'Starchart',
    summary:
      'Placeholder for a data or visualization project. Lead with the most surprising result, then the stack that produced it.',
    tags: ['Python', 'D3'],
    year: '2025',
    status: 'Slot reserved',
    repo: '',
    live: '',
    form: 'cluster',
  },
  {
    id: 'payload-bay',
    title: 'Payload Bay',
    summary:
      'Placeholder for an experiment or side project. Small, strange and fun is welcome here.',
    tags: ['Swift', 'Metal'],
    year: '2025',
    status: 'Slot reserved',
    repo: '',
    live: '',
    form: 'lattice',
  },
]

export const PAYLOAD_FORMS: readonly PayloadForm[] = ['knot', 'gyroscope', 'cluster', 'lattice']
export const MAX_PROJECTS = 6

/** Returns a list of human-readable problems; empty means the manifest is valid. */
export function validateProjects(list: readonly Project[]): string[] {
  const errors: string[] = []
  if (list.length < 1 || list.length > MAX_PROJECTS) {
    errors.push(`Expected 1–${MAX_PROJECTS} projects, found ${list.length}.`)
  }
  const ids = new Set<string>()
  list.forEach((p, i) => {
    const where = `projects[${i}]`
    if (!p.id.trim()) errors.push(`${where}: id is empty.`)
    if (ids.has(p.id)) errors.push(`${where}: duplicate id "${p.id}".`)
    ids.add(p.id)
    if (!p.title.trim()) errors.push(`${where}: title is empty.`)
    if (!PAYLOAD_FORMS.includes(p.form)) errors.push(`${where}: unknown form "${p.form}".`)
    for (const key of ['repo', 'live'] as const) {
      const url = p[key]
      if (url && !/^https?:\/\//.test(url)) errors.push(`${where}: ${key} must start with http(s)://.`)
    }
  })
  return errors
}
