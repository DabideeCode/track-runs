/**
 * Train runtime (design.md §4, DD-3; task 11.1).
 *
 * Owns the current `TrainSim` and implements the store's `TrainPort`. The
 * per-frame train state lives here, not in the Zustand store, so the train can
 * move every frame without React re-renders. The scene's `useFrame` calls
 * `tick(dt)`; `TrainView` reads `poses()`; the test hook reads `snapshot()`.
 *
 * Build mode: there is no running simulation. `snapshot()` and `poses()`
 * derive the parked train from the current pieces and start facing, memoised
 * on the pieces array identity and the facing value, so the parked train
 * follows station moves, rotations, undo and redo (Requirement 17.2) and is
 * `null` without a station (Requirement 17.9). The build state comes from a
 * source function (`connect(() => store.getState())`) or from explicit
 * `syncParked(pieces, startFacing)` calls.
 *
 * Play mode: the simulation runs on the graph of the pieces passed to
 * `enterPlay`. Pieces cannot change in Play mode, and the setting is never
 * read here, so a setting change cannot disturb the train (Requirement 7.10).
 *
 * The class has no Three.js, DOM or timer dependencies, so it runs in Node.
 */
import { buildTrackGraph, type TrackGraph } from '@/domain/trackGraph';
import {
  parkTrain,
  snapshot as snapshotOf,
  startPlay,
  stepTrain,
  vehiclePoses,
  type DriveMode,
  type TrainEvent,
  type TrainSim,
  type TrainSnapshot,
  type VehiclePose,
} from '@/domain/train';
import type { Piece } from '@/domain/types';
import type { AudioPort } from '@/audio/types';
import type { TrainPort } from '@/store/ports';

export type { VehiclePose } from '@/domain/train';

/** The Build-mode inputs the parked train depends on. */
export interface ParkedSource {
  pieces: readonly Piece[];
  startFacing: 0 | 180;
}

/** Held driving keys. Only Manual driving reads them. */
export interface DriveKeys {
  w: boolean;
  s: boolean;
}

/** Minimal event target for the window blur listener, so tests can pass a fake. */
export interface BlurTarget {
  addEventListener(type: 'blur', listener: () => void): void;
  removeEventListener(type: 'blur', listener: () => void): void;
}

export interface TrainRuntimeOptions {
  /** Reads the current pieces and start facing (usually `() => store.getState()`). */
  source?: () => ParkedSource;
}

interface ParkedCache {
  pieces: readonly Piece[];
  startFacing: 0 | 180;
  graph: TrackGraph | null;
  sim: TrainSim | null;
}

function findStation(pieces: readonly Piece[]): Piece | null {
  for (const p of pieces) if (p.type === 'station') return p;
  return null;
}

export class TrainRuntime implements TrainPort {
  private readonly audio: AudioPort;
  private source: (() => ParkedSource) | null;
  /** Fallback Build-mode state for when no source is connected. */
  private synced: ParkedSource = { pieces: [], startFacing: 0 };
  private parked: ParkedCache | null = null;

  private playing = false;
  private playGraph: TrackGraph | null = null;
  private sim: TrainSim | null = null;
  private driveMode: DriveMode = 'auto';
  private keys: DriveKeys = { w: false, s: false };

  private version = 0;
  private readonly listeners = new Set<() => void>();

  constructor(audio: AudioPort, options: TrainRuntimeOptions = {}) {
    this.audio = audio;
    this.source = options.source ?? null;
  }

  // -------------------------------------------------------------------------
  // Build-mode state
  // -------------------------------------------------------------------------

  /** Reads the Build-mode pieces and start facing from `source` from now on. */
  connect(source: () => ParkedSource): void {
    this.source = source;
    this.parked = null;
    this.bump();
  }

  /**
   * Sets the Build-mode pieces and start facing explicitly. Used when no
   * source is connected; with a source connected the source wins.
   */
  syncParked(pieces: readonly Piece[], startFacing: 0 | 180): void {
    if (this.synced.pieces === pieces && this.synced.startFacing === startFacing) return;
    this.synced = { pieces, startFacing };
    if (!this.source && !this.playing) this.bump();
  }

  private buildState(): ParkedSource {
    return this.source ? this.source() : this.synced;
  }

  /**
   * The parked simulation for the current build state, memoised on the pieces
   * array identity and the start facing. A re-derivation increases the
   * version (without notifying, since this runs inside a read).
   */
  private parkedNow(): ParkedCache {
    const { pieces, startFacing } = this.buildState();
    const c = this.parked;
    if (c && c.pieces === pieces && c.startFacing === startFacing) return c;
    const station = findStation(pieces);
    // Reuse the graph when only the facing changed.
    const graph = station ? (c && c.pieces === pieces && c.graph ? c.graph : buildTrackGraph(pieces)) : null;
    const sim = station && graph ? parkTrain(graph, station, startFacing) : null;
    this.parked = { pieces, startFacing, graph, sim };
    this.bump(false);
    return this.parked;
  }

