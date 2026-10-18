export interface BlenderInstalls {
  /** A plain `blender` executable on PATH (e.g. `sudo dnf install blender`). */
  blenderOnPath: boolean
  /** The Flathub app `org.blender.Blender`. */
  flatpakBlender: boolean
}

/** The argv to run a Blender Python script headless, preferring the native install. */
export function blenderCommand(installs: BlenderInstalls, script: string, args: string[]): string[] {
  const headless = ['-b', '--factory-startup', '-P', script, '--', ...args]
  if (installs.blenderOnPath) return ['blender', ...headless]
  if (installs.flatpakBlender) return ['flatpak', 'run', 'org.blender.Blender', ...headless]
  throw new Error('Blender not found. Install it with `sudo dnf install blender` or `flatpak install --user flathub org.blender.Blender`.')
}
