import { nanoid } from 'nanoid';
import { create } from 'zustand';
import { play } from '@/audio/audioEngine';
import { autoAdjustRotation } from '@/domain/autoAdjust';
import { nextRotation } from '@/domain/catalog';
import { hasNewConnection } from '@/domain/connections';
import { nextDefaultName, validateName } from '@/domain/names';
import { validatePlacement } from '@/domain/rules';
import type {
  ActionResult,
  Diorama,
  DriveMode,
  GameState,
  Mode,
  Piece,
  PieceType,
  PlaceResult,
  ReasonCode,
  Rotation,
  Setting,
} from '@/domain/types';
import { readDioramas, removeDiorama, writeDiorama } from '@/persistence/saveFile';
import { emptyHistory, recordEdit, redo, undo, type History } from './history';
import { setDriveStyle, startTrain, stopTrain } from './trainRuntime';

const AUTOSAVE_SECONDS = 30;
const INVALID_SOUND_REASONS: readonly ReasonCode[] = ['out_of_bounds', 'station_limit', 'on_track', 'occupied'];

export interface Tile {
  x: number;
  z: number;
}

export interface DragState {
  source: 'palette' | 'board';
  type: PieceType;
  pieceId: string | null;
  rotation: Rotation;
  tile: Tile | null;
  valid: boolean;
}

export interface RejectedDrop {
  key: number;
  pieceId: string | null;
  type: PieceType;
  rotation: Rotation;
  tile: Tile | null;
  origin: Tile | null;
}

export interface ExitingPiece {
  key: number;
  piece: Piece;
}

export type DialogState = { kind: 'delete'; id: string; name: string } | { kind: 'unsaved' } | null;

interface StoreState extends GameState {
  screen: 'menu' | 'playfield';
  savedDioramas: Diorama[];
  createdAt: string | null;
  drag: DragState | null;
  toolRotation: Rotation;
  hoverTile: Tile | null;
  hoverPieceId: string | null;
  toast: { id: number; message: string } | null;
  dialog: DialogState;
  lowQuality: boolean;
  cameraResetToken: number;
  history: History;
  exiting: ExitingPiece[];
  rejected: RejectedDrop | null;
}

interface StoreActions {
  placePiece(type: PieceType, gridX: number, gridZ: number, rotation?: Rotation): PlaceResult;
  placeWithAdjust(type: PieceType, gridX: number, gridZ: number, startRotation: Rotation): PlaceResult;
  movePiece(id: string, gridX: number, gridZ: number, rotation?: Rotation): ActionResult;
  rotatePiece(id: string): ActionResult;
  removePiece(id: string): ActionResult;
  selectPiece(id: string | null): void;
  selectTool(type: PieceType | null): void;
  rotateActive(): void;
  clickBoard(tile: Tile | null, pieceId: string | null): void;
  beginDrag(drag: Pick<DragState, 'source' | 'type' | 'pieceId' | 'rotation'>): void;
  updateDrag(tile: Tile | null): void;
  commitDrag(): void;
  cancelDrag(): void;
  escape(): void;
  setHover(tile: Tile | null, pieceId: string | null): void;
  setMode(mode: Mode): ActionResult;
  setDriveMode(mode: DriveMode): void;
  setSetting(setting: Setting): void;
  flipDirection(): void;
  showToast(message: string): void;
  clearToast(id: number): void;
  requestCameraReset(): void;
  setLowQuality(lowQuality: boolean): void;
  undo(): void;
  redo(): void;
  refreshSaved(): void;
  newDiorama(): void;
  openDiorama(id: string): void;
  saveDiorama(kind?: 'manual' | 'auto'): boolean;
  renameDiorama(id: string, name: string): { ok: boolean; message?: string };
  requestDelete(id: string): void;
  confirmDelete(): void;
  closeDialog(): void;
  requestBack(): void;
  saveAndLeave(): void;
  returnToMenu(): void;
  clearExiting(key: number): void;
  clearRejected(key: number): void;
}

export type GameStore = StoreState & StoreActions;

let thumbnailCapture: (() => string | undefined) | null = null;
let nextKey = 1;

export function registerThumbnailCapture(capture: (() => string | undefined) | null) {
  thumbnailCapture = capture;
}

function emptySession(name: string) {
  return {
    pieces: [],
    selectedTool: null,
    selectedPieceId: null,
    mode: 'build',
    driveMode: 'auto',
    setting: 'bedroom',
    startFacing: 0,
    dioramaId: null,
    dioramaName: name,
    isDirty: false,
    createdAt: null,
    drag: null,
    toolRotation: 0,
    hoverTile: null,
    hoverPieceId: null,
    history: emptyHistory,
    exiting: [],
    rejected: null,
  } satisfies Partial<StoreState>;
}

