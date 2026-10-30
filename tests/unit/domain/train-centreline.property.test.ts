// Feature: track-diorama-builder, Property 36: Centrelines match the catalogue geometry
/**
 * **Validates: Requirements 19.8, 19.9, 28.19**
 *
 * For any track piece (type, tile, rotation) and any s in [0, L], `pointAt`
 * lies inside the piece's tile; for `curve` it is at distance 0.5 from the
 * tile's rotated south-east corner; for `straight`, `tunnel` and `station` it
 * lies on the line through the tile centre joining the rotated connector
 * midpoints; for `buffer` it lies on the line from the rotated S midpoint to
 * the stop block face; s = 0 and, except for the buffer, s = L are the
 * midpoints of the edges of connectors 0 and 1; and `tangentAt` is a unit
 * vector.
 *
 * The oracle is independent of `trackPath.ts`. It takes the geometry from the
 * requirements: tile centre (gridX − 7.5, gridZ − 7.5); connectors at 0° from
 * Requirement 28.4 in progress order (straight/tunnel/station N, S; curve S, E;
 * buffer S); the curve as a quarter circle of radius 0.5 about the rotated
 * south-east corner (Requirement 19.8); straights between opposite edge
 * midpoints and the buffer from its S midpoint to the stop face 0.25 north of
 * the centre (Requirement 19.9, design §1.8). Local vectors are rotated
 * clockwise (viewed from above, +x east, +z south) with (x, z) → (−z, x) per
 * 90° step.
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { endOutward, endPoint, pathLength, pointAt, tangentAt } from '@/domain/trackPath';
import type { Rotation, TrackType } from '@/domain/types';

type V = { x: number; z: number };
type Compass = 'N' | 'E' | 'S' | 'W';

const EXACT = 1e-9;
const NUMERIC = 1e-6;

const TRACK_TYPES: readonly TrackType[] = ['straight', 'curve', 'tunnel', 'station', 'buffer'];
const ROTATIONS: readonly Rotation[] = [0, 90, 180, 270];

/** Unit vector toward each edge at 0° (+x east, +z south). */
const EDGE: Record<Compass, V> = {
  N: { x: 0, z: -1 },
  E: { x: 1, z: 0 },
  S: { x: 0, z: 1 },
  W: { x: -1, z: 0 },
};

/** Connectors at 0° from Requirement 28.4, in progress order. */
const CONNECTORS_0: Record<TrackType, readonly Compass[]> = {
  straight: ['N', 'S'],
  tunnel: ['N', 'S'],
  station: ['N', 'S'],
  curve: ['S', 'E'],
  buffer: ['S'],
};

const add = (a: V, b: V): V => ({ x: a.x + b.x, z: a.z + b.z });
const sub = (a: V, b: V): V => ({ x: a.x - b.x, z: a.z - b.z });
const scale = (a: V, k: number): V => ({ x: a.x * k, z: a.z * k });
const dot = (a: V, b: V): number => a.x * b.x + a.z * b.z;
const cross = (a: V, b: V): number => a.x * b.z - a.z * b.x;
const len = (a: V): number => Math.hypot(a.x, a.z);
const dist = (a: V, b: V): number => len(sub(a, b));

/** Clockwise rotation by r degrees, (x, z) → (−z, x) per 90° step. */
function rot(v: V, r: Rotation): V {
  let { x, z } = v;
  for (let i = 0; i < r / 90; i++) [x, z] = [-z, x];
  return { x, z };
}

interface Piece36 {
  type: TrackType;
  gridX: number;
  gridZ: number;
  rotation: Rotation;
}

interface Oracle {
  centre: V;
  start: V; // s = 0
  end: V; // s = L
  length: number;
  /** Expected world point at arc length s. */
  point: (s: number) => V;
  /** Expected unit tangent at arc length s (toward increasing s). */
  tangent: (s: number) => V;
  /** Rotated SE corner, curves only. */
  corner?: V;
  /** Outward unit vectors at end 0 and end 1. */
  outward: [V, V];
}

function oracle(p: Piece36): Oracle {
  const centre = { x: p.gridX - 7.5, z: p.gridZ - 7.5 };
  const toWorld = (local: V): V => add(centre, rot(local, p.rotation));
  const conns = CONNECTORS_0[p.type];
  const start = toWorld(scale(EDGE[conns[0]!], 0.5));

  if (p.type === 'curve') {
    const corner = toWorld({ x: 0.5, z: 0.5 });
    const end = toWorld(scale(EDGE[conns[1]!], 0.5));
    const r = 0.5;
    const a = sub(start, corner); // radius vector at s = 0
    const b = sub(end, corner); // radius vector at s = L, perpendicular to a
    const length = (Math.PI / 2) * r;
    return {
      centre,
      start,
      end,
      length,
      corner,
      point: (s) => {
        const phi = s / r;
        return add(corner, add(scale(a, Math.cos(phi)), scale(b, Math.sin(phi))));
      },
      tangent: (s) => {
        const phi = s / r;
        return scale(add(scale(a, -Math.sin(phi)), scale(b, Math.cos(phi))), 1 / r);
      },
      outward: [rot(EDGE[conns[0]!], p.rotation), rot(EDGE[conns[1]!], p.rotation)],
    };
  }

  const end =
    p.type === 'buffer'
      ? toWorld({ x: 0, z: -0.25 }) // stop block face, 0.25 north of the centre at 0°
      : toWorld(scale(EDGE[conns[1]!], 0.5));
  const length = dist(start, end);
  const dir = scale(sub(end, start), 1 / length);
  return {
    centre,
    start,
    end,
    length,
    point: (s) => add(start, scale(dir, s)),
    tangent: () => dir,
    outward: [scale(dir, -1), dir],
  };
}

