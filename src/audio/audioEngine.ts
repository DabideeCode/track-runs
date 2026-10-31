import { Howl, Howler } from 'howler';
import type { AudioSettings, SoundEvent } from '@/domain/types';
import { useGameStore } from '@/store/gameStore';
import { setPlayback } from './soundLog';
import { createChugLoop, playSynth } from './synthSfx';

const base = `${import.meta.env.BASE_URL}assets/audio`;

/** Files are trimmed of leading silence, so each sound starts at once. */
const EFFECT_GAINS: Partial<Record<SoundEvent, number>> = {
  pickup: 0.45,
  place: 0.8,
  move: 0.55,
  rotate: 0.6,
  delete: 0.6,
  snap: 0.7,
  invalid: 0.5,
  bump: 0.8,
  ui: 0.16,
};

const MUSIC_GAIN = 0.7;
const CHUG_GAIN = 0.32;
const CHUG_FADE = 0.08;

const howls = new Map<SoundEvent, Howl>();
const failed = new Set<SoundEvent>();
let music: Howl | null = null;
let started = false;
let chugSource: AudioBufferSourceNode | null = null;
let chugGain: GainNode | null = null;

const settings = (): AudioSettings => useGameStore.getState().audio;

function audioContext(): AudioContext | null {
  return Howler.ctx ?? null;
}

function effectVolume(gain: number): number {
  return settings().sfxVolume * gain;
}

function loadEffects(): void {
  for (const event of Object.keys(EFFECT_GAINS) as SoundEvent[]) {
    howls.set(event, new Howl({ src: [`${base}/sfx/${event}.mp3`], onloaderror: () => failed.add(event) }));
  }
}

function startMusic(): void {
  music = new Howl({
    src: [`${base}/music/cozy-puzzle-title.mp3`],
    html5: true,
    loop: true,
    volume: settings().musicVolume * MUSIC_GAIN,
    onplayerror: () => music?.once('unlock', () => music?.play()),
    onloaderror: (_, error) => console.warn('Music could not be loaded:', error),
  });
  music.play();
}

/** Audio starts on the first gesture. Nothing reaches Howler earlier, or it would queue and burst. */
function start(): void {
  if (started) return;
  started = true;
  Howler.mute(settings().muted);
  loadEffects();
  startMusic();
}

function play(event: SoundEvent): void {
  if (!started || settings().muted || event === 'chug') return;
  const gain = EFFECT_GAINS[event];
  const howl = howls.get(event);
  if (gain !== undefined && howl && !failed.has(event)) {
    howl.volume(effectVolume(gain), howl.play());
    return;
  }
  const context = audioContext();
  if (context) playSynth(context, Howler.masterGain, event, settings().sfxVolume);
}

function setChugLevel(level: number): void {
  const context = audioContext();
  if (!started || !context) return;
  if (level > 0 && !chugSource) {
    chugGain = context.createGain();
    chugGain.gain.value = 0;
    chugGain.connect(Howler.masterGain);
    chugSource = context.createBufferSource();
    chugSource.buffer = createChugLoop(context);
    chugSource.loop = true;
    chugSource.connect(chugGain);
    chugSource.start();
  }
  if (!chugSource || !chugGain) return;
  chugGain.gain.setTargetAtTime(level * CHUG_GAIN * settings().sfxVolume, context.currentTime, CHUG_FADE);
  chugSource.playbackRate.setTargetAtTime(0.7 + level * 0.6, context.currentTime, CHUG_FADE);
  if (level === 0) {
    const source = chugSource;
    source.stop(context.currentTime + 0.4);
    chugSource = null;
    chugGain = null;
  }
}

function applySettings(next: AudioSettings, previous: AudioSettings): void {
  if (next === previous || !started) return;
  Howler.mute(next.muted);
  music?.volume(next.musicVolume * MUSIC_GAIN);
}

/** Fetches effects early into the HTTP cache, so the first sound is not held up by the network. */
function prefetchEffects(): void {
  for (const event of Object.keys(EFFECT_GAINS)) void fetch(`${base}/sfx/${event}.mp3`).catch(() => {});
}

export function initAudio(): void {
  setPlayback({ play, setChugLevel });
  useGameStore.subscribe((state, previous) => applySettings(state.audio, previous.audio));
  window.addEventListener('pointerdown', start, { capture: true, once: true });
  window.addEventListener('keydown', start, { capture: true, once: true });
  prefetchEffects();
}
