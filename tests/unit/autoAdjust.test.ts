import { describe, expect, it } from 'vitest';
import { autoAdjustRotation } from '@/domain/autoAdjust';
import type { Piece } from '@/domain/types';

const northSouth: Piece = { id: 'a', type: 'straight', gridX: 5, gridZ: 5, rotation: 0 };

describe('autoAdjustRotation', () => {
  it('keeps a rotation that already connects', () => {
    expect(autoAdjustRotation('straight', 5, 4, 0, [northSouth])).toBe(0);
  });

  it('turns to the first clockwise rotation that connects', () => {
    expect(autoAdjustRotation('straight', 5, 4, 90, [northSouth])).toBe(180);
    expect(autoAdjustRotation('straight', 5, 4, 270, [northSouth])).toBe(0);
  });

  it('turns a curve clockwise from its current rotation', () => {
    expect(autoAdjustRotation('curve', 5, 4, 0, [northSouth])).toBe(0);
    expect(autoAdjustRotation('curve', 5, 6, 0, [northSouth])).toBe(90 + 90);
  });

  it('turns a buffer so its connector faces the open end', () => {
    expect(autoAdjustRotation('buffer', 5, 4, 90, [northSouth])).toBe(0);
    expect(autoAdjustRotation('buffer', 5, 6, 0, [northSouth])).toBe(180);
  });

  it('leaves a track with no neighbour alone', () => {
    expect(autoAdjustRotation('straight', 9, 9, 90, [northSouth])).toBe(90);
  });

  it('leaves it alone when the neighbour has no open end facing it', () => {
    expect(autoAdjustRotation('straight', 6, 5, 0, [northSouth])).toBe(0);
  });

  it('keeps a rotation connected to one neighbour even if another stays open', () => {
    const east: Piece = { id: 'b', type: 'straight', gridX: 6, gridZ: 4, rotation: 90 };
    expect(autoAdjustRotation('straight', 5, 4, 0, [northSouth, east])).toBe(0);
  });

  it('leaves decorations alone', () => {
    expect(autoAdjustRotation('house', 5, 4, 90, [northSouth])).toBe(90);
  });

  it('ignores the piece itself when moving', () => {
    const self: Piece = { id: 'c', type: 'straight', gridX: 5, gridZ: 4, rotation: 90 };
    expect(autoAdjustRotation('straight', 5, 4, 90, [northSouth, self], 'c')).toBe(180);
  });
});
