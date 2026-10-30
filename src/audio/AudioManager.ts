/**
 * Plays sound effects and music and keeps the sound log
 * (Requirements 25.1, 25.10 to 25.12, 26.2, 26.3, 26.5, 27.4, 27.5, 27.10,
 * 27.11, 39.15).
 *
 * Sound log. `play` and `startChug` append the event name first,
 * synchronously and always, whether or not audio is muted or unlocked. The log
 * keeps the newest `SOUND_LOG_LIMIT` entries. `getLog()` returns a copy.
 *
 * Unlock. `install(target)` adds one-time capture-phase `pointerdown` and
 * `keydown` listeners. The first event resumes Howler's audio context, starts
 * the music and removes the listeners. Before that, nothing makes a sound, and
 * nothing triggered before the unlock is played afterwards. A chug started
 * before the unlock also stays silent until the train starts it again.
 *
 * Routing (all inside Howler's Web Audio graph, so one unlock covers it all):
 *
 *     synth one-shots → effects gain ─┐
 *     chug loop (level = chug gain) ──┼→ Howler.masterGain → speakers
 *     file one-shots (Howl volume) ───┤
 *     music (see music.ts) ───────────┘
 *
 * Mute and volumes. Gains come from `computeGains` (gains.ts). Muting sets the
 * gains to 0 and keeps the stored volumes, so unmuting restores them.
 * `apply()` updates the effects gain, the running chug, every file Howl and
 * the music at once. While muted, one-shots are skipped, but a chug that
 * starts keeps running at gain 0, so unmuting while the train moves makes the
 * chug audible again (Requirement 27.10).
 *
 * File sounds. Each `{ kind: 'file' }` entry in the sound bank is preloaded as
 * a decoded Web Audio buffer (`html5: false`) when `install()` runs. If the
 * file fails to load, one warning is logged and the event uses its synth
 * fallback from then on. A file that has not finished loading also uses the
 * fallback, so a sound never waits and plays late. A file's Howl volume is
 * the effects gain times the entry's mix trim (`gain` in the sound bank).
 *
 * Node safety. The module reads no browser globals at import time. Howler, the
 * Howl factory, the music controller and the event target are injectable, so
 * tests run without real audio.
 */
import { Howl, Howler } from 'howler';
import { DEFAULT_AUDIO_SETTINGS } from '../domain/saveFormat';
import type { AudioSettings, SoundEvent } from '../domain/types';
import { computeGains } from './gains';
import { MUSIC_FILES, createMusic, type MusicController } from './music';
import { SOUND_BANK, fileGainOf, resolveSynth } from './soundBank';
import { startChugLoop, type ChugHandle } from './synth';
import type { AudioPort, OneShotEvent } from './types';

export type { AudioPort, OneShotEvent } from './types';

/** Most entries the sound log keeps; the oldest are dropped first. */
export const SOUND_LOG_LIMIT = 10_000;

/** Time constant for effects gain changes (well under 100 ms). */
const GAIN_SMOOTH = 0.01;

/** The parts of Howler the manager uses. */
export interface HowlerLike {
  /** Howler's audio context, created on demand; null when Web Audio is unavailable. */
  getContext(): AudioContext | null;
  /** `Howler.masterGain`; null when Web Audio is unavailable. */
  getMasterGain(): AudioNode | null;
}

/** The parts of a `Howl` the manager uses. */
export interface HowlLike {
  play(): unknown;
  volume(volume: number): unknown;
  state(): 'unloaded' | 'loading' | 'loaded';
  unload(): void;
}

export interface HowlFactoryOptions {
  src: string[];
  html5: false;
  preload: true;
  volume: number;
  onloaderror: (id: number, error: unknown) => void;
}

export interface AudioManagerOptions {
  howler?: HowlerLike;
  createHowl?: (options: HowlFactoryOptions) => HowlLike;
  /** Music controller; defaults to `createMusic` with `MUSIC_FILES` on Howler's graph. */
  music?: MusicController;
  /** Initial settings; defaults to unmuted, music 0.5, effects 0.8. */
  settings?: AudioSettings;
  warn?: (message: string, data?: unknown) => void;
}

