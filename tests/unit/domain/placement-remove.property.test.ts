// Feature: track-diorama-builder, Property 10: Removal deletes exactly one piece and its connections
/**
 * **Validates: Requirements 12.6, 14.9, 39.6**
 *
 * For any board and any piece on it, a successful remove returns the previous
 * array with only that entry removed (others keep their order and values),
 * and `getConnections` afterwards contains no pair with the removed id.
 *
 * Checked here on the pure placement engine:
 * - removing any existing piece in Build mode succeeds;
 * - the result equals the input minus exactly that entry, others unchanged and in order;
 * - the history entry is `{ kind: 'remove', piece, index }` with the original index;
 * - the sound is `delete` and `snap` is false;
 * - connections after = connections before minus every pair containing the
 *   removed id, and also match an independent pairwise oracle;
 * - removing an unknown id gives `not_found`;
 * - the input array and its pieces are not mutated.
 *
 * The "selectedPieceId becomes null" clause of Property 10 is store state, not
 * part of `applyBuild`; it is covered by the store tests (task 10.x).
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { applyBuild } from '@/domain/placement';
import { getConnections } from '@/domain/connections';
import type { Piece, Rotation } from '@/domain/types';
import { ID_GEN, arbBoard, arbLayoutWith, arbLoop } from '../arbitraries';

type Vec = readonly [number, number];

/** Connectors at 0° from the Section 6 table as edge vectors (N = (0, −1), E = (1, 0), S = (0, 1)). */
const SPEC_CONNECTORS_0: Record<string, readonly Vec[]> = {
  straight: [[0, -1], [0, 1]],
  tunnel: [[0, -1], [0, 1]],
  station: [[0, -1], [0, 1]],
  curve: [[0, 1], [1, 0]],
  buffer: [[0, 1]],
};

/** Rotates an edge vector clockwise by r: (x, z) → (−z, x) per 90°. */
function rotateVec([x, z]: Vec, r: Rotation): Vec {
  let v: [number, number] = [x, z];
  for (let i = 0; i < r / 90; i++) v = [-v[1], v[0]];
  return [v[0] + 0, v[1] + 0];
}

function edges(p: Piece): Vec[] {
  return (SPEC_CONNECTORS_0[p.type] ?? []).map((v) => rotateVec(v, p.rotation));
}

/** Independent brute-force oracle: sorted pairs of tracks joined across a shared edge. */
function oracleConnections(pieces: readonly Piece[]): Array<[string, string]> {
  const pairs: Array<[string, string]> = [];
  for (let i = 0; i < pieces.length; i++) {
    for (let j = i + 1; j < pieces.length; j++) {
      const a = pieces[i]!;
      const b = pieces[j]!;
      const dx = b.gridX - a.gridX;
      const dz = b.gridZ - a.gridZ;
      const aHas = edges(a).some(([x, z]) => x === dx && z === dz);
      const bHas = edges(b).some(([x, z]) => x === -dx && z === -dz);
      if (aHas && bHas) pairs.push(a.id < b.id ? [a.id, b.id] : [b.id, a.id]);
    }
  }
  return pairs.sort((p, q) => (p[0] !== q[0] ? (p[0] < q[0] ? -1 : 1) : p[1] < q[1] ? -1 : p[1] > q[1] ? 1 : 0));
}

/** Boards with many connections and many decorations, plus a non-empty pick. */
const arbNonEmptyBoard: fc.Arbitrary<Piece[]> = fc
  .oneof(
    { arbitrary: arbBoard, weight: 2 },
    { arbitrary: arbLayoutWith({ decorations: true }), weight: 2 },
    { arbitrary: arbLoop().map((l) => l.pieces), weight: 1 },
  )
  .filter((pieces) => pieces.length > 0);

const arbBoardAndPick = arbNonEmptyBoard.chain((pieces) =>
  fc.nat({ max: pieces.length - 1 }).map((index) => ({ pieces, index })),
);

describe('Property 10: Removal deletes exactly one piece and its connections', () => {
  it('removes exactly the chosen piece and every connection that used it', () => {
    fc.assert(
      fc.property(arbBoardAndPick, ({ pieces, index }) => {
        const snapshot = JSON.parse(JSON.stringify(pieces)) as Piece[];
        const target = pieces[index]!;
        const connectionsBefore = getConnections(pieces);

        const outcome = applyBuild({ pieces, mode: 'build', newId: ID_GEN('new', 1) }, { kind: 'remove', id: target.id });

        expect(outcome.ok).toBe(true);
        if (!outcome.ok) return;

        // Input not mutated.
        expect(pieces).toEqual(snapshot);

        // Exactly that entry removed; the rest unchanged and in order.
        const expected = snapshot.filter((_, i) => i !== index);
        expect(outcome.pieces).toEqual(expected);
        expect(outcome.pieces).toHaveLength(snapshot.length - 1);
        expect(outcome.pieces.some((p) => p.id === target.id)).toBe(false);

        // History entry, sound and snap.
        expect(outcome.entry).toEqual({ kind: 'remove', piece: snapshot[index], index });
        expect(outcome.sound).toBe('delete');
        expect(outcome.snap).toBe(false);
        expect(outcome.id).toBeUndefined();

        // Connections: before minus every pair containing the removed id.
        const connectionsAfter = getConnections(outcome.pieces);
        expect(connectionsAfter).toEqual(connectionsBefore.filter(([a, b]) => a !== target.id && b !== target.id));
        expect(connectionsAfter.some(([a, b]) => a === target.id || b === target.id)).toBe(false);
        expect(connectionsAfter).toEqual(oracleConnections(outcome.pieces));
      }),
      { numRuns: 100 },
    );
  });

  it('rejects an unknown id with not_found and leaves the board untouched', () => {
    const arbUnknownId = fc.oneof(
      fc.string().map((s) => `missing-${s}`),
      fc.constantFrom<unknown>('', 'P1', null, undefined, 1, {}, ['p1']),
    );
    fc.assert(
      fc.property(fc.oneof(arbBoard, arbNonEmptyBoard), arbUnknownId, (pieces, id) => {
        fc.pre(!pieces.some((p) => p.id === id));
        const snapshot = JSON.parse(JSON.stringify(pieces)) as Piece[];
        const outcome = applyBuild({ pieces, mode: 'build', newId: ID_GEN('new', 1) }, { kind: 'remove', id });
        expect(outcome).toEqual({ ok: false, reason: 'not_found' });
        expect(pieces).toEqual(snapshot);
      }),
      { numRuns: 100 },
    );
  });
});
