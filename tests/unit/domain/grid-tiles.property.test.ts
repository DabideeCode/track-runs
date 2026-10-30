// Feature: track-diorama-builder, Property 1: Pointer maps to the nearest tile
/**
 * **Validates: Requirements 2.3, 2.7, 8.6**
 *
 * For any point (x, z) on the ground plane, `worldToTile(x, z)` returns null
 * exactly when x or z lies outside [−8, 8); otherwise it returns integer tile
 * coordinates whose centre is within 0.5 of the point on both axes, and a
 * point lying exactly on a shared tile edge maps to the tile with the larger
 * index (east or south).
 *
 * Oracles, independent of `Math.floor(x + 8)`:
 *
 * - Nearest-centre scan: every one of the 256 tile centres (written out from
 *   Section 6 of requirement.md: centre = index − 7.5) is compared with the
 *   point, and the nearest wins; on a tie the larger gridX, then the larger
 *   gridZ wins. The comparison is done per axis with exact arithmetic: for
 *   centres a < b, b is at least as near as a exactly when 2p ≥ a + b (both
 *   sides are exact in binary floating point), so no rounding can flip it.
 *   Squared Euclidean distance is separable, so the 2D nearest centre is the
 *   pair of per-axis nearest centres; the scan still visits all 256 centres.
 * - Half-open cell check: the returned tile's cell is [index − 8, index − 7)
 *   on each axis. Its bounds are integers, so `lo ≤ p < hi` is an exact test
 *   that the centre is within 0.5 of the point with edges going east/south.
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { tileCentre, worldToTile } from '@/domain/grid';

const SIZE = 16;
const HALF_EXTENT = 8;

/** Tile centres along one axis, from the spec: index 0 → −7.5 … index 15 → 7.5. */
const CENTRES: readonly number[] = Array.from({ length: SIZE }, (_, i) => i - 7.5);

/** True when the spec says the point is inside the grid area. */
function insideGrid(x: number, z: number): boolean {
  return (
    Number.isFinite(x) &&
    Number.isFinite(z) &&
    x >= -HALF_EXTENT &&
    x < HALF_EXTENT &&
    z >= -HALF_EXTENT &&
    z < HALF_EXTENT
  );
}

/**
 * True when centre `b` is at least as near to coordinate `p` as centre `a`
 * along one axis, computed exactly. Precondition: a < b.
 * (p − b)² ≤ (p − a)²  ⇔  (a − b)(2p − a − b) ≤ 0  ⇔  2p ≥ a + b.
 */
function atLeastAsNear(p: number, a: number, b: number): boolean {
  return 2 * p >= a + b;
}

/** Scan all 256 centres for the nearest; ties go to the larger index (east, then south). */
function nearestTileOracle(x: number, z: number): { gridX: number; gridZ: number } {
  let best = { gridX: 0, gridZ: 0 };
  for (let gz = 0; gz < SIZE; gz++) {
    for (let gx = 0; gx < SIZE; gx++) {
      // Candidate (gx, gz) is visited after `best` in row-major order. It
      // replaces `best` when it is at least as near on each axis where it
      // differs, which (by separability) means at least as near overall
      // and, on equal distance, larger on the differing axes.
      const xOk = gx === best.gridX || (gx > best.gridX
        ? atLeastAsNear(x, CENTRES[best.gridX]!, CENTRES[gx]!)
        : !atLeastAsNear(x, CENTRES[gx]!, CENTRES[best.gridX]!));
      const zOk = gz === best.gridZ || (gz > best.gridZ
        ? atLeastAsNear(z, CENTRES[best.gridZ]!, CENTRES[gz]!)
        : !atLeastAsNear(z, CENTRES[gz]!, CENTRES[best.gridZ]!));
      if (xOk && zOk) best = { gridX: gx, gridZ: gz };
    }
  }
  return best;
}

// ---- Generators -----------------------------------------------------------

const LATTICE = 2 ** 20;

/** Points on a fine lattice spanning beyond the grid (outside, inside, on edges). */
const arbLattice = fc
  .integer({ min: -10 * LATTICE, max: 10 * LATTICE })
  .map((n) => n / LATTICE);

/** Exactly on a tile edge or grid boundary (integers −9 to 9 include ±8). */
const arbEdge = fc.integer({ min: -9, max: 9 });

/** Within a hair of an edge or boundary, on either side. */
const arbNearEdge = fc
  .tuple(fc.integer({ min: -9, max: 9 }), fc.double({ min: -1e-6, max: 1e-6, noNaN: true }))
  .map(([edge, delta]) => edge + delta);

/** Hand-picked awkward values: non-finite, signed zero, nearest doubles to the bounds. */
const arbSpecial = fc.constantFrom(
  Number.NaN,
  Number.POSITIVE_INFINITY,
  Number.NEGATIVE_INFINITY,
  0,
  -0,
  8,
  -8,
  8 - 2 ** -50, // largest double below 8
  -8 - 2 ** -50, // nearest double below −8
  -8 + 2 ** -50,
  Number.MAX_VALUE,
  -Number.MAX_VALUE,
);

/** Any double, including NaN, ±Infinity, subnormals and huge magnitudes. */
const arbAnyDouble = fc.double();

const arbCoord = fc.oneof(
  { arbitrary: arbLattice, weight: 4 },
  { arbitrary: arbEdge, weight: 2 },
  { arbitrary: arbNearEdge, weight: 2 },
  { arbitrary: arbSpecial, weight: 1 },
  { arbitrary: arbAnyDouble, weight: 1 },
);

// ---- Property -------------------------------------------------------------

describe('Property 1: Pointer maps to the nearest tile', () => {
  it('worldToTile is null outside [−8, 8) and otherwise the nearest tile, with edges going east or south', () => {
    fc.assert(
      fc.property(arbCoord, arbCoord, (x, z) => {
        const tile = worldToTile(x, z);

        if (!insideGrid(x, z)) {
          expect(tile).toBeNull();
          return;
        }

        expect(tile).not.toBeNull();
        const { gridX, gridZ } = tile!;

        // Integer coordinates inside the grid.
        expect(Number.isInteger(gridX)).toBe(true);
        expect(Number.isInteger(gridZ)).toBe(true);
        expect(gridX).toBeGreaterThanOrEqual(0);
        expect(gridX).toBeLessThan(SIZE);
        expect(gridZ).toBeGreaterThanOrEqual(0);
        expect(gridZ).toBeLessThan(SIZE);

        // The tile's centre (as reported by the grid module) agrees with the spec.
        const centre = tileCentre(gridX, gridZ);
        expect(centre).toEqual({ x: CENTRES[gridX], z: CENTRES[gridZ] });

        // Centre within 0.5 on both axes, with edges going east/south:
        // exact half-open cell test [centre − 0.5, centre + 0.5).
        expect(x >= centre.x - 0.5 && x < centre.x + 0.5).toBe(true);
        expect(z >= centre.z - 0.5 && z < centre.z + 0.5).toBe(true);

        // Matches the nearest of the 256 centres, ties to east/south.
        expect(tile).toEqual(nearestTileOracle(x, z));
      }),
      { numRuns: 1000 },
    );
  });
});
