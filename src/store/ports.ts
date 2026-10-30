/**
 * Ports the store talks to (design section 3, DD-2).
 *
 * The store never reaches for globals: audio, the train runtime, the 3D scene,
 * persistence, the clock, id generation and timers are all injected through
 * `AppDeps`, so the same store runs in the browser and in Node tests with fakes.
 *
 * `AudioPort` is defined in the audio layer (`src/audio/types.ts`, D-32) and is
 * only re-exported here, so the store and the audio implementation never import
 * each other.
 */
import type { TrainSnapshot } from '@/domain/train';
import type { Piece } from '@/domain/types';
import type { SaveRepository } from '@/persistence/saveRepository';
import type { SettingsRepository } from '@/persistence/settingsRepository';
import type { WarnFn } from '@/persistence/storage';
import type { AudioPort } from '@/audio/types';

export type { AudioPort, OneShotEvent } from '@/audio/types';

/** The train runtime as seen by the store (implemented by `TrainRuntime`, task 11.1). */
export interface TrainPort {
  /** Starts Play mode from the parked train; plays `whistle` and starts the chug. */
  enterPlay(pieces: readonly Piece[], startFacing: 0 | 180): void;
  /** Stops the train and the chug; the train is parked again. */
  exitPlay(): void;
  setDriveMode(mode: 'auto' | 'manual'): void;
  /** The `getTrain()` result: null when no station exists. */
  snapshot(): TrainSnapshot | null;
}

/** The 3D scene as seen by the store (implemented by `SceneBridge`, task 11.2). */
export interface ScenePort {
  /** JPEG data URL of the current scene, at most 320 × 240; null when capture fails. May throw. */
  captureThumbnail(): string | null;
  /** Animates the camera back to the default pose. */
  resetView(): void;
}

/** Opaque timer handle; numbers in the browser, objects in Node. */
export type TimerHandle = unknown;

/** Injectable timers, so tests control toast dismissal and the autosave interval. */
export interface Timers {
  setTimeout(fn: () => void, ms: number): TimerHandle;
  clearTimeout(handle: TimerHandle): void;
  setInterval(fn: () => void, ms: number): TimerHandle;
  clearInterval(handle: TimerHandle): void;
}

export interface AppDeps {
  audio: AudioPort;
  train: TrainPort;
  scene: ScenePort;
  saves: SaveRepository;
  settings: SettingsRepository;
  /** Clock in epoch milliseconds. */
  now: () => number;
  /** Piece id generator (`nanoid` in the browser, seeded in tests). */
  newId: () => string;
  /** Defaults to the global timer functions. */
  timers?: Timers;
  /** Defaults to `console.warn`. */
  warn?: WarnFn;
}

/** The global timer functions, wrapped so they can be stored and called unbound. */
export const globalTimers: Timers = {
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (h) => globalThis.clearTimeout(h as Parameters<typeof globalThis.clearTimeout>[0]),
  setInterval: (fn, ms) => globalThis.setInterval(fn, ms),
  clearInterval: (h) => globalThis.clearInterval(h as Parameters<typeof globalThis.clearInterval>[0]),
};
