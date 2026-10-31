import { nanoid } from 'nanoid';
import { emitSound } from '@/audio/soundLog';
import { autoAdjustRotation } from '@/domain/autoAdjust';
import { isPieceType, isRotation, nextRotation } from '@/domain/catalogue';
import { getConnections } from '@/domain/connectors';
import { footprintCentre, type Tile } from '@/domain/grid';
import { nextDefaultName, normaliseName } from '@/domain/naming';
import { validateMove, validatePlace, validateTarget } from '@/domain/rules';
import type {
  ActionResult,
  AudioSettings,
  Diorama,
  GameState,
  Piece,
  PieceType,
  PlaceResult,
  ReasonCode,
  Rotation,
} from '@/domain/types';
import { saveAudioSettings } from '@/persistence/audioSettings';
import { listDioramas, removeDiorama, writeDiorama } from '@/persistence/saveRepository';
import { parkTrain, startTrain } from '@/train/runtime';
import { freshDiorama, showToast, UNDO_LIMIT, useGameStore, type AppState, type PieceFx } from './gameStore';
import { captureThumbnail } from './thumbnail';

const FX_LIMIT = 300;
let fxCount = 0;

const state = () => useGameStore.getState();

function refuse(reason: ReasonCode): { ok: false; reason: ReasonCode } {
  emitSound('invalid');
  return { ok: false, reason };
}

function fxFor(kind: PieceFx['kind'], piece: Piece, from: PieceFx['from'] = null): PieceFx {
  fxCount += 1;
  return { key: String(fxCount), kind, piece, from };
}

/** A piece runs one effect at a time, so a new one replaces any still running for that piece. */
function withFx(fx: PieceFx): PieceFx[] {
  return [...state().fx.filter((item) => item.piece.id !== fx.piece.id), fx].slice(-FX_LIMIT);
}

export function clearFx(key: string): void {
  useGameStore.setState((current) => ({ fx: current.fx.filter((item) => item.key !== key) }));
}

function connectionKeys(pieces: readonly Piece[]): Set<string> {
  return new Set(getConnections(pieces).map((pair) => pair.join('|')));
}

function formsConnection(before: readonly Piece[], after: readonly Piece[]): boolean {
  const known = connectionKeys(before);
  return [...connectionKeys(after)].some((key) => !known.has(key));
}

/** Every change to the pieces goes through here, so history and unsaved state cannot be missed. */
function commitPieces(pieces: Piece[], extra: Partial<AppState> = {}): void {
  const current = state();
  useGameStore.setState({
    pieces,
    undoStack: [...current.undoStack, current.pieces].slice(-UNDO_LIMIT),
    redoStack: [],
    isDirty: true,
    ...extra,
  });
}

function currentPosition(piece: Pick<Piece, 'type' | 'gridX' | 'gridZ' | 'rotation'>): NonNullable<PieceFx['from']> {
  const centre = footprintCentre(piece.type, piece.gridX, piece.gridZ);
  return { x: centre.x, z: centre.z, rotation: piece.rotation };
}

/* Screens and saved dioramas */

const CLEAN_PLAYFIELD = {
  screen: 'playfield',
  undoStack: [],
  redoStack: [],
  drag: null,
  hoverTile: null,
  hoveredPieceId: null,
  ghostRotation: 0,
  fx: [],
} satisfies Partial<AppState>;

export function refreshDioramas({ warn = false } = {}): void {
  useGameStore.setState({ savedDioramas: listDioramas({ warn }) });
}

export function newDiorama(): void {
  const names = state().savedDioramas.map((diorama) => diorama.name);
  useGameStore.setState({ ...freshDiorama(), ...CLEAN_PLAYFIELD, dioramaName: nextDefaultName(names) });
}

export function openDiorama(id: string): void {
  const diorama = state().savedDioramas.find((candidate) => candidate.id === id);
  if (!diorama) return;
  useGameStore.setState({
    ...freshDiorama(),
    ...CLEAN_PLAYFIELD,
    pieces: diorama.pieces,
    setting: diorama.setting,
    startFacing: diorama.startFacing,
    dioramaId: diorama.id,
    dioramaName: diorama.name,
  });
}

/** Saves the open diorama. A failure leaves it unsaved and tells the user. */
export function saveDiorama(message = 'Saved'): boolean {
  const current = state();
  const now = new Date().toISOString();
  const id = current.dioramaId ?? nanoid();
  const diorama: Diorama = {
    id,
    name: current.dioramaName,
    setting: current.setting,
    startFacing: current.startFacing,
    pieces: current.pieces,
    createdAt: current.savedDioramas.find((saved) => saved.id === id)?.createdAt ?? now,
    updatedAt: now,
  };
  const thumbnail = captureThumbnail();
  const saved =
    (thumbnail !== null && writeDiorama({ ...diorama, thumbnail })) || writeDiorama(diorama);
  if (!saved) {
    showToast('Could not save: browser storage is full or unavailable');
    return false;
  }
  useGameStore.setState({ dioramaId: id, isDirty: false });
  refreshDioramas();
  showToast(message);
  return true;
}

