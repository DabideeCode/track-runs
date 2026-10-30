// Feature: track-diorama-builder, Property 3: Connectors rotate clockwise with the piece
/**
 * **Validates: Requirements 14.3, 14.4, 28.4**
 *
 * For any track type and any rotation r, `connectorsOf({ type, rotation: r })`
 * equals the catalogue's connectors at 0° each turned clockwise by r
 * (N → E → S → W), keeps the same order, and applying four successive 90°
 * rotations returns the original connector list; decorations always have no
 * connectors.
 *
 * The oracle is independent of the implementation: the 0° connectors are
 * taken from the table in Requirement 28.4, and each one is rotated as a unit
 * vector (x, z) → (−z, x) per 90° clockwise step (+x east, +z south, viewed
 * from above), then mapped back to a compass name.
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { connectorsOf, nextRotation } from '@/domain/connectors';
import type { DecorationType, Dir, Rotation, TrackType } from '@/domain/types';

type Compass = 'N' | 'E' | 'S' | 'W';

/** Connectors at 0° from Requirement 28.4, in progress order. */
const SPEC_CONNECTORS_0: Record<TrackType, readonly Compass[]> = {
  straight: ['N', 'S'],
  curve: ['S', 'E'],
  tunnel: ['N', 'S'],
  station: ['N', 'S'],
  buffer: ['S'],
};

const TRACK_TYPES = Object.keys(SPEC_CONNECTORS_0) as TrackType[];
const DECORATION_TYPES: readonly DecorationType[] = [
  'house', 'pineTree', 'roundTree', 'hill', 'car', 'cassette', 'blocks',
];
const ROTATIONS: readonly Rotation[] = [0, 90, 180, 270];

/** Unit vector of the edge each compass direction faces (+x east, +z south). */
const VECTOR: Record<Compass, readonly [number, number]> = {
  N: [0, -1],
  E: [1, 0],
  S: [0, 1],
  W: [-1, 0],
};

/** Dir encoding used by the domain: 0 = N, 1 = E, 2 = S, 3 = W. */
const DIR_OF: Record<Compass, Dir> = { N: 0, E: 1, S: 2, W: 3 };

function compassOf(x: number, z: number): Compass {
  const found = (Object.keys(VECTOR) as Compass[]).find(
    (c) => VECTOR[c][0] === x && VECTOR[c][1] === z,
  );
  if (!found) throw new Error(`Not a unit edge vector: (${x}, ${z})`);
  return found;
}

/** Rotate a compass direction clockwise by r degrees using (x, z) → (−z, x) per step. */
function rotateGeometric(c: Compass, r: Rotation): Compass {
  let [x, z] = VECTOR[c];
  for (let i = 0; i < r / 90; i++) {
    [x, z] = [-z, x];
  }
  // Normalise −0 to 0 so the lookup matches.
  return compassOf(x + 0, z + 0);
}

function expectedConnectors(type: TrackType, r: Rotation): Dir[] {
  return SPEC_CONNECTORS_0[type].map((c) => DIR_OF[rotateGeometric(c, r)]);
}

const arbTrackType = fc.constantFrom(...TRACK_TYPES);
const arbDecorationType = fc.constantFrom(...DECORATION_TYPES);
const arbRotation = fc.constantFrom(...ROTATIONS);

describe('Property 3: Connectors rotate clockwise with the piece', () => {
  it('track connectors equal the 0° connectors turned clockwise by the rotation, in order, and four 90° turns restore them', () => {
    fc.assert(
      fc.property(arbTrackType, arbRotation, (type, rotation) => {
        const actual = connectorsOf({ type, rotation });

        // Equals the geometric rotation of the spec's 0° connectors, same order.
        expect(actual).toEqual(expectedConnectors(type, rotation));

        // Each single 90° step turns every connector one place clockwise.
        const next = connectorsOf({ type, rotation: nextRotation(rotation) });
        expect(next).toEqual(actual.map((d) => ((d + 1) % 4) as Dir));

        // Four successive 90° rotations return the original list.
        let r: Rotation = rotation;
        for (let i = 0; i < 4; i++) r = nextRotation(r);
        expect(r).toBe(rotation);
        expect(connectorsOf({ type, rotation: r })).toEqual(actual);

        // Connectors are distinct directions.
        expect(new Set(actual).size).toBe(actual.length);
      }),
      { numRuns: 100 },
    );
  });

  it('decorations have no connectors at any rotation', () => {
    fc.assert(
      fc.property(arbDecorationType, arbRotation, (type, rotation) => {
        expect(connectorsOf({ type, rotation })).toEqual([]);
      }),
      { numRuns: 100 },
    );
  });
});
