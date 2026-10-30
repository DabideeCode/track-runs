import type { Piece, PieceType } from '@/domain/types';
import { pieceAtTile } from '@/domain/rules';
import { useGameStore } from '@/store/gameStore';
import { isCanvas, pieceAt, tileAt } from './pointerRay';

const DRAG_THRESHOLD_PX = 4;

interface PendingPress {
  source: 'palette' | 'board';
  type: PieceType | null;
  piece: Piece | null;
  x: number;
  y: number;
}

let pending: PendingPress | null = null;
let draggedRecently = false;
let lastPointer: PointerEvent | null = null;

const store = () => useGameStore.getState();

export function didJustDrag() {
  return draggedRecently;
}

export function pressPaletteItem(event: PointerEvent, type: PieceType) {
  pending = { source: 'palette', type, piece: null, x: event.clientX, y: event.clientY };
  draggedRecently = false;
}

// With a tool active the board acts on the tile under the pointer, so a free tile can always be reached.
function pieceUnderPointer(event: PointerEvent) {
  const { pieces, selectedTool } = store();
  if (!selectedTool) return pieceAt(event.clientX, event.clientY, pieces);
  const tile = tileAt(event.clientX, event.clientY);
  return tile ? pieceAtTile(pieces, tile.x, tile.z) : null;
}

function onPointerDown(event: PointerEvent) {
  if (event.button !== 0 || !isCanvas(event.target) || store().mode !== 'build') return;
  const piece = pieceUnderPointer(event);
  pending = { source: 'board', type: piece?.type ?? null, piece, x: event.clientX, y: event.clientY };
  draggedRecently = false;
}

function startDragIfMoved(event: PointerEvent) {
  if (!pending || store().drag) return;
  if (Math.hypot(event.clientX - pending.x, event.clientY - pending.y) < DRAG_THRESHOLD_PX) return;
  if (pending.source === 'palette') {
    store().beginDrag({ source: 'palette', type: pending.type!, pieceId: null, rotation: 0 });
  } else if (pending.piece) {
    const { id, type, rotation } = pending.piece;
    store().beginDrag({ source: 'board', type, pieceId: id, rotation });
  }
}

function updatePointerTargets(event: PointerEvent) {
  const overCanvas = isCanvas(event.target);
  if (store().drag) {
    store().updateDrag(overCanvas ? tileAt(event.clientX, event.clientY) : null);
    return;
  }
  if (store().mode !== 'build' || !overCanvas) {
    store().setHover(null, null);
    return;
  }
  store().setHover(tileAt(event.clientX, event.clientY), pieceUnderPointer(event)?.id ?? null);
}

function onPointerMove(event: PointerEvent) {
  lastPointer = event;
  startDragIfMoved(event);
  updatePointerTargets(event);
}

// The camera can move under a still pointer, for example on wheel zoom or Reset view.
export function refreshPointerTargets() {
  if (lastPointer) updatePointerTargets(lastPointer);
}

function onPointerUp(event: PointerEvent) {
  if (event.button !== 0) return;
  const press = pending;
  pending = null;
  if (store().drag) {
    store().updateDrag(isCanvas(event.target) ? tileAt(event.clientX, event.clientY) : null);
    store().commitDrag();
    draggedRecently = true;
    return;
  }
  if (press?.source === 'board' && isCanvas(event.target)) {
    store().clickBoard(tileAt(event.clientX, event.clientY), press.piece?.id ?? null);
  }
}

function abandon() {
  pending = null;
  store().cancelDrag();
}

export function installPointerControls() {
  window.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', abandon);
  window.addEventListener('blur', abandon);
  return () => {
    window.removeEventListener('pointerdown', onPointerDown);
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', abandon);
    window.removeEventListener('blur', abandon);
    abandon();
  };
}
