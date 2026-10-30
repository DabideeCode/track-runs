// Feature: track-diorama-builder, Property 20: Test hook and UI paths are equivalent
/**
 * **Validates: Requirements 16.7, 39.2, 39.17**
 *
 * For any starting board and any sequence of build requests, running the
 * requests through the test hook on one store and through the UI paths
 * (drag-controller drop with ghost rotation 0, keyboard R, keyboard Delete) on
 * an identical second store yields the same `ok` results, the same reasons,
 * the same `pieces` arrays (with ids from the same seeded id generator) and the
 * same sound logs apart from `pickup`; `getState()` after each hook call
 * reflects that call.
 *
 * Two real stores (harness from task 10.5) start with the same seeds and the
 * same reachable board, built by replaying `arbBoardWithHistory` through store
 * actions. Then each request runs on both:
 *
 * - Hook store: the real test hook (`createTestHook`): `placePiece` without a
 *   rotation, `movePiece`, `rotatePiece`, `removePiece`.
 * - UI store: the real `DragController` driven with synthetic pointer events,
 *   a fake `rayFromClient` that maps client pixels to tiles (40 px per tile,
 *   null off the grid), a pick function that finds the piece under a tile, and
 *   `isOverScene` true only for events whose target is the canvas; plus the
 *   real `handleKeyDown`:
 *   - place: a palette drag (press on the palette, move onto the target, release
 *     there) or, when that tool is already selected, a click on the tile;
 *   - move: press on the piece, move off the grid (starts the board drag), move
 *     to the target, release there;
 *   - rotate / remove: click the piece to select it, then R / Delete.
 *   Escape clears a selected tool first, so a press on a piece picks it.
 *
 * Results of UI actions are read from the store actions the UI calls (`drop`,
 * `placePiece`, `rotatePiece`, `deleteSelected`) through a recording wrapper
 * that forwards to the real action.
 *
 * The UI cannot express some hook requests: unknown types or ids, non-integer
 * coordinates, explicit rotations, and a station placement while a station
 * exists and the station tool is not selected (the palette blocks it,
 * Requirement 16.13). The generator produces only valid types, integer
 * coordinates and existing pieces; the station case is checked to be blocked
 * by the UI (no state change, no sound) and is then skipped on both stores.
 */
