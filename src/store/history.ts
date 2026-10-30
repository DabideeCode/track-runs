import type { Piece } from '@/domain/types';

const MAX_STEPS = 50;

export interface History {
  past: Piece[][];
  future: Piece[][];
}

export const emptyHistory: History = { past: [], future: [] };

export function recordEdit(history: History, before: Piece[]): History {
  return { past: [...history.past, before].slice(-MAX_STEPS), future: [] };
}

export function undo(history: History, current: Piece[]) {
  const pieces = history.past[history.past.length - 1];
  if (!pieces) return null;
  return {
    pieces,
    history: { past: history.past.slice(0, -1), future: [current, ...history.future] },
  };
}

export function redo(history: History, current: Piece[]) {
  const [pieces, ...future] = history.future;
  if (!pieces) return null;
  return {
    pieces,
    history: { past: [...history.past, current].slice(-MAX_STEPS), future },
  };
}
