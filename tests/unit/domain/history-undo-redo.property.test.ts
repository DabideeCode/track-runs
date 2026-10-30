// Feature: track-diorama-builder, Property 18: Undo then redo is the identity
/**
 * **Validates: Requirements 13.4, 13.7**
 *
 * For any board, any sequence of 1 to 20 accepted build actions and any k up
 * to the number recorded, undoing k actions and then redoing k actions
 * produces a `pieces` array deep-equal to the one before the undos.
 *
 * The scenario starts from a reachable board (with an empty history), applies
 * 1 to 20 random requests through `applyBuild`, and records every accepted
 * entry with `record`, the same way the store does. Requests target the
 * board's ids and the ids the next placements will receive, so pieces placed
 * during the sequence are also moved, rotated and removed.
 *
 * Checked on top of the property statement:
 * - `past` and `future` after the k redos deep-equal the history before the
 *   undos, and one more redo returns null.
 * - A single undo then redo from any undo depth is the identity.
 * - After undos, recording a new action clears `future`, so redo returns null.
 * - No input (pieces, history, entries) is mutated: everything passed in is
 *   deep-frozen and compared against a structured clone afterwards.
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { applyBuild, type BuildRequest } from '@/domain/placement';
import { emptyHistory, record, redo, undo, type History } from '@/domain/history';
import type { Piece } from '@/domain/types';
import { arbBoardWithHistory, arbRequest, boardTiles, ID_GEN, type BoardWithHistory } from '../arbitraries';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    for (const v of Object.values(value)) deepFreeze(v);
    Object.freeze(value);
  }
  return value;
}

interface State {
  pieces: Piece[];
  history: History;
}

/** Freezes a state and returns it with a structured clone for mutation checks. */
function frozenWithSnapshot(s: State): { state: State; snapshot: State } {
  const snapshot = structuredClone(s);
  return { state: deepFreeze(s), snapshot };
}

/** Undoes `n` times; every undo must succeed. Checks that no input is mutated. */
function undoN(s: State, n: number): State {
  let cur = s;
  for (let i = 0; i < n; i++) {
    const { state, snapshot } = frozenWithSnapshot(cur);
    const step = undo(state.history, state.pieces);
    expect(step).not.toBeNull();
    expect(state).toEqual(snapshot);
    cur = { pieces: step!.pieces, history: step!.history };
  }
  return cur;
}

/** Redoes `n` times; every redo must succeed. Checks that no input is mutated. */
function redoN(s: State, n: number): State {
  let cur = s;
  for (let i = 0; i < n; i++) {
    const { state, snapshot } = frozenWithSnapshot(cur);
    const step = redo(state.history, state.pieces);
    expect(step).not.toBeNull();
    expect(state).toEqual(snapshot);
    cur = { pieces: step!.pieces, history: step!.history };
  }
  return cur;
}

/**
 * Applies requests to the base board with an empty history, recording every
 * accepted entry. Ids continue from the base board's counter, so they never
 * clash with existing ones.
 */
function buildHistory(base: BoardWithHistory, requests: readonly BuildRequest[]): State {
  const newId = ID_GEN('p', base.nextIdStart);
  let pieces = base.pieces.map((p) => ({ ...p }));
  let history = emptyHistory();
  for (const request of requests) {
    const outcome = applyBuild({ pieces, mode: 'build', newId }, request);
    if (!outcome.ok) continue;
    pieces = outcome.pieces;
    if (outcome.entry !== null) history = record(history, outcome.entry);
  }
  return { pieces, history };
}

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

const MAX_ACTIONS = 20;

