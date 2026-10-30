// Feature: track-diorama-builder, Property 11: Rejected actions change nothing
/**
 * **Validates: Requirements 11.4, 11.10, 12.3, 14.10, 16.11, 25.7, 35.8**
 *
 * Property 11: *For any* store state and any build request that `applyBuild`
 * rejects, the store's `pieces`, `isDirty`, `history` and connections are
 * identical before and after the call, and the only sound logged is a single
 * `invalid`.
 *
 * Store states: a real store (`createHarness`) built by replaying a reachable
 * board (`arbBoardWithHistory`) through the store's own build actions, then
 * varied with 0 to 3 undos (so the redo stack is not empty), an optional save
 * (so `isDirty` can be false with history present), an optional selection and
 * an optional switch to Play mode (when a station exists).
 *
 * Requests: `arbRequest` aimed at the board's ids and tiles, each sent either
 * straight to the store action (`placePiece`, `movePiece`, `rotatePiece`,
 * `removePiece`, as the test hook does) or through the UI drag path
 * (`beginDrag`, `setDragTile`, `drop`) when a drag can start. The oracle is
 * `applyBuild` on the store's current pieces and mode with the same request
 * the store sends; an off-grid drop is a rejection (`out_of_bounds`). Accepted
 * requests are applied too, so later requests meet varied states. Every
 * rejected request is checked against the property.
 */
