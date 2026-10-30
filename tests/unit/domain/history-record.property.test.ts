// Feature: track-diorama-builder, Property 16: History records one entry per effective action
/**
 * **Validates: Requirements 13.1, 13.2, 13.5**
 *
 * For any sequence of build requests in Build mode, the undo stack grows by one
 * for each accepted request that changes `pieces` and by zero for rejected
 * requests and same-tile moves, never holds more than 50 entries (dropping the
 * oldest first), and the redo stack is emptied by any accepted request that
 * changes `pieces`.
 *
 * The test drives `applyBuild` and `record` the way the store does: an outcome
 * with a non-null `entry` is recorded, everything else is not. "Effective" is
 * judged independently of `entry`, by comparing `pieces` before and after, so
 * the test also checks that `applyBuild` returns an entry exactly when the board
 * changes. Undo and redo are interleaved so the redo stack is often non-empty
 * when a new action arrives. A reference model (a plain list of the recorded
 * entries, trimmed from the front) checks the exact contents and order of both
 * stacks, which covers "oldest dropped first". Some requests run in Play mode
 * and must be rejected with `play_mode` and no entry.
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { applyBuild, type BuildOutcome, type BuildRequest } from '@/domain/placement';
import { HISTORY_LIMIT, emptyHistory, record, redo, undo, type History, type HistoryEntry } from '@/domain/history';
import type { Piece, PieceType, Rotation } from '@/domain/types';
import { ID_GEN, PIECE_TYPES, ROTATIONS, arbBoard, arbRequest, boardTiles } from '../arbitraries';

// ---------------------------------------------------------------------------
// Operations, resolved against the current board when they run
// ---------------------------------------------------------------------------

type Op =
  | { kind: 'raw'; request: BuildRequest }
  | { kind: 'playMode'; request: BuildRequest }
  | { kind: 'place'; type: PieceType; x: number; z: number; rotation: Rotation | undefined; autoAdjust: boolean }
  | { kind: 'move'; pick: number; dx: number; dz: number; rotation: Rotation | undefined }
  | { kind: 'sameTileMove'; pick: number; withRotation: boolean }
  | { kind: 'rotate'; pick: number }
  | { kind: 'remove'; pick: number }
  /** Always effective: rotates a piece, or places a straight on an empty board. */
  | { kind: 'grow'; pick: number }
  | { kind: 'undo' }
  | { kind: 'redo' };

const arbMaybeRotation = fc.option(fc.constantFrom(...ROTATIONS), { nil: undefined });

function arbOp(ids: readonly string[], tiles: Piece[]): fc.Arbitrary<Op> {
  const hot = boardTiles(tiles);
  return fc.oneof(
    { arbitrary: arbRequest(ids, hot).map((request): Op => ({ kind: 'raw', request })), weight: 4 },
    { arbitrary: arbRequest(ids, hot).map((request): Op => ({ kind: 'playMode', request })), weight: 1 },
    {
      arbitrary: fc
        .record({
          type: fc.constantFrom(...PIECE_TYPES),
          x: fc.integer({ min: 0, max: 15 }),
          z: fc.integer({ min: 0, max: 15 }),
          rotation: arbMaybeRotation,
          autoAdjust: fc.boolean(),
        })
        .map((r): Op => ({ kind: 'place', ...r })),
      weight: 4,
    },
    {
      arbitrary: fc
        .record({
          pick: fc.nat(),
          dx: fc.integer({ min: -2, max: 2 }),
          dz: fc.integer({ min: -2, max: 2 }),
          rotation: arbMaybeRotation,
        })
        .map((r): Op => ({ kind: 'move', ...r })),
      weight: 3,
    },
    {
      arbitrary: fc.record({ pick: fc.nat(), withRotation: fc.boolean() }).map((r): Op => ({ kind: 'sameTileMove', ...r })),
      weight: 2,
    },
    { arbitrary: fc.nat().map((pick): Op => ({ kind: 'rotate', pick })), weight: 2 },
    { arbitrary: fc.nat().map((pick): Op => ({ kind: 'remove', pick })), weight: 1 },
    { arbitrary: fc.constant<Op>({ kind: 'undo' }), weight: 2 },
    { arbitrary: fc.constant<Op>({ kind: 'redo' }), weight: 2 },
  );
}

const MISSING_ID = 'missing-id';

