/**
 * Store test harness (task 10.5).
 *
 * `createHarness(opts)` builds a real `createAppStore(deps)` wired to fakes
 * that run in Node and are fully deterministic:
 *
 * - `storage`: an in-memory `KeyValueStorage` (`memoryStorage`) with
 *   switchable write failures, shared by the real save and settings repositories.
 *   `sharedStorage` reuses another harness's storage to simulate a reload.
 * - `audio`: a recording `AudioPort`; `log` / `getLog()` is the sound log.
 * - `train`: the real `TrainRuntime` (pure train functions, no Three.js or DOM),
 *   connected to the store so `snapshot()` follows the store's pieces in Build
 *   mode. `deps.train` delegates to it and records each call in `trainCalls`.
 * - `scene`: a fake `ScenePort` whose thumbnail capture can succeed, return
 *   null or throw.
 * - `clock`: a controllable clock; `advance(ms)` moves time and fires every
 *   due timeout and interval in time order (ties in scheduling order).
 * - `ids` / `dioramaIds`: seeded counters (`p1`, `p2`, … and `d1`, `d2`, …).
 *
 * Two harnesses created with the same options and driven by the same calls
 * produce identical ids, timestamps and states (Requirements 16.7, 39.17).
 */
import type { AudioPort, OneShotEvent } from '@/audio/types';
import type { TrainSnapshot } from '@/domain/train';
import type { AudioSettings, Diorama, Piece, SoundEvent } from '@/domain/types';
import {
  SAVE_KEY,
  createSaveRepository,
  type SaveRepository,
} from '@/persistence/saveRepository';
import {
  createSettingsRepository,
  type SettingsRepository,
} from '@/persistence/settingsRepository';
import { memoryStorage, type FailWrites, type MemoryStorage } from '@/persistence/storage';
import { TrainRuntime } from '@/runtime/TrainRuntime';
import { createAppStore, type AppStore } from '@/store/createAppStore';
import type { AppDeps, ScenePort, TimerHandle, Timers, TrainPort } from '@/store/ports';

export { memoryStorage } from '@/persistence/storage';

// ---------------------------------------------------------------------------
// Seeded ids
// ---------------------------------------------------------------------------

export interface IdGenerator {
  /** The next id: `${prefix}${n}`, n counting up from `start`. */
  next(): string;
  /** Every id issued so far, oldest first. */
  issued(): string[];
}

export function seededIds(prefix = 'p', start = 1): IdGenerator {
  let n = start;
  const out: string[] = [];
  return {
    next() {
      const id = `${prefix}${n++}`;
      out.push(id);
      return id;
    },
    issued: () => [...out],
  };
}

// ---------------------------------------------------------------------------
// Controllable clock and timers
// ---------------------------------------------------------------------------

/** The default start time used by every harness. */
export const HARNESS_START = Date.parse('2026-10-29T10:00:00.000Z');

export interface ManualClock {
  /** Current time in epoch milliseconds. */
  readonly now: number;
  /** Moves time forward by `ms`, firing due timers in order. Negative values are treated as 0. */
  advance(ms: number): void;
  /** Number of pending timeouts and intervals. */
  pendingTimers(): number;
  /** Timers that read this clock. */
  readonly timers: Timers;
}

export function manualClock(start = HARNESS_START): ManualClock {
  type Job = { id: number; at: number; every: number | null; fn: () => void };
  const jobs = new Map<number, Job>();
  let now = start;
  let seq = 0;
  const delay = (ms: number) => (Number.isFinite(ms) && ms > 0 ? ms : 0);

  const timers: Timers = {
    setTimeout(fn, ms) {
      const id = ++seq;
      jobs.set(id, { id, at: now + delay(ms), every: null, fn });
      return id;
    },
    clearTimeout(h: TimerHandle) {
      jobs.delete(h as number);
    },
    setInterval(fn, ms) {
      const id = ++seq;
      // Browsers clamp interval delays; at least 1 ms keeps `advance` finite.
      const every = Math.max(1, delay(ms));
      jobs.set(id, { id, at: now + every, every, fn });
      return id;
    },
    clearInterval(h: TimerHandle) {
      jobs.delete(h as number);
    },
  };

  return {
    get now() {
      return now;
    },
    timers,
    pendingTimers: () => jobs.size,
    advance(ms) {
      const end = now + delay(ms);
      for (;;) {
        let due: Job | null = null;
        for (const j of jobs.values()) {
          if (j.at > end) continue;
          // Earliest time first; Map order (scheduling order) breaks ties.
          if (due === null || j.at < due.at) due = j;
        }
        if (due === null) break;
        now = due.at;
        if (due.every === null) jobs.delete(due.id);
        else due.at += due.every;
        due.fn();
      }
      now = end;
    },
  };
}

