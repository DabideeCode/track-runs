import type { SoundEvent } from '@/domain/types';

/** Section 8 fallback: sounds built with Web Audio, for the whistle, the chug and any file that fails. */

interface Knock {
  frequency: number;
  decay: number;
  noise: number;
}

const KNOCKS: Partial<Record<SoundEvent, Knock>> = {
  pickup: { frequency: 620, decay: 0.05, noise: 0.25 },
  place: { frequency: 300, decay: 0.09, noise: 0.3 },
  move: { frequency: 420, decay: 0.08, noise: 0.3 },
  rotate: { frequency: 780, decay: 0.05, noise: 0.25 },
  snap: { frequency: 1250, decay: 0.04, noise: 0.35 },
  invalid: { frequency: 170, decay: 0.16, noise: 0.15 },
  ui: { frequency: 1000, decay: 0.025, noise: 0.2 },
  bump: { frequency: 140, decay: 0.14, noise: 0.25 },
};

function noiseBuffer(context: AudioContext, seconds: number): AudioBuffer {
  const buffer = context.createBuffer(1, Math.ceil(seconds * context.sampleRate), context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let index = 0; index < data.length; index++) data[index] = Math.random() * 2 - 1;
  return buffer;
}

function playKnock(context: AudioContext, output: AudioNode, knock: Knock, volume: number): void {
  const now = context.currentTime;
  const end = now + knock.decay * 4;

  const tone = context.createOscillator();
  tone.type = 'triangle';
  tone.frequency.setValueAtTime(knock.frequency * 1.4, now);
  tone.frequency.exponentialRampToValueAtTime(knock.frequency, now + 0.02);
  const toneGain = context.createGain();
  toneGain.gain.setValueAtTime(volume, now);
  toneGain.gain.exponentialRampToValueAtTime(0.0001, end);
  tone.connect(toneGain).connect(output);
  tone.start(now);
  tone.stop(end);

  const click = context.createBufferSource();
  click.buffer = noiseBuffer(context, 0.03);
  const clickFilter = context.createBiquadFilter();
  clickFilter.type = 'bandpass';
  clickFilter.frequency.value = knock.frequency * 3;
  const clickGain = context.createGain();
  clickGain.gain.setValueAtTime(volume * knock.noise, now);
  clickGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.03);
  click.connect(clickFilter).connect(clickGain).connect(output);
  click.start(now);
}

/** A crackling splinter, so delete is clearly unlike the low knock of place. */
function playCrack(context: AudioContext, output: AudioNode, volume: number): void {
  const now = context.currentTime;
  const source = context.createBufferSource();
  source.buffer = noiseBuffer(context, 0.16);
  const filter = context.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = 2600;
  const gain = context.createGain();
  gain.gain.setValueAtTime(volume * 0.7, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
  source.connect(filter).connect(gain).connect(output);
  source.start(now);
}

/** Two soft reed-like tones with a little vibrato, like a wooden toy whistle. */
function playWhistle(context: AudioContext, output: AudioNode, volume: number): void {
  const now = context.currentTime;
  const end = now + 0.75;
  const gain = context.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(volume * 0.28, now + 0.05);
  gain.gain.setValueAtTime(volume * 0.28, end - 0.2);
  gain.gain.exponentialRampToValueAtTime(0.0001, end);
  gain.connect(output);

  const vibrato = context.createOscillator();
  vibrato.frequency.value = 6;
  const vibratoDepth = context.createGain();
  vibratoDepth.gain.value = 7;
  vibrato.connect(vibratoDepth);

  for (const frequency of [784, 988]) {
    const tone = context.createOscillator();
    tone.type = 'triangle';
    tone.frequency.value = frequency;
    vibratoDepth.connect(tone.frequency);
    tone.connect(gain);
    tone.start(now);
    tone.stop(end);
  }
  vibrato.start(now);
  vibrato.stop(end);
}

export function playSynth(context: AudioContext, output: AudioNode, event: SoundEvent, volume: number): void {
  if (event === 'whistle') playWhistle(context, output, volume);
  else if (event === 'delete') playCrack(context, output, volume);
  else {
    const knock = KNOCKS[event];
    if (knock) playKnock(context, output, knock, volume * 0.6);
  }
}

/** One bar of four soft chuffs. It loops, and the engine sets its rate and level from train speed. */
export function createChugLoop(context: AudioContext): AudioBuffer {
  const length = Math.ceil(0.72 * context.sampleRate);
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  let smoothed = 0;
  for (let index = 0; index < length; index++) {
    const time = index / context.sampleRate;
    const beat = (time / 0.18) % 1;
    const accent = Math.floor(time / 0.18) % 4 === 0 ? 1 : 0.65;
    smoothed += (Math.random() * 2 - 1 - smoothed) * 0.16;
    data[index] = smoothed * accent * Math.exp(-beat * 5) * 0.9;
  }
  return buffer;
}
