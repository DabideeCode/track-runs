/**
 * Background music (Requirements 27.1 to 27.3, 34.12, 1.7).
 *
 * Two sources, chosen when `start()` runs:
 *
 * - **File.** When `fileSrc` lists a sourced CC0 or CC-BY track (see
 *   `MUSIC_FILES`), it loops through a `Howl` (`loop: true`, `html5: false`,
 *   so it plays through Howler's Web Audio graph and `Howler.masterGain`).
 *   Volume is the Howl's own volume. If the file fails to load, the generated
 *   music below is used instead.
 * - **Tone.** Otherwise `tone` is loaded with a dynamic `import('tone')` (it is
 *   never imported statically, so it stays out of the main bundle and never
 *   runs while a music file is in use). Tone is pointed at Howler's audio
 *   context, so one unlock covers both, and its output goes into a dedicated
 *   music gain node chained to `destination()` (Howler's master gain), so mute
 *   and the music volume both apply.
 *
 * The generated loop is a gentle 92 BPM piece in C major on the progression
 * I–vi–IV–V (C, Am, F, G), 8 bars long: a plucked marimba-like FM voice
 * playing an arpeggiated melody, a soft low-pass pad, a quiet sine bass and a
 * brush-like pink-noise beat through a band-pass filter. All levels are low
 * so the mix never clips.
 *
 * Failure handling: a failed `import('tone')`, a missing Web Audio context or
 * an exception during Tone setup logs exactly one warning (never an error),
 * leaves the music silent with `source === 'none'`, and never throws.
 *
 * The module touches no browser globals at import time, so it can be imported
 * in Node tests.
 */
import { Howl } from 'howler';

/** Type of the `tone` module, used in type positions only (erased at build time). */
type ToneModule = typeof import('tone');

/**
 * Music files under `public/assets/audio/music/`, preferred format first.
 * `null` means no file is used, so the `tone` fallback plays. No CC0 or CC-BY
 * track could be confirmed to fit the required style, so the generated music
 * is used (D-61, Requirement 34.12). Set this to the file's URL list to switch.
 */
export const MUSIC_FILES: readonly string[] | null = null;

export type MusicSource = 'file' | 'tone' | 'none';

export interface MusicOptions {
  /** Howl `src` list for a music file, or `null` / empty to use generated music. */
  fileSrc: readonly string[] | null;
  /** Howler's Web Audio context (`Howler.ctx`), or null when Web Audio is unavailable. */
  getContext: () => AudioContext | null;
  /** Node the music gain connects to (`Howler.masterGain`), or null when unavailable. */
  destination: () => AudioNode | null;
  /** Warning logger; defaults to `console.warn`. */
  warn?: (message: string, data?: unknown) => void;
  /** Loader for `tone`; defaults to `() => import('tone')`. */
  loadTone?: () => Promise<ToneModule>;
  /** Initial music volume, 0 to 1. Defaults to 0.5. */
  volume?: number;
}

export interface MusicController {
  /**
   * Starts the music. Idempotent: while started (or starting), further calls
   * return the same promise. Never rejects.
   */
  start(): Promise<void>;
  /** Sets the music volume (0 to 1). Applies at once to playing music and to later starts. */
  setVolume(volume: number): void;
  /** Stops the music and releases its nodes. `start()` may be called again afterwards. */
  stop(): void;
  /** The source currently playing: `'none'` before start, after stop or after a failure. */
  readonly source: MusicSource;
}

// ---------------------------------------------------------------------------
// Song data (pure, testable without tone)
// ---------------------------------------------------------------------------

export const MUSIC_BPM = 92;
/** Steps are eighth notes; 8 per 4/4 bar. */
export const STEPS_PER_BAR = 8;
export const SONG_BARS = 8;
export const SONG_STEPS = STEPS_PER_BAR * SONG_BARS;

const BEAT_SECONDS = 60 / MUSIC_BPM;
const BAR_SECONDS = 4 * BEAT_SECONDS;

export interface Chord {
  /** Roman numeral in C major. */
  degree: 'I' | 'vi' | 'IV' | 'V';
  name: string;
  pad: readonly string[];
  bass: string;
}

/** I–vi–IV–V in C major, one chord per bar, played twice per loop. */
export const PROGRESSION: readonly Chord[] = [
  { degree: 'I', name: 'C', pad: ['C4', 'E4', 'G4'], bass: 'C2' },
  { degree: 'vi', name: 'Am', pad: ['A3', 'C4', 'E4'], bass: 'A1' },
  { degree: 'IV', name: 'F', pad: ['F3', 'A3', 'C4'], bass: 'F1' },
  { degree: 'V', name: 'G', pad: ['G3', 'B3', 'D4'], bass: 'G1' },
];

type Line = readonly (string | null)[];

