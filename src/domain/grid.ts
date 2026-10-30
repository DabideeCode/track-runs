/**
 * The 16 × 16 tile grid (Section 2 and Section 6 of requirement.md).
 *
 * World units: one tile is 1 × 1, the grid is centred on the origin and
 * covers −8 ≤ x < 8 and −8 ≤ z < 8. Tile (gridX, gridZ) has its centre at
 * (gridX − 7.5, gridZ − 7.5). gridX runs west to east (+x), gridZ north to
 * south (+z).
 */
import { itemOf } from './catalogue';
import type { PieceType, Tile } from './types';

/** Number of tiles along each edge of the grid. */
export const GRID = 16;

/** Half the grid width in world units. */
const HALF = GRID / 2;

/** World position of the centre of tile (gridX, gridZ). */
export function tileCentre(gridX: number, gridZ: number): { x: number; z: number } {
  return { x: gridX - HALF + 0.5, z: gridZ - HALF + 0.5 };
}

/**
 * Maps a point on the ground plane to the tile whose centre is nearest.
 * A point exactly on a shared edge maps to the east or south tile.
 * Returns null for non-finite input or a point outside −8 ≤ x < 8, −8 ≤ z < 8.
 */
export function worldToTile(x: number, z: number): Tile | null {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  if (x < -HALF || x >= HALF || z < -HALF || z >= HALF) return null;
  return { gridX: axisIndex(x), gridZ: axisIndex(z) };
}

/**
 * Tile index along one axis for a coordinate p with −8 ≤ p < 8.
 *
 * `p + 8` is rounded to the nearest double, so for p a hair below a tile edge
 * (for example p = −5e-324, just below the edge at 0) the sum can round up to
 * the edge's integer and `Math.floor` returns the tile one too far east or
 * south. Rounding never crosses an integer downwards, so the error is at most
 * +1. Two guards fix it:
 *
 * 1. If p < g − 8, the floor overshot; subtract 1. `g − 8` is an integer, so
 *    the comparison is exact.
 * 2. The clamp to 15 keeps p just below 8 (where p + 8 rounds to 16) inside
 *    the grid. Guard 1 already covers that case; the clamp is a backstop.
 */
function axisIndex(p: number): number {
  let g = Math.floor(p + HALF);
  if (p < g - HALF) g -= 1;
  return Math.min(GRID - 1, g);
}

/**
 * Tiles covered by a piece anchored at (gridX, gridZ). 1 × 1 items cover the
 * anchor only; the 2 × 2 hill covers the anchor and the tiles to its east,
 * south and south-east. Tiles are returned whether or not they lie in the grid.
 */
export function footprintTiles(type: PieceType, gridX: number, gridZ: number): Tile[] {
  if (itemOf(type).size === 1) return [{ gridX, gridZ }];
  return [
    { gridX, gridZ },
    { gridX: gridX + 1, gridZ },
    { gridX, gridZ: gridZ + 1 },
    { gridX: gridX + 1, gridZ: gridZ + 1 },
  ];
}

/** World position of the centre of a piece's footprint (the mean of its tile centres). */
export function footprintCentre(type: PieceType, gridX: number, gridZ: number): { x: number; z: number } {
  const c = tileCentre(gridX, gridZ);
  const offset = (itemOf(type).size - 1) / 2;
  return { x: c.x + offset, z: c.z + offset };
}

/** True when both coordinates are integers from 0 to 15. */
export function inGrid(t: Tile): boolean {
  return (
    Number.isInteger(t.gridX) &&
    Number.isInteger(t.gridZ) &&
    t.gridX >= 0 &&
    t.gridX < GRID &&
    t.gridZ >= 0 &&
    t.gridZ < GRID
  );
}

/** Unique integer key for an in-grid tile (row-major, 0 to 255). */
export const tileKey = (t: Tile): number => t.gridZ * GRID + t.gridX;
