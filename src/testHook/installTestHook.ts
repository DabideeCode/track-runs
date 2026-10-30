/**
 * The `window.__DIORAMA__` test hook (Section 10.2 of requirement.md;
 * design section 5; Requirements 38 and 39).
 *
 * Every method is a thin, synchronous wrapper around the same store actions
 * the UI calls, so the hook applies exactly the UI's validation and plays the
 * same sounds (Requirements 16.7, 39.16, 39.17). The hook never logs `pickup`,
 * because no grab happens.
 *
 * Values handed to the caller are plain copies: mutating a result of
 * `getState()`, `getConnections()`, `getTrain()` or `getSoundLog()` never
 * changes the store, the memoised selectors or the sound log.
 *
 * Bad arguments never throw. The store's placement engine turns them into
 * reason codes: an unknown type, an unknown id or a rotation other than 0, 90,
 * 180 or 270 gives `not_found`; non-integer or off-grid coordinates give
 * `out_of_bounds`; an unknown mode gives `not_found` from `setMode`; an unknown
 * drive mode is ignored by `setDriveMode`.
 *
 * Load this module only through a dynamic `import()` after
 * `shouldInstallTestHook` (in `./shouldInstall`) returns true, so production
 * builds without `?test=1` never download it (Requirement 38.3).
 */
import type { AudioPort } from '@/audio/types';
import type { GameState, PieceType, Rotation } from '@/domain/types';
import type { AppStore } from '@/store/createAppStore';
import type { TrainPort } from '@/store/ports';
import { selectConnections } from '@/store/selectors';
import type { BuildResult } from '@/store/types';

export { shouldInstallTestHook, type EnvLike, type LocationLike } from './shouldInstall';

// ---------------------------------------------------------------------------
// The contract, verbatim from Section 10.2 of requirement.md
// ---------------------------------------------------------------------------

export interface DioramaTestHook {
  getState(): GameState;
  placePiece(
    type: PieceType, gridX: number, gridZ: number, rotation?: Rotation
  ): { ok: boolean; id?: string; reason?: string };
  movePiece(id: string, gridX: number, gridZ: number): { ok: boolean; reason?: string };
  rotatePiece(id: string): { ok: boolean; reason?: string }; // 90° clockwise
  removePiece(id: string): { ok: boolean; reason?: string };
  getConnections(): Array<[string, string]>; // pairs of connected track ids
  setMode(mode: 'build' | 'play'): { ok: boolean; reason?: string };
  setDriveMode(mode: 'auto' | 'manual'): void;
  getTrain(): {
    pieceId: string;     // track piece the locomotive is on
    progress: number;    // 0 to 1 along that piece
    moving: boolean;
    direction: 'forward' | 'reverse';
    speed: number;       // tiles per second
  } | null;
  getSoundLog(): string[]; // sound event names in the order played
}

/**
 * Test-only helpers kept off `__DIORAMA__`, so the contract object stays
 * exactly as specified (design: End-to-end tests).
 */
export interface DioramaDebugHook {
  /** Client (CSS pixel) coordinates of a tile centre, or null off the grid, out of view or before the scene exists. */
  tileToScreen(gridX: number, gridZ: number): { x: number; y: number } | null;
}

/** Where the hook is installed; `window` in the browser, a plain object in tests. */
export interface HookTarget {
  __DIORAMA__?: DioramaTestHook;
  __DIORAMA_DEBUG__?: DioramaDebugHook;
}

declare global {
  interface Window {
    __DIORAMA__?: DioramaTestHook;
    __DIORAMA_DEBUG__?: DioramaDebugHook;
  }
}