  // -------------------------------------------------------------------------
  // TrainPort
  // -------------------------------------------------------------------------

  /**
   * Starts Play mode: parks the train on the station, switches to Auto
   * driving and departs Forward. Forwards `whistle` and the chug start to the
   * audio manager. Does nothing without a station (the store refuses that).
   */
  enterPlay(pieces: readonly Piece[], startFacing: 0 | 180): void {
    const station = findStation(pieces);
    if (!station) return;
    if (this.playing) this.stopPlay();
    const graph = buildTrackGraph(pieces);
    const parked = parkTrain(graph, station, startFacing);
    const started = startPlay(graph, parked);
    this.playGraph = graph;
    this.sim = started.sim;
    this.playing = true;
    this.driveMode = 'auto';
    this.clearKeys();
    this.forward(started.events);
    this.bump();
  }

  /** Stops the train and the chug; the train is parked at the station again. */
  exitPlay(): void {
    if (!this.playing) return;
    this.stopPlay();
    this.bump();
  }

  /** Sets the drive mode used by the next `tick`. Any mode, any time. */
  setDriveMode(mode: DriveMode): void {
    this.driveMode = mode;
  }

  /** The `getTrain()` result: the running train in Play mode, the parked train in Build mode, null without a station. */
  snapshot(): TrainSnapshot | null {
    if (this.playing && this.playGraph && this.sim) return snapshotOf(this.playGraph, this.sim);
    const p = this.parkedNow();
    return p.graph && p.sim ? snapshotOf(p.graph, p.sim) : null;
  }

  // -------------------------------------------------------------------------
  // Frame loop and input
  // -------------------------------------------------------------------------

  /**
   * Advances the running train by one frame (`stepTrain` clamps to 0.1 s and
   * runs 1/120 s sub-steps), forwards its events to the audio manager and,
   * while the chug runs, sets the chug level from the speed in tiles per
   * second (D-32). Does nothing in Build mode.
   */
  tick(frameDt: number): void {
    if (!this.playing || !this.playGraph || !this.sim) return;
    const r = stepTrain(
      this.playGraph,
      this.sim,
      { driveMode: this.driveMode, w: this.keys.w, s: this.keys.s },
      frameDt,
    );
    this.sim = r.sim;
    this.forward(r.events);
    if (this.sim.chugging) this.audio.setChugLevel(this.sim.speed);
    this.bump();
  }

  /** Updates the held W and S keys (keyboard handler, on keydown and keyup). */
  setKeys(keys: Partial<DriveKeys>): void {
    this.keys = { w: keys.w ?? this.keys.w, s: keys.s ?? this.keys.s };
  }

  /** Releases both driving keys. */
  clearKeys(): void {
    this.keys = { w: false, s: false };
  }

  /** The currently held driving keys (a copy). */
  getKeys(): DriveKeys {
    return { ...this.keys };
  }

  /**
   * Clears the held keys whenever `target` (normally `window`) loses focus,
   * so the train cannot keep driving after focus loss. Returns a detach function.
   */
  bindBlur(target: BlurTarget): () => void {
    const onBlur = () => this.clearKeys();
    target.addEventListener('blur', onBlur);
    return () => target.removeEventListener('blur', onBlur);
  }

  // -------------------------------------------------------------------------
  // Scene access
  // -------------------------------------------------------------------------

  /** Poses of [locomotive, carriage 1, carriage 2], or null without a station. Read by TrainView every frame. */
  poses(): VehiclePose[] | null {
    if (this.playing && this.playGraph && this.sim) return vehiclePoses(this.playGraph, this.sim);
    const p = this.parkedNow();
    return p.graph && p.sim ? vehiclePoses(p.graph, p.sim) : null;
  }

  isPlaying(): boolean {
    return this.playing;
  }

  getDriveMode(): DriveMode {
    return this.driveMode;
  }

  /**
   * A counter that increases whenever the train's poses may have changed:
   * on every Play-mode tick, on entering and leaving Play mode, and when the
   * parked train is re-derived from new pieces or a new start facing.
   */
  getVersion(): number {
    if (!this.playing) this.parkedNow();
    return this.version;
  }

  /** Calls `listener` after each version increase. Returns an unsubscribe function. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private stopPlay(): void {
    this.audio.stopChug();
    this.playing = false;
    this.playGraph = null;
    this.sim = null;
    this.driveMode = 'auto';
    this.clearKeys();
  }

  private forward(events: readonly TrainEvent[]): void {
    for (const e of events) {
      switch (e) {
        case 'whistle':
          this.audio.play('whistle');
          break;
        case 'bump':
          this.audio.play('bump');
          break;
        case 'chugStart':
          this.audio.startChug(this.sim?.speed ?? 0);
          break;
        case 'chugStop':
          this.audio.stopChug();
          break;
      }
    }
  }

  private bump(notify = true): void {
    this.version++;
    if (notify) for (const l of [...this.listeners]) l();
  }
}
