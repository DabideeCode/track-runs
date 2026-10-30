/**
 * Linear undo and redo history for build actions (Requirement 13).
 *
 * Pure functions: inputs are never mutated, and every returned array, entry
 * and piece is a fresh copy, so callers cannot alias history internals.
 *
 * Undo applies the exact inverse of an entry without re-validating. History is
 * linear, so the inverse always restores a state that existed and was valid.
 * Redo re-applies the entry, recreating the same ids and values (13.4).
 */

import type { Piece, Placement, Rotation } from './types';

export type HistoryEntry =
  | { kind: 'place'; piece: Piece; index: number }
  | { kind: 'remove'; piece: Piece; index: number }
  | { kind: 'move'; id: string; from: Placement; to: Placement }
  | { kind: 'rotate'; id: string; from: Rotation; to: Rotation };

/** `past` and `future` are stacks; the last element is the top. */
export interface History {
  past: HistoryEntry[];
  future: HistoryEntry[];
}

/** Retention limit. Exceeds the required 20 (Requirement 13.2, D-25). */
export const HISTORY_LIMIT = 50;

export interface HistoryStep {
  history: History;
  pieces: Piece[];
}

export function emptyHistory(): History {
  return { past: [], future: [] };
}

function copyPiece(p: Piece): Piece {
  return { id: p.id, type: p.type, gridX: p.gridX, gridZ: p.gridZ, rotation: p.rotation };
}

function copyPlacement(p: Placement): Placement {
  return { gridX: p.gridX, gridZ: p.gridZ, rotation: p.rotation };
}

function copyEntry(e: HistoryEntry): HistoryEntry {
  switch (e.kind) {
    case 'place':
    case 'remove':
      return { kind: e.kind, piece: copyPiece(e.piece), index: e.index };
    case 'move':
      return { kind: 'move', id: e.id, from: copyPlacement(e.from), to: copyPlacement(e.to) };
    case 'rotate':
      return { kind: 'rotate', id: e.id, from: e.from, to: e.to };
  }
}

/**
 * Pushes an entry, drops the oldest entries beyond `HISTORY_LIMIT` and clears
 * `future` (Requirements 13.1, 13.2, 13.5).
 */
export function record(h: History, e: HistoryEntry): History {
  const past = [...h.past.map(copyEntry), copyEntry(e)];
  const overflow = past.length - HISTORY_LIMIT;
  return { past: overflow > 0 ? past.slice(overflow) : past, future: [] };
}

function insertAt(pieces: readonly Piece[], piece: Piece, index: number): Piece[] {
  const out = pieces.map(copyPiece);
  const at = Math.max(0, Math.min(Number.isInteger(index) ? index : out.length, out.length));
  out.splice(at, 0, copyPiece(piece));
  return out;
}

function removeById(pieces: readonly Piece[], id: string): Piece[] | null {
  const i = pieces.findIndex((p) => p.id === id);
  if (i < 0) return null;
  const out = pieces.map(copyPiece);
  out.splice(i, 1);
  return out;
}

function updateById(
  pieces: readonly Piece[],
  id: string,
  change: (p: Piece) => Piece,
): Piece[] | null {
  const i = pieces.findIndex((p) => p.id === id);
  if (i < 0) return null;
  const out = pieces.map(copyPiece);
  out[i] = change(out[i]!);
  return out;
}

/** Applies the entry forwards (`'redo'`) or its exact inverse (`'undo'`). */
function applyEntry(
  pieces: readonly Piece[],
  e: HistoryEntry,
  direction: 'undo' | 'redo',
): Piece[] | null {
  const forward = direction === 'redo';
  switch (e.kind) {
    case 'place':
      return forward ? insertAt(pieces, e.piece, e.index) : removeById(pieces, e.piece.id);
    case 'remove':
      return forward ? removeById(pieces, e.piece.id) : insertAt(pieces, e.piece, e.index);
    case 'move': {
      const target = forward ? e.to : e.from;
      return updateById(pieces, e.id, (p) => ({ ...p, ...copyPlacement(target) }));
    }
    case 'rotate': {
      const rotation = forward ? e.to : e.from;
      return updateById(pieces, e.id, (p) => ({ ...p, rotation }));
    }
  }
}

/**
 * Undoes the most recent entry and moves it onto `future`. Returns null when
 * `past` is empty, or when the entry's piece is missing (an inconsistent
 * history), leaving everything unchanged.
 */
export function undo(h: History, pieces: readonly Piece[]): HistoryStep | null {
  const entry = h.past[h.past.length - 1];
  if (entry === undefined) return null;
  const next = applyEntry(pieces, entry, 'undo');
  if (next === null) return null;
  return {
    pieces: next,
    history: {
      past: h.past.slice(0, -1).map(copyEntry),
      future: [...h.future.map(copyEntry), copyEntry(entry)],
    },
  };
}

/**
 * Re-applies the most recently undone entry and moves it back onto `past`.
 * Returns null when `future` is empty, or when the entry's piece is missing.
 */
export function redo(h: History, pieces: readonly Piece[]): HistoryStep | null {
  const entry = h.future[h.future.length - 1];
  if (entry === undefined) return null;
  const next = applyEntry(pieces, entry, 'redo');
  if (next === null) return null;
  return {
    pieces: next,
    history: {
      past: [...h.past.map(copyEntry), copyEntry(entry)],
      future: h.future.slice(0, -1).map(copyEntry),
    },
  };
}