// ---------------------------------------------------------------------------
// Recording audio
// ---------------------------------------------------------------------------

export interface RecordingAudio extends AudioPort {
  /** The live sound log (same entries as `getLog()`). */
  readonly log: SoundEvent[];
  /** Last settings passed to `apply`, or null. */
  readonly applied: AudioSettings | null;
  /** True between `startChug` and `stopChug`. */
  readonly chugRunning: boolean;
  /** Last value passed to `setChugLevel`. */
  readonly chugLevel: number;
  /** Empties the sound log. */
  clearLog(): void;
}

export function recordingAudio(): RecordingAudio {
  const log: SoundEvent[] = [];
  let applied: AudioSettings | null = null;
  let chugRunning = false;
  let chugLevel = 0;
  return {
    log,
    get applied() {
      return applied;
    },
    get chugRunning() {
      return chugRunning;
    },
    get chugLevel() {
      return chugLevel;
    },
    play(event: OneShotEvent) {
      log.push(event);
    },
    startChug(speed = 0) {
      log.push('chug');
      chugRunning = true;
      chugLevel = speed;
    },
    setChugLevel(speed) {
      chugLevel = speed;
    },
    stopChug() {
      chugRunning = false;
    },
    apply(settings) {
      applied = { ...settings };
    },
    getLog: () => [...log],
    clearLog() {
      log.length = 0;
    },
  };
}

// ---------------------------------------------------------------------------
// Fake scene
// ---------------------------------------------------------------------------

export type ThumbnailMode = 'ok' | 'null' | 'throw';

/** The data URL returned by the fake scene in `'ok'` mode. */
export const FAKE_THUMBNAIL = 'data:image/jpeg;base64,AAAA';

export interface FakeScene extends ScenePort {
  setThumbnailMode(mode: ThumbnailMode): void;
  /** Number of `captureThumbnail` calls. */
  readonly captures: number;
  /** Number of `resetView` calls. */
  readonly resetViews: number;
}

export function fakeScene(mode: ThumbnailMode = 'ok'): FakeScene {
  let current = mode;
  let captures = 0;
  let resetViews = 0;
  return {
    get captures() {
      return captures;
    },
    get resetViews() {
      return resetViews;
    },
    setThumbnailMode(next) {
      current = next;
    },
    captureThumbnail() {
      captures++;
      if (current === 'throw') throw new Error('Thumbnail capture failed (fake scene)');
      return current === 'null' ? null : FAKE_THUMBNAIL;
    },
    resetView() {
      resetViews++;
    },
  };
}

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

export type TrainCall =
  | { method: 'enterPlay'; pieces: readonly Piece[]; startFacing: 0 | 180 }
  | { method: 'exitPlay' }
  | { method: 'setDriveMode'; mode: 'auto' | 'manual' };

export interface HarnessOptions {
  /** Initial storage contents (raw key → string). */
  storage?: Record<string, string>;
  /** Shorthand: stores these dioramas as a valid SaveFile (merged over `storage`). */
  saved?: Diorama[];
  /** Makes storage writes throw `QuotaExceededError` from the start. */
  failWrites?: FailWrites;
  /**
   * Uses this storage instead of a new one, for example another harness's
   * `storage`, to simulate a page reload on the same localStorage. Its contents
   * and failure switch are used as they are, so `storage`, `saved` and
   * `failWrites` must not be given with it.
   */
  sharedStorage?: MemoryStorage;
  /** Where the store starts: the menu (default), a new diorama, or an opened saved diorama. */
  start?: 'menu' | 'playfield' | { open: string };
  /** Piece id prefix and first counter value (default `p`, 1). */
  idPrefix?: string;
  idStart?: number;
  /** Diorama id prefix (default `d`). */
  dioramaIdPrefix?: string;
  /** Clock start in epoch ms (default `HARNESS_START`). */
  startTime?: number;
  thumbnail?: ThumbnailMode;
}

