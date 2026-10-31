import { describe, expect, it } from 'vitest';
import { buildOccupancy, footprintTiles, isOnGrid, tileToWorld, worldToTile } from '@/domain/grid';

describe('grid', () => {
  it('centres tile (0, 0) at x = -7.5, z = -7.5', () => {
    expect(tileToWorld({ x: 0, z: 0 })).toEqual({ x: -7.5, z: -7.5 });
    expect(tileToWorld({ x: 15, z: 15 })).toEqual({ x: 7.5, z: 7.5 });
  });

  it('maps a world point to the nearest tile', () => {
    expect(worldToTile(-7.5, -7.5)).toEqual({ x: 0, z: 0 });
    expect(worldToTile(0.1, -0.1)).toEqual({ x: 8, z: 7 });
    expect(worldToTile(7.9, 7.9)).toEqual({ x: 15, z: 15 });
  });

  it('flags tiles off the grid and non-integers', () => {
    expect(isOnGrid({ x: 0, z: 15 })).toBe(true);
    expect(isOnGrid({ x: 16, z: 0 })).toBe(false);
    expect(isOnGrid({ x: -1, z: 0 })).toBe(false);
    expect(isOnGrid({ x: 1.5, z: 0 })).toBe(false);
  });

  it('covers the hill anchor plus east, south and south-east', () => {
    const tiles = footprintTiles('hill', 3, 4);
    expect(tiles).toHaveLength(4);
    expect(tiles).toEqual(
      expect.arrayContaining([
        { x: 3, z: 4 },
        { x: 4, z: 4 },
        { x: 3, z: 5 },
        { x: 4, z: 5 },
      ]),
    );
  });

  it('builds occupancy including every hill tile', () => {
    const occupancy = buildOccupancy([{ id: 'h', type: 'hill', gridX: 0, gridZ: 0, rotation: 90 }]);
    expect(occupancy.size).toBe(4);
    expect(occupancy.get('1,1')?.id).toBe('h');
  });
});
