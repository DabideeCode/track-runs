import type { SoundEvent } from './audioEngine';

type Voice = (context: AudioContext, output: AudioNode, time: number) => void;

function noiseBuffer(context: AudioContext, seconds: number) {
  const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * seconds), context.sampleRate);
  const samples = buffer.getChannelData(0);
  for (let i = 0; i < samples.length; i += 1) samples[i] = Math.random() * 2 - 1;
  return buffer;
}

function thump(context: AudioContext, output: AudioNode, time: number, from: number, to: number, seconds: number, level: number) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(from, time);
  oscillator.frequency.exponentialRampToValueAtTime(to, time + seconds);
  gain.gain.setValueAtTime(level, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + seconds);
  oscillator.connect(gain).connect(output);
  oscillator.start(time);
  oscillator.stop(time + seconds + 0.01);
}

function click(context: AudioContext, output: AudioNode, time: number, centre: number, seconds: number, level: number) {
  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const gain = context.createGain();
  source.buffer = noiseBuffer(context, seconds);
  filter.type = 'bandpass';
  filter.frequency.value = centre;
  filter.Q.value = 2.5;
  gain.gain.setValueAtTime(level, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + seconds);
  source.connect(filter).connect(gain).connect(output);
  source.start(time);
}

const voices: Partial<Record<SoundEvent, Voice>> = {
  pickup: (c, o, t) => {
    thump(c, o, t, 320, 520, 0.09, 0.35);
    click(c, o, t, 1800, 0.04, 0.2);
  },
  place: (c, o, t) => {
    thump(c, o, t, 240, 110, 0.13, 0.8);
    click(c, o, t, 1300, 0.05, 0.5);
  },
  move: (c, o, t) => {
    thump(c, o, t, 200, 120, 0.1, 0.55);
    click(c, o, t, 1100, 0.04, 0.3);
  },
  rotate: (c, o, t) => {
    click(c, o, t, 2200, 0.035, 0.45);
    click(c, o, t + 0.05, 1700, 0.035, 0.35);
  },
  delete: (c, o, t) => {
    thump(c, o, t, 420, 70, 0.26, 0.5);
    click(c, o, t + 0.02, 600, 0.14, 0.2);
  },
  snap: (c, o, t) => {
    click(c, o, t, 2800, 0.03, 0.55);
    thump(c, o, t + 0.02, 760, 500, 0.07, 0.35);
  },
  invalid: (c, o, t) => {
    thump(c, o, t, 150, 110, 0.12, 0.5);
    thump(c, o, t + 0.13, 130, 90, 0.14, 0.5);
  },
  ui: (c, o, t) => {
    click(c, o, t, 3200, 0.02, 0.22);
  },
  whistle: (c, o, t) => {
    for (const frequency of [880, 1108]) {
      const oscillator = c.createOscillator();
      const gain = c.createGain();
      oscillator.type = 'triangle';
      oscillator.frequency.setValueAtTime(frequency * 0.97, t);
      oscillator.frequency.linearRampToValueAtTime(frequency, t + 0.08);
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.18, t + 0.06);
      gain.gain.setValueAtTime(0.18, t + 0.55);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
      oscillator.connect(gain).connect(o);
      oscillator.start(t);
      oscillator.stop(t + 0.82);
    }
  },
  bump: (c, o, t) => {
    thump(c, o, t, 130, 60, 0.18, 0.7);
    click(c, o, t, 500, 0.06, 0.25);
  },
};

export function playSynth(context: AudioContext, output: AudioNode, event: SoundEvent) {
  voices[event]?.(context, output, context.currentTime);
}

// Two soft wooden chuffs that repeat for as long as the train moves.
export function createChugBuffer(context: AudioContext) {
  const seconds = 0.42;
  const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * seconds), context.sampleRate);
  const samples = buffer.getChannelData(0);
  let smoothed = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const time = i / context.sampleRate;
    const phase = (time % (seconds / 2)) / (seconds / 2);
    const envelope = Math.exp(-phase * 7);
    smoothed += ((Math.random() * 2 - 1) - smoothed) * 0.12;
    samples[i] = smoothed * envelope * 1.6 + Math.sin(2 * Math.PI * 90 * time) * envelope * 0.25;
  }
  return buffer;
}
