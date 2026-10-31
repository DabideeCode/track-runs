import { isTrack } from './catalogue';
import { buildOccupancy, footprintTiles, isOnGrid, tileKey } from './grid';
import type { GameState, Piece, PieceType, ReasonCode } from './types';

type Mode = GameState['mode'];

function fitsGrid(type: PieceType, x: number, z: number): boolean {
  return footprintTiles(type, x, z).every(isOnGrid);
}

function checkOverlap(
  pieces: readonly Piece[],
  type: PieceType,
  x: number,
  z: number,
  ignoreId: string | null,
): ReasonCode | null {
  const occupancy = buildOccupancy(pieces);
  const holders = footprintTiles(type, x, z)
    .map((tile) => occupancy.get(tileKey(tile.x, tile.z)))
    .filter((piece): piece is Piece => piece !== undefined && piece.id !== ignoreId);
  if (holders.length === 0) return null;
  if (!isTrack(type) && holders.some((piece) => isTrack(piece.type))) return 'on_track';
  return 'occupied';
}

export function validatePlace(
  pieces: readonly Piece[],
  mode: Mode,
  type: PieceType,
  x: number,
  z: number,
): ReasonCode | null {
  if (mode === 'play') return 'play_mode';
  if (!fitsGrid(type, x, z)) return 'out_of_bounds';
  if (type === 'station' && pieces.some((piece) => piece.type === 'station')) return 'station_limit';
  return checkOverlap(pieces, type, x, z, null);
}

export function validateMove(
  pieces: readonly Piece[],
  mode: Mode,
  id: string,
  x: number,
  z: number,
): ReasonCode | null {
  if (mode === 'play') return 'play_mode';
  const piece = pieces.find((candidate) => candidate.id === id);
  if (!piece) return 'not_found';
  if (!fitsGrid(piece.type, x, z)) return 'out_of_bounds';
  return checkOverlap(pieces, piece.type, x, z, id);
}

/** Rotate and remove can only fail on mode or a missing piece, as they never change tiles. */
export function validateTarget(pieces: readonly Piece[], mode: Mode, id: string): ReasonCode | null {
  if (mode === 'play') return 'play_mode';
  return pieces.some((piece) => piece.id === id) ? null : 'not_found';
}
