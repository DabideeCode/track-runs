import type { PieceType } from '@/domain/types';
import type { AppState } from '@/store/gameStore';

/** One piece drawn on its own rather than in a batch, because it is animating or highlighted. */
export interface ActiveEntry {
  key: string;
  type: PieceType;
  pieceId: string;
  fxKey: string | null;
  fades: boolean;
}

export function activeEntries(state: AppState): ActiveEntry[] {
  const entries = new Map<string, ActiveEntry>();

  for (const fx of state.fx) {
    const fades = fx.kind === 'delete' || fx.kind === 'rejectNew';
    const key = fades ? `fade-${fx.key}` : fx.piece.id;
    entries.set(key, { key, type: fx.piece.type, pieceId: fx.piece.id, fxKey: fx.key, fades });
  }

  const addPiece = (id: string | null) => {
    if (!id || entries.has(id)) return;
    const piece = state.pieces.find((candidate) => candidate.id === id);
    if (piece) entries.set(id, { key: id, type: piece.type, pieceId: id, fxKey: null, fades: false });
  };
  addPiece(state.drag?.pieceId ?? null);
  addPiece(state.selectedPieceId);
  addPiece(state.hoveredPieceId);

  return [...entries.values()];
}

/** Ids of pieces drawn individually, as a stable string so a selector only changes when they do. */
export function activeIdsKey(state: AppState): string {
  return activeEntries(state)
    .map((entry) => entry.pieceId)
    .sort()
    .join(' ');
}
