// Feature: track-diorama-builder, Property 2: Footprints follow the catalogue
/**
 * **Validates: Requirements 28.3, 16.1**
 *
 * For any piece type and any integer anchor (gridX, gridZ), `footprintTiles`
 * returns only the anchor for 1 × 1 types, and for `hill` returns exactly the
 * anchor and the tiles at (+1, 0), (0, +1) and (+1, +1); `footprintCentre` is
 * the mean of those tile centres.
 *
 * The oracle is independent of the catalogue's `size` field: Requirement 28.3
 * says every item is 1 × 1 except `hill`, which is 2 × 2 with the anchor as
 * its north-west tile. Tile centres are computed from requirement.md Section 2
 * (16 × 16 grid of unit tiles centred on the origin, so tile (gx, gz) has its
 * centre at (gx − 7.5, gz − 7.5)).
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { footprintCentre, footprintTiles, inGrid, tileKey } from '@/domain/grid';
import type { PieceType, Tile } from '@/domain/types';

/** All 12 type ids from Requirement 28.1. */
const ALL_TYPES: readonly PieceType[] = [
  'straight', 'curve', 'tunnel', 'station', 'buffer',
  'house', 'pineTree', 'roundTree', 'hill', 'car', 'cassette', 'blocks',
];

/** Requirement 28.3: anchor plus east, south and south-east for the hill; anchor only otherwise. */
function expectedFootprint(type: PieceType, gridX: number, gridZ: number): Tile[] {
  if (type === 'hill') {
    return [
      { gridX, gridZ },
      { gridX: gridX + 1, gridZ },
      { gridX, gridZ: gridZ + 1 },
      { gridX: gridX + 1, gridZ: gridZ + 1 },
    ];
  }
  return [{ gridX, gridZ }];
}

/** Tile centre from Section 2: one-unit tiles, grid centred on the origin. */
const oracleCentre = (t: Tile) => ({ x: t.gridX - 7.5, z: t.gridZ - 7.5 });

const sortTiles = (ts: readonly Tile[]): Tile[] =>
  [...ts].sort((a, b) => a.gridZ - b.gridZ || a.gridX - b.gridX);

const arbType = fc.constantFrom(...ALL_TYPES);
// Integer anchors on and well off the grid; footprintTiles returns tiles either way.
const arbCoord = fc.integer({ min: -20, max: 35 });
// Anchors whose whole footprint may or may not fit in the grid.
const arbGridCoord = fc.integer({ min: 0, max: 15 });

describe('Property 2: Footprints follow the catalogue', () => {
  it('footprintTiles is the anchor for 1 × 1 types and the 2 × 2 block for the hill', () => {
    fc.assert(
      fc.property(arbType, arbCoord, arbCoord, (type, gridX, gridZ) => {
        const actual = footprintTiles(type, gridX, gridZ);
        const expected = expectedFootprint(type, gridX, gridZ);

        // Exactly the expected set of tiles, with no duplicates.
        expect(actual).toHaveLength(expected.length);
        expect(sortTiles(actual)).toEqual(sortTiles(expected));

        // The anchor is always part of the footprint and is its north-west tile.
        expect(actual).toContainEqual({ gridX, gridZ });
        for (const t of actual) {
          expect(t.gridX).toBeGreaterThanOrEqual(gridX);
          expect(t.gridZ).toBeGreaterThanOrEqual(gridZ);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('footprintCentre is the mean of the footprint tile centres', () => {
    fc.assert(
      fc.property(arbType, arbCoord, arbCoord, (type, gridX, gridZ) => {
        const tiles = expectedFootprint(type, gridX, gridZ);
        const centres = tiles.map(oracleCentre);
        const meanX = centres.reduce((s, c) => s + c.x, 0) / centres.length;
        const meanZ = centres.reduce((s, c) => s + c.z, 0) / centres.length;

        const actual = footprintCentre(type, gridX, gridZ);
        expect(actual.x).toBeCloseTo(meanX, 9);
        expect(actual.z).toBeCloseTo(meanZ, 9);
      }),
      { numRuns: 100 },
    );
  });

  it('in-grid footprints cover distinct tiles, and a hill fits only when anchored at 14 or less', () => {
    fc.assert(
      fc.property(arbType, arbGridCoord, arbGridCoord, (type, gridX, gridZ) => {
        const tiles = footprintTiles(type, gridX, gridZ);
        const fits = tiles.every(inGrid);
        const expectedFits = type === 'hill' ? gridX <= 14 && gridZ <= 14 : true;
        expect(fits).toBe(expectedFits);

        // Requirement 16.1: each covered tile counts once, so keys are distinct.
        if (fits) {
          const keys = tiles.map(tileKey);
          expect(new Set(keys).size).toBe(tiles.length);
          for (const k of keys) {
            expect(k).toBeGreaterThanOrEqual(0);
            expect(k).toBeLessThan(256);
          }
        }
      }),
      { numRuns: 100 },
    );
  });
});
