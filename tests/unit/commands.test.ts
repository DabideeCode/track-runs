import { beforeEach, describe, expect, it } from 'vitest';
import { getSoundLog } from '@/audio/soundLog';
import {
  beginBoardDrag,
  beginPaletteDrag,
  cancelDrag,
  dropDrag,
  movePiece,
  newDiorama,
  placeAtTile,
  placePiece,
  redo,
  removePiece,
  rotateActive,
  rotatePiece,
  selectPiece,
  selectTool,
  undo,
  updateDragTarget,
} from '@/store/commands';
import { useGameStore } from '@/store/gameStore';

const state = () => useGameStore.getState();
const lastSounds = (count: number) => getSoundLog().slice(-count);

beforeEach(() => {
  newDiorama();
  useGameStore.setState({ savedDioramas: [] });
});

describe('placePiece', () => {
  it('adds exactly one piece and marks the diorama unsaved', () => {
    const result = placePiece('straight', 2, 3, 90);
    expect(result).toMatchObject({ ok: true });
    expect(state().pieces).toEqual([{ id: result.id, type: 'straight', gridX: 2, gridZ: 3, rotation: 90 }]);
    expect(state().isDirty).toBe(true);
    expect(lastSounds(1)).toEqual(['place']);
  });

  it('applies auto-adjust only when rotation is omitted', () => {
    placePiece('straight', 5, 5, 0);
    expect(placePiece('straight', 5, 4, 90).ok).toBe(true);
    expect(state().pieces[1]?.rotation).toBe(90);
    placePiece('curve', 5, 6);
    expect(state().pieces[2]?.rotation).toBe(180);
  });

  it('plays snap once after place when a connection forms', () => {
    placePiece('straight', 5, 5, 0);
    placePiece('straight', 5, 4, 0);
    expect(lastSounds(2)).toEqual(['place', 'snap']);
    placePiece('straight', 9, 9, 0);
    expect(lastSounds(1)).toEqual(['place']);
  });

  it('plays snap once even when two connections form', () => {
    placePiece('straight', 5, 3, 0);
    placePiece('straight', 5, 5, 0);
    placePiece('straight', 5, 4, 0);
    expect(lastSounds(3)).toEqual(['place', 'place', 'snap']);
  });

  it('refuses with a reason and the invalid sound', () => {
    placePiece('straight', 5, 5, 0);
    expect(placePiece('house', 5, 5)).toEqual({ ok: false, reason: 'on_track' });
    expect(lastSounds(1)).toEqual(['invalid']);
    expect(state().pieces).toHaveLength(1);
  });

  it('returns not_found for an unknown type', () => {
    expect(placePiece('rocket' as never, 1, 1)).toEqual({ ok: false, reason: 'not_found' });
  });
});

describe('placeAtTile', () => {
  it('keeps the tool selected, except the station', () => {
    selectTool('house');
    placeAtTile({ x: 1, z: 1 });
    expect(state().selectedTool).toBe('house');
    selectTool('station');
    placeAtTile({ x: 3, z: 3 });
    expect(state().selectedTool).toBeNull();
  });
});

describe('dragging', () => {
  it('places from the palette on a valid drop', () => {
    beginPaletteDrag('straight');
    updateDragTarget({ x: 4, z: 4 });
    expect(state().drag?.valid).toBe(true);
    dropDrag();
    expect(state().pieces).toHaveLength(1);
    expect(state().drag).toBeNull();
    expect(lastSounds(2)).toEqual(['pickup', 'place']);
  });

  it('cancels off the grid with the invalid sound', () => {
    beginPaletteDrag('straight');
    updateDragTarget(null);
    dropDrag();
    expect(state().pieces).toHaveLength(0);
    expect(lastSounds(1)).toEqual(['invalid']);
  });

  it('moves a board piece on a valid drop, playing move not place', () => {
    const { id } = placePiece('straight', 2, 2, 0);
    beginBoardDrag(id!);
    updateDragTarget({ x: 6, z: 6 });
    dropDrag();
    expect(state().pieces[0]).toMatchObject({ gridX: 6, gridZ: 6 });
    expect(lastSounds(2)).toEqual(['pickup', 'move']);
  });

  it('returns to its tile and rotation after an invalid drop', () => {
    const { id } = placePiece('straight', 2, 2, 0);
    placePiece('house', 6, 6);
    beginBoardDrag(id!);
    rotateActive();
    updateDragTarget({ x: 6, z: 6 });
    expect(state().drag?.valid).toBe(false);
    dropDrag();
    expect(state().pieces[0]).toMatchObject({ gridX: 2, gridZ: 2, rotation: 0 });
    expect(lastSounds(1)).toEqual(['invalid']);
  });

  it('changes nothing when dropped on its own tile with the same rotation', () => {
    const { id } = placePiece('straight', 2, 2, 0);
    const before = state().undoStack.length;
    useGameStore.setState({ isDirty: false });
    beginBoardDrag(id!);
    updateDragTarget({ x: 2, z: 2 });
    dropDrag();
    expect(state().isDirty).toBe(false);
    expect(state().undoStack).toHaveLength(before);
    expect(lastSounds(1)).toEqual(['pickup']);
  });

  it('applies a rotation made during the drag', () => {
    const { id } = placePiece('straight', 2, 2, 0);
    beginBoardDrag(id!);
    rotateActive();
    updateDragTarget({ x: 8, z: 8 });
    dropDrag();
    expect(state().pieces[0]).toMatchObject({ gridX: 8, gridZ: 8, rotation: 90 });
  });

  it('Escape-style cancel restores everything silently', () => {
    const { id } = placePiece('straight', 2, 2, 0);
    beginBoardDrag(id!);
    updateDragTarget({ x: 8, z: 8 });
    const count = getSoundLog().length;
    cancelDrag();
    expect(state().pieces[0]).toMatchObject({ gridX: 2, gridZ: 2 });
    expect(getSoundLog()).toHaveLength(count);
  });
});

