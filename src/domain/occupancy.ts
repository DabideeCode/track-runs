/**
 * Tile occupancy index: which piece covers each in-grid tile.
 *
 * Built once per `pieces` array in O(n). Every tile of a piece's footprint is
 * indexed, so the 2 × 2 hill appears under 4 keys. Tiles off the grid are never
 * indexed and always look up as empty.
 */
import { footprintTiles, inGrid, tileKey } from './grid';
import type { Piece, Tile } from './types';

/** Maps `tileKey(tile)` to the piece whose footprint covers that tile. */
export type OccupancyIndex = ReadonlyMap<number, Piece>;

/** Index every in-grid footprint tile of every piece. */
export function buildOccupancy(pieces: readonly Piece[]): OccupancyIndex {
  const index = new Map<number, Piece>();
  for (const piece of pieces) {
    for (const tile of footprintTiles(piece.type, piece.gridX, piece.gridZ)) {
      if (inGrid(tile)) index.set(tileKey(tile), piece);
    }
  }
  return index;
}

/** The piece covering `tile`, or undefined for an empty or off-grid tile. */
export function pieceAt(index: OccupancyIndex, tile: Tile): Piece | undefined {
  if (!inGrid(tile)) return undefined;
  return index.get(tileKey(tile));
}