function pickId(pieces: readonly Piece[], pick: number): string {
  return pieces.length === 0 ? MISSING_ID : pieces[pick % pieces.length]!.id;
}

function pickPiece(pieces: readonly Piece[], pick: number): Piece | undefined {
  return pieces.length === 0 ? undefined : pieces[pick % pieces.length];
}

/** Turns a build op into a concrete request and mode for the current board. */
function resolve(op: Exclude<Op, { kind: 'undo' } | { kind: 'redo' }>, pieces: readonly Piece[]): {
  request: BuildRequest;
  mode: 'build' | 'play';
} {
  switch (op.kind) {
    case 'raw':
      return { request: op.request, mode: 'build' };
    case 'playMode':
      return { request: op.request, mode: 'play' };
    case 'place': {
      const request: BuildRequest = { kind: 'place', type: op.type, gridX: op.x, gridZ: op.z, autoAdjust: op.autoAdjust };
      if (op.rotation !== undefined) request.rotation = op.rotation;
      return { request, mode: 'build' };
    }
    case 'move': {
      const p = pickPiece(pieces, op.pick);
      const request: BuildRequest = p
        ? { kind: 'move', id: p.id, gridX: p.gridX + op.dx, gridZ: p.gridZ + op.dz }
        : { kind: 'move', id: MISSING_ID, gridX: 0, gridZ: 0 };
      if (op.rotation !== undefined) request.rotation = op.rotation;
      return { request, mode: 'build' };
    }
    case 'sameTileMove': {
      const p = pickPiece(pieces, op.pick);
      if (!p) return { request: { kind: 'move', id: MISSING_ID, gridX: 0, gridZ: 0 }, mode: 'build' };
      const request: BuildRequest = { kind: 'move', id: p.id, gridX: p.gridX, gridZ: p.gridZ };
      if (op.withRotation) request.rotation = p.rotation;
      return { request, mode: 'build' };
    }
    case 'rotate':
      return { request: { kind: 'rotate', id: pickId(pieces, op.pick) }, mode: 'build' };
    case 'remove':
      return { request: { kind: 'remove', id: pickId(pieces, op.pick) }, mode: 'build' };
    case 'grow':
      return pieces.length > 0
        ? { request: { kind: 'rotate', id: pickId(pieces, op.pick) }, mode: 'build' }
        : {
            request: { kind: 'place', type: 'straight', gridX: 0, gridZ: 0, autoAdjust: false },
            mode: 'build',
          };
  }
}

// ---------------------------------------------------------------------------
// Runner with a reference model
// ---------------------------------------------------------------------------

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

interface RunStats {
  effective: number;
  maxPast: number;
}

