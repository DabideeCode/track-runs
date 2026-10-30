import { describe, expect, it } from 'vitest';
import type { Piece } from '@/domain/types';
import { emptyHistory, recordEdit, redo, undo } from '@/store/history';

const state = (count: number): Piece[] =>
  Array.from({ length: count }, (_, index) => ({
    id: String(index),
    type: 'house',
    gridX: index,
    gridZ: 0,
    rotation: 0,
  }));

describe('history', () => {
  it('undoes and redoes in order', () => {
    const history = recordEdit(recordEdit(emptyHistory, state(0)), state(1));
    const first = undo(history, state(2))!;
    expect(first.pieces).toEqual(state(1));
    const second = undo(first.history, first.pieces)!;
    expect(second.pieces).toEqual(state(0));
    const third = redo(second.history, second.pieces)!;
    expect(third.pieces).toEqual(state(1));
  });

  it('keeps at least 20 steps and caps at 50', () => {
    let history = emptyHistory;
    for (let i = 0; i < 60; i += 1) history = recordEdit(history, state(0));
    expect(history.past).toHaveLength(50);
  });

  it('clears redo on a new edit', () => {
    const history = recordEdit(emptyHistory, state(0));
    const undone = undo(history, state(1))!;
    expect(undone.history.future).toHaveLength(1);
    expect(recordEdit(undone.history, state(0)).future).toHaveLength(0);
  });

  it('does nothing with an empty stack', () => {
    expect(undo(emptyHistory, state(0))).toBeNull();
    expect(redo(emptyHistory, state(0))).toBeNull();
  });
});
