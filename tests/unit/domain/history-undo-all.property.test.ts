// Feature: track-diorama-builder, Property 17: Undoing everything restores the start
/**
 * **Validates: Requirements 13.3, 13.6**
 *
 * For any board and any sequence of accepted build actions, undoing every
 * recorded action restores a `pieces` array deep-equal to the one before the
 * sequence, including original ids, values and order.
 *
 * Checked on the pure domain core (`applyBuild` + `record` + `undo`):
 * - start from a reachable board (`arbBoard`) with empty history;
 * - apply exactly `target` effective actions (accepted and with a history
 *   entry), drawn with `arbRequest` against the current board's ids and
 *   tiles and topped up with always-accepted requests if the draws run out,
 *   recording a deep copy of `pieces` after every action (the trajectory);
 * - undo until `undo` returns null; after k undos the pieces equal the state
 *   after n − k actions, so removed pieces come back at their original index;
 * - at the end `past` is empty, `future` holds every undone entry, and the
 *   pieces equal the start state (n ≤ HISTORY_LIMIT) or the state after
 *   n − HISTORY_LIMIT actions (n > HISTORY_LIMIT, the oldest were dropped).
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { applyBuild, type BuildRequest } from '@/domain/placement';
import { HISTORY_LIMIT, emptyHistory, record, undo, type History } from '@/domain/history';
import type { Piece } from '@/domain/types';
import { ID_GEN, arbBoard, arbRequest, boardTiles } from '../arbitraries';

const clone = (pieces: readonly Piece[]): Piece[] => JSON.parse(JSON.stringify(pieces)) as Piece[];

interface Run {
  start: Piece[];
  /** trajectory[i] is a deep copy of `pieces` after i effective actions; trajectory[0] is the start. */
  trajectory: Piece[][];
  pieces: Piece[];
  history: History;
}

/**
 * A request that is always accepted and always records an entry: rotate a
 * piece on a non-empty board (rotation never changes a footprint and always
 * changes the angle), or place a straight on an empty board.
 */
function guaranteedRequest(pieces: readonly Piece[], i: number): BuildRequest {
  if (pieces.length > 0) return { kind: 'rotate', id: pieces[i % pieces.length]!.id };
  return { kind: 'place', type: 'straight', gridX: 0, gridZ: 0, autoAdjust: false };
}

/**
 * Applies exactly `target` effective actions. First, up to `4 × target`
 * requests are drawn with `arbRequest` from the current board; rejected
 * requests and same-tile moves (entry null) are skipped. If the draws run out
 * before `target` actions are recorded (for example, an empty board where
 * every draw is rejected), the run is topped up with `guaranteedRequest`.
 */
function buildRun(start: Piece[], target: number, gen: fc.GeneratorValue): Run {
  const newId = ID_GEN('n', 1); // distinct from the board's `p…` ids
  let pieces = clone(start);
  let history = emptyHistory();
  const trajectory: Piece[][] = [clone(start)];
  const apply = (request: BuildRequest): boolean => {
    const outcome = applyBuild({ pieces, mode: 'build', newId }, request);
    if (!outcome.ok || outcome.entry === null) return false;
    history = record(history, outcome.entry);
    pieces = outcome.pieces;
    trajectory.push(clone(pieces));
    return true;
  };
  for (let attempt = 0; attempt < target * 4 && trajectory.length - 1 < target; attempt++) {
    apply(gen(arbRequest, pieces.map((p) => p.id), boardTiles(pieces)));
  }
  for (let i = 0; trajectory.length - 1 < target; i++) {
    const request = guaranteedRequest(pieces, i);
    if (!apply(request)) throw new Error(`guaranteed request rejected: ${JSON.stringify(request)}`);
  }
  return { start, trajectory, pieces, history };
}

/** Undoes until null, checking each intermediate state against the trajectory. */
function undoAllAndCheck(run: Run): void {
  const n = run.trajectory.length - 1;
  const undoable = Math.min(n, HISTORY_LIMIT);
  expect(run.history.past).toHaveLength(undoable);
  expect(run.pieces).toEqual(run.trajectory[n]);

  let { pieces, history } = run;
  let k = 0;
  for (;;) {
    const before = clone(pieces);
    const step = undo(history, pieces);
    if (step === null) break;
    // `undo` must not mutate its input.
    expect(pieces).toEqual(before);
    k++;
    pieces = step.pieces;
    history = step.history;
    expect(pieces).toEqual(run.trajectory[n - k]);
    expect(history.past).toHaveLength(undoable - k);
    expect(history.future).toHaveLength(k);
    expect(k).toBeLessThanOrEqual(undoable);
  }

  expect(k).toBe(undoable);
  expect(history.past).toEqual([]);
  expect(pieces).toEqual(run.trajectory[n - undoable]);
  if (n <= HISTORY_LIMIT) expect(pieces).toEqual(run.start);
}

describe('Property 17: Undoing everything restores the start', () => {
  it('undoing every recorded action restores the starting pieces exactly', () => {
    fc.assert(
      fc.property(arbBoard, fc.integer({ min: 1, max: HISTORY_LIMIT }), fc.gen(), (start, target, gen) => {
        const run = buildRun(start, target, gen);
        // `buildRun` tops up with always-accepted requests, so exactly
        // `target` (at least one) actions are recorded.
        expect(run.trajectory.length - 1).toBe(target);
        undoAllAndCheck(run);
      }),
      { numRuns: 100 },
    );
  }, 60_000);

  it('past the history limit, undoing everything restores the state before the last HISTORY_LIMIT actions', () => {
    fc.assert(
      fc.property(
        arbBoard,
        fc.integer({ min: HISTORY_LIMIT + 1, max: HISTORY_LIMIT + 15 }),
        fc.gen(),
        (start, target, gen) => {
          const run = buildRun(start, target, gen);
          // Exactly `target` actions, so the oldest are always dropped.
          expect(run.trajectory.length - 1).toBe(target);
          expect(run.trajectory.length - 1).toBeGreaterThan(HISTORY_LIMIT);
          undoAllAndCheck(run);
        },
      ),
      { numRuns: 100 },
    );
  }, 60_000);
});
