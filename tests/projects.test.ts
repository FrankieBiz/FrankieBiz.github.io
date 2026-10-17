import { describe, expect, it } from 'vitest'
import { projects, validateProjects, type Project } from '../src/content/projects'

const sample: Project = {
  id: 'a',
  title: 'A',
  summary: '',
  tags: [],
  year: '2026',
  status: 'Live',
  repo: '',
  live: '',
  form: 'knot',
}

describe('payload manifest', () => {
  it('ships a valid placeholder manifest', () => {
    expect(validateProjects(projects)).toEqual([])
  })

  it('catches duplicate ids, empty titles, bad forms and bad URLs', () => {
    const errors = validateProjects([
      sample,
      { ...sample, title: ' ' },
      { ...sample, id: 'b', form: 'cube' as Project['form'] },
      { ...sample, id: 'c', repo: 'github.com/someone/repo' },
    ])
    expect(errors.some((e) => e.includes('duplicate id'))).toBe(true)
    expect(errors.some((e) => e.includes('title is empty'))).toBe(true)
    expect(errors.some((e) => e.includes('unknown form'))).toBe(true)
    expect(errors.some((e) => e.includes('repo must start with http'))).toBe(true)
  })

  it('enforces the 1–6 project range', () => {
    expect(validateProjects([])).toHaveLength(1)
    const seven = Array.from({ length: 7 }, (_, i) => ({ ...sample, id: `p${i}` }))
    expect(validateProjects(seven)[0]).toMatch(/Expected 1–6/)
  })
})