/** Event names the unlock listens for (Requirement 27.4). */
export const UNLOCK_EVENTS = ['pointerdown', 'keydown'] as const;

export interface AudioManager extends AudioPort {
  /**
   * Adds the one-time unlock listeners to `target` (the window by default) and
   * preloads file sounds. Returns a function that removes the listeners.
   * Calling it again while installed returns the same remover.
   */
  install(target?: EventTarget): () => void;
  /** Unlocks audio now. Called by the first unlock event. Idempotent. */
  unlock(): void;
  readonly unlocked: boolean;
  readonly settings: AudioSettings;
}

/** Howler's global, read lazily so nothing runs at import time. */
const defaultHowler: HowlerLike = {
  getContext() {
    // Howler creates its context on first use; `volume()` triggers that setup.
    if (!Howler.ctx && Howler.usingWebAudio) Howler.volume();
    return Howler.ctx ?? null;
  },
  getMasterGain() {
    return Howler.masterGain ?? null;
  },
};

const defaultCreateHowl = (options: HowlFactoryOptions): HowlLike => new Howl(options);

function sanitise(s: AudioSettings): AudioSettings {
  const vol = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);
  return { muted: s.muted === true, musicVolume: vol(s.musicVolume), sfxVolume: vol(s.sfxVolume) };
}

interface FileSound {
  /** Null only while the Howl is being constructed. */
  howl: HowlLike | null;
  failed: boolean;
  /** Mix trim from the sound bank, multiplied with the effects gain. */
  trim: number;
}