export interface Harness {
  store: AppStore;
  deps: AppDeps;
  storage: MemoryStorage;
  audio: RecordingAudio;
  /** The real train runtime behind `deps.train`. */
  train: TrainRuntime;
  /** Calls the store made on `deps.train`, oldest first. */
  trainCalls: TrainCall[];
  scene: FakeScene;
  clock: ManualClock;
  ids: IdGenerator;
  dioramaIds: IdGenerator;
  saves: SaveRepository;
  settings: SettingsRepository;
  /** Every warning passed to the store and the repositories. */
  warnings: string[];
  /** Advances the running train by one frame of `dt` seconds. */
  tick(dt: number): void;
  /** Shorthand for `train.snapshot()` (the test hook's `getTrain()`). */
  getTrain(): TrainSnapshot | null;
  /** Dioramas currently in the SaveFile (raw parse, no validation); [] when the key is missing. */
  stored(): Diorama[];
  /** Stops the store's timers and the train. Safe to call twice. */
  dispose(): void;
}

/** A SaveFile storage entry for `dioramas`. */
export function saveFileOf(...dioramas: Diorama[]): Record<string, string> {
  return { [SAVE_KEY]: JSON.stringify({ version: 1, dioramas }) };
}

const live = new Set<Harness>();

/** Disposes every harness not yet disposed; call from `afterEach`. */
export function disposeHarnesses(): void {
  for (const h of [...live]) h.dispose();
}

export function createHarness(opts: HarnessOptions = {}): Harness {
  let storage: MemoryStorage;
  if (opts.sharedStorage) {
    if (opts.storage || opts.saved || opts.failWrites !== undefined) {
      throw new Error('createHarness: sharedStorage cannot be combined with storage, saved or failWrites');
    }
    storage = opts.sharedStorage;
  } else {
    const init = { ...opts.storage, ...(opts.saved ? saveFileOf(...opts.saved) : {}) };
    storage = memoryStorage(init, { failWrites: opts.failWrites ?? false });
  }
  const clock = manualClock(opts.startTime ?? HARNESS_START);
  const ids = seededIds(opts.idPrefix ?? 'p', opts.idStart ?? 1);
  const dioramaIds = seededIds(opts.dioramaIdPrefix ?? 'd', 1);
  const audio = recordingAudio();
  const scene = fakeScene(opts.thumbnail ?? 'ok');
  const warnings: string[] = [];
  const warn = (message: string) => void warnings.push(message);

  const saves = createSaveRepository({
    storage,
    now: () => new Date(clock.now),
    newId: () => dioramaIds.next(),
    warn,
  });
  const settings = createSettingsRepository({ storage, warn });

  const train = new TrainRuntime(audio);
  const trainCalls: TrainCall[] = [];
  const trainPort: TrainPort = {
    enterPlay(pieces, startFacing) {
      trainCalls.push({ method: 'enterPlay', pieces, startFacing });
      train.enterPlay(pieces, startFacing);
    },
    exitPlay() {
      trainCalls.push({ method: 'exitPlay' });
      train.exitPlay();
    },
    setDriveMode(mode) {
      trainCalls.push({ method: 'setDriveMode', mode });
      train.setDriveMode(mode);
    },
    snapshot: () => train.snapshot(),
  };

  const deps: AppDeps = {
    audio,
    train: trainPort,
    scene,
    saves,
    settings,
    now: () => clock.now,
    newId: () => ids.next(),
    timers: clock.timers,
    warn,
  };

  const store = createAppStore(deps);
  train.connect(() => store.getState());

  const start = opts.start ?? 'menu';
  if (start === 'playfield') store.getState().newDiorama();
  else if (typeof start === 'object' && !store.getState().openDiorama(start.open)) {
    throw new Error(`createHarness: saved diorama "${start.open}" could not be opened`);
  }

  let disposed = false;
  const harness: Harness = {
    store,
    deps,
    storage,
    audio,
    train,
    trainCalls,
    scene,
    clock,
    ids,
    dioramaIds,
    saves,
    settings,
    warnings,
    tick: (dt) => train.tick(dt),
    getTrain: () => train.snapshot(),
    stored() {
      const raw = storage.getItem(SAVE_KEY);
      return raw === null ? [] : (JSON.parse(raw) as { dioramas: Diorama[] }).dioramas;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      live.delete(harness);
      store.getState().dispose();
      train.exitPlay();
    },
  };
  live.add(harness);
  return harness;
}
