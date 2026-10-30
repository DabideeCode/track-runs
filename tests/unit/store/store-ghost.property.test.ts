// Feature: track-diorama-builder, Property 15: Ghost tint agrees with the drop result
/**
 * **Validates: Requirements 11.5, 11.6**
 *
 * Property 15: *For any* board, dragged type (or dragged piece) and target
 * tile, `drag.valid` is true exactly when dropping there would be accepted by
 * `applyBuild`.
 *
 * The store is real (harness from task 10.5). Each case replays a reachable
 * board (`arbBoardWithHistory`) through the store's build actions, then runs
 * 1 to 5 drags one after another, so later drags meet the boards that earlier
 * drops produced. Each drag is a palette drag of any of the 12 types or a
 * board drag of a placed piece, optionally started with an initial tile, then
 * a random mix of target-tile changes (`setDragTile` with in-grid tiles, tiles
 * on or next to pieces, hill anchors on the last row or column, `null`, and
 * off-grid or non-integer coordinates) and R presses (`handleKeyDown`), and it
 * ends with a drop or a cancel.
 *
 * After every step the oracle is `applyBuild` on the store's current pieces
 * and mode with the request the drop would send: `place` with the drag type,
 * the drag rotation and auto-adjust on for a palette drag; `move` with the
 * piece id and the drag rotation for a board drag. With no target tile (off
 * the grid) the drop is a rejection. A target given off the grid must also be
 * rejected by `applyBuild` with those raw coordinates. Every drop is then
 * performed and its `ok` must equal the `drag.valid` shown just before it.
 */
