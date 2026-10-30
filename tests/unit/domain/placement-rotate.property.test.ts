// Feature: track-diorama-builder, Property 9: Rotation cycles clockwise without moving the piece
/**
 * **Validates: Requirements 12.4, 15.3, 28.18, 39.5**
 *
 * For any board and any piece on it, a successful rotate sets that piece's
 * rotation to the next value in 0 → 90 → 180 → 270 → 0, never applies
 * auto-adjust, keeps its anchor and footprint (including a hill's 4 tiles),
 * and leaves every other piece unchanged.
 *
 * The oracles below restate the rotation cycle, the footprints, the connectors
 * at 0° and the connection rule from Requirements 14 and 28, without importing
 * the catalogue, connectors, grid or connections modules.
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { applyBuild } from '@/domain/placement';
import type { Piece } from '@/domain/types';
import { arbBoard, ID_GEN } from '../arbitraries';

// ---------------------------------------------------------------------------
// Independent oracles
// ---------------------------------------------------------------------------

/** Requirement 12.4: the clockwise cycle. */
const oracleNext = (r: number) => (r + 90) % 360;

/** Requirement 28.3: hill covers anchor, east, south and south-east; everything else the anchor only. */
function oracleFootprint(p: Piece): string[] {
  const { gridX: x, gridZ: z } = p;
  const tiles = p.type === 'hill' ? [[x, z], [x + 1, z], [x, z + 1], [x + 1, z + 1]] : [[x, z]];
  return tiles.map(([tx, tz]) => `${tx},${tz}`).sort();
}

/** Requirement 28.4: connectors at 0° as [dx, dz] offsets (N = −Z, E = +X, S = +Z). */
const N: [number, number] = [0, -1];
const E: [number, number] = [1, 0];
const S: [number, number] = [0, 1];
const CONNECTORS0: Record<string, Array<[number, number]>> = {
  straight: [N, S],
  tunnel: [N, S],
  station: [N, S],
  curve: [S, E],
  buffer: [S],
};

/** Turn an offset clockwise (viewed from above) by `r` degrees: N → E → S → W. */
function turn([dx, dz]: [number, number], r: number): [number, number] {
  let v: [number, number] = [dx, dz];
  for (let k = 0; k < r / 90; k++) v = [-v[1], v[0]];
  return [v[0] + 0, v[1] + 0];
}

function oracleConnectors(p: Piece): Array<[number, number]> {
  return (CONNECTORS0[p.type] ?? []).map((d) => turn(d, p.rotation));
}

/** Requirement 14.2: brute-force pairwise connections as sorted "a|b" keys. */
function oracleConnections(pieces: readonly Piece[]): Set<string> {
  const out = new Set<string>();
  for (const a of pieces) {
    for (const b of pieces) {
      if (a.id >= b.id) continue;
      const dx = b.gridX - a.gridX;
      const dz = b.gridZ - a.gridZ;
      const aFaces = oracleConnectors(a).some(([cx, cz]) => cx === dx && cz === dz);
      const bFaces = oracleConnectors(b).some(([cx, cz]) => cx === -dx && cz === -dz);
      if (aFaces && bFaces) out.add(`${a.id}|${b.id}`);
    }
  }
  return out;
}

function deepFreeze(pieces: Piece[]): readonly Piece[] {
  for (const p of pieces) Object.freeze(p);
  return Object.freeze(pieces);
}

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/** A non-empty reachable board and the index of one piece on it. */
const arbBoardAndPick = arbBoard
  .filter((pieces) => pieces.length > 0)
  .chain((pieces) => fc.nat({ max: pieces.length - 1 }).map((at) => ({ pieces, at })));

const failingNewId = () => {
  throw new Error('rotate must not allocate an id');
};

// ---------------------------------------------------------------------------
// Property 9
// ---------------------------------------------------------------------------

describe('Property 9: Rotation cycles clockwise without moving the piece', () => {
  it('rotates one piece clockwise by 90° and changes nothing else', () => {
    fc.assert(
      fc.property(arbBoardAndPick, ({ pieces, at }) => {
        const snapshot = structuredClone(pieces);
        const input = deepFreeze(pieces);
        const target = snapshot[at]!;

        const outcome = applyBuild({ pieces: input, mode: 'build', newId: failingNewId }, {
          kind: 'rotate',
          id: target.id,
        });

        // Rotating an existing piece in Build mode always succeeds (Requirement 28.18).
        expect(outcome.ok).toBe(true);
        if (!outcome.ok) return;

        // Input is not mutated.
        expect(input).toEqual(snapshot);
        // A fresh array is returned.
        expect(outcome.pieces).not.toBe(input);

        // Same length and order; only the target's rotation changes.
        expect(outcome.pieces.map((p) => p.id)).toEqual(snapshot.map((p) => p.id));
        const expectedRotation = oracleNext(target.rotation);
        snapshot.forEach((before, i) => {
          const after = outcome.pieces[i]!;
          if (i === at) {
            expect(after).toEqual({ ...before, rotation: expectedRotation });
          } else {
            expect(after).toEqual(before);
          }
        });

        // The footprint (including a hill's 4 tiles) is unchanged.
        expect(oracleFootprint(outcome.pieces[at]!)).toEqual(oracleFootprint(target));

        // History entry, sound and snap.
        expect(outcome.entry).toEqual({
          kind: 'rotate',
          id: target.id,
          from: target.rotation,
          to: expectedRotation,
        });
        expect(outcome.id).toBeUndefined();
        expect(outcome.sound).toBe('rotate');
        const before = oracleConnections(snapshot);
        const after = oracleConnections(outcome.pieces);
        const created = [...after].some((pair) => !before.has(pair));
        expect(outcome.snap).toBe(created);
      }),
      { numRuns: 100 },
    );
  });

  it('four successive rotations restore the original board exactly', () => {
    fc.assert(
      fc.property(arbBoardAndPick, ({ pieces, at }) => {
        const snapshot = structuredClone(pieces);
        const id = pieces[at]!.id;
        const seen: number[] = [pieces[at]!.rotation];
        let current: readonly Piece[] = deepFreeze(pieces);
        for (let k = 0; k < 4; k++) {
          const outcome = applyBuild({ pieces: current, mode: 'build', newId: ID_GEN('x') }, {
            kind: 'rotate',
            id,
          });
          expect(outcome.ok).toBe(true);
          if (!outcome.ok) return;
          current = deepFreeze(outcome.pieces);
          seen.push(current[at]!.rotation);
        }
        // Each step is +90° clockwise, and four steps return to the start.
        for (let k = 1; k < seen.length; k++) expect(seen[k]).toBe(oracleNext(seen[k - 1]!));
        expect(current).toEqual(snapshot);
      }),
      { numRuns: 100 },
    );
  });
});