import { afterEach, describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { applyBuild, type BuildOutcome, type BuildRequest } from '@/domain/placement';
import { getConnections } from '@/domain/connections';
import { isPieceType } from '@/domain/catalogue';
import type { Piece, PieceType, Tile } from '@/domain/types';
import type { AppStore } from '@/store/createAppStore';
import { createHarness, disposeHarnesses, type Harness } from './harness';
import {
  arbBoardWithHistory,
  arbRequest,
  boardTiles,
  type AppliedStep,
  type BoardWithHistory,
} from '../arbitraries';

afterEach(() => disposeHarnesses());

/** An id generator for the oracle that never touches the store's counter. */
const oracleId = () => 'oracle-id';

/** Replays accepted placement-engine requests through the store's build actions. */
function replay(store: AppStore, steps: readonly AppliedStep[]): void {
  for (const { request } of steps) {
    const s = store.getState();
    let result;
    switch (request.kind) {
      case 'place':
        result = s.placePiece(request.type, request.gridX, request.gridZ, {
          rotation: request.rotation as never,
          autoAdjust: request.autoAdjust,
        });
        break;
      case 'move':
        result = s.movePiece(request.id, request.gridX, request.gridZ, request.rotation);
        break;
      case 'rotate':
        result = s.rotatePiece(request.id);
        break;
      case 'remove':
        result = s.removePiece(request.id);
        break;
    }
    if (!result.ok) throw new Error(`replay: an accepted request was rejected (${result.reason})`);
  }
}

type Sent = {
  /** What the placement engine predicts for the call the store makes. */
  expected: BuildOutcome;
  /** Sound-log length just before the call that commits (or rejects) the request. */
  logStart: number;
  /** Runs that call and returns its result. */
  commit: () => { ok: boolean; reason?: string } | null;
};

/** Plans a request as a direct store action (the test hook path). */
function planDirect(h: Harness, request: BuildRequest): Sent {
  const s = h.store.getState();
  const ctx = { pieces: s.pieces, mode: s.mode, newId: oracleId };
  const logStart = h.audio.log.length;
  switch (request.kind) {
    case 'place': {
      const rotation = request.rotation;
      const autoAdjust = request.autoAdjust;
      return {
        expected: applyBuild(ctx, { kind: 'place', type: request.type, gridX: request.gridX, gridZ: request.gridZ, rotation, autoAdjust }),
        logStart,
        commit: () => s.placePiece(request.type, request.gridX, request.gridZ, { rotation: rotation as never, autoAdjust }),
      };
    }
    case 'move':
      return {
        expected: applyBuild(ctx, { kind: 'move', id: request.id, gridX: request.gridX, gridZ: request.gridZ, rotation: request.rotation }),
        logStart,
        commit: () => s.movePiece(request.id, request.gridX, request.gridZ, request.rotation),
      };
    case 'rotate':
      return { expected: applyBuild(ctx, request), logStart, commit: () => s.rotatePiece(request.id) };
    case 'remove':
      return { expected: applyBuild(ctx, request), logStart, commit: () => s.removePiece(request.id) };
  }
}

/**
 * Plans a place or move request through the UI drag path. Returns null when no
 * drag can start (Play mode, unknown type or id, station limit), in which case
 * the caller uses the direct path. The pickup sound of `beginDrag` comes before
 * `logStart`; the property is about the drop that commits the request.
 */
function planDrag(h: Harness, request: BuildRequest): Sent | null {
  if (request.kind !== 'place' && request.kind !== 'move') return null;
  const s = h.store.getState();
  let started: boolean;
  if (request.kind === 'place') {
    if (!isPieceType(request.type)) return null;
    started = s.beginDrag({ source: 'palette', type: request.type as PieceType });
  } else {
    if (typeof request.id !== 'string') return null;
    started = s.beginDrag({ source: 'board', pieceId: request.id });
  }
  if (!started) return null;
  h.store.getState().setDragTile({ gridX: request.gridX, gridZ: request.gridZ } as Tile);

  const now = h.store.getState();
  const drag = now.drag!;
  const ctx = { pieces: now.pieces, mode: now.mode, newId: oracleId };
  let expected: BuildOutcome;
  if (drag.tile === null) expected = { ok: false, reason: 'out_of_bounds' };
  else if (drag.source === 'palette') {
    expected = applyBuild(ctx, {
      kind: 'place', type: drag.type, gridX: drag.tile.gridX, gridZ: drag.tile.gridZ, rotation: drag.rotation, autoAdjust: true,
    });
  } else {
    expected = applyBuild(ctx, {
      kind: 'move', id: drag.pieceId, gridX: drag.tile.gridX, gridZ: drag.tile.gridZ, rotation: drag.rotation,
    });
  }
  return { expected, logStart: h.audio.log.length, commit: () => h.store.getState().drop() };
}

type Case = {
  board: BoardWithHistory;
  undos: number;
  save: boolean;
  selectPick: number | null;
  play: boolean;
  requests: Array<{ request: BuildRequest; viaDrag: boolean }>;
};

const arbCase: fc.Arbitrary<Case> = arbBoardWithHistory({ maxSteps: 30 }).chain((board) =>
  fc.record({
    board: fc.constant(board),
    undos: fc.nat({ max: 3 }),
    save: fc.boolean(),
    selectPick: fc.option(fc.nat(), { nil: null }),
    play: fc.boolean(),
    requests: fc.array(
      fc.record({
        request: arbRequest(board.pieces.map((p) => p.id), boardTiles(board.pieces)),
        viaDrag: fc.boolean(),
      }),
      { minLength: 1, maxLength: 12 },
    ),
  }),
);

/** A board built from accepted requests, in the form `arbBoardWithHistory` produces. */
function fixedBoard(requests: readonly BuildRequest[]): BoardWithHistory {
  let n = 1;
  const newId = () => `p${n++}`;
  let pieces: Piece[] = [];
  const steps: AppliedStep[] = [];
  for (const request of requests) {
    const outcome = applyBuild({ pieces, mode: 'build', newId }, request);
    if (!outcome.ok) throw new Error(`fixedBoard: a request was rejected (${outcome.reason})`);
    pieces = outcome.pieces;
    steps.push({ request, outcome });
  }
  return { pieces, steps, nextIdStart: n };
}

/** p1 straight at (5, 5), p2 house at (8, 8), p3 station at (5, 6). */
const FIXED_BOARD = fixedBoard([
  { kind: 'place', type: 'straight', gridX: 5, gridZ: 5, rotation: 0, autoAdjust: false },
  { kind: 'place', type: 'house', gridX: 8, gridZ: 8, rotation: 0, autoAdjust: false },
  { kind: 'place', type: 'station', gridX: 5, gridZ: 6, rotation: 0, autoAdjust: false },
]);

const direct = (request: BuildRequest) => ({ request, viaDrag: false });
const dragged = (request: BuildRequest) => ({ request, viaDrag: true });

/**
 * Fixed cases that produce every rejection reason for every seed, with
 * `on_track`, `occupied` and `out_of_bounds` on both the direct and the drag
 * path (a drag cannot start in Play mode or for a second station, so
 * `play_mode` and `station_limit` are direct only). They are values of
 * `arbCase` (at most 12 requests, at most 3 undos).
 */
const COVERAGE_CASES: Case[] = [
  {
    board: FIXED_BOARD,
    undos: 0,
    save: false,
    selectPick: null,
    play: false,
    requests: [
      direct({ kind: 'place', type: 'house', gridX: 5, gridZ: 5, autoAdjust: true }), // on_track
      direct({ kind: 'move', id: 'p2', gridX: 5, gridZ: 6 }), // on_track
      direct({ kind: 'place', type: 'straight', gridX: 8, gridZ: 8, autoAdjust: false }), // occupied
      direct({ kind: 'place', type: 'station', gridX: 10, gridZ: 10, autoAdjust: true }), // station_limit
      direct({ kind: 'move', id: 'nope', gridX: 1, gridZ: 1 }), // not_found
      direct({ kind: 'place', type: 'house', gridX: 16, gridZ: 0, autoAdjust: false }), // out_of_bounds
      dragged({ kind: 'place', type: 'house', gridX: 5, gridZ: 5, autoAdjust: true }), // on_track
      dragged({ kind: 'move', id: 'p2', gridX: 5, gridZ: 5 }), // on_track
      dragged({ kind: 'place', type: 'straight', gridX: 8, gridZ: 8, autoAdjust: true }), // occupied
      dragged({ kind: 'move', id: 'p1', gridX: 8, gridZ: 8 }), // occupied
      dragged({ kind: 'place', type: 'straight', gridX: 16, gridZ: 3, autoAdjust: true }), // out_of_bounds
      dragged({ kind: 'move', id: 'p1', gridX: 3, gridZ: -1 }), // out_of_bounds
    ],
  },
  {
    board: FIXED_BOARD,
    undos: 0,
    save: true,
    selectPick: 0,
    play: true,
    requests: [
      direct({ kind: 'place', type: 'straight', gridX: 1, gridZ: 1, autoAdjust: true }), // play_mode
      dragged({ kind: 'place', type: 'house', gridX: 2, gridZ: 2, autoAdjust: false }), // play_mode
      direct({ kind: 'move', id: 'p1', gridX: 3, gridZ: 3 }), // play_mode
      dragged({ kind: 'move', id: 'p2', gridX: 4, gridZ: 4 }), // play_mode
      direct({ kind: 'rotate', id: 'p1' }), // play_mode
      direct({ kind: 'remove', id: 'p3' }), // play_mode
    ],
  },
  {
    // Two undos remove the station and the house, so the redo stack is not empty.
    board: FIXED_BOARD,
    undos: 2,
    save: true,
    selectPick: 0,
    play: false,
    requests: [
      direct({ kind: 'rotate', id: 'nope' }), // not_found
      direct({ kind: 'remove', id: 'p999999' }), // not_found
      direct({ kind: 'place', type: 'rocket', gridX: 1, gridZ: 1, autoAdjust: false }), // not_found
      direct({ kind: 'place', type: 'straight', gridX: 1, gridZ: 1, rotation: 45, autoAdjust: false }), // not_found
      direct({ kind: 'place', type: 'pineTree', gridX: 5, gridZ: 5, autoAdjust: false }), // on_track
      dragged({ kind: 'place', type: 'roundTree', gridX: 5, gridZ: 5, autoAdjust: true }), // on_track
      direct({ kind: 'place', type: 'hill', gridX: 15, gridZ: 2, autoAdjust: false }), // out_of_bounds
      direct({ kind: 'move', id: 'p1', gridX: 1.5, gridZ: 2 }), // out_of_bounds
    ],
  },
];

describe('Property 11: Rejected actions change nothing', () => {
  it('leaves pieces, isDirty, history and connections unchanged and logs one invalid', () => {
    let rejected = 0;
    let dragRejected = 0;
    const reasons = new Set<string>();
    // fast-check runs the `examples` first, so the first runs are COVERAGE_CASES.
    let runs = 0;
    const exampleDirectReasons = new Set<string>();
    const exampleDragReasons = new Set<string>();
    fc.assert(
      fc.property(arbCase, ({ board, undos, save, selectPick, play, requests }) => {
        const isExample = runs++ < COVERAGE_CASES.length;
        const h = createHarness({ start: 'playfield' });
        try {
          replay(h.store, board.steps);
          expect(h.store.getState().pieces).toEqual(board.pieces);

          for (let i = 0; i < undos; i++) h.store.getState().undo();
          if (save) h.store.getState().save('manual');
          const pieces0 = h.store.getState().pieces;
          if (selectPick !== null && pieces0.length > 0) {
            h.store.getState().selectPiece(pieces0[selectPick % pieces0.length]!.id);
          }
          if (play) h.store.getState().setMode('play');

          for (const { request, viaDrag } of requests) {
            const dragPlan = viaDrag ? planDrag(h, request) : null;
            const sent = { ...(dragPlan ?? planDirect(h, request)), viaDrag: dragPlan !== null };

            const before = h.store.getState();
            const piecesJson = JSON.stringify(before.pieces);
            const history = structuredClone(before.history);
            const isDirty = before.isDirty;
            const connections = getConnections(before.pieces);

            const result = sent.commit();
            if (sent.expected.ok) continue;
            rejected++;
            reasons.add(sent.expected.reason);
            if (sent.viaDrag) dragRejected++;
            if (isExample) (sent.viaDrag ? exampleDragReasons : exampleDirectReasons).add(sent.expected.reason);

            const after = h.store.getState();
            expect(result).toEqual({ ok: false, reason: sent.expected.reason });
            expect(JSON.stringify(after.pieces)).toBe(piecesJson);
            expect(after.isDirty).toBe(isDirty);
            expect(after.history).toEqual(history);
            expect(getConnections(after.pieces)).toEqual(connections);
            expect(h.audio.log.slice(sent.logStart)).toEqual(['invalid']);
          }
        } finally {
          h.dispose();
        }
      }),
      { numRuns: 100, examples: COVERAGE_CASES.map((c): [Case] => [c]) },
    );
    // The fixed cases alone guarantee every reason on the direct path and the
    // footprint reasons on the drag path, whatever the seed. (The examples are
    // counted within numRuns.)
    expect(runs).toBe(100);
    expect([...exampleDirectReasons].sort()).toEqual(
      ['not_found', 'occupied', 'on_track', 'out_of_bounds', 'play_mode', 'station_limit'],
    );
    expect([...exampleDragReasons].sort()).toEqual(['occupied', 'on_track', 'out_of_bounds']);
    // The generators must actually produce rejected requests, for every reason
    // a build request can have, on both paths.
    expect(rejected).toBeGreaterThan(50);
    expect(dragRejected).toBeGreaterThan(0);
    expect([...reasons].sort()).toEqual(
      ['not_found', 'occupied', 'on_track', 'out_of_bounds', 'play_mode', 'station_limit'],
    );
  });
});