import { afterEach, describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { footprintTiles, inGrid } from '@/domain/grid';
import type { BuildRequest } from '@/domain/placement';
import type { Piece, PieceType, Rotation, Tile } from '@/domain/types';
import { createDragController, type DragController, type PointerLike } from '@/input/DragController';
import { handleKeyDown, type KeyboardContext } from '@/input/useKeyboardShortcuts';
import type { AppStore } from '@/store/createAppStore';
import { selectConnections } from '@/store/selectors';
import type { AppState, BuildResult } from '@/store/types';
import { createTestHook, type DioramaTestHook } from '@/testHook/installTestHook';
import { arbBoardWithHistory, PIECE_TYPES, TRACK_TYPES } from '../arbitraries';
import { createHarness, disposeHarnesses, type Harness } from './harness';

afterEach(() => disposeHarnesses());

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

/** A target tile: absolute, or relative to the anchor of an existing piece (picked at run time). */
type Target =
  | { kind: 'abs'; x: number; z: number }
  | { kind: 'near'; pick: number; dx: number; dz: number };

type Cmd =
  | { kind: 'place'; type: PieceType; target: Target; preferTool: boolean }
  | { kind: 'move'; pick: number; target: Target }
  | { kind: 'rotate'; pick: number }
  | { kind: 'remove'; pick: number };

/** Mostly in-grid integers, sometimes just off the grid (or further). */
const arbCoord = fc.oneof(
  { arbitrary: fc.integer({ min: 0, max: 15 }), weight: 8 },
  { arbitrary: fc.constantFrom(-2, -1, 16, 17), weight: 1 },
);

const arbTarget: fc.Arbitrary<Target> = fc.oneof(
  { arbitrary: fc.record({ kind: fc.constant('abs' as const), x: arbCoord, z: arbCoord }), weight: 2 },
  {
    arbitrary: fc.record({
      kind: fc.constant('near' as const),
      pick: fc.nat(),
      dx: fc.integer({ min: -1, max: 1 }),
      dz: fc.integer({ min: -1, max: 1 }),
    }),
    weight: 3,
  },
);

/** Tracks twice as likely as decorations, so connections and snaps are common. */
const arbType: fc.Arbitrary<PieceType> = fc.oneof(
  { arbitrary: fc.constantFrom(...TRACK_TYPES), weight: 2 },
  { arbitrary: fc.constantFrom(...PIECE_TYPES), weight: 1 },
);

const arbCmd: fc.Arbitrary<Cmd> = fc.oneof(
  {
    arbitrary: fc.record({ kind: fc.constant('place' as const), type: arbType, target: arbTarget, preferTool: fc.boolean() }),
    weight: 4,
  },
  { arbitrary: fc.record({ kind: fc.constant('move' as const), pick: fc.nat(), target: arbTarget }), weight: 3 },
  { arbitrary: fc.record({ kind: fc.constant('rotate' as const), pick: fc.nat() }), weight: 2 },
  { arbitrary: fc.record({ kind: fc.constant('remove' as const), pick: fc.nat() }), weight: 1 },
);

function resolveTarget(t: Target, pieces: readonly Piece[]): Tile {
  if (t.kind === 'abs' || pieces.length === 0) {
    return t.kind === 'abs' ? { gridX: t.x, gridZ: t.z } : { gridX: 7, gridZ: 7 };
  }
  const p = pieces[t.pick % pieces.length]!;
  return { gridX: p.gridX + t.dx, gridZ: p.gridZ + t.dz };
}

// ---------------------------------------------------------------------------
// Store setup
// ---------------------------------------------------------------------------

/** Replays an accepted build request through the store's actions. */
function replay(store: AppStore, req: BuildRequest): BuildResult {
  const s = store.getState();
  switch (req.kind) {
    case 'place':
      return s.placePiece(req.type, req.gridX, req.gridZ, { rotation: req.rotation, autoAdjust: req.autoAdjust });
    case 'move':
      return s.movePiece(req.id, req.gridX, req.gridZ, req.rotation);
    case 'rotate':
      return s.rotatePiece(req.id);
    case 'remove':
      return s.removePiece(req.id);
  }
}

/** The hook's result shape: `{ ok, id?, reason? }` with absent keys left out. */
function shape(r: BuildResult | { ok: boolean; id?: string; reason?: string }): {
  ok: boolean;
  id?: string;
  reason?: string;
} {
  const out: { ok: boolean; id?: string; reason?: string } = { ok: r.ok };
  if ('id' in r && r.id !== undefined) out.id = r.id;
  if ('reason' in r && r.reason !== undefined) out.reason = r.reason;
  return out;
}

// ---------------------------------------------------------------------------
// UI driver: drag controller + keyboard on the second store
// ---------------------------------------------------------------------------

const CANVAS = { id: 'canvas' };
const PALETTE = { id: 'palette' };
const ORIGIN_PX = 100;
const TILE_PX = 40;
/** A point on the palette panel, far from every tile. */
const PALETTE_POINT = { clientX: -400, clientY: 300 };

/** Client coordinates of a tile centre (off-grid tiles give points beside the grid). */
function clientOf(gridX: number, gridZ: number): { clientX: number; clientY: number } {
  return { clientX: ORIGIN_PX + gridX * TILE_PX + TILE_PX / 2, clientY: ORIGIN_PX + gridZ * TILE_PX + TILE_PX / 2 };
}

function tileOfClient(clientX: number, clientY: number): Tile | null {
  const tile = { gridX: Math.floor((clientX - ORIGIN_PX) / TILE_PX), gridZ: Math.floor((clientY - ORIGIN_PX) / TILE_PX) };
  return inGrid(tile) ? tile : null;
}

type UiOutcome = { kind: 'done'; result: BuildResult } | { kind: 'blocked' };

interface UiDriver {
  controller: DragController;
  place(type: PieceType, tile: Tile, preferTool: boolean): UiOutcome;
  move(piece: Piece, tile: Tile): UiOutcome;
  rotate(piece: Piece): UiOutcome;
  remove(piece: Piece): UiOutcome;
}

function createUiDriver(h: Harness): UiDriver {
  let last: BuildResult | null | undefined;

  // Forwards to the real store; records the result of the build actions the UI calls.
  const recordingStore = {
    getState(): AppState {
      const s = h.store.getState();
      return {
        ...s,
        drop: () => (last = s.drop()),
        placePiece: (...args: Parameters<AppState['placePiece']>) => (last = s.placePiece(...args)),
        rotatePiece: (id: unknown) => (last = s.rotatePiece(id)),
        deleteSelected: () => (last = s.deleteSelected()),
      };
    },
    subscribe: (listener: (state: AppState, prev: AppState) => void) => h.store.subscribe(listener),
  };

  const controller = createDragController({
    store: recordingStore,
    bridge: { rayFromClient: tileOfClient },
    isOverScene: (e) => e.target === CANVAS,
  });
  controller.setPickPiece((clientX, clientY) => {
    const tile = tileOfClient(clientX, clientY);
    if (tile === null) return null;
    const hit = h.store
      .getState()
      .pieces.find((p) => footprintTiles(p.type, p.gridX, p.gridZ).some((t) => t.gridX === tile.gridX && t.gridZ === tile.gridZ));
    return hit?.id ?? null;
  });
  controller.attach();

  const keyCtx: KeyboardContext = { store: recordingStore, train: h.train };
  const key = (k: string) => handleKeyDown({ key: k, target: null, preventDefault: () => {} }, keyCtx);

  const onCanvas = (gridX: number, gridZ: number): PointerLike => ({ ...clientOf(gridX, gridZ), target: CANVAS, button: 0 });

  /** Runs one gesture and returns the build result it produced. */
  function capture(gesture: () => void): UiOutcome {
    last = undefined;
    gesture();
    expect(controller.phase.kind).toBe('idle');
    expect(h.store.getState().drag).toBeNull();
    if (last === undefined || last === null) throw new Error('UI gesture produced no build result');
    return { kind: 'done', result: last };
  }

  function clearTool(): void {
    if (h.store.getState().selectedTool !== null) expect(key('Escape')).toBe('clearTool');
    expect(h.store.getState().selectedTool).toBeNull();
  }

  function selectByClick(piece: Piece): void {
    clearTool();
    const at = onCanvas(piece.gridX, piece.gridZ);
    controller.pointerDown(at);
    expect(controller.phase.kind).toBe('piecePress');
    controller.pointerUp(at);
    expect(controller.phase.kind).toBe('idle');
    expect(h.store.getState().selectedPieceId).toBe(piece.id);
  }

  return {
    controller,

    place(type, tile, preferTool) {
      const s = h.store.getState();
      const offGrid = !inGrid(tile);
      const paletteAllowed = !(type === 'station' && s.pieces.some((p) => p.type === 'station'));
      // A tool click off the grid does nothing (D-27), so off-grid targets need a drag.
      const toolAllowed = s.selectedTool === type && !offGrid;

      if (toolAllowed && (preferTool || !paletteAllowed)) {
        return capture(() => {
          const at = onCanvas(tile.gridX, tile.gridZ);
          controller.pointerDown(at);
          expect(controller.phase.kind).toBe('toolPress');
          controller.pointerUp(at);
        });
      }
      if (!paletteAllowed) {
        // The palette blocks a second station: nothing starts, nothing changes.
        const before = h.store.getState();
        const logLength = h.audio.log.length;
        expect(controller.paletteDown(type, { ...PALETTE_POINT, target: PALETTE, button: 0 })).toBe(false);
        expect(controller.phase.kind).toBe('idle');
        expect(h.store.getState().pieces).toBe(before.pieces);
        expect(h.audio.log.length).toBe(logLength);
        return { kind: 'blocked' };
      }
      return capture(() => {
        expect(controller.paletteDown(type, { ...PALETTE_POINT, target: PALETTE, button: 0 })).toBe(true);
        const at = onCanvas(tile.gridX, tile.gridZ);
        controller.pointerMove(at);
        expect(controller.phase.kind).toBe('paletteDrag');
        // Ghost rotation 0: no R during the drag.
        expect(h.store.getState().drag?.rotation).toBe(0);
        controller.pointerUp(at);
      });
    },

    move(piece, tile) {
      clearTool();
      return capture(() => {
        controller.pointerDown(onCanvas(piece.gridX, piece.gridZ));
        expect(controller.phase.kind).toBe('piecePress');
        // Off the grid first: a different tile and far beyond 4 px, so the drag starts
        // even when the target is the piece's own tile.
        controller.pointerMove(onCanvas(-3, -3));
        expect(controller.phase.kind).toBe('boardDrag');
        const at = onCanvas(tile.gridX, tile.gridZ);
        controller.pointerMove(at);
        controller.pointerUp(at);
      });
    },

    rotate(piece) {
      selectByClick(piece);
      return capture(() => expect(key('r')).toBe('rotatePiece'));
    },

    remove(piece) {
      selectByClick(piece);
      return capture(() => expect(key('Delete')).toBe('deleteSelected'));
    },
  };
}

// ---------------------------------------------------------------------------
// Hook side and "reflects that call" checks
// ---------------------------------------------------------------------------

function nextRotation(r: Rotation): Rotation {
  return ((r + 90) % 360) as Rotation;
}

function runHook(hook: DioramaTestHook, cmd: Cmd, piece: Piece | null, tile: Tile | null) {
  switch (cmd.kind) {
    case 'place':
      return hook.placePiece(cmd.type, tile!.gridX, tile!.gridZ);
    case 'move':
      return hook.movePiece(piece!.id, tile!.gridX, tile!.gridZ);
    case 'rotate':
      return hook.rotatePiece(piece!.id);
    case 'remove':
      return hook.removePiece(piece!.id);
  }
}

/** `getState()` right after a hook call shows that call's effect. */
function expectReflects(
  hook: DioramaTestHook,
  h: Harness,
  cmd: Cmd,
  before: readonly Piece[],
  piece: Piece | null,
  tile: Tile | null,
  r: { ok: boolean; id?: string },
): void {
  const state = hook.getState();
  expect(state.pieces).toEqual(h.store.getState().pieces);
  if (!r.ok) {
    expect(state.pieces).toEqual(before);
    return;
  }
  const find = (id: string) => state.pieces.find((p) => p.id === id);
  switch (cmd.kind) {
    case 'place': {
      expect(state.pieces).toHaveLength(before.length + 1);
      const added = find(r.id!);
      expect(added).toMatchObject({ type: cmd.type, gridX: tile!.gridX, gridZ: tile!.gridZ });
      break;
    }
    case 'move':
      expect(find(piece!.id)).toEqual({ ...piece!, gridX: tile!.gridX, gridZ: tile!.gridZ });
      break;
    case 'rotate':
      expect(find(piece!.id)).toEqual({ ...piece!, rotation: nextRotation(piece!.rotation) });
      break;
    case 'remove':
      expect(find(piece!.id)).toBeUndefined();
      expect(state.pieces).toHaveLength(before.length - 1);
      break;
  }
  expect(state.isDirty).toBe(true);
}

// ---------------------------------------------------------------------------
// Property
// ---------------------------------------------------------------------------

describe('Property 20: Test hook and UI paths are equivalent', () => {
  it('hook calls and UI gestures give the same results, pieces and sounds (apart from pickup)', () => {
    /** Outcome kinds met across all runs, so the property is not passing vacuously. */
    const seen = new Set<string>();
    fc.assert(
      fc.property(
        arbBoardWithHistory({ maxSteps: 25 }),
        fc.array(arbCmd, { minLength: 1, maxLength: 20 }),
        (board, cmds) => {
          const hookH = createHarness({ start: 'playfield' });
          const uiH = createHarness({ start: 'playfield' });
          let ui: UiDriver | null = null;
          try {
            for (const step of board.steps) {
              expect(replay(hookH.store, step.request).ok).toBe(true);
              expect(replay(uiH.store, step.request).ok).toBe(true);
            }
            expect(uiH.store.getState().pieces).toEqual(hookH.store.getState().pieces);
            expect(uiH.store.getState().pieces).toEqual(board.pieces);
            hookH.audio.clearLog();
            uiH.audio.clearLog();

            const hook = createTestHook({ store: hookH.store, audio: hookH.audio, train: hookH.train });
            ui = createUiDriver(uiH);

            for (const cmd of cmds) {
              const before = hookH.store.getState().pieces;
              const piece = cmd.kind === 'place' || before.length === 0 ? null : before[cmd.pick % before.length]!;
              if (cmd.kind !== 'place' && piece === null) continue;
              const tile = cmd.kind === 'place' || cmd.kind === 'move' ? resolveTarget(cmd.target, before) : null;

              let uiOutcome: UiOutcome;
              switch (cmd.kind) {
                case 'place':
                  uiOutcome = ui.place(cmd.type, tile!, cmd.preferTool);
                  break;
                case 'move':
                  uiOutcome = ui.move(piece!, tile!);
                  break;
                case 'rotate':
                  uiOutcome = ui.rotate(piece!);
                  break;
                case 'remove':
                  uiOutcome = ui.remove(piece!);
                  break;
              }
              if (uiOutcome.kind === 'blocked') {
                seen.add('blocked');
                continue;
              }

              const logBefore = hookH.audio.log.length;
              const hookResult = runHook(hook, cmd, piece, tile);
              seen.add(`${cmd.kind}:${hookResult.ok ? 'ok' : 'rejected'}`);
              if (hookH.audio.log.slice(logBefore).includes('snap')) seen.add('snap');
              expectReflects(hook, hookH, cmd, before, piece, tile, hookResult);

              expect(shape(uiOutcome.result)).toEqual(shape(hookResult));
              expect(uiH.store.getState().pieces).toEqual(hookH.store.getState().pieces);
              expect(selectConnections(uiH.store.getState())).toEqual(hook.getConnections());
              expect(uiH.audio.getLog().filter((e) => e !== 'pickup')).toEqual(hook.getSoundLog());
            }
            // Both stores issued the same ids from their identical seeds.
            expect(uiH.ids.issued()).toEqual(hookH.ids.issued());
          } finally {
            ui?.controller.detach();
            hookH.dispose();
            uiH.dispose();
          }
        },
      ),
      { numRuns: 100 },
    );
    for (const kind of ['place:ok', 'place:rejected', 'move:ok', 'move:rejected', 'rotate:ok', 'remove:ok', 'snap']) {
      expect(seen, `no case covered ${kind}`).toContain(kind);
    }
  });
});
