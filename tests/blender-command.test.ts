import { describe, expect, it } from 'vitest'
import { blenderCommand } from '../tools/blender/command'

describe('blender command resolution', () => {
  it('prefers a plain `blender` on PATH (Fedora package)', () => {
    expect(blenderCommand({ blenderOnPath: true, flatpakBlender: true }, 'tools/blender/rocket.py', ['--out', 'x'])).toEqual([
      'blender', '-b', '--factory-startup', '-P', 'tools/blender/rocket.py', '--', '--out', 'x',
    ])
  })

  it('falls back to the Flatpak install', () => {
    expect(blenderCommand({ blenderOnPath: false, flatpakBlender: true }, 's.py', [])).toEqual([
      'flatpak', 'run', 'org.blender.Blender', '-b', '--factory-startup', '-P', 's.py', '--',
    ])
  })

  it('explains how to install Blender when neither exists', () => {
    expect(() => blenderCommand({ blenderOnPath: false, flatpakBlender: false }, 's.py', [])).toThrow(/sudo dnf install blender|flatpak install/)
  })
})
