import { create } from 'zustand';
import type { Tile } from '@/domain/grid';
import type { AudioSettings, Diorama, GameState, Piece, PieceType, Rotation } from '@/domain/types';
import { DEFAULT_AUDIO } from '@/persistence/audioSettings';

export const UNDO_LIMIT = 50;
const TOAST_MS = 3000;

export interface DragState {
  source: 'palette' | 'board';
  pieceType: PieceType;
  pieceId: string | null;
  origin: Tile | null;
  originRotation: Rotation;
  target: Tile | null;
  rotation: Rotation;
  valid: boolean;
}

export type DialogState =
  | { kind: 'delete'; dioramaId: string; name: string }
  | { kind: 'rename'; dioramaId: string; name: string }
  | { kind: 'unsaved' };

/** A short visual change, so a piece can animate after the store has already been updated. */
export interface PieceFx {
  key: string;
  kind: 'drop' | 'slide' | 'rotate' | 'delete' | 'rejectNew' | 'rejectBoard';
  piece: Piece;
  from: { x: number; z: number; rotation: Rotation } | null;
}

export interface AppState extends GameState {
  screen: 'menu' | 'playfield';
  drag: DragState | null;
  ghostRotation: Rotation;
  hoveredPieceId: string | null;
  hoverTile: Tile | null;
  undoStack: Piece[][];
  redoStack: Piece[][];
  toast: { id: string; message: string } | null;
  dialog: DialogState | null;
  audio: AudioSettings;
  lowQuality: boolean;
  savedDioramas: Diorama[];
  fx: PieceFx[];
}

export function freshDiorama(): GameState {
  return {
    pieces: [],
    selectedTool: null,
    selectedPieceId: null,
    mode: 'build',
    driveMode: 'auto',
    setting: 'bedroom',
    startFacing: 0,
    dioramaId: null,
    dioramaName: 'Untitled diorama',
    isDirty: false,
  };
}

export const useGameStore = create<AppState>(() => ({
  ...freshDiorama(),
  screen: 'menu',
  drag: null,
  ghostRotation: 0,
  hoveredPieceId: null,
  hoverTile: null,
  undoStack: [],
  redoStack: [],
  toast: null,
  dialog: null,
  audio: DEFAULT_AUDIO,
  lowQuality: false,
  savedDioramas: [],
  fx: [],
}));

let toastTimer: ReturnType<typeof setTimeout> | undefined;
let toastCount = 0;

/** One toast at a time: a new message replaces the current one. */
export function showToast(message: string): void {
  clearTimeout(toastTimer);
  toastCount += 1;
  useGameStore.setState({ toast: { id: String(toastCount), message } });
  toastTimer = setTimeout(() => useGameStore.setState({ toast: null }), TOAST_MS);
}
