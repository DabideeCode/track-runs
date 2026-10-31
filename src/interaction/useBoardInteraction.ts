import { useEffect } from 'react';
import type { PieceType } from '@/domain/types';
import {
  beginBoardDrag,
  beginPaletteDrag,
  cancelDrag,
  dropDrag,
  placeAtTile,
  selectPiece,
  setHover,
  updateDragTarget,
} from '@/store/commands';
import { useGameStore } from '@/store/gameStore';
import { boardCanvas, isOverCanvas, pointerRay } from './boardView';
import { pickPiece } from './picking';
import { rayToTile } from './pointerMath';

const DRAG_THRESHOLD = 4;

type Press =
  | { kind: 'palette'; type: PieceType; x: number; y: number; dragging: boolean }
  | { kind: 'board'; pieceId: string | null; x: number; y: number; dragging: boolean };

let press: Press | null = null;
let suppressPaletteClick = false;

export function pressPalette(type: PieceType, clientX: number, clientY: number): void {
  press = { kind: 'palette', type, x: clientX, y: clientY, dragging: false };
}

/** A drag that ends on its own palette button still fires a click, which must not select the tool. */
export function consumePaletteClick(): boolean {
  const suppressed = suppressPaletteClick;
  suppressPaletteClick = false;
  return suppressed;
}

function tileAt(clientX: number, clientY: number) {
  if (!isOverCanvas(clientX, clientY)) return null;
  const ray = pointerRay(clientX, clientY);
  return ray ? rayToTile(ray) : null;
}

function pieceAt(clientX: number, clientY: number) {
  const ray = pointerRay(clientX, clientY);
  return ray ? pickPiece(ray, useGameStore.getState().pieces) : null;
}

/** One controller for all board input. It listens on window so a palette drag can cross the overlay. */
export function useBoardInteraction(): void {
  useEffect(() => {
    let cameraButton: number | null = null;

    const updateHover = (event: PointerEvent) => {
      const state = useGameStore.getState();
      if (state.mode === 'play' || !isOverCanvas(event.clientX, event.clientY)) {
        setHover(null, null);
        return;
      }
      const tile = tileAt(event.clientX, event.clientY);
      const piece = state.selectedTool ? null : pieceAt(event.clientX, event.clientY);
      setHover(tile, piece?.id ?? null);
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.target !== boardCanvas()) return;
      if (event.button !== 0) {
        cameraButton = event.button;
        setHover(null, null);
        return;
      }
      if (useGameStore.getState().mode === 'play') return;
      const piece = pieceAt(event.clientX, event.clientY);
      press = { kind: 'board', pieceId: piece?.id ?? null, x: event.clientX, y: event.clientY, dragging: false };
    };

    const startDragIfMoved = (event: PointerEvent) => {
      if (!press || press.dragging) return;
      if (Math.hypot(event.clientX - press.x, event.clientY - press.y) < DRAG_THRESHOLD) return;
      if (press.kind === 'palette') {
        press.dragging = true;
        beginPaletteDrag(press.type);
      } else if (press.pieceId && !useGameStore.getState().selectedTool) {
        press.dragging = true;
        beginBoardDrag(press.pieceId);
      }
    };

    const onPointerMove = (event: PointerEvent) => {
      if (cameraButton !== null) return;
      startDragIfMoved(event);
      if (useGameStore.getState().drag) {
        setHover(null, null);
        updateDragTarget(tileAt(event.clientX, event.clientY));
      } else {
        updateHover(event);
      }
    };

    const onPointerUp = (event: PointerEvent) => {
      if (event.button !== 0) {
        if (event.button === cameraButton) cameraButton = null;
        return;
      }
      const finished = press;
      press = null;
      if (useGameStore.getState().drag) {
        updateDragTarget(tileAt(event.clientX, event.clientY));
        dropDrag();
      }
      if (!finished) return;
      if (finished.kind === 'palette') {
        suppressPaletteClick = finished.dragging;
      } else if (!finished.dragging) {
        handleClick(event, finished.pieceId);
      }
    };

    const handleClick = (event: PointerEvent, pieceId: string | null) => {
      const state = useGameStore.getState();
      if (state.mode === 'play') return;
      if (state.selectedTool) {
        const tile = tileAt(event.clientX, event.clientY);
        if (tile) placeAtTile(tile);
      } else {
        selectPiece(pieceId);
      }
    };

    const abandon = () => {
      press = null;
      cameraButton = null;
      cancelDrag();
    };

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
    };
  }, []);

  useEffect(
    () =>
      useGameStore.subscribe((state) => {
        const canvas = boardCanvas();
        if (!canvas) return;
        const cursor = state.drag ? 'grabbing' : state.hoveredPieceId ? 'pointer' : '';
        if (canvas.style.cursor !== cursor) canvas.style.cursor = cursor;
      }),
    [],
  );
}
