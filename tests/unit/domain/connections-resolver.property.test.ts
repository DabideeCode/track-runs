// Feature: track-diorama-builder, Property 4: Connection resolver matches the adjacency rule
/**
 * **Validates: Requirements 14.2, 14.5, 39.12, 41.6**
 *
 * For any board, `getConnections` returns exactly the set of unordered pairs
 * found by a brute-force check over all piece pairs (edge-adjacent tiles, each
 * piece having a connector on the shared edge); each pair appears once with
 * its two ids in lexicographic order, the list is sorted lexicographically, no
 * decoration id appears, and no track appears in more pairs than it has
 * connectors.
 *
 * The oracle is independent of the implementation: connectors at 0° come from
 * the Section 6 table, each one is rotated as an edge vector with
 * (x, z) → (−z, x) per 90° clockwise step (+x east, +z south), and every pair
 * i < j of pieces is checked directly. It does not use `connectorsOf`,
 * `rotateDir`, `dirDelta` or the occupancy index.
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { getConnections, newConnections } from '@/domain/connections';
import type { Piece, Rotation } from '@/domain/types';
import { arbBoard, arbBoardWithHistory, arbLayout, arbLoop } from '../arbitraries';

type Vec = readonly [number, number];

/** Connectors at 0° from the Section 6 table, as edge vectors (N = (0, −1), E = (1, 0), S = (0, 1)). */
const SPEC_CONNECTORS_0: Record<string, readonly Vec[]> = {
  straight: [[0, -1], [0, 1]],
  tunnel: [[0, -1], [0, 1]],
  station: [[0, -1], [0, 1]],
  curve: [[0, 1], [1, 0]],
  buffer: [[0, 1]],
};

const isTrack = (p: Piece): boolean => p.type in SPEC_CONNECTORS_0;

function rotateVec([x, z]: Vec, r: Rotation): Vec {
  let v: [number, number] = [x, z];
  for (let i = 0; i < r / 90; i++) v = [-v[1], v[0]];
  return [v[0] + 0, v[1] + 0];
}

function oracleConnectors(p: Piece): Vec[] {
  return (SPEC_CONNECTORS_0[p.type] ?? []).map((v) => rotateVec(v, p.rotation));
}

const hasVec = (list: readonly Vec[], dx: number, dz: number): boolean =>
  list.some(([x, z]) => x === dx && z === dz);

/** Brute force: every pair i < j, connected iff edge-adjacent and each faces the other. */
function oracle(pieces: readonly Piece[]): Array<[string, string]> {
  const pairs: Array<[string, string]> = [];
  for (let i = 0; i < pieces.length; i++) {
    for (let j = i + 1; j < pieces.length; j++) {
      const a = pieces[i]!;
      const b = pieces[j]!;
      if (!isTrack(a) || !isTrack(b)) continue;
      const dx = b.gridX - a.gridX;
      const dz = b.gridZ - a.gridZ;
      if (Math.abs(dx) + Math.abs(dz) !== 1) continue;
      if (!hasVec(oracleConnectors(a), dx, dz)) continue;
      if (!hasVec(oracleConnectors(b), -dx, -dz)) continue;
      pairs.push(a.id < b.id ? [a.id, b.id] : [b.id, a.id]);
    }
  }
  return pairs.sort((p, q) => (p[0] !== q[0] ? (p[0] < q[0] ? -1 : 1) : p[1] < q[1] ? -1 : p[1] > q[1] ? 1 : 0));
}

const key = (pair: readonly [string, string]): string => `${pair[0]}\u0000${pair[1]}`;

/** Boards from all three generators: mixed boards, station layouts and closed loops. */
const arbAnyBoard: fc.Arbitrary<Piece[]> = fc.oneof(
  { arbitrary: arbBoard, weight: 2 },
  { arbitrary: arbLayout, weight: 2 },
  { arbitrary: arbLoop().map((l) => l.pieces), weight: 1 },
);

/** A board and a permutation of it. */
const arbBoardAndShuffle = arbAnyBoard.chain((pieces) =>
  fc
    .shuffledSubarray(pieces, { minLength: pieces.length, maxLength: pieces.length })
    .map((shuffled) => ({ pieces, shuffled })),
);

describe('Property 4: Connection resolver matches the adjacency rule', () => {
  it('getConnections equals the brute-force oracle, sorted and unique, with no decorations, independent of piece order', () => {
    fc.assert(
      fc.property(arbBoardAndShuffle, ({ pieces, shuffled }) => {
        const actual = getConnections(pieces);
        const expected = oracle(pieces);

        // Exactly the oracle's pairs, in the oracle's (lexicographic) order.
        expect(actual).toEqual(expected);

        // Each pair once, ids sorted within a pair, pairs strictly increasing.
        const keys = actual.map(key);
        expect(new Set(keys).size).toBe(keys.length);
        for (const [a, b] of actual) expect(a < b).toBe(true);
        for (let i = 1; i < actual.length; i++) {
          const [p, q] = [actual[i - 1]!, actual[i]!];
          expect(p[0] < q[0] || (p[0] === q[0] && p[1] < q[1])).toBe(true);
        }

        // No decoration id appears; no track in more pairs than it has connectors.
        const byId = new Map(pieces.map((p) => [p.id, p]));
        const degree = new Map<string, number>();
        for (const pair of actual) {
          for (const id of pair) {
            const p = byId.get(id);
            expect(p).toBeDefined();
            expect(isTrack(p!)).toBe(true);
            degree.set(id, (degree.get(id) ?? 0) + 1);
          }
        }
        for (const [id, d] of degree) {
          expect(d).toBeLessThanOrEqual(oracleConnectors(byId.get(id)!).length);
        }

        // The result does not depend on the order of `pieces`.
        expect(getConnections(shuffled)).toEqual(actual);
      }),
      { numRuns: 100 },
    );
  });

  it('a closed loop connects every piece to exactly two neighbours', () => {
    fc.assert(
      fc.property(arbLoop(), (loop) => {
        const actual = getConnections(loop.pieces);
        expect(actual).toEqual(oracle(loop.pieces));
        expect(actual.length).toBe(loop.pieces.length);
        const degree = new Map<string, number>();
        for (const pair of actual) for (const id of pair) degree.set(id, (degree.get(id) ?? 0) + 1);
        for (const p of loop.pieces) expect(degree.get(p.id)).toBe(2);
      }),
      { numRuns: 100 },
    );
  });

  it('newConnections(before, after) is the oracle set difference, sorted', () => {
    const arbStates = arbBoardWithHistory().chain((b) => {
      const states: Piece[][] = [[], ...b.steps.map((s) => s.outcome.pieces)];
      return fc
        .tuple(fc.nat({ max: states.length - 1 }), fc.nat({ max: states.length - 1 }))
        .map(([i, j]) => ({ before: states[i]!, after: states[j]! }));
    });
    fc.assert(
      fc.property(arbStates, ({ before, after }) => {
        const old = new Set(oracle(before).map(key));
        const expected = oracle(after).filter((pair) => !old.has(key(pair)));
        expect(newConnections(before, after)).toEqual(expected);
        expect(newConnections(after, after)).toEqual([]);
      }),
      { numRuns: 100 },
    );
  });
});