/** Marimba melody, one line of 8 eighth notes per bar (null is a rest). */
const MELODY: readonly Line[] = [
  // First pass: arpeggios.
  ['E5', null, 'G4', 'C5', null, 'G4', 'D5', null],
  ['C5', null, 'E4', 'A4', null, 'E4', 'B4', null],
  ['A4', null, 'C5', 'F5', null, 'C5', 'E5', null],
  ['D5', null, 'B4', 'G4', null, 'B4', 'D5', null],
  // Second pass: a little higher and more melodic.
  ['G5', null, 'E5', 'C5', null, 'D5', 'E5', null],
  ['E5', null, 'C5', 'A4', null, 'B4', 'C5', null],
  ['F5', null, 'E5', 'C5', null, 'A4', 'C5', null],
  ['D5', null, 'B4', 'G4', null, 'A4', 'B4', null],
];

/** Brush velocity per eighth note: light on the beat, accent on 2 and 4, ghost notes between. */
const BRUSH: readonly number[] = [0.22, 0.1, 0.5, 0.12, 0.22, 0.1, 0.5, 0.16];

export interface SongStep {
  chord: Chord;
  /** Pad chord to start on this step (bar start only). */
  pad: readonly string[] | null;
  /** Bass note on beats 1 and 3. */
  bass: string | null;
  marimba: { note: string; velocity: number } | null;
  /** Brush hit velocity, 0 for none. */
  brush: number;
}

/** What plays on a given eighth-note step of the loop (wraps every `SONG_STEPS`). */
export function songStep(step: number): SongStep {
  const s = ((Math.floor(step) % SONG_STEPS) + SONG_STEPS) % SONG_STEPS;
  const bar = Math.floor(s / STEPS_PER_BAR);
  const inBar = s % STEPS_PER_BAR;
  const chord = PROGRESSION[bar % PROGRESSION.length]!;
  const note = MELODY[bar]![inBar] ?? null;
  return {
    chord,
    pad: inBar === 0 ? chord.pad : null,
    bass: inBar === 0 || inBar === 4 ? chord.bass : null,
    // Slight accent on the first note of each beat pair keeps the line lively.
    marimba: note ? { note, velocity: inBar % 2 === 0 ? 0.55 : 0.42 } : null,
    brush: BRUSH[inBar]!,
  };
}

// ---------------------------------------------------------------------------
// Tone song
// ---------------------------------------------------------------------------

interface Song {
  dispose(): void;
}

/** Points Tone at `ctx` unless it already uses it. Closes Tone's own default context. */
function useToneContext(Tone: ToneModule, ctx: AudioContext): void {
  if (Tone.getContext().rawContext === ctx) return;
  // disposeOld closes the extra AudioContext Tone created on import. It never
  // closes `ctx`, because the old context wraps a different raw context.
  Tone.setContext(new Tone.Context(ctx), true);
}

/** Builds the voices and the step loop, connects them to `output` and starts the transport. */
function buildSong(Tone: ToneModule, output: AudioNode): Song {
  const transport = Tone.getTransport();
  const disposables: Array<{ dispose(): unknown }> = [];
  const keep = <T extends { dispose(): unknown }>(node: T): T => {
    disposables.push(node);
    return node;
  };

  try {
    const bus = keep(new Tone.Gain(0.8));
    bus.connect(output);

    // Plucked marimba-like voice: FM with a 4:1 ratio and a fast decay, no sustain.
    const marimba = keep(
      new Tone.PolySynth(Tone.FMSynth, {
        harmonicity: 4,
        modulationIndex: 2.2,
        oscillator: { type: 'sine' },
        envelope: { attack: 0.002, decay: 0.55, sustain: 0, release: 0.35 },
        modulation: { type: 'sine' },
        modulationEnvelope: { attack: 0.002, decay: 0.12, sustain: 0, release: 0.1 },
      }),
    );
    marimba.volume.value = -13;
    marimba.connect(bus);

    // Soft pad: triangle voices with a slow attack through a gentle low-pass.
    const padFilter = keep(new Tone.Filter({ type: 'lowpass', frequency: 1100, rolloff: -12 }));
    padFilter.connect(bus);
    const pad = keep(
      new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'triangle' },
        envelope: { attack: 1.1, decay: 0.6, sustain: 0.55, release: 1.8 },
      }),
    );
    pad.volume.value = -25;
    pad.connect(padFilter);

    // Quiet round sine bass on beats 1 and 3.
    const bass = keep(
      new Tone.Synth({
        oscillator: { type: 'sine' },
        envelope: { attack: 0.01, decay: 0.4, sustain: 0.3, release: 0.4 },
      }),
    );
    bass.volume.value = -17;
    bass.connect(bus);

    // Brush beat: short pink-noise swishes through a band-pass.
    const brushFilter = keep(new Tone.Filter({ type: 'bandpass', frequency: 4200, Q: 0.8 }));
    brushFilter.connect(bus);
    const brush = keep(
      new Tone.NoiseSynth({
        noise: { type: 'pink' },
        envelope: { attack: 0.004, decay: 0.11, sustain: 0, release: 0.05 },
      }),
    );
    brush.volume.value = -30;
    brush.connect(brushFilter);

    let step = 0;
    const loop = keep(
      new Tone.Loop((time: number) => {
        const ev = songStep(step);
        step = (step + 1) % SONG_STEPS;
        if (ev.pad) pad.triggerAttackRelease([...ev.pad], BAR_SECONDS * 0.95, time, 0.35);
        if (ev.bass) bass.triggerAttackRelease(ev.bass, BEAT_SECONDS * 1.5, time, 0.6);
        if (ev.marimba) {
          marimba.triggerAttackRelease(ev.marimba.note, BEAT_SECONDS * 0.9, time, ev.marimba.velocity);
        }
        if (ev.brush > 0) brush.triggerAttackRelease(0.08, time, ev.brush);
      }, '8n'),
    );

    transport.bpm.value = MUSIC_BPM;
    loop.start(0);
    transport.start('+0.05');

    return {
      dispose() {
        try {
          transport.stop();
          transport.cancel(0);
        } catch {
          // The transport may already be stopped.
        }
        disposeAll(disposables);
      },
    };
  } catch (err) {
    disposeAll(disposables);
    throw err;
  }
}

