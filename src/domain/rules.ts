import { footprintTiles, isPieceType, isTrack } from './catalog';
import { isOnGrid } from './grid';
import type { Mode, Piece, PieceType, ReasonCode } from './types';

interface PlacementCheck {
  mode: Mode;
  type: PieceType;
  gridX: number;
  gridZ: number;
  movingId?: string;
}

function tileKey(x: number, z: number) {
  return `${x},${z}`;
}

export function occupancy(pieces: readonly Piece[], ignoreId?: string) {
  const tiles = new Map<string, Piece>();
  for (const piece of pieces) {
    if (piece.id === ignoreId) continue;
    for (const tile of footprintTiles(piece.type, piece.gridX, piece.gridZ)) {
      tiles.set(tileKey(tile.x, tile.z), piece);
    }
  }
  return tiles;
}

export function pieceAtTile(pieces: readonly Piece[], x: number, z: number) {
  return occupancy(pieces).get(tileKey(x, z)) ?? null;
}

// Checks run in the order in D-06, and the first failure is the reported reason.
export function validatePlacement(pieces: readonly Piece[], check: PlacementCheck): ReasonCode | null {
  const { mode, type, gridX, gridZ, movingId } = check;
  if (mode === 'play') return 'play_mode';
  if (!isPieceType(type)) return 'not_found';
  if (movingId !== undefined && !pieces.some((piece) => piece.id === movingId)) return 'not_found';

  const footprint = Number.isInteger(gridX) && Number.isInteger(gridZ)
    ? footprintTiles(type, gridX, gridZ)
    : [{ x: gridX, z: gridZ }];
  if (footprint.some((tile) => !isOnGrid(tile.x, tile.z))) return 'out_of_bounds';

  if (type === 'station' && movingId === undefined && pieces.some((piece) => piece.type === 'station')) {
    return 'station_limit';
  }

  const tiles = occupancy(pieces, movingId);
  const holders = footprint.flatMap((tile) => tiles.get(tileKey(tile.x, tile.z)) ?? []);
  if (!isTrack(type) && holders.some((piece) => isTrack(piece.type))) return 'on_track';
  if (holders.length > 0) return 'occupied';
  return null;
}