function failure(reason: ReasonCode): ActionResult {
  if (INVALID_SOUND_REASONS.includes(reason)) play('invalid');
  return { ok: false, reason };
}

export const useGameStore = create<GameStore>()((set, get) => {
  function commitPieces(pieces: Piece[]) {
    const before = get().pieces;
    set({ pieces, isDirty: true, history: recordEdit(get().history, before) });
    return hasNewConnection(before, pieces);
  }

  function attemptPlace(type: PieceType, gridX: number, gridZ: number, rotation: Rotation, adjust: boolean): PlaceResult {
    const { pieces, mode } = get();
    const reason = validatePlacement(pieces, { mode, type, gridX, gridZ });
    if (reason) return failure(reason);

    const piece: Piece = { id: nanoid(), type, gridX, gridZ, rotation };
    if (adjust) piece.rotation = autoAdjustRotation(pieces, piece);
    const connected = commitPieces([...pieces, piece]);
    play('place');
    if (connected) play('snap');
    return { ok: true, id: piece.id };
  }

  return {
    ...emptySession('Untitled diorama'),
    screen: 'menu',
    savedDioramas: [],
    toast: null,
    dialog: null,
    lowQuality: false,
    cameraResetToken: 0,

    placePiece(type, gridX, gridZ, rotation) {
      return attemptPlace(type, gridX, gridZ, rotation ?? 0, rotation === undefined);
    },

    placeWithAdjust(type, gridX, gridZ, startRotation) {
      return attemptPlace(type, gridX, gridZ, startRotation, true);
    },

    movePiece(id, gridX, gridZ, rotation) {
      const { pieces, mode } = get();
      const piece = pieces.find((candidate) => candidate.id === id);
      const reason = validatePlacement(pieces, {
        mode,
        type: piece?.type ?? 'straight',
        gridX,
        gridZ,
        movingId: id,
      });
      if (reason) return failure(reason);

      const current = piece!;
      const startRotation = rotation ?? current.rotation;
      if (current.gridX === gridX && current.gridZ === gridZ && current.rotation === startRotation) {
        play('move');
        return { ok: true };
      }

      const others = pieces.filter((candidate) => candidate.id !== id);
      const moved: Piece = { ...current, gridX, gridZ, rotation: startRotation };
      moved.rotation = autoAdjustRotation(others, moved);
      const connected = commitPieces(pieces.map((candidate) => (candidate.id === id ? moved : candidate)));
      play('move');
      if (connected) play('snap');
      return { ok: true };
    },

    rotatePiece(id) {
      const { pieces, mode } = get();
      if (mode === 'play') return failure('play_mode');
      const piece = pieces.find((candidate) => candidate.id === id);
      if (!piece) return failure('not_found');
      const rotated = { ...piece, rotation: nextRotation(piece.rotation) };
      const connected = commitPieces(pieces.map((candidate) => (candidate.id === id ? rotated : candidate)));
      play('rotate');
      if (connected) play('snap');
      return { ok: true };
    },

    removePiece(id) {
      const { pieces, mode, selectedPieceId, exiting } = get();
      if (mode === 'play') return failure('play_mode');
      const piece = pieces.find((candidate) => candidate.id === id);
      if (!piece) return failure('not_found');
      commitPieces(pieces.filter((candidate) => candidate.id !== id));
      set({
        selectedPieceId: selectedPieceId === id ? null : selectedPieceId,
        exiting: [...exiting, { key: nextKey++, piece }],
      });
      play('delete');
      return { ok: true };
    },

    selectPiece(id) {
      set({ selectedPieceId: id, selectedTool: null, toolRotation: 0 });
    },

    selectTool(type) {
      const { selectedTool, mode } = get();
      if (mode === 'play') return;
      set({
        selectedTool: type === selectedTool ? null : type,
        selectedPieceId: null,
        toolRotation: 0,
      });
    },

    rotateActive() {
      const { drag, selectedPieceId, selectedTool, toolRotation, rotatePiece } = get();
      if (drag) {
        set({ drag: { ...drag, rotation: nextRotation(drag.rotation) } });
        play('rotate');
      } else if (selectedPieceId) {
        rotatePiece(selectedPieceId);
      } else if (selectedTool) {
        set({ toolRotation: nextRotation(toolRotation) });
        play('rotate');
      }
    },

    clickBoard(tile, pieceId) {
      const { selectedTool, toolRotation, selectPiece, placeWithAdjust } = get();
      if (pieceId) {
        selectPiece(pieceId);
      } else if (selectedTool && tile) {
        const result = placeWithAdjust(selectedTool, tile.x, tile.z, toolRotation);
        if (result.ok && selectedTool === 'station') set({ selectedTool: null, toolRotation: 0 });
      } else if (!selectedTool) {
        set({ selectedPieceId: null });
      }
    },

    beginDrag({ source, type, pieceId, rotation }) {
      set({
        drag: { source, type, pieceId, rotation, tile: null, valid: false },
        selectedTool: source === 'palette' ? type : null,
        selectedPieceId: source === 'board' ? pieceId : null,
        rejected: null,
      });
      play('pickup');
    },

    updateDrag(tile) {
      const { drag, pieces, mode } = get();
      if (!drag) return;
      if (drag.tile?.x === tile?.x && drag.tile?.z === tile?.z) return;
      const valid = tile !== null && validatePlacement(pieces, {
        mode,
        type: drag.type,
        gridX: tile.x,
        gridZ: tile.z,
        movingId: drag.pieceId ?? undefined,
      }) === null;
      set({ drag: { ...drag, tile, valid } });
    },

    commitDrag() {
      const { drag, pieces, placeWithAdjust, movePiece } = get();
      if (!drag) return;
      set({ drag: null, selectedTool: null, toolRotation: 0 });

      let accepted = false;
      if (drag.tile) {
        if (drag.source === 'palette') {
          const result = placeWithAdjust(drag.type, drag.tile.x, drag.tile.z, drag.rotation);
          accepted = result.ok;
          if (result.id) set({ selectedPieceId: result.id });
        } else {
          accepted = movePiece(drag.pieceId!, drag.tile.x, drag.tile.z, drag.rotation).ok;
        }
      } else {
        play('invalid');
      }

      if (!accepted) {
        const home = pieces.find((piece) => piece.id === drag.pieceId);
        set({
          rejected: {
            key: nextKey++,
            pieceId: drag.pieceId,
            type: drag.type,
            rotation: drag.rotation,
            tile: drag.tile,
            origin: home ? { x: home.gridX, z: home.gridZ } : null,
          },
        });
      }
    },

    cancelDrag() {
      if (get().drag) set({ drag: null, selectedTool: null, toolRotation: 0 });
    },

    escape() {
      const { drag, selectedTool, cancelDrag } = get();
      if (drag) cancelDrag();
      else if (selectedTool) set({ selectedTool: null, toolRotation: 0 });
      else set({ selectedPieceId: null });
    },

    setHover(tile, pieceId) {
      const { hoverTile, hoverPieceId } = get();
      if (hoverTile?.x === tile?.x && hoverTile?.z === tile?.z && hoverPieceId === pieceId) return;
      set({ hoverTile: tile, hoverPieceId: pieceId });
    },

    setMode(mode) {
      const state = get();
      if (mode === state.mode) return { ok: true };
      if (mode === 'play') {
        if (!state.pieces.some((piece) => piece.type === 'station')) {
          state.showToast('Place a station to start');
          return { ok: false, reason: 'no_station' };
        }
        set({
          mode: 'play',
          driveMode: 'auto',
          drag: null,
          selectedTool: null,
          selectedPieceId: null,
          toolRotation: 0,
          hoverTile: null,
          hoverPieceId: null,
        });
        play('whistle');
        startTrain(state.pieces, state.startFacing);
        return { ok: true };
      }
      stopTrain();
      set({ mode: 'build' });
      return { ok: true };
    },

    setDriveMode(mode) {
      set({ driveMode: mode });
      setDriveStyle(mode);
    },

    setSetting(setting) {
      if (setting !== get().setting) set({ setting, isDirty: true });
    },

    flipDirection() {
      const { mode, startFacing } = get();
      if (mode === 'build') set({ startFacing: startFacing === 0 ? 180 : 0, isDirty: true });
    },

    showToast(message) {
      set({ toast: { id: nextKey++, message } });
    },

    clearToast(id) {
      if (get().toast?.id === id) set({ toast: null });
    },

    requestCameraReset() {
      set({ cameraResetToken: get().cameraResetToken + 1 });
    },

    setLowQuality(lowQuality) {
      set({ lowQuality });
    },

    undo() {
      const { mode, history, pieces, selectedPieceId } = get();
      if (mode !== 'build') return;
      const result = undo(history, pieces);
      if (!result) return;
      set({
        pieces: result.pieces,
        history: result.history,
        isDirty: true,
        selectedPieceId: result.pieces.some((piece) => piece.id === selectedPieceId) ? selectedPieceId : null,
      });
    },

    redo() {
      const { mode, history, pieces, selectedPieceId } = get();
      if (mode !== 'build') return;
      const result = redo(history, pieces);
      if (!result) return;
      set({
        pieces: result.pieces,
        history: result.history,
        isDirty: true,
        selectedPieceId: result.pieces.some((piece) => piece.id === selectedPieceId) ? selectedPieceId : null,
      });
    },

    refreshSaved() {
      set({ savedDioramas: readDioramas() });
    },

    newDiorama() {
      const saved = readDioramas();
      set({
        ...emptySession(nextDefaultName(saved.map((diorama) => diorama.name))),
        savedDioramas: saved,
        screen: 'playfield',
      });
    },

    openDiorama(id) {
      const saved = readDioramas();
      const diorama = saved.find((candidate) => candidate.id === id);
      if (!diorama) return;
      set({
        ...emptySession(diorama.name),
        savedDioramas: saved,
        screen: 'playfield',
        pieces: structuredClone(diorama.pieces),
        setting: diorama.setting,
        startFacing: diorama.startFacing,
        dioramaId: diorama.id,
        createdAt: diorama.createdAt,
      });
    },

    saveDiorama(kind = 'manual') {
      const state = get();
      const now = new Date().toISOString();
      const id = state.dioramaId ?? nanoid();
      const createdAt = state.createdAt ?? now;
      const previous = state.savedDioramas.find((diorama) => diorama.id === id);
      const thumbnail = thumbnailCapture?.() ?? previous?.thumbnail;
      const diorama: Diorama = {
        id,
        name: state.dioramaName,
        setting: state.setting,
        startFacing: state.startFacing,
        pieces: structuredClone(state.pieces),
        createdAt,
        updatedAt: now,
        ...(thumbnail ? { thumbnail } : {}),
      };
      if (!writeDiorama(diorama)) {
        state.showToast('Could not save. Storage may be full.');
        return false;
      }
      set({ dioramaId: id, createdAt, isDirty: false, savedDioramas: readDioramas() });
      state.showToast(kind === 'auto' ? 'Autosaved' : 'Saved');
      return true;
    },

    renameDiorama(id, name) {
      const result = validateName(name);
      if (!result.ok) return { ok: false, message: result.message };
      const diorama = readDioramas().find((candidate) => candidate.id === id);
      if (!diorama) return { ok: false, message: 'This diorama no longer exists.' };
      const saved = writeDiorama({ ...diorama, name: result.name, updatedAt: new Date().toISOString() });
      if (!saved) return { ok: false, message: 'Could not save. Storage may be full.' };
      get().refreshSaved();
      return { ok: true };
    },

    requestDelete(id) {
      const diorama = get().savedDioramas.find((candidate) => candidate.id === id);
      if (diorama) set({ dialog: { kind: 'delete', id, name: diorama.name } });
    },

    confirmDelete() {
      const { dialog, refreshSaved, showToast } = get();
      if (dialog?.kind !== 'delete') return;
      if (!removeDiorama(dialog.id)) showToast('Could not save. Storage may be full.');
      set({ dialog: null });
      refreshSaved();
    },

    closeDialog() {
      set({ dialog: null });
    },

    requestBack() {
      const { isDirty, returnToMenu } = get();
      if (isDirty) set({ dialog: { kind: 'unsaved' } });
      else returnToMenu();
    },

    saveAndLeave() {
      const { saveDiorama, returnToMenu } = get();
      set({ dialog: null });
      if (saveDiorama()) returnToMenu();
    },

    returnToMenu() {
      stopTrain();
      set({
        ...emptySession('Untitled diorama'),
        screen: 'menu',
        dialog: null,
        savedDioramas: readDioramas(),
      });
    },

    clearExiting(key) {
      set({ exiting: get().exiting.filter((entry) => entry.key !== key) });
    },

    clearRejected(key) {
      if (get().rejected?.key === key) set({ rejected: null });
    },
  };
});

export function startAutosave() {
  const timer = window.setInterval(() => {
    const { mode, isDirty, drag, screen, saveDiorama } = useGameStore.getState();
    if (screen === 'playfield' && mode === 'build' && isDirty && !drag) saveDiorama('auto');
  }, AUTOSAVE_SECONDS * 1000);
  return () => window.clearInterval(timer);
}
