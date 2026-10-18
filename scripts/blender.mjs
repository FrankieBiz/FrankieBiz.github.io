// Runs a Blender Python script headless (no window), with whichever Blender is installed.
// Usage: npm run assets:blender -- tools/blender/<script>.py [script args]
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { blenderCommand } from '../tools/blender/command.ts'

const [script, ...args] = process.argv.slice(2)
if (!script) {
  console.error('usage: npm run assets:blender -- tools/blender/<script>.py [args]')
  process.exit(2)
}
const ok = (cmd, argv) => spawnSync(cmd, argv, { stdio: 'ignore' }).status === 0
const installs = {
  blenderOnPath: ok('sh', ['-c', 'command -v blender']),
  flatpakBlender: ok('flatpak', ['info', 'org.blender.Blender']),
}
// Absolute path: the Flatpak build starts in its own working directory.
const [cmd, ...argv] = blenderCommand(installs, resolve(script), args)
const result = spawnSync(cmd, argv, { stdio: 'inherit' })
process.exit(result.status ?? 1)