function leaveToMenu(): void {
  parkTrain();
  useGameStore.setState({ screen: 'menu', mode: 'build', dialog: null, drag: null, fx: [] });
  refreshDioramas();
}

export function requestBackToMenu(): void {
  if (state().isDirty) useGameStore.setState({ dialog: { kind: 'unsaved' } });
  else leaveToMenu();
}

export function saveAndLeave(): void {
  useGameStore.setState({ dialog: null });
  if (saveDiorama()) leaveToMenu();
}

export function discardAndLeave(): void {
  leaveToMenu();
}

export function closeDialog(): void {
  useGameStore.setState({ dialog: null });
}

export function askRename(dioramaId: string, name: string): void {
  useGameStore.setState({ dialog: { kind: 'rename', dioramaId, name } });
}

export function askDelete(dioramaId: string, name: string): void {
  useGameStore.setState({ dialog: { kind: 'delete', dioramaId, name } });
}

/** Returns false if the name is refused or storage fails, so the dialog can stay open. */
export function renameDiorama(id: string, name: string): boolean {
  const normalised = normaliseName(name);
  const diorama = state().savedDioramas.find((candidate) => candidate.id === id);
  if (normalised === null || !diorama) return false;
  if (!writeDiorama({ ...diorama, name: normalised, updatedAt: new Date().toISOString() })) return false;
  useGameStore.setState({ dialog: null });
  refreshDioramas();
  return true;
}

export function deleteDiorama(id: string): void {
  useGameStore.setState({ dialog: null });
  if (!removeDiorama(id)) showToast('Could not delete: browser storage is unavailable');
  refreshDioramas();
}

/* Tools and selection */

export function selectTool(type: PieceType | null): void {
  const current = state();
  if (current.mode === 'play') return;
  const tool = current.selectedTool === type ? null : type;
  useGameStore.setState({ selectedTool: tool, selectedPieceId: null, ghostRotation: 0 });
}

export function selectPiece(id: string | null): void {
  useGameStore.setState({ selectedPieceId: id, selectedTool: null, ghostRotation: 0 });
}

export function setHover(tile: Tile | null, pieceId: string | null): void {
  const current = state();
  const sameTile = current.hoverTile?.x === tile?.x && current.hoverTile?.z === tile?.z;
  if (sameTile && current.hoveredPieceId === pieceId) return;
  useGameStore.setState({ hoverTile: tile, hoveredPieceId: pieceId });
}

/* Placing, moving, rotating and removing */

export function placePiece(type: PieceType, gridX: number, gridZ: number, rotation?: Rotation): PlaceResult {
  return placeWith(type, gridX, gridZ, rotation ?? 0, rotation === undefined);
}

function placeWith(
  type: PieceType,
  gridX: number,
  gridZ: number,
  rotation: Rotation,
  adjust: boolean,
): PlaceResult {
  const current = state();
  if (!isPieceType(type)) return refuse('not_found');
  const reason = validatePlace(current.pieces, current.mode, type, gridX, gridZ);
  if (reason) return refuse(reason);
  if (!isRotation(rotation)) return refuse('out_of_bounds');

  const finalRotation = adjust ? autoAdjustRotation(type, gridX, gridZ, rotation, current.pieces) : rotation;
  const piece: Piece = { id: nanoid(), type, gridX, gridZ, rotation: finalRotation };
  const pieces = [...current.pieces, piece];
  commitPieces(pieces, { fx: withFx(fxFor('drop', piece)) });
  emitSound('place');
  if (formsConnection(current.pieces, pieces)) emitSound('snap');
  return { ok: true, id: piece.id };
}

/** Click placement with the selected tool. */
export function placeAtTile(tile: Tile): void {
  const { selectedTool, ghostRotation } = state();
  if (!selectedTool) return;
  const result = placeWith(selectedTool, tile.x, tile.z, ghostRotation, true);
  if (result.ok && selectedTool === 'station') selectTool(null);
}

export function movePiece(id: string, gridX: number, gridZ: number): ActionResult {
  return moveWith(id, gridX, gridZ, undefined);
}