function run(start: Piece[], ops: readonly Op[]): RunStats {
  const newId = ID_GEN('n', 1);
  let pieces: Piece[] = start;
  let history: History = emptyHistory();
  // Reference model: the recorded entries, newest last.
  let modelPast: HistoryEntry[] = [];
  let modelFuture: HistoryEntry[] = [];
  const stats: RunStats = { effective: 0, maxPast: 0 };

  for (const op of ops) {
    const piecesBefore = clone(pieces);
    const historyBefore = clone(history);

    if (op.kind === 'undo' || op.kind === 'redo') {
      const step = op.kind === 'undo' ? undo(history, pieces) : redo(history, pieces);
      // Undo and redo never mutate their inputs.
      expect(pieces).toEqual(piecesBefore);
      expect(history).toEqual(historyBefore);
      const source = op.kind === 'undo' ? modelPast : modelFuture;
      if (source.length === 0) {
        expect(step).toBeNull();
      } else {
        // A linear history is always consistent, so the step must apply.
        expect(step).not.toBeNull();
        const moved = source[source.length - 1]!;
        if (op.kind === 'undo') {
          modelPast = modelPast.slice(0, -1);
          modelFuture = [...modelFuture, moved];
        } else {
          modelFuture = modelFuture.slice(0, -1);
          modelPast = [...modelPast, moved];
        }
        pieces = step!.pieces;
        history = step!.history;
      }
    } else {
      const { request, mode } = resolve(op, pieces);
      const outcome: BuildOutcome = applyBuild({ pieces, mode, newId }, request);
      // applyBuild never mutates the board.
      expect(pieces).toEqual(piecesBefore);

      if (mode === 'play') {
        expect(outcome).toEqual({ ok: false, reason: 'play_mode' });
      }

      if (!outcome.ok) {
        // Rejected: nothing to record, history untouched.
        expect(outcome).not.toHaveProperty('entry');
      } else {
        const changed = JSON.stringify(outcome.pieces) !== JSON.stringify(piecesBefore);
        // An entry exists exactly when the board changed (13.1: none for a same-tile move).
        if (changed) expect(outcome.entry).not.toBeNull();
        else expect(outcome.entry).toBeNull();

        if (outcome.entry !== null) {
          const entryBefore = clone(outcome.entry);
          const next = record(history, outcome.entry);
          // record never mutates the history or the entry it is given.
          expect(history).toEqual(historyBefore);
          expect(outcome.entry).toEqual(entryBefore);

          // 13.1: one more entry, unless at the cap (13.2), where the size stays the same.
          const expectedLength = Math.min(historyBefore.past.length + 1, HISTORY_LIMIT);
          expect(next.past).toHaveLength(expectedLength);
          // The new entry is on top.
          expect(next.past[next.past.length - 1]).toEqual(entryBefore);
          // 13.2: only the oldest entries are dropped; the rest keep their order.
          expect(next.past).toEqual([...historyBefore.past, entryBefore].slice(-HISTORY_LIMIT));
          // 13.5: any recorded action empties the redo stack.
          expect(next.future).toEqual([]);

          modelPast = [...modelPast, entryBefore].slice(-HISTORY_LIMIT);
          modelFuture = [];
          history = next;
          stats.effective++;
        }
        pieces = outcome.pieces;
      }
    }

    // The history always matches the reference model and respects the cap.
    expect(history.past).toEqual(modelPast);
    expect(history.future).toEqual(modelFuture);
    expect(history.past.length).toBeLessThanOrEqual(HISTORY_LIMIT);
    stats.maxPast = Math.max(stats.maxPast, history.past.length);
  }
  return stats;
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** A reachable board and up to 120 mixed operations. */
const arbMixedRun = arbBoard.chain((pieces) =>
  fc
    .array(arbOp(pieces.map((p) => p.id), pieces), { maxLength: 120 })
    .map((ops) => ({ pieces, ops })),
);

/**
 * A reachable board and a long run: 85 to 100 always-effective `grow` ops with
 * up to 30 mixed ops spread between them. Even if every mixed op were an undo,
 * the undo stack would reach 85 − 30 = 55 entries, so the 50-entry cap is hit.
 */
const arbLongRun = arbBoard.chain((pieces) =>
  fc
    .tuple(
      fc.array(fc.nat(), { minLength: 85, maxLength: 100 }),
      fc.array(arbOp(pieces.map((p) => p.id), pieces), { maxLength: 30 }),
      fc.nat(),
    )
    .map(([growPicks, mixed, offset]) => {
      // Mixed op k goes after grow op (offset + 3k) mod n, spreading them through the run.
      const after = new Map<number, Op[]>();
      mixed.forEach((op, k) => {
        const at = (offset + 3 * k) % growPicks.length;
        after.set(at, [...(after.get(at) ?? []), op]);
      });
      const ops: Op[] = [];
      growPicks.forEach((pick, i) => {
        ops.push({ kind: 'grow', pick });
        ops.push(...(after.get(i) ?? []));
      });
      return { pieces, ops };
    }),
);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Property 16: History records one entry per effective action', () => {
  it('retains at least the 20 most recent actions', () => {
    expect(HISTORY_LIMIT).toBeGreaterThanOrEqual(20);
  });

  it('records exactly one entry per effective action over mixed sequences with undo and redo', () => {
    fc.assert(
      fc.property(arbMixedRun, ({ pieces, ops }) => {
        const before = clone(pieces);
        run(pieces, ops);
        expect(pieces).toEqual(before);
      }),
      { numRuns: 100 },
    );
  });

  it('caps the undo stack at the limit and drops the oldest entries first on long sequences', () => {
    fc.assert(
      fc.property(arbLongRun, ({ pieces, ops }) => {
        const before = clone(pieces);
        const stats = run(pieces, ops);
        expect(pieces).toEqual(before);
        // The run really exercised the cap.
        expect(stats.effective).toBeGreaterThan(HISTORY_LIMIT);
        expect(stats.maxPast).toBe(HISTORY_LIMIT);
      }),
      { numRuns: 100 },
    );
  });
});