function disposeAll(nodes: Array<{ dispose(): unknown }>): void {
  for (const node of nodes.splice(0).reverse()) {
    try {
      node.dispose();
    } catch {
      // Ignore: the node is being thrown away anyway.
    }
  }
}

// ---------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------

function clampVolume(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.min(1, Math.max(0, v));
}

/** Smoothing time constant for volume changes (well under the 100 ms limit). */
const VOLUME_SMOOTH = 0.02;

export function createMusic(opts: MusicOptions): MusicController {
  const warn = opts.warn ?? ((message: string, data?: unknown) => console.warn(message, data));
  const loadTone = opts.loadTone ?? (() => import('tone'));

  let volume = clampVolume(opts.volume ?? 0.5);
  let source: MusicSource = 'none';
  let pending: Promise<void> | null = null;
  /** Incremented by every start and stop, so late async work from an old start is dropped. */
  let generation = 0;

  let howl: Howl | null = null;
  let song: Song | null = null;
  let gain: GainNode | null = null;

  const releaseHowl = () => {
    if (!howl) return;
    const h = howl;
    howl = null;
    try {
      h.stop();
      h.unload();
    } catch {
      // Ignore: the Howl is being thrown away.
    }
  };

  const releaseTone = () => {
    song?.dispose();
    song = null;
    if (gain) {
      try {
        gain.disconnect();
      } catch {
        // Already disconnected.
      }
      gain = null;
    }
  };

  async function startTone(gen: number): Promise<void> {
    const ctx = opts.getContext();
    const dest = opts.destination();
    if (!ctx || !dest) {
      source = 'none';
      warn('Music is off: Web Audio is not available.');
      return;
    }

    let Tone: ToneModule;
    try {
      Tone = await loadTone();
    } catch (err) {
      if (gen === generation) {
        source = 'none';
        warn('Music is off: the music generator could not be loaded.', err);
      }
      return;
    }
    if (gen !== generation) return;

    let musicGain: GainNode | null = null;
    try {
      musicGain = ctx.createGain();
      musicGain.gain.value = volume;
      musicGain.connect(dest);
      useToneContext(Tone, ctx);
      song = buildSong(Tone, musicGain);
      gain = musicGain;
      source = 'tone';
    } catch (err) {
      if (musicGain) {
        try {
          musicGain.disconnect();
        } catch {
          // Ignore.
        }
      }
      song = null;
      source = 'none';
      warn('Music is off: the music generator could not start.', err);
    }
  }

  /** Starts the file. Returns false when no file is configured. */
  function startFile(gen: number): boolean {
    const src = opts.fileSrc;
    if (!src || src.length === 0) return false;
    const h = new Howl({
      src: [...src],
      loop: true,
      html5: false,
      preload: true,
      volume,
      onloaderror: () => {
        // Fall back to generated music; this start's promise has already resolved.
        if (gen !== generation || howl !== h) return;
        releaseHowl();
        source = 'none';
        void startTone(gen);
      },
    });
    howl = h;
    source = 'file';
    h.play();
    return true;
  }

  return {
    start() {
      if (pending) return pending;
      const gen = ++generation;
      pending = (async () => {
        try {
          if (startFile(gen)) return;
          await startTone(gen);
        } catch (err) {
          // Defensive: nothing above should throw, but start() must never reject.
          if (gen === generation) {
            releaseHowl();
            releaseTone();
            source = 'none';
            warn('Music is off: the music could not start.', err);
          }
        }
      })();
      return pending;
    },

    setVolume(v) {
      volume = clampVolume(v);
      if (howl) howl.volume(volume);
      if (gain) {
        const param = gain.gain;
        try {
          param.setTargetAtTime(volume, gain.context.currentTime, VOLUME_SMOOTH);
        } catch {
          param.value = volume;
        }
      }
    },

    stop() {
      generation++;
      pending = null;
      releaseHowl();
      releaseTone();
      source = 'none';
    },

    get source() {
      return source;
    },
  };
}
