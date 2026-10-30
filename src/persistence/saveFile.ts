import { isPieceType } from '@/domain/catalog';
import { validateName } from '@/domain/names';
import { validatePlacement } from '@/domain/rules';
import type { Diorama, Piece } from '@/domain/types';

export const SAVE_KEY = 'wooden-diorama:v1';

export type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

function browserStorage(): StorageLike | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) && !Number.isNaN(Date.parse(value));
}

function isPiece(value: unknown): value is Piece {
  if (typeof value !== 'object' || value === null) return false;
  const piece = value as Record<string, unknown>;
  return (
    typeof piece.id === 'string' &&
    piece.id.length > 0 &&
    typeof piece.type === 'string' &&
    isPieceType(piece.type) &&
    Number.isInteger(piece.gridX) &&
    Number.isInteger(piece.gridZ) &&
    (piece.gridX as number) >= 0 &&
    (piece.gridX as number) <= 15 &&
    (piece.gridZ as number) >= 0 &&
    (piece.gridZ as number) <= 15 &&
    [0, 90, 180, 270].includes(piece.rotation as number)
  );
}

function piecesAreValid(value: unknown): value is Piece[] {
  if (!Array.isArray(value) || !value.every(isPiece)) return false;
  if (new Set(value.map((piece) => piece.id)).size !== value.length) return false;
  const placed: Piece[] = [];
  for (const piece of value) {
    const reason = validatePlacement(placed, {
      mode: 'build',
      type: piece.type,
      gridX: piece.gridX,
      gridZ: piece.gridZ,
    });
    if (reason) return false;
    placed.push(piece);
  }
  return true;
}

export function isReadableDiorama(value: unknown): value is Diorama {
  if (typeof value !== 'object' || value === null) return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.id === 'string' &&
    entry.id.length > 0 &&
    typeof entry.name === 'string' &&
    validateName(entry.name).ok &&
    (entry.setting === 'bedroom' || entry.setting === 'kitchen') &&
    (entry.startFacing === 0 || entry.startFacing === 180) &&
    isIsoDate(entry.createdAt) &&
    isIsoDate(entry.updatedAt) &&
    (entry.thumbnail === undefined || typeof entry.thumbnail === 'string') &&
    piecesAreValid(entry.pieces)
  );
}

// Returns the stored entries as raw values, or an empty list if the file is missing or unreadable.
function readRawEntries(storage: StorageLike): unknown[] {
  const text = storage.getItem(SAVE_KEY);
  if (text === null) return [];
  try {
    const file: unknown = JSON.parse(text);
    if (
      typeof file === 'object' &&
      file !== null &&
      (file as { version?: unknown }).version === 1 &&
      Array.isArray((file as { dioramas?: unknown }).dioramas)
    ) {
      return (file as { dioramas: unknown[] }).dioramas;
    }
  } catch {
    // Reported below with the other unreadable-file cases.
  }
  console.warn('Track: the saved diorama file could not be read and was ignored.');
  return [];
}

export function readDioramas(storage = browserStorage()): Diorama[] {
  if (!storage) return [];
  try {
    return readRawEntries(storage).filter((entry): entry is Diorama => {
      const readable = isReadableDiorama(entry);
      if (!readable) console.warn('Track: skipped an unreadable saved diorama.');
      return readable;
    });
  } catch {
    console.warn('Track: saved dioramas could not be read.');
    return [];
  }
}

function hasId(entry: unknown, id: string) {
  return typeof entry === 'object' && entry !== null && (entry as { id?: unknown }).id === id;
}

function writeEntries(storage: StorageLike, entries: unknown[]) {
  storage.setItem(SAVE_KEY, JSON.stringify({ version: 1, dioramas: entries }));
}

export function writeDiorama(diorama: Diorama, storage = browserStorage()): boolean {
  if (!storage) return false;
  try {
    const entries = readRawEntries(storage);
    const index = entries.findIndex((entry) => hasId(entry, diorama.id));
    if (index >= 0) entries[index] = diorama;
    else entries.push(diorama);
    writeEntries(storage, entries);
    return true;
  } catch {
    return false;
  }
}

export function removeDiorama(id: string, storage = browserStorage()): boolean {
  if (!storage) return false;
  try {
    writeEntries(
      storage,
      readRawEntries(storage).filter((entry) => !hasId(entry, id)),
    );
    return true;
  } catch {
    return false;
  }
}