const arbScenario = arbBoardWithHistory({ maxSteps: 30 }).chain((base) => {
  // Existing ids plus the ids the next placements will get (p<n>, p<n+1>, ...).
  const ids = [
    ...base.pieces.map((p) => p.id),
    ...Array.from({ length: MAX_ACTIONS }, (_, j) => `p${base.nextIdStart + j}`),
  ];
  const req = arbRequest(ids, boardTiles(base.pieces));
  return fc.record({
    base: fc.constant(base),
    requests: fc.array(req, { minLength: 1, maxLength: MAX_ACTIONS }),
    k: fc.nat(),
    extra: req,
  });
});

/** Builds the history and discards cases where no action was recorded. */
function scenarioState(base: BoardWithHistory, requests: readonly BuildRequest[]): State {
  const s = buildHistory(base, requests);
  fc.pre(s.history.past.length >= 1);
  expect(s.history.past.length).toBeLessThanOrEqual(MAX_ACTIONS);
  expect(s.history.future).toEqual([]);
  return s;
}

// ---------------------------------------------------------------------------
// Property 18
// ---------------------------------------------------------------------------

describe('Property 18: Undo then redo is the identity', () => {
  it('undoing k actions then redoing k actions restores pieces and history', () => {
    fc.assert(
      fc.property(arbScenario, ({ base, requests, k }) => {
        const start = scenarioState(base, requests);
        const n = k % (start.history.past.length + 1);
        const before = structuredClone(start);

        const undone = undoN(start, n);
        expect(undone.history.past).toHaveLength(before.history.past.length - n);
        expect(undone.history.future).toHaveLength(n);

        const redone = redoN(undone, n);
        // Same ids, values and order (redo never allocates new ids, 13.4).
        expect(redone.pieces).toEqual(before.pieces);
        expect(redone.history).toEqual(before.history);
        // Everything undone has been redone, so there is nothing left to redo.
        expect(redo(redone.history, redone.pieces)).toBeNull();
      }),
      { numRuns: 100 },
    );
  });

  it('a single undo then redo from any undo depth is the identity', () => {
    fc.assert(
      fc.property(arbScenario, ({ base, requests, k }) => {
        const start = scenarioState(base, requests);
        const depth = k % start.history.past.length; // leaves at least one entry to undo
        const point = undoN(start, depth);
        const before = structuredClone(point);

        const after = redoN(undoN(point, 1), 1);
        expect(after.pieces).toEqual(before.pieces);
        expect(after.history).toEqual(before.history);
      }),
      { numRuns: 100 },
    );
  });

  it('recording a new action after undos clears future, so redo returns null', () => {
    fc.assert(
      fc.property(arbScenario, ({ base, requests, k, extra }) => {
        const start = scenarioState(base, requests);
        const depth = 1 + (k % start.history.past.length);
        const point = undoN(start, depth);
        expect(point.history.future).toHaveLength(depth);

        const { state, snapshot } = frozenWithSnapshot(point);
        const ctx = { pieces: state.pieces, mode: 'build' as const, newId: ID_GEN('q') };
        let outcome = applyBuild(ctx, extra);
        if (!outcome.ok || outcome.entry === null) {
          // Fall back to an action that always succeeds and records an entry.
          const fallback: BuildRequest =
            state.pieces.length > 0
              ? { kind: 'rotate', id: state.pieces[0]!.id }
              : { kind: 'place', type: 'straight', gridX: 0, gridZ: 0, autoAdjust: false };
          outcome = applyBuild(ctx, fallback);
        }
        expect(outcome.ok).toBe(true);
        if (!outcome.ok || outcome.entry === null) throw new Error('fallback action did not record an entry');

        const history = record(state.history, outcome.entry);
        expect(state).toEqual(snapshot);
        expect(history.future).toEqual([]);
        expect(history.past).toHaveLength(snapshot.history.past.length + 1);

        const piecesAfter = deepFreeze(outcome.pieces);
        const piecesSnapshot = structuredClone(outcome.pieces);
        expect(redo(deepFreeze(history), piecesAfter)).toBeNull();
        expect(piecesAfter).toEqual(piecesSnapshot);
      }),
      { numRuns: 100 },
    );
  });
});