describe('move, rotate and remove', () => {
  it('moves and plays move', () => {
    const { id } = placePiece('straight', 2, 2, 0);
    expect(movePiece(id!, 3, 3)).toEqual({ ok: true });
    expect(lastSounds(1)).toEqual(['move']);
  });

  it('applies auto-adjust on a move', () => {
    placePiece('straight', 5, 5, 0);
    const { id } = placePiece('straight', 9, 9, 90);
    movePiece(id!, 5, 4);
    expect(state().pieces[1]).toMatchObject({ gridX: 5, gridZ: 4, rotation: 180 });
    expect(lastSounds(2)).toEqual(['move', 'snap']);
  });

  it('rotates 90 degrees clockwise and plays rotate, then snap if it connects', () => {
    placePiece('straight', 5, 5, 0);
    const { id } = placePiece('straight', 5, 4, 90);
    expect(rotatePiece(id!)).toEqual({ ok: true });
    expect(state().pieces[1]?.rotation).toBe(180);
    expect(lastSounds(2)).toEqual(['rotate', 'snap']);
  });

  it('removes and plays delete', () => {
    const { id } = placePiece('straight', 2, 2, 0);
    selectPiece(id!);
    expect(removePiece(id!)).toEqual({ ok: true });
    expect(state().pieces).toHaveLength(0);
    expect(state().selectedPieceId).toBeNull();
    expect(lastSounds(1)).toEqual(['delete']);
  });

  it('reports not_found', () => {
    expect(movePiece('x', 1, 1)).toEqual({ ok: false, reason: 'not_found' });
    expect(rotatePiece('x')).toEqual({ ok: false, reason: 'not_found' });
    expect(removePiece('x')).toEqual({ ok: false, reason: 'not_found' });
  });
});

describe('selection', () => {
  it('a tool and a selected piece never coexist', () => {
    const { id } = placePiece('straight', 2, 2, 0);
    selectPiece(id!);
    selectTool('house');
    expect(state().selectedPieceId).toBeNull();
    selectPiece(id!);
    expect(state().selectedTool).toBeNull();
  });

  it('selecting the same tool again deselects it', () => {
    selectTool('house');
    selectTool('house');
    expect(state().selectedTool).toBeNull();
  });
});

describe('undo and redo', () => {
  it('undoes and redoes place, move, rotate and delete', () => {
    const { id } = placePiece('straight', 2, 2, 0);
    movePiece(id!, 3, 3);
    rotatePiece(id!);
    removePiece(id!);
    expect(state().pieces).toHaveLength(0);
    undo();
    expect(state().pieces[0]).toMatchObject({ gridX: 3, gridZ: 3, rotation: 90 });
    undo();
    expect(state().pieces[0]).toMatchObject({ gridX: 3, gridZ: 3, rotation: 0 });
    undo();
    expect(state().pieces[0]).toMatchObject({ gridX: 2, gridZ: 2 });
    undo();
    expect(state().pieces).toHaveLength(0);
    redo();
    redo();
    expect(state().pieces[0]).toMatchObject({ gridX: 3, gridZ: 3 });
  });

  it('a new action clears redo', () => {
    placePiece('straight', 2, 2, 0);
    undo();
    placePiece('house', 4, 4);
    redo();
    expect(state().pieces).toHaveLength(1);
    expect(state().pieces[0]?.type).toBe('house');
  });

  it('holds at least 20 steps, capped at 50', () => {
    for (let i = 0; i < 60; i++) placePiece('house', i % 16, Math.floor(i / 16));
    expect(state().undoStack).toHaveLength(50);
    for (let i = 0; i < 20; i++) undo();
    expect(state().pieces).toHaveLength(40);
  });

  it('counts an auto-adjusted move as one step', () => {
    placePiece('straight', 5, 5, 0);
    const { id } = placePiece('straight', 9, 9, 90);
    movePiece(id!, 5, 4);
    undo();
    expect(state().pieces[1]).toMatchObject({ gridX: 9, gridZ: 9, rotation: 90 });
  });

  it('is silent', () => {
    placePiece('straight', 2, 2, 0);
    const count = getSoundLog().length;
    undo();
    redo();
    expect(getSoundLog()).toHaveLength(count);
  });

  it('clears a selection whose piece no longer exists', () => {
    const { id } = placePiece('straight', 2, 2, 0);
    selectPiece(id!);
    undo();
    expect(state().selectedPieceId).toBeNull();
  });
});
