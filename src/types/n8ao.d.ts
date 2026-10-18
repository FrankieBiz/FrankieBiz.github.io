// Minimal types for n8ao 2.0.1 (the package ships none). Only what we use.
declare module 'n8ao' {
  import { Pass } from 'postprocessing'
  import type { Camera, Color, Scene } from 'three'

  export interface N8AOConfiguration {
    aoSamples: number
    aoRadius: number
    denoiseSamples: number
    denoiseRadius: number
    distanceFalloff: number
    intensity: number
    color: Color
    halfRes: boolean
    depthAwareUpsampling: boolean
    screenSpaceRadius: boolean
    gammaCorrection: boolean
    transparencyAware: boolean
  }

  /** Ambient occlusion pass for pmndrs/postprocessing; place after a RenderPass. */
  export class N8AOPostPass extends Pass {
    constructor(scene: Scene, camera: Camera, width?: number, height?: number)
    configuration: N8AOConfiguration
    setQualityMode(mode: 'Performance' | 'Low' | 'Medium' | 'High' | 'Ultra'): void
    setSize(width: number, height: number): void
  }
}
