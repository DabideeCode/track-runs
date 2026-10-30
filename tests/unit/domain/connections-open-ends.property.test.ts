// Feature: track-diorama-builder, Property 5: Open ends are the unconnected connectors
/**
 * **Validates: Requirements 14.6, 14.9**
 *
 * For any board, the number of open ends plus twice the number of connections
 * equals the total number of track connectors, and every open end reported by
 * `openEnds` is a connector whose facing tile is off the grid, empty, a
 * decoration, or a track without the opposite connector.
 *
 * The oracle is independent of the implementation: connectors come from the
 * "Connectors at 0°" column of the Section 6 table and are rotated as unit
 * vectors (x, z) → (−z, x) per 90° clockwise step (+x east, +z south). Tile
 * occupancy is rebuilt here from the footprint rule (hill covers its anchor
 * and the tiles east, south and south-east; everything else covers 1 tile).
 *
 * Checks:
 * - `openEnds` equals the oracle's open connectors exactly (as sorted lists of
 *   `pieceId|gridX|gridZ|dir`, so duplicates would also be caught).
 * - (sum of connectors over tracks) = openEnds.length + 2 × connections.
 * - A closed loop from `arbLoop` has no open ends.
 * - Removing a piece through `applyBuild` turns every connector that was
 *   connected to it into an open end, drops the removed piece's own ends, and
 *   leaves every other connection and open end unchanged (Requirement 14.9).
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { getConnections, openEnds } from '@/domain/connections';
import { applyBuild } from '@/domain/placement';
import type { Piece, PieceType, TrackType } from '@/domain/types';
import { arbBoard, arbLayout, arbLayoutWith, arbLoop } from '../arbitraries';

type Compass = 'N' | 'E' | 'S' | 'W';

/** Connectors at 0° from the Section 6 table. */
const SPEC_CONNECTORS_0: Record<TrackType, readonly Compass[]> = {
  straight: ['N', 'S'],
  curve: ['S', 'E'],
  tunnel: ['N', 'S'],
  station: ['N', 'S'],
  buffer: ['S'],
};

/** Unit vector of the edge each compass direction faces (+x east, +z south). */
const VECTOR: Record<Compass, readonly [number, number]> = {
  N: [0, -1],
  E: [1, 0],
  S: [0, 1],
  W: [-1, 0],
};

/** Dir encoding used by the domain: 0 = N, 1 = E, 2 = S, 3 = W. */
const DIR_CODE: Record<Compass, number> = { N: 0, E: 1, S: 2, W: 3 };

function isTrack(type: PieceType): type is TrackType {
  return Object.prototype.hasOwnProperty.call(SPEC_CONNECTORS_0, type);
}

function compassOf(x: number, z: number): Compass {
  const hit = (Object.keys(VECTOR) as Compass[]).find((c) => VECTOR[c][0] === x && VECTOR[c][1] === z);
  if (!hit) throw new Error(`not a unit vector: (${x}, ${z})`);
  return hit;
}

/** Rotates a compass direction clockwise by `rotation` degrees as a vector. */
function rotateCompass(c: Compass, rotation: number): Compass {
  let [x, z] = VECTOR[c];
  for (let i = 0; i < rotation / 90; i++) [x, z] = [-z, x];
  // Normalise −0 so the lookup matches.
  return compassOf(x + 0, z + 0);
}

function oracleConnectors(p: Piece): Compass[] {
  if (!isTrack(p.type)) return [];
  return SPEC_CONNECTORS_0[p.type].map((c) => rotateCompass(c, p.rotation));
}

function oracleOccupancy(pieces: readonly Piece[]): Map<string, Piece> {
  const map = new Map<string, Piece>();
  for (const p of pieces) {
    const size = p.type === 'hill' ? 2 : 1;
    for (let dx = 0; dx < size; dx++) {
      for (let dz = 0; dz < size; dz++) map.set(`${p.gridX + dx},${p.gridZ + dz}`, p);
    }
  }
  return map;
}

const OPPOSITE: Record<Compass, Compass> = { N: 'S', E: 'W', S: 'N', W: 'E' };

function endKey(pieceId: string, gridX: number, gridZ: number, dir: number): string {
  return `${pieceId}|${gridX}|${gridZ}|${dir}`;
}