function moveWith(id: string, gridX: number, gridZ: number, rotation: Rotation | undefined): ActionResult {
  const current = state();
  const reason = validateMove(current.pieces, current.mode, id, gridX, gridZ);
  if (reason) return refuse(reason);

  const piece = current.pieces.find((candidate) => candidate.id === id)!;
  const startRotation = rotation ?? piece.rotation;
  const finalRotation = autoAdjustRotation(piece.type, gridX, gridZ, startRotation, current.pieces, id);
  const moved: Piece = { ...piece, gridX, gridZ, rotation: finalRotation };
  const pieces = current.pieces.map((candidate) => (candidate.id === id ? moved : candidate));
  commitPieces(pieces, { fx: withFx(fxFor('slide', moved, currentPosition(piece))) });
  emitSound('move');
  if (formsConnection(current.pieces, pieces)) emitSound('snap');
  return { ok: true };
}

export function rotatePiece(id: string): ActionResult {
  const current = state();
  const reason = validateTarget(current.pieces, current.mode, id);
  if (reason) return refuse(reason);

  const piece = current.pieces.find((candidate) => candidate.id === id)!;
  const rotated: Piece = { ...piece, rotation: nextRotation(piece.rotation) };
  const pieces = current.pieces.map((candidate) => (candidate.id === id ? rotated : candidate));
  commitPieces(pieces, { fx: withFx(fxFor('rotate', rotated, currentPosition(piece))) });
  emitSound('rotate');
  if (formsConnection(current.pieces, pieces)) emitSound('snap');
  return { ok: true };
}

export function removePiece(id: string): ActionResult {
  const current = state();
  const reason = validateTarget(current.pieces, current.mode, id);
  if (reason) return refuse(reason);

  const piece = current.pieces.find((candidate) => candidate.id === id)!;
  commitPieces(
    current.pieces.filter((candidate) => candidate.id !== id),
    {
      fx: withFx(fxFor('delete', piece)),
      selectedPieceId: current.selectedPieceId === id ? null : current.selectedPieceId,
      hoveredPieceId: current.hoveredPieceId === id ? null : current.hoveredPieceId,
    },
  );
  emitSound('delete');
  return { ok: true };
}

export function removeSelected(): void {
  const { selectedPieceId } = state();
  if (selectedPieceId) removePiece(selectedPieceId);
}

/** R: turns the dragged piece, the tool's ghost, or the selected piece. */
export function rotateActive(): void {
  const current = state();
  if (current.mode === 'play') return;
  if (current.drag) {
    useGameStore.setState({ drag: { ...current.drag, rotation: nextRotation(current.drag.rotation) } });
    emitSound('rotate');
  } else if (current.selectedTool) {
    useGameStore.setState({ ghostRotation: nextRotation(current.ghostRotation) });
    emitSound('rotate');
  } else if (current.selectedPieceId) {
    rotatePiece(current.selectedPieceId);
  }
}

/* Dragging */

export function beginPaletteDrag(type: PieceType): void {
  const current = state();
  if (current.mode === 'play' || current.drag) return;
  if (type === 'station' && current.pieces.some((piece) => piece.type === 'station')) return;
  emitSound('pickup');
  useGameStore.setState({
    drag: {
      source: 'palette',
      pieceType: type,
      pieceId: null,
      origin: null,
      originRotation: 0,
      target: null,
      rotation: 0,
      valid: false,
    },
  });
}

export function beginBoardDrag(id: string): void {
  const current = state();
  const piece = current.pieces.find((candidate) => candidate.id === id);
  if (!piece || current.mode === 'play' || current.drag) return;
  emitSound('pickup');
  useGameStore.setState({
    selectedPieceId: id,
    selectedTool: null,
    fx: current.fx.filter((item) => item.piece.id !== id),
    drag: {
      source: 'board',
      pieceType: piece.type,
      pieceId: id,
      origin: { x: piece.gridX, z: piece.gridZ },
      originRotation: piece.rotation,
      target: { x: piece.gridX, z: piece.gridZ },
      rotation: piece.rotation,
      valid: true,
    },
  });
}

export function updateDragTarget(target: Tile | null): void {
  const current = state();
  const { drag } = current;
  if (!drag) return;
  if (drag.target?.x === target?.x && drag.target?.z === target?.z) return;
  const valid =
    target !== null &&
    (drag.pieceId
      ? validateMove(current.pieces, current.mode, drag.pieceId, target.x, target.z)
      : validatePlace(current.pieces, current.mode, drag.pieceType, target.x, target.z)) === null;
  useGameStore.setState({ drag: { ...drag, target, valid } });
}

export function dropDrag(): void {
  const current = state();
  const { drag } = current;
  if (!drag) return;
  useGameStore.setState({ drag: null });
  if (drag.source === 'palette') dropFromPalette(drag);
  else dropFromBoard(drag);
}