const arbPiece = fc.record({
  type: fc.constantFrom(...TRACK_TYPES),
  gridX: fc.integer({ min: 0, max: 15 }),
  gridZ: fc.integer({ min: 0, max: 15 }),
  rotation: fc.constantFrom(...ROTATIONS),
});

/** Fraction of L in [0, 1], with the ends weighted in. */
const arbFraction = fc.oneof(
  fc.constant(0),
  fc.constant(1),
  fc.double({ min: 0, max: 1, noNaN: true }),
);

function expectClose(actual: V, expected: V, tol: number): void {
  expect(Math.abs(actual.x - expected.x)).toBeLessThanOrEqual(tol);
  expect(Math.abs(actual.z - expected.z)).toBeLessThanOrEqual(tol);
}

/** Derivative of pointAt by finite differences, second order, staying inside [0, L]. */
function finiteDifference(piece: Piece36, s: number, L: number): V {
  const h = 1e-5;
  const P = (t: number): V => pointAt(piece, t);
  if (s - h >= 0 && s + h <= L) {
    return scale(sub(P(s + h), P(s - h)), 1 / (2 * h));
  }
  if (s - h < 0) {
    // Forward: (−3 p(s) + 4 p(s + h) − p(s + 2h)) / 2h
    return scale(add(add(scale(P(s), -3), scale(P(s + h), 4)), scale(P(s + 2 * h), -1)), 1 / (2 * h));
  }
  // Backward: (3 p(s) − 4 p(s − h) + p(s − 2h)) / 2h
  return scale(add(add(scale(P(s), 3), scale(P(s - h), -4)), P(s - 2 * h)), 1 / (2 * h));
}

describe('Property 36: Centrelines match the catalogue geometry', () => {
  it('points lie on the expected centreline inside the tile, with unit tangents matching the derivative', () => {
    fc.assert(
      fc.property(arbPiece, arbFraction, (piece, fraction) => {
        const o = oracle(piece);
        const L = pathLength(piece.type);
        expect(Math.abs(L - o.length)).toBeLessThanOrEqual(EXACT);

        const s = fraction * L;
        const p = pointAt(piece, s);

        // Inside the piece's tile.
        expect(Math.abs(p.x - o.centre.x)).toBeLessThanOrEqual(0.5 + EXACT);
        expect(Math.abs(p.z - o.centre.z)).toBeLessThanOrEqual(0.5 + EXACT);

        // Shape of the centreline.
        if (piece.type === 'curve') {
          const corner = o.corner!;
          expect(Math.abs(dist(p, corner) - 0.5)).toBeLessThanOrEqual(EXACT);
          // Within the quarter between the two connector midpoints.
          expect(dot(sub(p, corner), sub(o.start, corner))).toBeGreaterThanOrEqual(-EXACT);
          expect(dot(sub(p, corner), sub(o.end, corner))).toBeGreaterThanOrEqual(-EXACT);
        } else {
          // On the line joining start and end (for non-buffers it passes through the tile centre).
          const d = sub(o.end, o.start);
          expect(Math.abs(cross(sub(p, o.start), d))).toBeLessThanOrEqual(EXACT);
          if (piece.type !== 'buffer') {
            expect(Math.abs(cross(sub(o.centre, o.start), d))).toBeLessThanOrEqual(EXACT);
          }
        }

        // Arc-length parametrisation: the point at s is exactly the oracle's.
        expectClose(p, o.point(s), EXACT);

        // Unit tangent, matching the oracle and the numeric derivative.
        const t = tangentAt(piece, s);
        expect(Math.abs(len(t) - 1)).toBeLessThanOrEqual(EXACT);
        expectClose(t, o.tangent(s), EXACT);
        expectClose(t, finiteDifference(piece, s, L), NUMERIC);
      }),
      { numRuns: 100 },
    );
  });

  it('ends sit at the connector edge midpoints in connector order (buffer end 1 at the stop face)', () => {
    fc.assert(
      fc.property(arbPiece, (piece) => {
        const o = oracle(piece);
        const L = pathLength(piece.type);

        expectClose(pointAt(piece, 0), o.start, EXACT);
        expectClose(pointAt(piece, L), o.end, EXACT);
        expectClose(endPoint(piece, 0), o.start, EXACT);
        expectClose(endPoint(piece, 1), o.end, EXACT);

        // Connector ends lie on a tile edge midpoint: 0.5 from the centre along one axis.
        expect(Math.abs(dist(o.start, o.centre) - 0.5)).toBeLessThanOrEqual(EXACT);
        if (piece.type === 'buffer') {
          expect(Math.abs(dist(o.end, o.centre) - 0.25)).toBeLessThanOrEqual(EXACT);
        }

        // Outward vectors point across the connector edge (or past the stop face).
        const out0 = endOutward(piece, 0);
        const out1 = endOutward(piece, 1);
        expectClose(out0, o.outward[0], EXACT);
        expectClose(out1, o.outward[1], EXACT);
      }),
      { numRuns: 100 },
    );
  });

  it('pathLength equals the numeric polyline length of pointAt', () => {
    fc.assert(
      fc.property(arbPiece, (piece) => {
        const L = pathLength(piece.type);
        const segments = 2000;
        let total = 0;
        let prev = pointAt(piece, 0);
        for (let i = 1; i <= segments; i++) {
          const next = pointAt(piece, (i / segments) * L);
          total += dist(prev, next);
          prev = next;
        }
        expect(Math.abs(total - L)).toBeLessThanOrEqual(NUMERIC);
      }),
      { numRuns: 100 },
    );
  });
});