export interface InstallTestHookOptions {
  store: AppStore;
  audio: Pick<AudioPort, 'getLog'>;
  train: Pick<TrainPort, 'snapshot'>;
  scene: { tileToScreen(gridX: number, gridZ: number): { x: number; y: number } | null };
  /** Defaults to `window` (or `globalThis` where there is no window). */
  target?: HookTarget;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/** A fresh `{ ok, id?, reason? }` object, never shared with the store. */
function result(r: BuildResult | { ok: true } | { ok: false; reason: string }): {
  ok: boolean;
  id?: string;
  reason?: string;
} {
  if (!r.ok) return { ok: false, reason: r.reason };
  return 'id' in r && r.id !== undefined ? { ok: true, id: r.id } : { ok: true };
}

/** A plain deep copy of exactly the Section 9 `GameState` fields (no extras, no actions). */
export function snapshotGameState(s: GameState): GameState {
  return {
    pieces: s.pieces.map((p) => ({ id: p.id, type: p.type, gridX: p.gridX, gridZ: p.gridZ, rotation: p.rotation })),
    selectedTool: s.selectedTool,
    selectedPieceId: s.selectedPieceId,
    mode: s.mode,
    driveMode: s.driveMode,
    setting: s.setting,
    startFacing: s.startFacing,
    dioramaId: s.dioramaId,
    dioramaName: s.dioramaName,
    isDirty: s.isDirty,
  };
}

/** Builds the hook object without installing it. Every method is bound and synchronous. */
export function createTestHook(opts: Omit<InstallTestHookOptions, 'scene' | 'target'>): DioramaTestHook {
  const { store, audio, train } = opts;
  const state = () => store.getState();

  return Object.freeze({
    getState: () => snapshotGameState(state()),

    placePiece: (type: PieceType, gridX: number, gridZ: number, rotation?: Rotation) =>
      // An omitted (or explicitly undefined) rotation applies the auto-adjust rule (AC-7.3).
      result(state().placePiece(type, gridX, gridZ, { rotation, autoAdjust: rotation === undefined })),

    // No rotation argument: the piece keeps its rotation (Requirement 15.7).
    movePiece: (id: string, gridX: number, gridZ: number) => result(state().movePiece(id, gridX, gridZ)),

    rotatePiece: (id: string) => result(state().rotatePiece(id)),

    removePiece: (id: string) => result(state().removePiece(id)),

    getConnections: () => selectConnections(state()).map(([a, b]): [string, string] => [a, b]),

    setMode: (mode: 'build' | 'play') => result(state().setMode(mode)),

    setDriveMode: (mode: 'auto' | 'manual'): void => {
      state().setDriveMode(mode);
    },

    getTrain: () => {
      const t = train.snapshot();
      return t === null
        ? null
        : { pieceId: t.pieceId, progress: t.progress, moving: t.moving, direction: t.direction, speed: t.speed };
    },

    getSoundLog: (): string[] => [...audio.getLog()],
  });
}

/** Builds the debug helper object. Non-number arguments give null. */
export function createDebugHook(scene: InstallTestHookOptions['scene']): DioramaDebugHook {
  return Object.freeze({
    tileToScreen(gridX: number, gridZ: number) {
      if (typeof gridX !== 'number' || typeof gridZ !== 'number') return null;
      const p = scene.tileToScreen(gridX, gridZ);
      return p === null ? null : { x: p.x, y: p.y };
    },
  });
}

function defaultTarget(): HookTarget {
  return (typeof window !== 'undefined' ? window : globalThis) as HookTarget;
}

/**
 * Assigns `__DIORAMA__` and `__DIORAMA_DEBUG__` on `target` (Requirements
 * 38.4, 38.5). The hook lives on the target, not in React, so it stays defined
 * while the user moves between the menu and the playfield. Returns a function
 * that removes both globals again, unless they were replaced since.
 */
export function installTestHook(options: InstallTestHookOptions): () => void {
  const target = options.target ?? defaultTarget();
  const hook = createTestHook(options);
  const debug = createDebugHook(options.scene);
  target.__DIORAMA__ = hook;
  target.__DIORAMA_DEBUG__ = debug;
  return () => {
    if (target.__DIORAMA__ === hook) delete target.__DIORAMA__;
    if (target.__DIORAMA_DEBUG__ === debug) delete target.__DIORAMA_DEBUG__;
  };
}
