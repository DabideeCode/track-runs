export interface GeneratedMusic {
  setLevel(level: number): void;
}

// A gentle plucked waltz, used when no music file is available (requirement.md Section 8).
const CHORDS = [
  ['C4', 'E4', 'G4'],
  ['A3', 'C4', 'E4'],
  ['F3', 'A3', 'C4'],
  ['G3', 'B3', 'D4'],
  ['C4', 'E4', 'G4'],
  ['E3', 'G3', 'B3'],
  ['F3', 'A3', 'C4'],
  ['G3', 'B3', 'D4'],
];
const BASS = ['C2', 'A1', 'F2', 'G2', 'C2', 'E2', 'F2', 'G2'];
const MELODY = ['E5', 'G5', 'A5', 'G5', 'E5', 'D5', 'C5', 'D5'];

export async function startGeneratedMusic(level: number): Promise<GeneratedMusic> {
  const Tone = await import('tone');
  await Tone.start();

  const output = new Tone.Volume(0).toDestination();
  const pluck = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'triangle' },
    envelope: { attack: 0.01, decay: 0.5, sustain: 0.1, release: 0.9 },
    volume: -14,
  }).connect(output);
  const bass = new Tone.Synth({
    oscillator: { type: 'sine' },
    envelope: { attack: 0.02, decay: 0.6, sustain: 0.3, release: 0.8 },
    volume: -12,
  }).connect(output);
  const lead = new Tone.Synth({
    oscillator: { type: 'sine' },
    envelope: { attack: 0.03, decay: 0.4, sustain: 0.2, release: 1.2 },
    volume: -17,
  }).connect(output);

  let bar = 0;
  const loop = new Tone.Loop((time) => {
    const index = bar % CHORDS.length;
    const chord = CHORDS[index]!;
    bass.triggerAttackRelease(BASS[index]!, '2n', time);
    chord.forEach((note, step) => {
      pluck.triggerAttackRelease(note, '8n', time + Tone.Time('4n').toSeconds() * step);
    });
    if (index % 2 === 0) {
      lead.triggerAttackRelease(MELODY[index]!, '2n', time + Tone.Time('4n').toSeconds());
    } else {
      lead.triggerAttackRelease(MELODY[index]!, '4n', time + Tone.Time('4n').toSeconds() * 2);
    }
    bar += 1;
  }, '2n.');

  Tone.getTransport().bpm.value = 104;
  Tone.getTransport().timeSignature = [3, 4];
  loop.start(0);
  Tone.getTransport().start();

  const setLevel = (value: number) => {
    output.mute = value <= 0;
    if (value > 0) output.volume.value = Tone.gainToDb(value);
  };
  setLevel(level);
  return { setLevel };
}
