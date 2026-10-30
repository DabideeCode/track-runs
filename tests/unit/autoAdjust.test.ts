import { describe, expect, it } from 'vitest';
import { autoAdjustRotation } from '@/domain/autoAdjust';
import type { Piece, PieceType, Rotation } from '@/domain/types';

function piece(id: string, type: PieceType, gridX: number, gridZ: number, rotation: Rotation = 0): Piece {
  return { id, type, gridX, gridZ, rotation };
}

describe('autoAdjustRotation', () => {
  it('keeps a rotation that already connects', () => {
    const others = [piece('a', 'straight', 8, 8)];
    expect(autoAdjustRotation(others, piece('b', 'straight', 8, 7, 180))).toBe(180);
  });

  it('turns to the first clockwise rotation that connects', () => {
    const others = [piece('a', 'straight', 8, 8, 90)];
    expect(autoAdjustRotation(others, piece('b', 'straight', 9, 8))).toBe(90);
    expect(autoAdjustRotation(others, piece('c', 'curve', 9, 8))).toBe(90);
    expect(autoAdjustRotation(others, piece('d', 'curve', 7, 8))).toBe(0);
  });

  it('keeps the current rotation when nothing connects', () => {
    const others = [piece('a', 'straight', 8, 8, 90)];
    expect(autoAdjustRotation(others, piece('b', 'straight', 8, 7, 90))).toBe(90);
    expect(autoAdjustRotation([], piece('c', 'curve', 1, 1, 270))).toBe(270);
  });

  it('leaves decorations alone', () => {
    const others = [piece('a', 'straight', 8, 8)];
    expect(autoAdjustRotation(others, piece('b', 'house', 8, 7, 90))).toBe(90);
  });
});