import { afterEach, describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { applyBuild, type BuildRequest } from '@/domain/placement';
import type { PieceType, Tile } from '@/domain/types';
import { handleKeyDown } from '@/input/useKeyboardShortcuts';
import type { AppState } from '@/store/types';
import {
  PIECE_TYPES,
  arbBoardWithHistory,
  boardTiles,
  type AppliedStep,
} from '../arbitraries';
import { createHarness, disposeHarnesses, type Harness } from './harness';

afterEach(() => disposeHarnesses());

/** An id generator for the oracle that never touches the store's counter. */
const oracleId = () => 'oracle-id';

const noKeys = { setKeys: () => {}, clearKeys: () => {} };

// ---------------------------------------------------------------------------
// Replaying the board
// ---------------------------------------------------------------------------

function replay(h: Harness, steps: readonly AppliedStep[]): void {
  for (const { request: q } of steps) {
    const s = h.store.getState();
    const r =
      q.kind === 'place'
        ? s.placePiece(q.type, q.gridX, q.gridZ, { rotation: q.rotation as never, autoAdjust: q.autoAdjust })
        : q.kind === 'move'
          ? s.movePiece(q.id, q.gridX, q.gridZ, q.rotation)
          : q.kind === 'rotate'
            ? s.rotatePiece(q.id)
            : s.removePiece(q.id);
    if (!r.ok) throw new Error(`replay: an accepted request was rejected (${r.reason})`);
  }
}

// ---------------------------------------------------------------------------
// Oracle
// ---------------------------------------------------------------------------

/** The request `drop()` sends for the current drag at tile (gridX, gridZ). */
function dropRequest(s: AppState, gridX: unknown, gridZ: unknown): BuildRequest {
  const d = s.drag!;
  return d.source === 'palette'
    ? { kind: 'place', type: d.type, gridX, gridZ, rotation: d.rotation, autoAdjust: true }
    : { kind: 'move', id: d.pieceId, gridX, gridZ, rotation: d.rotation };
}

/** Would dropping now be accepted? Off the grid (no tile) is a rejection. */
function wouldAccept(s: AppState): boolean {
  const d = s.drag!;
  if (d.tile === null) return false;
  return applyBuild({ pieces: s.pieces, mode: s.mode, newId: oracleId }, dropRequest(s, d.tile.gridX, d.tile.gridZ)).ok;
}

const isGridInt = (v: unknown) => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 15;

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/** A target as given by the pointer layer: a tile, possibly off the grid or malformed, or null. */
type RawTile = { gridX: unknown; gridZ: unknown } | null;

function arbTarget(hot: readonly Tile[]): fc.Arbitrary<RawTile> {
  const coord = fc.integer({ min: 0, max: 15 });
  const bad = fc.constantFrom<unknown>(-1, 16, 1.5, -0.5, Number.NaN, Number.POSITIVE_INFINITY, '3', undefined);
  const options: Array<fc.WeightedArbitrary<RawTile>> = [
    { arbitrary: fc.record({ gridX: coord, gridZ: coord }), weight: 4 },
    // A hill anchored here has tiles off the grid.
    { arbitrary: fc.record({ gridX: fc.constant(15), gridZ: coord }), weight: 1 },
    { arbitrary: fc.record({ gridX: coord, gridZ: fc.constant(15) }), weight: 1 },
    { arbitrary: fc.constant(null), weight: 1 },
    {
      arbitrary: fc.oneof(
        fc.record({ gridX: bad, gridZ: coord }),
        fc.record({ gridX: coord, gridZ: bad }),
      ),
      weight: 1,
    },
  ];
  if (hot.length > 0) {
    // On or next to a piece; may step off the grid at the edges.
    const near = fc
      .tuple(fc.constantFrom(...hot), fc.integer({ min: -1, max: 1 }), fc.integer({ min: -1, max: 1 }))
      .map(([t, dx, dz]) => ({ gridX: t.gridX + dx, gridZ: t.gridZ + dz }));
    options.push({ arbitrary: near, weight: 6 });
  }
  return fc.oneof(...options);
}

type Op = { kind: 'tile'; tile: RawTile } | { kind: 'r' };

interface DragPlan {
  source: 'palette' | 'board';
  type: PieceType;
  pick: number;
  start: RawTile | undefined;
  ops: Op[];
  end: 'drop' | 'cancel';
}

const arbCase = arbBoardWithHistory({ maxSteps: 30 }).chain((board) => {
  const target = arbTarget(boardTiles(board.pieces));
  const op: fc.Arbitrary<Op> = fc.oneof(
    { arbitrary: target.map((tile): Op => ({ kind: 'tile', tile })), weight: 3 },
    { arbitrary: fc.constant<Op>({ kind: 'r' }), weight: 1 },
  );
  const plan: fc.Arbitrary<DragPlan> = fc.record({
    source: fc.constantFrom<'palette' | 'board'>('palette', 'board'),
    type: fc.constantFrom(...PIECE_TYPES),
    pick: fc.nat(),
    start: fc.option(target, { nil: undefined }),
    ops: fc.array(op, { maxLength: 8 }),
    end: fc.oneof(
      { arbitrary: fc.constant<'drop' | 'cancel'>('drop'), weight: 3 },
      { arbitrary: fc.constant<'drop' | 'cancel'>('cancel'), weight: 1 },
    ),
  });
  return fc.record({ board: fc.constant(board), drags: fc.array(plan, { minLength: 1, maxLength: 5 }) });
});

// ---------------------------------------------------------------------------
// Property 15
// ---------------------------------------------------------------------------

describe('Property 15: Ghost tint agrees with the drop result', () => {
  it('drag.valid is true exactly when the drop would be accepted by applyBuild', () => {
    const seen = {
      paletteValid: 0, paletteInvalid: 0, boardValid: 0, boardInvalid: 0,
      offGrid: 0, rotatedValidityChecks: 0, drops: 0,
    };

    fc.assert(
      fc.property(arbCase, ({ board, drags }) => {
        const h = createHarness({ start: 'playfield' });
        try {
          replay(h, board.steps);
          expect(h.store.getState().pieces).toEqual(board.pieces);
          const st = () => h.store.getState();

          /** Checks the property for the current drag state. */
          const check = (given: RawTile | undefined, rotated: boolean) => {
            const s = st();
            const d = s.drag!;
            const expected = wouldAccept(s);
            expect(d.valid).toBe(expected);

            if (given !== undefined) {
              const offGrid = given === null || !isGridInt(given.gridX) || !isGridInt(given.gridZ);
              if (offGrid) {
                seen.offGrid++;
                expect(d.tile).toBeNull();
                if (given !== null) {
                  // The raw off-grid target is one `applyBuild` itself rejects.
                  const raw = dropRequest(s, given.gridX, given.gridZ);
                  expect(applyBuild({ pieces: s.pieces, mode: s.mode, newId: oracleId }, raw).ok).toBe(false);
                }
              } else {
                expect(d.tile).toEqual({ gridX: given.gridX, gridZ: given.gridZ });
              }
            }

            if (rotated) seen.rotatedValidityChecks++;
            const key = `${d.source}${expected ? 'Valid' : 'Invalid'}` as const;
            seen[key]++;
          };

          for (const plan of drags) {
            const pieces = st().pieces;
            const started =
              plan.source === 'palette'
                ? st().beginDrag({ source: 'palette', type: plan.type, tile: plan.start as Tile | null | undefined })
                : pieces.length > 0
                  ? st().beginDrag({
                      source: 'board',
                      pieceId: pieces[plan.pick % pieces.length]!.id,
                      tile: plan.start as Tile | null | undefined,
                    })
                  : false;
            if (!started) {
              expect(st().drag).toBeNull();
              continue;
            }
            check(plan.start, false);

            let rotated = false;
            for (const o of plan.ops) {
              if (o.kind === 'r') {
                expect(handleKeyDown({ key: 'r' }, { store: h.store, train: noKeys })).toBe('rotateDrag');
                rotated = true;
                check(undefined, true);
              } else {
                st().setDragTile(o.tile as Tile | null);
                check(o.tile, rotated);
              }
            }

            if (plan.end === 'cancel') {
              expect(st().cancelDrag()).toBe(true);
              continue;
            }
            const shown = st().drag!.valid;
            const result = st().drop();
            seen.drops++;
            expect(result).not.toBeNull();
            expect(result!.ok).toBe(shown);
            expect(st().drag).toBeNull();
          }
        } finally {
          h.dispose();
        }
      }),
      { numRuns: 100 },
    );

    // The generators must reach both tints on both drag sources, off-grid
    // targets, checks after R presses, and real drops.
    expect(seen.paletteValid).toBeGreaterThan(0);
    expect(seen.paletteInvalid).toBeGreaterThan(0);
    expect(seen.boardValid).toBeGreaterThan(0);
    expect(seen.boardInvalid).toBeGreaterThan(0);
    expect(seen.offGrid).toBeGreaterThan(0);
    expect(seen.rotatedValidityChecks).toBeGreaterThan(0);
    expect(seen.drops).toBeGreaterThan(0);
  });
});
