import { CATALOGUE } from './catalogue';
import type { Piece, PieceType } from './types';

export const GRID_SIZE = 16;
const HALF_TILE_SPAN = (GRID_SIZE - 1) / 2;

export interface Tile {
  x: number;
  z: number;
}

export function tileToWorld(tile: Tile): { x: number; z: number } {
  return { x: tile.x - HALF_TILE_SPAN, z: tile.z - HALF_TILE_SPAN };
}

export function worldToTile(x: number, z: number): Tile {
  // Adding 0 turns a rounded -0 into 0.
  return { x: Math.round(x + HALF_TILE_SPAN) + 0, z: Math.round(z + HALF_TILE_SPAN) + 0 };
}

export function isOnGrid(tile: Tile): boolean {
  return (
    Number.isInteger(tile.x) &&
    Number.isInteger(tile.z) &&
    tile.x >= 0 &&
    tile.x < GRID_SIZE &&
    tile.z >= 0 &&
    tile.z < GRID_SIZE
  );
}

export function tileKey(x: number, z: number): string {
  return `${x},${z}`;
}

/** Tiles covered by a piece. The anchor is the north-west tile, and rotation never changes this. */
export function footprintTiles(type: PieceType, x: number, z: number): Tile[] {
  const [width, depth] = CATALOGUE[type].footprint;
  const tiles: Tile[] = [];
  for (let dx = 0; dx < width; dx++) {
    for (let dz = 0; dz < depth; dz++) tiles.push({ x: x + dx, z: z + dz });
  }
  return tiles;
}

/** World-space centre of a piece's footprint. */
export function footprintCentre(type: PieceType, x: number, z: number): { x: number; z: number } {
  const [width, depth] = CATALOGUE[type].footprint;
  const anchor = tileToWorld({ x, z });
  return { x: anchor.x + (width - 1) / 2, z: anchor.z + (depth - 1) / 2 };
}

export function buildOccupancy(pieces: readonly Piece[]): Map<string, Piece> {
  const occupancy = new Map<string, Piece>();
  for (const piece of pieces) {
    for (const tile of footprintTiles(piece.type, piece.gridX, piece.gridZ)) {
      occupancy.set(tileKey(tile.x, tile.z), piece);
    }
  }
  return occupancy;
}
