import { describe, expect, it } from 'vitest';
import { rayToGround, rayToTile } from '@/interaction/pointerMath';

const straightDown = (x: number, z: number) => ({
  origin: { x, y: 10, z },
  direction: { x: 0, y: -1, z: 0 },
});

describe('pointerMath', () => {
  it('finds where a ray meets the ground plane', () => {
    const ray = { origin: { x: 0, y: 10, z: 10 }, direction: { x: 0, y: -1, z: -1 } };
    expect(rayToGround(ray)).toEqual({ x: 0, z: 0 });
  });

  it('returns null for a ray that never reaches the ground', () => {
    expect(rayToGround({ origin: { x: 0, y: 10, z: 0 }, direction: { x: 0, y: 1, z: 0 } })).toBeNull();
    expect(rayToGround({ origin: { x: 0, y: 10, z: 0 }, direction: { x: 1, y: 0, z: 0 } })).toBeNull();
  });

  it('maps to the nearest tile', () => {
    expect(rayToTile(straightDown(-7.5, -7.5))).toEqual({ x: 0, z: 0 });
    expect(rayToTile(straightDown(0.2, 0.2))).toEqual({ x: 8, z: 8 });
    expect(rayToTile(straightDown(7.9, -7.9))).toEqual({ x: 15, z: 0 });
  });

  it('reports null off the grid', () => {
    expect(rayToTile(straightDown(8.2, 0))).toBeNull();
    expect(rayToTile(straightDown(0, -8.2))).toBeNull();
  });
});