/** Every track connector, with whether the oracle considers it open. */
function oracleConnectorList(pieces: readonly Piece[]): Array<{ key: string; open: boolean }> {
  const occ = oracleOccupancy(pieces);
  const out: Array<{ key: string; open: boolean }> = [];
  for (const p of pieces) {
    for (const c of oracleConnectors(p)) {
      const [dx, dz] = VECTOR[c];
      const nx = p.gridX + dx;
      const nz = p.gridZ + dz;
      const offGrid = nx < 0 || nx > 15 || nz < 0 || nz > 15;
      const other = offGrid ? undefined : occ.get(`${nx},${nz}`);
      // Open when off-grid, empty, a decoration (no connectors), or a track
      // without the opposite connector.
      const open = !other || !oracleConnectors(other).includes(OPPOSITE[c]);
      out.push({ key: endKey(p.id, p.gridX, p.gridZ, DIR_CODE[c]), open });
    }
  }
  return out;
}

function oracleOpenKeys(pieces: readonly Piece[]): string[] {
  return oracleConnectorList(pieces).filter((e) => e.open).map((e) => e.key).sort();
}

function actualOpenKeys(pieces: readonly Piece[]): string[] {
  return openEnds(pieces).map((e) => endKey(e.pieceId, e.tile.gridX, e.tile.gridZ, e.dir)).sort();
}

/** Boards from every generator: random requests, track layouts, layouts with decorations, loops. */
const arbAnyBoard: fc.Arbitrary<Piece[]> = fc.oneof(
  arbBoard,
  arbLayout,
  arbLayoutWith({ decorations: true }),
  arbLoop().map((l) => l.pieces),
);

describe('Property 5: Open ends are the unconnected connectors', () => {
  it('openEnds equals the oracle set of unconnected connectors', () => {
    fc.assert(
      fc.property(arbAnyBoard, (pieces) => {
        expect(actualOpenKeys(pieces)).toEqual(oracleOpenKeys(pieces));
      }),
      { numRuns: 100 },
    );
  });

  it('track connectors = open ends + 2 × connections', () => {
    fc.assert(
      fc.property(arbAnyBoard, (pieces) => {
        const total = pieces.reduce((n, p) => n + oracleConnectors(p).length, 0);
        expect(openEnds(pieces).length + 2 * getConnections(pieces).length).toBe(total);
      }),
      { numRuns: 100 },
    );
  });

  it('a closed loop has no open ends', () => {
    fc.assert(
      fc.property(arbLoop(), (loop) => {
        expect(openEnds(loop.pieces)).toEqual([]);
        expect(oracleOpenKeys(loop.pieces)).toEqual([]);
      }),
      { numRuns: 100 },
    );
  });

  it('removing a piece opens the connectors that faced it and changes nothing else', () => {
    const arbBoardAndPick = fc
      .oneof(arbBoard, arbLayout, arbLayoutWith({ decorations: true }), arbLoop().map((l) => l.pieces))
      .filter((pieces) => pieces.length > 0)
      .chain((pieces) => fc.nat({ max: pieces.length - 1 }).map((i) => ({ pieces, i })));

    fc.assert(
      fc.property(arbBoardAndPick, ({ pieces, i }) => {
        const removed = pieces[i]!;
        const outcome = applyBuild(
          { pieces, mode: 'build', newId: () => 'unused' },
          { kind: 'remove', id: removed.id },
        );
        expect(outcome.ok).toBe(true);
        if (!outcome.ok) return;
        const after = outcome.pieces;

        // Connections: exactly the old ones that did not involve the removed piece.
        const before = getConnections(pieces);
        const kept = before.filter(([a, b]) => a !== removed.id && b !== removed.id);
        expect(getConnections(after)).toEqual(kept);

        // Each neighbour that was connected to the removed piece now has an
        // open end on the connector facing the removed piece's tile.
        const byId = new Map(pieces.map((p) => [p.id, p]));
        const newlyOpen: string[] = [];
        for (const [a, b] of before) {
          if (a !== removed.id && b !== removed.id) continue;
          const n = byId.get(a === removed.id ? b : a)!;
          const facing = oracleConnectors(n).filter((c) => {
            const [dx, dz] = VECTOR[c];
            return n.gridX + dx === removed.gridX && n.gridZ + dz === removed.gridZ;
          });
          expect(facing).toHaveLength(1);
          newlyOpen.push(endKey(n.id, n.gridX, n.gridZ, DIR_CODE[facing[0]!]));
        }
        const afterOpen = actualOpenKeys(after);
        for (const key of newlyOpen) expect(afterOpen).toContain(key);

        // Open ends: the old ones minus the removed piece's own, plus the newly opened.
        const expected = [
          ...actualOpenKeys(pieces).filter((k) => !k.startsWith(`${removed.id}|`)),
          ...newlyOpen,
        ].sort();
        expect(afterOpen).toEqual(expected);
      }),
      { numRuns: 100 },
    );
  });
});