function dropFromPalette(drag: NonNullable<AppState['drag']>): void {
  if (drag.target && drag.valid) {
    placeWith(drag.pieceType, drag.target.x, drag.target.z, drag.rotation, true);
    return;
  }
  emitSound('invalid');
  if (!drag.target) return;
  const piece: Piece = {
    id: `reject-${nanoid(6)}`,
    type: drag.pieceType,
    gridX: drag.target.x,
    gridZ: drag.target.z,
    rotation: drag.rotation,
  };
  useGameStore.setState({ fx: withFx(fxFor('rejectNew', piece)) });
}

function dropFromBoard(drag: NonNullable<AppState['drag']>): void {
  const piece = state().pieces.find((candidate) => candidate.id === drag.pieceId);
  if (!piece || !drag.origin) return;

  if (!drag.target || !drag.valid) {
    emitSound('invalid');
    const from = drag.target
      ? currentPosition({ type: piece.type, gridX: drag.target.x, gridZ: drag.target.z, rotation: drag.rotation })
      : currentPosition(piece);
    useGameStore.setState({ fx: withFx(fxFor('rejectBoard', piece, from)) });
    return;
  }
  const sameTile = drag.target.x === drag.origin.x && drag.target.z === drag.origin.z;
  if (sameTile && drag.rotation === drag.originRotation) {
    useGameStore.setState({ fx: withFx(fxFor('drop', piece)) });
    return;
  }
  moveWith(piece.id, drag.target.x, drag.target.z, drag.rotation);
  const moved = state().pieces.find((candidate) => candidate.id === piece.id)!;
  useGameStore.setState({ fx: withFx(fxFor('drop', moved)) });
}

/** Escape: nothing changes and no invalid sound plays, as this was the user's own choice. */
export function cancelDrag(): void {
  const { drag, pieces } = state();
  if (!drag) return;
  useGameStore.setState({ drag: null });
  const piece = pieces.find((candidate) => candidate.id === drag.pieceId);
  if (piece) useGameStore.setState({ fx: withFx(fxFor('slide', piece)) });
}

/* Play mode */

export function setMode(mode: GameState['mode']): ActionResult {
  const current = state();
  if (mode === current.mode) return { ok: true };

  if (mode === 'play') {
    if (!current.pieces.some((piece) => piece.type === 'station')) {
      showToast('Place a station to start');
      return { ok: false, reason: 'no_station' };
    }
    useGameStore.setState({
      mode: 'play',
      driveMode: 'auto',
      selectedTool: null,
      selectedPieceId: null,
      hoveredPieceId: null,
      hoverTile: null,
      drag: null,
      fx: [],
    });
    emitSound('whistle');
    startTrain(current.pieces, current.startFacing);
    return { ok: true };
  }

  parkTrain();
  useGameStore.setState({ mode: 'build' });
  return { ok: true };
}

export function setDriveMode(driveMode: GameState['driveMode']): void {
  useGameStore.setState({ driveMode });
}

export function setSetting(setting: GameState['setting']): void {
  if (setting !== state().setting) useGameStore.setState({ setting, isDirty: true });
}

export function setLowQuality(lowQuality: boolean): void {
  useGameStore.setState({ lowQuality });
}

export function updateAudio(change: Partial<AudioSettings>): void {
  const audio = { ...state().audio, ...change };
  useGameStore.setState({ audio });
  saveAudioSettings(audio);
}

export function flipStartFacing(): void {
  const current = state();
  if (current.mode === 'play') return;
  useGameStore.setState({ startFacing: current.startFacing === 0 ? 180 : 0, isDirty: true });
}

/* Undo and redo */

function restore(pieces: Piece[], undoStack: Piece[][], redoStack: Piece[][]): void {
  const { selectedPieceId } = state();
  useGameStore.setState({
    pieces,
    undoStack,
    redoStack,
    isDirty: true,
    fx: [],
    selectedPieceId: pieces.some((piece) => piece.id === selectedPieceId) ? selectedPieceId : null,
    hoveredPieceId: null,
  });
}

export function undo(): void {
  const { undoStack, redoStack, pieces, mode, drag } = state();
  const previous = undoStack.at(-1);
  if (!previous || mode === 'play' || drag) return;
  restore(previous, undoStack.slice(0, -1), [...redoStack, pieces]);
}

export function redo(): void {
  const { undoStack, redoStack, pieces, mode, drag } = state();
  const next = redoStack.at(-1);
  if (!next || mode === 'play' || drag) return;
  restore(next, [...undoStack, pieces], redoStack.slice(0, -1));
}
