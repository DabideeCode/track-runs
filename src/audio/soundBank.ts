/**
 * Maps every sound event to its source: an audio file (with a synth fallback
 * used when the file fails to load) or a Web Audio synthesis recipe
 * (Requirements 25.8, 25.9, 34.1, 34.5, 34.6, 34.11).
 *
 * Files are CC0 clips from Kenney's "Impact Sounds" and "Interface Sounds"
 * packs, stored under `public/assets/audio/sfx/` and credited in `CREDITS.md`
 * (D-61). Place, rotate and snap are wood impacts; place and delete are
 * different clips. Each file event keeps a synth fallback that is used while
 * the file loads or if it fails to load or decode (for example a browser that
 * cannot decode Ogg Vorbis). Whistle and chug have no suitable CC0 file, so
 * they stay synthesised.
 */
import type { SoundEvent } from '../domain/types';
import {
  LOOP_RECIPES,
  ONE_SHOT_RECIPES,
  isLoopRecipe,
  type LoopRecipe,
  type OneShotRecipe,
  type SynthRecipeName,
} from './synth';

export type SoundSource =
  | { kind: 'synth'; recipe: SynthRecipeName }
  | {
      kind: 'file';
      /** Howl `src` list, preferred format first (for example `.ogg`, then `.mp3`). */
      src: readonly string[];
      /** Recipe used when the file cannot be loaded or decoded. */
      fallback: SynthRecipeName;
      /**
       * Mix trim from 0 to 1, multiplied with the effects gain (default 1).
       * Balances clips that are mastered at different loudness.
       */
      gain?: number;
    };

/** Folder of the sound effect files, relative to the app's base URL. */
export const SFX_DIR = 'assets/audio/sfx/';

/** The app's base URL (`/` by default), read from Vite when available. */
function baseUrl(): string {
  const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL;
  if (typeof base !== 'string' || base === '') return '/';
  return base.endsWith('/') ? base : `${base}/`;
}

/** URL of a sound effect file under `public/assets/audio/sfx/`. */
export function sfxUrl(file: string): string {
  return `${baseUrl()}${SFX_DIR}${file}`;
}

function file(name: string, fallback: SynthRecipeName, gain?: number): SoundSource {
  return gain === undefined
    ? { kind: 'file', src: [sfxUrl(`${name}.ogg`)], fallback }
    : { kind: 'file', src: [sfxUrl(`${name}.ogg`)], fallback, gain };
}

export const SOUND_BANK: Readonly<Record<SoundEvent, SoundSource>> = {
  pickup: file('pickup', 'liftSwish', 0.6),
  place: file('place', 'woodKnock'),
  move: file('move', 'woodSlide', 0.9),
  rotate: file('rotate', 'woodTick'),
  delete: file('delete', 'woodKnockDown'),
  snap: file('snap', 'woodClack'),
  invalid: file('invalid', 'dullThunk', 0.7),
  ui: file('ui-click', 'uiClick', 0.6),
  whistle: { kind: 'synth', recipe: 'whistle' },
  chug: { kind: 'synth', recipe: 'chug' },
  bump: file('bump', 'softBump', 0.75),
};

/** The mix trim of a source (1 for synth sources or files without a trim), clamped to 0..1. */
export function fileGainOf(source: SoundSource): number {
  if (source.kind !== 'file' || source.gain === undefined || !Number.isFinite(source.gain)) return 1;
  return Math.min(1, Math.max(0, source.gain));
}

/** The synth recipe name an event uses: its recipe, or its file's fallback. */
export function synthRecipeNameFor(event: SoundEvent): SynthRecipeName {
  const source = SOUND_BANK[event];
  return source.kind === 'synth' ? source.recipe : source.fallback;
}

export type ResolvedRecipe =
  | { kind: 'oneShot'; name: SynthRecipeName; play: OneShotRecipe }
  | { kind: 'loop'; name: SynthRecipeName; start: LoopRecipe };

/** Resolves an event to the synth function to run (directly or as a file fallback). */
export function resolveSynth(event: SoundEvent): ResolvedRecipe {
  const name = synthRecipeNameFor(event);
  if (isLoopRecipe(name)) return { kind: 'loop', name, start: LOOP_RECIPES[name] };
  return { kind: 'oneShot', name, play: ONE_SHOT_RECIPES[name] };
}
