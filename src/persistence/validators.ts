import { isPieceType, isRotation } from '@/domain/catalogue';
import { normaliseName } from '@/domain/naming';
import { validatePlace } from '@/domain/rules';
import type { Diorama, Piece } from '@/domain/types';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isDate = (value: unknown): value is string =>
  typeof value === 'string' && !Number.isNaN(Date.parse(value));

function parsePiece(value: unknown): Piece | null {
  if (!isRecord(value)) return null;
  const { id, type, gridX, gridZ, rotation } = value;
  if (typeof id !== 'string' || id.length === 0) return null;
  if (!isPieceType(type) || !isRotation(rotation)) return null;
  if (typeof gridX !== 'number' || typeof gridZ !== 'number') return null;
  return { id, type, gridX, gridZ, rotation };
}

/** Replays each piece through the placement rules, so a saved layout can never break them. */
function parsePieces(value: unknown): Piece[] | null {
  if (!Array.isArray(value)) return null;
  const pieces: Piece[] = [];
  const ids = new Set<string>();
  for (const item of value) {
    const piece = parsePiece(item);
    if (!piece || ids.has(piece.id)) return null;
    if (validatePlace(pieces, 'build', piece.type, piece.gridX, piece.gridZ) !== null) return null;
    ids.add(piece.id);
    pieces.push(piece);
  }
  return pieces;
}

export function parseDiorama(value: unknown): Diorama | null {
  if (!isRecord(value)) return null;
  const { id, name, setting, startFacing, createdAt, updatedAt, thumbnail } = value;
  if (typeof id !== 'string' || id.length === 0) return null;
  if (typeof name !== 'string' || normaliseName(name) === null) return null;
  if (setting !== 'bedroom' && setting !== 'kitchen') return null;
  if (startFacing !== 0 && startFacing !== 180) return null;
  if (!isDate(createdAt) || !isDate(updatedAt)) return null;
  if (thumbnail !== undefined && typeof thumbnail !== 'string') return null;

  const pieces = parsePieces(value.pieces);
  if (!pieces) return null;
  return {
    id,
    name,
    setting,
    startFacing,
    pieces,
    createdAt,
    updatedAt,
    ...(thumbnail === undefined ? {} : { thumbnail }),
  };
}
