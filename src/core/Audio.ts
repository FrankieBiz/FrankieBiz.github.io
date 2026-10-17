import type { DirectorState } from '../director/state'

/**
 * Generative sound, no audio files: a detuned low drone that opens up in
 * orbit, filtered noise for the engine rumble, and a soft tick for UI hovers.
 * Nothing is created until the visitor turns sound on.
 */
export class Audio {
  enabled = false
  private ctx: AudioContext | null = null
  private master!: GainNode
  private droneFilter!: BiquadFilterNode
  private droneGain!: GainNode
  private rumbleGain!: GainNode
  private rumbleFilter!: BiquadFilterNode
  private hissGain!: GainNode

  private suspendTimer = 0
  private hidden = false

  toggle(): boolean {
    if (!this.ctx) this.build()
    const ctx = this.ctx!
    this.enabled = !this.enabled
    clearTimeout(this.suspendTimer)
    if (this.enabled && ctx.state === 'suspended') void ctx.resume()
    const now = ctx.currentTime
    this.master.gain.cancelScheduledValues(now)
    this.master.gain.setTargetAtTime(this.enabled ? 0.9 : 0, now, 0.35)
    // Once faded out, stop the audio graph entirely instead of running silent oscillators.
    if (!this.enabled) this.suspendTimer = window.setTimeout(() => void ctx.suspend(), 1600)
    return this.enabled
  }

  /** Background tabs keep playing in Chrome; pause the graph while hidden. */
  setHidden(hidden: boolean) {
    this.hidden = hidden
    if (!this.ctx) return
    if (hidden) void this.ctx.suspend()
    else if (this.enabled) void this.ctx.resume()
  }

  tick() {
    if (!this.enabled || !this.ctx) return
    const ctx = this.ctx
    const t = ctx.currentTime
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(2400, t)
    osc.frequency.exponentialRampToValueAtTime(1500, t + 0.05)
    gain.gain.setValueAtTime(0.0001, t)
    gain.gain.exponentialRampToValueAtTime(0.05, t + 0.005)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.07)
    osc.connect(gain).connect(this.master)
    osc.start(t)
    osc.stop(t + 0.08)
  }

  update(state: DirectorState, orbit: boolean) {
    if (!this.ctx || !this.enabled || this.hidden) return
    const t = this.ctx.currentTime
    const thrust = state.ignition * (0.35 + 0.65 * state.thrust)
    this.rumbleGain.gain.setTargetAtTime(thrust * 0.55, t, 0.08)
    this.rumbleFilter.frequency.setTargetAtTime(90 + thrust * 520, t, 0.1)
    this.droneFilter.frequency.setTargetAtTime(orbit ? 1400 : 380 + state.fuel * 220, t, 0.6)
    this.droneGain.gain.setTargetAtTime(orbit ? 0.11 : 0.08, t, 0.6)
    this.hissGain.gain.setTargetAtTime(orbit ? 0.012 : 0.004, t, 0.8)
  }

  private build() {
    const ctx = new AudioContext()
    this.ctx = ctx

    const compressor = ctx.createDynamicsCompressor()
    compressor.threshold.value = -18
    compressor.ratio.value = 4
    compressor.connect(ctx.destination)

    this.master = ctx.createGain()
    this.master.gain.value = 0
    this.master.connect(compressor)

    // Drone: three detuned voices around A1, slowly breathing through a lowpass.
    this.droneFilter = ctx.createBiquadFilter()
    this.droneFilter.type = 'lowpass'
    this.droneFilter.frequency.value = 380
    this.droneFilter.Q.value = 0.7
    this.droneGain = ctx.createGain()
    this.droneGain.gain.value = 0.08
    this.droneFilter.connect(this.droneGain).connect(this.master)
    for (const [freq, type, detune] of [
      [55, 'sawtooth', -7],
      [82.41, 'triangle', 4],
      [110, 'sawtooth', 9],
    ] as const) {
      const osc = ctx.createOscillator()
      osc.type = type
      osc.frequency.value = freq
      osc.detune.value = detune
      osc.connect(this.droneFilter)
      osc.start()
    }
    const lfo = ctx.createOscillator()
    const lfoGain = ctx.createGain()
    lfo.frequency.value = 0.07
    lfoGain.gain.value = 120
    lfo.connect(lfoGain).connect(this.droneFilter.frequency)
    lfo.start()

    // Noise source shared by rumble and orbit hiss.
    const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate)
    const data = noise.getChannelData(0)
    let brown = 0
    for (let i = 0; i < data.length; i++) {
      brown = (brown + 0.02 * (Math.random() * 2 - 1)) / 1.02
      data[i] = brown * 3.5
    }
    const src = ctx.createBufferSource()
    src.buffer = noise
    src.loop = true

    this.rumbleFilter = ctx.createBiquadFilter()
    this.rumbleFilter.type = 'lowpass'
    this.rumbleFilter.frequency.value = 90
    this.rumbleGain = ctx.createGain()
    this.rumbleGain.gain.value = 0
    src.connect(this.rumbleFilter).connect(this.rumbleGain).connect(this.master)

    const hissFilter = ctx.createBiquadFilter()
    hissFilter.type = 'highpass'
    hissFilter.frequency.value = 2600
    this.hissGain = ctx.createGain()
    this.hissGain.gain.value = 0
    src.connect(hissFilter).connect(this.hissGain).connect(this.master)
    src.start()
  }
}