export function createAudioManager(opts: AudioManagerOptions = {}): AudioManager {
  const howler = opts.howler ?? defaultHowler;
  const createHowl = opts.createHowl ?? defaultCreateHowl;
  const warn = opts.warn ?? ((message: string, data?: unknown) => console.warn(message, data));

  let settings = sanitise(opts.settings ?? DEFAULT_AUDIO_SETTINGS);
  let unlocked = false;
  const log: SoundEvent[] = [];

  const music: MusicController =
    opts.music ??
    createMusic({
      fileSrc: MUSIC_FILES,
      getContext: () => howler.getContext(),
      destination: () => howler.getMasterGain(),
      warn,
      volume: computeGains(settings, 0).music,
    });

  let effectsBus: GainNode | null = null;
  const files = new Map<OneShotEvent, FileSound>();
  let preloaded = false;

  let chug: ChugHandle | null = null;
  let chugSpeed = 0;

  let removeListeners: (() => void) | null = null;

  function append(event: SoundEvent): void {
    log.push(event);
    if (log.length > SOUND_LOG_LIMIT) log.splice(0, log.length - SOUND_LOG_LIMIT);
  }

  /** The effects gain node, created on first use after the unlock. */
  function getEffectsBus(ctx: AudioContext): GainNode | null {
    if (effectsBus && effectsBus.context === ctx) return effectsBus;
    const master = howler.getMasterGain();
    if (!master) return null;
    const bus = ctx.createGain();
    bus.gain.value = computeGains(settings, 0).effects;
    bus.connect(master);
    effectsBus = bus;
    return bus;
  }

  function preloadFiles(): void {
    if (preloaded) return;
    preloaded = true;
    for (const [event, source] of Object.entries(SOUND_BANK) as Array<
      [SoundEvent, (typeof SOUND_BANK)[SoundEvent]]
    >) {
      if (source.kind !== 'file' || event === 'chug') continue;
      const entry: FileSound = { howl: null, failed: false, trim: fileGainOf(source) };
      try {
        entry.howl = createHowl({
          src: [...source.src],
          html5: false,
          preload: true,
          volume: computeGains(settings, 0).effects * entry.trim,
          onloaderror: (_id, error) => {
            if (entry.failed) return;
            entry.failed = true;
            warn(`Sound "${event}" could not be loaded; using a synthesised sound instead.`, error);
            try {
              entry.howl?.unload();
            } catch {
              // Ignore: the Howl is being thrown away.
            }
          },
        });
        files.set(event, entry);
      } catch (error) {
        warn(`Sound "${event}" could not be loaded; using a synthesised sound instead.`, error);
      }
    }
  }

  function playSynth(event: OneShotEvent, ctx: AudioContext): void {
    const recipe = resolveSynth(event);
    if (recipe.kind !== 'oneShot') return;
    const bus = getEffectsBus(ctx);
    if (!bus) return;
    recipe.play(ctx, bus);
  }

  function playAudible(event: OneShotEvent): void {
    const howl = files.get(event)?.failed === false ? files.get(event)?.howl : null;
    if (howl && howl.state() === 'loaded') {
      howl.play();
      return;
    }
    const ctx = howler.getContext();
    if (ctx) playSynth(event, ctx);
  }

  function startChugAudible(): void {
    const ctx = howler.getContext();
    const master = howler.getMasterGain();
    if (!ctx || !master) return;
    chug = startChugLoop(ctx, master, {
      speed: chugSpeed,
      level: computeGains(settings, chugSpeed).chug,
    });
  }

  function releaseChug(): void {
    const handle = chug;
    chug = null;
    if (!handle) return;
    try {
      handle.stop();
    } catch (error) {
      warn('The chug sound could not be stopped cleanly.', error);
    }
  }

  function unlock(): void {
    if (unlocked) return;
    unlocked = true;
    removeListeners?.();
    try {
      const ctx = howler.getContext();
      if (ctx && ctx.state === 'suspended') {
        ctx.resume().catch((error: unknown) => warn('Audio could not be resumed.', error));
      }
      music.setVolume(computeGains(settings, 0).music);
      void music.start();
    } catch (error) {
      warn('Audio could not be unlocked.', error);
    }
  }

  return {
    play(event) {
      append(event);
      if (!unlocked || settings.muted) return;
      try {
        playAudible(event);
      } catch (error) {
        warn(`Sound "${event}" could not be played.`, error);
      }
    },

    startChug(speed = 0) {
      append('chug');
      releaseChug();
      chugSpeed = Number.isFinite(speed) ? Math.max(0, speed) : 0;
      if (!unlocked) return;
      try {
        startChugAudible();
      } catch (error) {
        chug = null;
        warn('The chug sound could not be started.', error);
      }
    },

    setChugLevel(speed) {
      chugSpeed = Number.isFinite(speed) ? Math.max(0, speed) : 0;
      if (!chug) return;
      try {
        chug.setRate(chugSpeed);
        chug.setLevel(computeGains(settings, chugSpeed).chug);
      } catch (error) {
        warn('The chug level could not be updated.', error);
      }
    },

    stopChug() {
      chugSpeed = 0;
      releaseChug();
    },

    apply(next) {
      settings = sanitise(next);
      const gains = computeGains(settings, chugSpeed);
      try {
        if (effectsBus) {
          const param = effectsBus.gain;
          try {
            param.setTargetAtTime(gains.effects, effectsBus.context.currentTime, GAIN_SMOOTH);
          } catch {
            param.value = gains.effects;
          }
        }
        chug?.setLevel(gains.chug);
        for (const file of files.values()) {
          if (!file.failed) file.howl?.volume(gains.effects * file.trim);
        }
        music.setVolume(gains.music);
      } catch (error) {
        warn('The audio settings could not be applied to playing sounds.', error);
      }
    },

    getLog() {
      return log.slice();
    },

    install(target) {
      if (removeListeners) return removeListeners;
      const t = target ?? (typeof window !== 'undefined' ? window : null);
      preloadFiles();
      if (!t) return () => {};
      const handler = () => unlock();
      for (const name of UNLOCK_EVENTS) t.addEventListener(name, handler, { capture: true });
      const remove = () => {
        for (const name of UNLOCK_EVENTS) t.removeEventListener(name, handler, { capture: true });
        if (removeListeners === remove) removeListeners = null;
      };
      removeListeners = remove;
      return remove;
    },

    unlock,

    get unlocked() {
      return unlocked;
    },

    get settings() {
      return { ...settings };
    },
  };
}
