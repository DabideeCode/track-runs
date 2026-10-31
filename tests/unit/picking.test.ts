import { describe, expect, it } from 'vitest';
import { tileToWorld } from '@/domain/grid';
import type { Piece } from '@/domain/types';
import { pickPiece } from '@/interaction/picking';

const tree: Piece = { id: 'tree', type: 'pineTree', gridX: 8, gridZ: 8, rotation: 0 };
const track: Piece = { id: 'track', type: 'straight', gridX: 8, gridZ: 6, rotation: 0 };
const hill: Piece = { id: 'hill', type: 'hill', gridX: 2, gridZ: 2, rotation: 0 };

// Looks north and down, from the south, so the tree stands in front of the track behind it.
function rayThrough(worldX: number, worldY: number, worldZ: number) {
  const origin = { x: worldX, y: worldY + 6, z: worldZ + 6 };
  return { origin, direction: { x: 0, y: -1, z: -1 } };
}

describe('pickPiece', () => {
  it('picks a piece straight below the pointer', () => {
    const { x, z } = tileToWorld({ x: 8, z: 6 });
    const ray = { origin: { x, y: 8, z }, direction: { x: 0, y: -1, z: 0 } };
    expect(pickPiece(ray, [tree, track])?.id).toBe('track');
  });

  it('picks a tall piece rather than the tile behind its top', () => {
    const { x, z } = tileToWorld({ x: 8, z: 8 });
    expect(pickPiece(rayThrough(x, 1, z), [tree, track])?.id).toBe('tree');
  });

  it('picks the nearest of two hits', () => {
    const { x, z } = tileToWorld({ x: 8, z: 8 });
    const ray = { origin: { x, y: 2, z: z + 10 }, direction: { x: 0, y: -0.15, z: -1 } };
    expect(pickPiece(ray, [track, tree])?.id).toBe('tree');
  });

  it('covers all four hill tiles', () => {
    const { x, z } = tileToWorld({ x: 3, z: 3 });
    const ray = { origin: { x, y: 8, z }, direction: { x: 0, y: -1, z: 0 } };
    expect(pickPiece(ray, [hill])?.id).toBe('hill');
  });

  it('returns null when nothing is hit', () => {
    const ray = { origin: { x: 7, y: 8, z: 7 }, direction: { x: 0, y: -1, z: 0 } };
    expect(pickPiece(ray, [tree, track, hill])).toBeNull();
  });
});
