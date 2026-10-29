// Synthesised sound effects (D1). Everything is generated with the Web Audio API, so a sound
// starts on the next audio quantum after its action (well under the 100 ms budget of AC-12.8).
import type { SoundName } from './soundBus'

let ctx: AudioContext | null = null
let master: GainNode | null = null
let noiseBuffer: AudioBuffer | null = null
let volume = 0.8

export function ensureSfxContext(): AudioContext | null {
  if (ctx) return ctx
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  ctx = new Ctor({ latencyHint: 'interactive' })
  master = ctx.createGain()
  master.gain.value = volume
  // A gentle compressor keeps stacked sounds (place + snap) from clipping.
  const comp = ctx.createDynamicsCompressor()
  comp.threshold.value = -14
  comp.ratio.value = 3
  master.connect(comp).connect(ctx.destination)
  noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
  const data = noiseBuffer.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  return ctx
}

export function resumeSfx() {
  void ensureSfxContext()?.resume()
}

export function setSfxVolume(v: number) {
  volume = v
  if (master && ctx) master.gain.setTargetAtTime(v, ctx.currentTime, 0.02)
}

const ready = () => (ctx && master && ctx.state === 'running' ? { ctx, out: master } : null)

interface Env {
  at?: number
  gain: number
  attack?: number
  decay: number
}

function envGain(c: AudioContext, out: AudioNode, { at = 0, gain, attack = 0.002, decay }: Env) {
  const g = c.createGain()
  const t = c.currentTime + at
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(Math.max(gain, 0.0002), t + attack)
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay)
  g.connect(out)
  return { g, t, end: t + attack + decay + 0.05 }
}

function tone(
  c: AudioContext,
  out: AudioNode,
  opts: Env & { freq: number; to?: number; type?: OscillatorType },
) {
  const { g, t, end } = envGain(c, out, opts)
  const osc = c.createOscillator()
  osc.type = opts.type ?? 'sine'
  osc.frequency.setValueAtTime(opts.freq, t)
  if (opts.to) osc.frequency.exponentialRampToValueAtTime(opts.to, t + opts.decay)
  osc.connect(g)
  osc.start(t)
  osc.stop(end)
}

function noise(
  c: AudioContext,
  out: AudioNode,
  opts: Env & { freq: number; q?: number; type?: BiquadFilterType },
) {
  if (!noiseBuffer) return
  const { g, t, end } = envGain(c, out, opts)
  const src = c.createBufferSource()
  src.buffer = noiseBuffer
  const filter = c.createBiquadFilter()
  filter.type = opts.type ?? 'bandpass'
  filter.frequency.value = opts.freq
  filter.Q.value = opts.q ?? 1.2
  src.connect(filter).connect(g)
  src.start(t, Math.random() * 0.5)
  src.stop(end)
}

/** Modal "wood block" knock: a few inharmonic damped partials plus a short contact click. */
function knock(c: AudioContext, out: AudioNode, freq: number, gain: number, decay = 0.12, at = 0) {
  ;[1, 2.76, 5.4].forEach((ratio, i) =>
    tone(c, out, { at, freq: freq * ratio, gain: gain / (1 + i * 1.6), decay: decay / (1 + i * 0.7) }),
  )
  noise(c, out, { at, freq: freq * 2.4, q: 1.5, gain: gain * 0.45, decay: 0.025 })
}

const recipes: Record<SoundName, (c: AudioContext, out: AudioNode) => void> = {
  pickup: (c, o) => {
    tone(c, o, { freq: 620, to: 920, gain: 0.18, decay: 0.07 })
    noise(c, o, { freq: 3000, gain: 0.05, decay: 0.03 })
  },
  place: (c, o) => knock(c, o, 520, 0.42),
  move: (c, o) => knock(c, o, 430, 0.36, 0.1),
  snap: (c, o) => {
    knock(c, o, 1250, 0.2, 0.04, 0.03)
    knock(c, o, 1550, 0.22, 0.05, 0.065)
  },
  rotate: (c, o) => {
    for (let i = 0; i < 3; i++) knock(c, o, 980 + i * 60, 0.12, 0.035, i * 0.035)
  },
  delete: (c, o) => {
    tone(c, o, { freq: 520, to: 140, gain: 0.22, decay: 0.22, attack: 0.01 })
    noise(c, o, { freq: 900, q: 0.6, gain: 0.08, decay: 0.2, attack: 0.02, type: 'lowpass' })
  },
  invalid: (c, o) => {
    const lp = c.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 600
    lp.connect(o)
    tone(c, lp, { freq: 150, gain: 0.32, decay: 0.09, type: 'square' })
    tone(c, lp, { at: 0.12, freq: 135, gain: 0.3, decay: 0.12, type: 'square' })
  },
  ui: (c, o) => tone(c, o, { freq: 1400, gain: 0.06, decay: 0.025 }),
  whistle: (c, o) => {
    ;[880, 1108].forEach((f) => {
      const { g, t, end } = envGain(c, o, { gain: 0.09, attack: 0.06, decay: 0.75 })
      const osc = c.createOscillator()
      osc.frequency.setValueAtTime(f * 0.97, t)
      osc.frequency.linearRampToValueAtTime(f, t + 0.08)
      const lfo = c.createOscillator()
      const depth = c.createGain()
      lfo.frequency.value = 6
      depth.gain.value = f * 0.008
      lfo.connect(depth).connect(osc.frequency)
      osc.connect(g)
      osc.start(t)
      lfo.start(t)
      osc.stop(end)
      lfo.stop(end)
    })
    noise(c, o, { freq: 2200, q: 0.8, gain: 0.04, attack: 0.05, decay: 0.7 })
  },
  chug: (c, o) => chuff(c, o, 0.25),
  bump: (c, o) => {
    tone(c, o, { freq: 95, to: 60, gain: 0.45, decay: 0.16 })
    knock(c, o, 300, 0.2, 0.08)
  },
}

function chuff(c: AudioContext, o: AudioNode, gain: number) {
  noise(c, o, { freq: 700, q: 0.7, gain, attack: 0.01, decay: 0.12, type: 'bandpass' })
}

export function playSfx(name: SoundName) {
  const r = ready()
  if (r) recipes[name](r.ctx, r.out)
}

// Continuous chug/clatter while the train moves: tempo and volume follow speed (AC-12.3).
let chugPhase = 0
let clatterPhase = 0
export function updateChug(speed: number, dt: number) {
  const r = ready()
  if (!r || speed <= 0.01) {
    chugPhase = 0
    return
  }
  const level = Math.min(1, speed / 2)
  chugPhase += dt * speed * 2.6
  clatterPhase += dt * speed
  if (chugPhase >= 1) {
    chugPhase %= 1
    chuff(r.ctx, r.out, 0.05 + 0.13 * level)
  }
  if (clatterPhase >= 1) {
    // Wheels crossing a track joint: a light double wooden click once per tile.
    clatterPhase %= 1
    knock(r.ctx, r.out, 1700, 0.05 + 0.06 * level, 0.03)
    knock(r.ctx, r.out, 1600, 0.04 + 0.05 * level, 0.03, 0.09)
  }
}
