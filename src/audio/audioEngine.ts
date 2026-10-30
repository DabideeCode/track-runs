import { Howl, Howler } from 'howler';
import {
  readAudioSettings,
  writeAudioSettings,
  type AudioSettings,
} from '@/persistence/audioSettings';
import type { GeneratedMusic } from './musicFallback';
import { createChugBuffer, playSynth } from './synth';

export type SoundEvent =
  | 'pickup'
  | 'place'
  | 'move'
  | 'rotate'
  | 'delete'
  | 'snap'
  | 'invalid'
  | 'ui'
  | 'whistle'
  | 'chug'
  | 'bump';

// Only list files that exist, so a missing asset can never cause a failed request.
const SFX_FILES: Partial<Record<SoundEvent, string>> = {};
const MUSIC_FILE = `${import.meta.env.BASE_URL}assets/audio/music/carefree.mp3`;

const TOP_CHUG_SPEED = 2;
const CHUG_LEVEL = 0.3;

const soundLog: SoundEvent[] = [];
const settings: AudioSettings = readAudioSettings();

const effects = new Map<SoundEvent, Howl>();
let unlocked = false;
let context: AudioContext | null = null;
let effectsOutput: GainNode | null = null;
let chugGain: GainNode | null = null;
let music: Howl | null = null;
let generatedMusic: GeneratedMusic | null = null;

function musicLevel() {
  return settings.muted ? 0 : settings.musicVolume;
}

function effectsLevel() {
  return settings.muted ? 0 : settings.sfxVolume;
}

function applyLevels() {
  if (effectsOutput) effectsOutput.gain.value = effectsLevel();
  for (const sound of effects.values()) sound.volume(effectsLevel());
  music?.volume(musicLevel());
  generatedMusic?.setLevel(musicLevel());
}

function startChugLoop(ctx: AudioContext, output: AudioNode) {
  const source = ctx.createBufferSource();
  chugGain = ctx.createGain();
  chugGain.gain.value = 0;
  source.buffer = createChugBuffer(ctx);
  source.loop = true;
  source.connect(chugGain).connect(output);
  source.start();
}

function startMusic() {
  music = new Howl({
    src: [MUSIC_FILE],
    html5: true,
    loop: true,
    volume: musicLevel(),
    onloaderror: () => void startFallbackMusic(),
  });
  music.play();
}

async function startFallbackMusic() {
  music = null;
  try {
    const { startGeneratedMusic } = await import('./musicFallback');
    generatedMusic = await startGeneratedMusic(musicLevel());
  } catch {
    console.warn('Track: background music could not start.');
  }
}

function unlock() {
  if (unlocked) return;
  unlocked = true;
  try {
    context = new AudioContext();
    effectsOutput = context.createGain();
    effectsOutput.connect(context.destination);
    startChugLoop(context, effectsOutput);
    for (const [event, src] of Object.entries(SFX_FILES)) {
      effects.set(event as SoundEvent, new Howl({ src: [src], volume: effectsLevel() }));
    }
    applyLevels();
    context.resume().catch(() => {});
    startMusic();
  } catch {
    console.warn('Track: audio is not available in this browser.');
  }
}

export function installAudioUnlock() {
  Howler.autoSuspend = false;
  Howler.autoUnlock = false;
  window.addEventListener('pointerdown', unlock, { once: true, capture: true });
  window.addEventListener('keydown', unlock, { once: true, capture: true });
}

export function play(event: SoundEvent) {
  soundLog.push(event);
  if (!unlocked || event === 'chug') return;
  const sound = effects.get(event);
  if (sound?.state() === 'loaded') sound.play();
  else if (context && effectsOutput) playSynth(context, effectsOutput, event);
}

export function getSoundLog(): SoundEvent[] {
  return [...soundLog];
}

export function setChugSpeed(speed: number) {
  if (!chugGain || !context) return;
  const level = Math.min(1, speed / TOP_CHUG_SPEED) * CHUG_LEVEL;
  chugGain.gain.setTargetAtTime(level, context.currentTime, 0.05);
}

export function getAudioSettings(): AudioSettings {
  return { ...settings };
}

export function updateAudioSettings(next: Partial<AudioSettings>) {
  Object.assign(settings, next);
  writeAudioSettings(settings);
  applyLevels();
}
