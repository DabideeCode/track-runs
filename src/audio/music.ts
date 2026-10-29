// Procedural background music (D1, §8 fallback): an original, cozy acoustic-electronic loop in
// F major — plucked arpeggios, a mallet melody, round bass and brushed percussion — built with tone.

type ToneModule = typeof import('tone')

let tone: ToneModule | null = null
let bus: import('tone').Volume | null = null
let started = false
let level = 0.6
let muted = false

const toDb = (v: number) => (v <= 0.001 ? -Infinity : 20 * Math.log10(v) - 8)

export function setMusicVolume(v: number, isMuted: boolean) {
  level = v
  muted = isMuted
  if (bus) bus.volume.rampTo(isMuted ? -Infinity : toDb(v), 0.2)
}

// 8-bar progression: I – V – vi – IV – I – V – IV – V.
const CHORDS: string[][] = [
  ['F3', 'A3', 'C4'],
  ['E3', 'G3', 'C4'],
  ['D3', 'F3', 'A3'],
  ['D3', 'F3', 'A#3'],
  ['F3', 'A3', 'C4'],
  ['E3', 'G3', 'C4'],
  ['D3', 'F3', 'A#3'],
  ['E3', 'G3', 'C4'],
]
const ROOTS = ['F2', 'C2', 'D2', 'A#1', 'F2', 'C2', 'A#1', 'C2']
const FIFTHS = ['C3', 'G2', 'A2', 'F2', 'C3', 'G2', 'F2', 'G2']

// Melody per bar as [eighth offset, note, length in eighths].
const MELODY: Array<Array<[number, string, number]>> = [
  [[0, 'A4', 1], [1, 'C5', 1], [2, 'A4', 2], [4, 'G4', 1], [5, 'F4', 1], [6, 'G4', 2]],
  [[0, 'E4', 1], [1, 'G4', 1], [2, 'C5', 2], [4, 'D5', 1], [5, 'C5', 1], [6, 'G4', 2]],
  [[0, 'F4', 1], [1, 'A4', 1], [2, 'D5', 2], [4, 'C5', 1], [5, 'A4', 1], [6, 'F4', 2]],
  [[0, 'D4', 1], [1, 'F4', 1], [2, 'A#4', 3], [6, 'A4', 1], [7, 'G4', 1]],
  [[0, 'A4', 1], [1, 'C5', 1], [2, 'A4', 2], [4, 'G4', 1], [5, 'F4', 1], [6, 'G4', 2]],
  [[0, 'E4', 1], [1, 'G4', 1], [2, 'C5', 2], [4, 'E5', 2], [6, 'D5', 2]],
  [[0, 'D5', 2], [2, 'C5', 1], [3, 'A#4', 1], [4, 'A4', 2], [6, 'G4', 2]],
  [[0, 'G4', 2], [2, 'A4', 1], [3, 'G4', 1], [4, 'E4', 3]],
]
const ARP = [0, 1, 2, 3, 2, 1, 2, 1]

export async function startMusic() {
  if (started) return
  started = true
  tone = await import('tone')
  const T = tone
  await T.start()

  bus = new T.Volume(muted ? -Infinity : toDb(level)).toDestination()
  const reverb = new T.Reverb({ decay: 2.8, wet: 0.24 }).connect(bus)
  const warm = new T.Filter(5200, 'lowpass').connect(reverb)

  const pluck = new T.PolySynth(T.Synth, {
    oscillator: { type: 'triangle' },
    envelope: { attack: 0.004, decay: 0.35, sustain: 0.04, release: 0.6 },
    volume: -17,
  }).connect(warm)
  const mallet = new T.FMSynth({
    harmonicity: 3.01,
    modulationIndex: 1.6,
    oscillator: { type: 'sine' },
    envelope: { attack: 0.003, decay: 0.5, sustain: 0.06, release: 0.8 },
    modulationEnvelope: { attack: 0.002, decay: 0.12, sustain: 0, release: 0.2 },
    volume: -13,
  }).connect(warm)
  const pad = new T.PolySynth(T.AMSynth, {
    envelope: { attack: 0.6, decay: 0.4, sustain: 0.7, release: 1.6 },
    volume: -30,
  }).connect(reverb)
  const bass = new T.MonoSynth({
    oscillator: { type: 'triangle' },
    envelope: { attack: 0.01, decay: 0.3, sustain: 0.4, release: 0.4 },
    filterEnvelope: { attack: 0.005, decay: 0.15, sustain: 0.3, baseFrequency: 180, octaves: 2 },
    volume: -14,
  }).connect(bus)
  const kick = new T.MembraneSynth({
    pitchDecay: 0.03,
    octaves: 4,
    envelope: { attack: 0.002, decay: 0.25, sustain: 0 },
    volume: -22,
  }).connect(bus)
  const brush = new T.NoiseSynth({
    noise: { type: 'pink' },
    envelope: { attack: 0.004, decay: 0.07, sustain: 0 },
    volume: -34,
  }).connect(reverb)

  const transport = T.getTransport()
  transport.bpm.value = 92
  const eighth = T.Time('8n').toSeconds()
  const bar = T.Time('1m').toSeconds()
  const up = (n: string) => T.Frequency(n).transpose(12).toNote()

  // 16-bar loop: bars 1–8 arpeggios only, bars 9–16 add the melody.
  let barCount = 0
  new T.Loop((time) => {
    const pos = barCount++ % 16
    const i = pos % 8
    const chord = CHORDS[i]
    const notes = [...chord, up(chord[0])]
    ARP.forEach((k, step) => pluck.triggerAttackRelease(notes[k], '8n', time + step * eighth, step % 2 ? 0.55 : 0.75))
    pad.triggerAttackRelease(chord, bar * 0.95, time, 0.5)
    bass.triggerAttackRelease(ROOTS[i], '4n.', time)
    bass.triggerAttackRelease(FIFTHS[i], '8n', time + 3 * eighth, 0.7)
    bass.triggerAttackRelease(ROOTS[i], '4n', time + 4 * eighth, 0.8)
    kick.triggerAttackRelease('C1', '8n', time)
    kick.triggerAttackRelease('C1', '8n', time + 4 * eighth, 0.7)
    for (let s = 1; s < 8; s += 2) brush.triggerAttackRelease('16n', time + s * eighth, s === 3 || s === 7 ? 0.9 : 0.5)
    if (pos >= 8) {
      for (const [at, note, len] of MELODY[i]) {
        mallet.triggerAttackRelease(note, len * eighth * 0.9, time + at * eighth, 0.8)
      }
    }
  }, '1m').start(0)

  transport.start('+0.1')
}
