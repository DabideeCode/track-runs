/**
 * Track connections and open ends (Requirement 14, Section 10.2 getConnections).
 *
 * Two tracks A and B are connected when B's tile is A's tile + dirDelta(d) for
 * some connector d of A, and B has the connector opposite(d). Decorations have
 * no connectors, so they never connect. Off-grid tiles hold nothing, so a
 * connector facing the grid boundary is an open end.
 *
 * Every track piece is 1 × 1, so a track's tile is its anchor.
 */
import { connectorsOf, dirDelta, opposite } from './connectors';
import { buildOccupancy, pieceAt, type OccupancyIndex } from './occupancy';
import type { Dir, Piece, Tile } from './types';

/** A connected pair of piece ids, sorted so that pair[0] < pair[1]. */
export type Connection = [string, string];

/** An unconnected connector: the track's tile and the edge it faces. */
export interface OpenEnd {
  pieceId: string;
  tile: Tile;
  dir: Dir;
}

/**
 * The track across edge `dir` of `piece` that has a connector facing back
 * (opposite(dir)), with the index of that connector in its catalogue order.
 * Returns null when the tile across is off the grid, empty, a decoration, or a
 * track without the opposite connector. Does not check that `piece` itself has
 * a connector on `dir`; callers iterate over the piece's own connectors.
 */
export function neighbourAcross(
  index: OccupancyIndex,
  piece: Piece,
  dir: Dir,
): { piece: Piece; connectorIndex: number } | null {
  const { dx, dz } = dirDelta(dir);
  const other = pieceAt(index, { gridX: piece.gridX + dx, gridZ: piece.gridZ + dz });
  if (!other || other.id === piece.id) return null;
  const connectorIndex = connectorsOf(other).indexOf(opposite(dir));
  return connectorIndex === -1 ? null : { piece: other, connectorIndex };
}

/** Plain string ordering (not locale-aware): first ids, then second ids. */
function comparePairs(a: Connection, b: Connection): number {
  if (a[0] !== b[0]) return a[0] < b[0] ? -1 : 1;
  if (a[1] !== b[1]) return a[1] < b[1] ? -1 : 1;
  return 0;
}

function pairKey(pair: Connection): string {
  return `${pair[0]}\u0000${pair[1]}`;
}

/**
 * Every connected pair once, ids sorted within each pair and the pairs sorted
 * lexicographically (Requirement 39.12).
 */
export function getConnections(pieces: readonly Piece[]): Connection[] {
  const index = buildOccupancy(pieces);
  const seen = new Set<string>();
  const pairs: Connection[] = [];
  for (const piece of pieces) {
    for (const dir of connectorsOf(piece)) {
      const hit = neighbourAcross(index, piece, dir);
      if (!hit) continue;
      const a = piece.id;
      const b = hit.piece.id;
      const pair: Connection = a < b ? [a, b] : [b, a];
      const key = pairKey(pair);
      if (seen.has(key)) continue;
      seen.add(key);
      pairs.push(pair);
    }
  }
  return pairs.sort(comparePairs);
}

/** Every track connector with no matching connector across its edge, in piece order. */
export function openEnds(pieces: readonly Piece[]): OpenEnd[] {
  const index = buildOccupancy(pieces);
  const ends: OpenEnd[] = [];
  for (const piece of pieces) {
    for (const dir of connectorsOf(piece)) {
      if (!neighbourAcross(index, piece, dir)) {
        ends.push({ pieceId: piece.id, tile: { gridX: piece.gridX, gridZ: piece.gridZ }, dir });
      }
    }
  }
  return ends;
}

/** Pairs connected in `after` but not in `before`, sorted like getConnections. */
export function newConnections(before: readonly Piece[], after: readonly Piece[]): Connection[] {
  const old = new Set(getConnections(before).map(pairKey));
  return getConnections(after).filter((pair) => !old.has(pairKey(pair)));
}
