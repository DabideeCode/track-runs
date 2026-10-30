// Feature: track-diorama-builder, Property 37: The parked train sits on the station facing the chosen way
/**
 * **Validates: Requirements 17.1, 17.2, 17.4, 17.5, 18.5, 39.20**
 *
 * For any board containing a station (any tile, any rotation) and either start
 * facing, the Build-mode snapshot reports the station's id, progress 0.5,
 * `moving: false`, `speed: 0` and `direction: 'forward'`, and the locomotive
 * heading points toward the station's rotated connector 0 for facing 0 and
 * toward connector 1 for facing 180; for any Play-mode simulation run on such
 * a board, returning to Build mode yields that same snapshot.
 *
 * The oracle is independent of `trackPath.ts` and `trackGraph.ts`:
 * - Tile centre (gridX − 7.5, gridZ − 7.5); +x east, +z south.
 * - Connectors at 0° (Requirement 28.4, progress order): straight, tunnel and
 *   station N, S; curve S, E; buffer S. A rotation r turns each connector
 *   clockwise by r (N → E → S → W), so the station's connector 0 is N, E, S, W
 *   at 0°, 90°, 180°, 270° (Requirement 17.4) and connector 1 the opposite
 *   edge (Requirement 17.5).
 * - Carriages trail on the other side (Requirements 17.4, 17.5) at 0.95 and
 *   1.85 tiles behind the locomotive centre along the centreline (D-15). A
 *   small compass walker follows the centreline back from the station:
 *   straight-type pieces are 1-tile straight lines between opposite edge
 *   midpoints, the buffer runs 0.75 from its connector to the stop face, a
 *   curve is a quarter circle of radius 0.5 about the corner shared by its two
 *   connector edges, and past a dead end the walk continues in a straight line
 *   (Requirement 19.10).
 *
 * The run also covers station moves and rotations (Requirement 17.2), boards
 * with decorations, parking independence from every other piece, and the
 * return to Build mode after a random Play-mode run (Requirement 18.5).
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { applyBuild } from '@/domain/placement';
import { buildTrackGraph } from '@/domain/trackGraph';
import {
  parkTrain,
  snapshot,
  startPlay,
  stepTrain,
  vehiclePoses,
  type DriveInput,
  type TrainSim,
  type VehiclePose,
} from '@/domain/train';
import type { Piece, PieceType, Rotation } from '@/domain/types';
import { arbLayout, arbLayoutWith, arbLoop } from '../arbitraries';

const TOL = 1e-9;

// ---------------------------------------------------------------------------
// Independent geometry oracle
// ---------------------------------------------------------------------------

type V = { x: number; z: number };
/** Compass index: 0 = N (−z), 1 = E (+x), 2 = S (+z), 3 = W (−x). */
type Compass = 0 | 1 | 2 | 3;

const VEC: Record<Compass, V> = {
  0: { x: 0, z: -1 },
  1: { x: 1, z: 0 },
  2: { x: 0, z: 1 },
  3: { x: -1, z: 0 },
};

const CONNECTORS_AT_0: Partial<Record<PieceType, Compass[]>> = {
  straight: [0, 2],
  tunnel: [0, 2],
  station: [0, 2],
  curve: [2, 1],
  buffer: [2],
};

const turn = (c: Compass, r: Rotation): Compass => ((c + r / 90) % 4) as Compass;
const back = (c: Compass): Compass => ((c + 2) % 4) as Compass;
const centre = (p: { gridX: number; gridZ: number }): V => ({ x: p.gridX - 7.5, z: p.gridZ - 7.5 });
const add = (a: V, b: V, k = 1): V => ({ x: a.x + b.x * k, z: a.z + b.z * k });

function connectors(p: Piece): Compass[] {
  return (CONNECTORS_AT_0[p.type] ?? []).map((c) => turn(c, p.rotation));
}

/** The track on tile (gridX, gridZ) with a connector facing `toward`, or null. */
function trackAt(pieces: readonly Piece[], gridX: number, gridZ: number, toward: Compass): Piece | null {
  for (const p of pieces) {
    if (p.gridX === gridX && p.gridZ === gridZ && connectors(p).includes(toward)) return p;
  }
  return null;
}

interface ExpectedPose {
  x: number;
  z: number;
  /** Unit vector the vehicle faces (toward the locomotive's front). */
  tangent: V;
  onTrack: boolean;
}

/**
 * Pose `dist` (> 0.5) behind the locomotive centre, which sits at the centre
 * of `station` facing compass direction `f`.
 */
function trailingPose(pieces: readonly Piece[], station: Piece, f: Compass, dist: number): ExpectedPose {
  let u: Compass = back(f); // travel direction of the walk (away from the locomotive)
  let tile = { gridX: station.gridX, gridZ: station.gridZ };
  let at = add(centre(station), VEC[u], 0.5); // trailing edge midpoint
  let remaining = dist - 0.5;
  for (;;) {
    const next = { gridX: tile.gridX + VEC[u].x, gridZ: tile.gridZ + VEC[u].z };
    const piece = trackAt(pieces, next.gridX, next.gridZ, back(u));
    const straightOn = (onTrack: boolean): ExpectedPose => {
      const p = add(at, VEC[u], remaining);
      return { x: p.x, z: p.z, tangent: VEC[back(u)], onTrack };
    };
    if (!piece) return straightOn(false);
    if (piece.type === 'buffer') return straightOn(remaining <= 0.75);
    if (piece.type !== 'curve') {
      if (remaining <= 1) return straightOn(true);
      at = add(at, VEC[u], 1);
      remaining -= 1;
      tile = next;
      continue;
    }
    // Curve: entered through the edge facing back(u), leaves through w.
    const w = connectors(piece).find((c) => c !== back(u))!;
    const c = add(add(centre(piece), VEC[back(u)], 0.5), VEC[w], 0.5); // shared corner
    const arc = Math.PI / 4;
    if (remaining <= arc) {
      const v = { x: at.x - c.x, z: at.z - c.z };
      // Choose the turning sense whose initial motion is along u.
      const sigma = -v.z * VEC[u].x + v.x * VEC[u].z >= 0 ? 1 : -1;
      const th = (sigma * remaining) / 0.5;
      const rv = { x: v.x * Math.cos(th) - v.z * Math.sin(th), z: v.x * Math.sin(th) + v.z * Math.cos(th) };
      // Travel tangent is sigma × (−rv.z, rv.x) / 0.5; the vehicle faces the other way.
      const tangent = { x: (sigma * rv.z) / 0.5, z: (-sigma * rv.x) / 0.5 };
      return { x: c.x + rv.x, z: c.z + rv.z, tangent, onTrack: true };
    }
    at = add(centre(piece), VEC[w], 0.5);
    remaining -= arc;
    tile = next;
    u = w;
  }
}

function expectPose(actual: VehiclePose, expected: ExpectedPose, label: string): void {
  const msg = `${label}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`;
  expect(Math.abs(actual.x - expected.x), msg).toBeLessThanOrEqual(TOL);
  expect(Math.abs(actual.z - expected.z), msg).toBeLessThanOrEqual(TOL);
  expect(Math.abs(actual.tangent.x - expected.tangent.x), msg).toBeLessThanOrEqual(TOL);
  expect(Math.abs(actual.tangent.z - expected.tangent.z), msg).toBeLessThanOrEqual(TOL);
  expect(actual.onTrack, msg).toBe(expected.onTrack);
  expect(actual.onTrack ? actual.pieceId !== null : actual.pieceId === null, msg).toBe(true);
}

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/** Boards with exactly one station: open layouts, layouts with decorations, closed loops. */
const arbStationBoard: fc.Arbitrary<Piece[]> = fc.oneof(
  arbLayout,
  arbLayoutWith({ decorations: true }),
  arbLoop({ station: 'always' }).map((l) => l.pieces),
);

/**
 * Optionally rotates the station 0 to 3 times and moves it (through
 * `applyBuild`, as the UI, the hook, undo and redo would), so the station
 * takes any rotation and sometimes a new tile (Requirement 17.2).
 */
const arbBoard = fc
  .record({
    board: arbStationBoard,
    turns: fc.nat({ max: 3 }),
    move: fc.option(fc.record({ gridX: fc.integer({ min: 0, max: 15 }), gridZ: fc.integer({ min: 0, max: 15 }) }), {
      nil: undefined,
    }),
  })
  .map(({ board, turns, move }) => {
    let pieces = board;
    const id = pieces.find((p) => p.type === 'station')!.id;
    const ctx = () => ({ pieces, mode: 'build' as const, newId: () => 'unused' });
    for (let i = 0; i < turns; i++) {
      const out = applyBuild(ctx(), { kind: 'rotate', id });
      if (out.ok) pieces = out.pieces;
    }
    if (move) {
      const out = applyBuild(ctx(), { kind: 'move', id, gridX: move.gridX, gridZ: move.gridZ });
      if (out.ok) pieces = out.pieces;
    }
    return pieces;
  });

const arbFrame: fc.Arbitrary<{ input: DriveInput; dt: number }> = fc.record({
  input: fc.record({
    driveMode: fc.constantFrom<'auto' | 'manual'>('auto', 'manual'),
    w: fc.boolean(),
    s: fc.boolean(),
  }),
  dt: fc.double({ min: 0, max: 0.12, noNaN: true }),
});

// ---------------------------------------------------------------------------
// Property
// ---------------------------------------------------------------------------

describe('Property 37: The parked train sits on the station facing the chosen way', () => {
  it('parks on the station centre, faces the chosen connector, trails the carriages and re-parks after play', () => {
    fc.assert(
      fc.property(
        arbBoard,
        fc.constantFrom<0 | 180>(0, 180),
        fc.array(arbFrame, { maxLength: 150 }),
        (pieces, startFacing, frames) => {
          const before = structuredClone(pieces);
          const stations = pieces.filter((p) => p.type === 'station');
          expect(stations).toHaveLength(1);
          const station = stations[0]!;
          const g = buildTrackGraph(pieces);

          // Snapshot (Requirements 17.1, 17.2, 39.20).
          const parked = parkTrain(g, station, startFacing);
          const snap = snapshot(g, parked);
          expect(snap).toEqual({ pieceId: station.id, progress: 0.5, moving: false, direction: 'forward', speed: 0 });

          // Locomotive pose (Requirements 17.4, 17.5).
          const c0 = turn(0, station.rotation);
          const f: Compass = startFacing === 0 ? c0 : back(c0);
          const poses = vehiclePoses(g, parked);
          expect(poses.map((p) => p.vehicle)).toEqual(['locomotive', 'carriage1', 'carriage2']);
          const loco = poses[0]!;
          const mid = centre(station);
          expectPose(loco, { x: mid.x, z: mid.z, tangent: VEC[f], onTrack: true }, 'locomotive');
          expect(loco.pieceId).toBe(station.id);
          expect(Math.abs(Math.hypot(loco.tangent.x, loco.tangent.z) - 1)).toBeLessThanOrEqual(TOL);

          // Carriages trail on the opposite side, 0.95 and 1.85 along the centreline.
          expectPose(poses[1]!, trailingPose(pieces, station, f, 0.95), 'carriage1');
          expectPose(poses[2]!, trailingPose(pieces, station, f, 1.85), 'carriage2');

          // Flipping the start facing reverses the locomotive exactly, in place.
          const flipped = vehiclePoses(g, parkTrain(g, station, startFacing === 0 ? 180 : 0))[0]!;
          expect(flipped.x).toBe(loco.x);
          expect(flipped.z).toBe(loco.z);
          expect(flipped.tangent.x + loco.tangent.x).toBe(0);
          expect(flipped.tangent.z + loco.tangent.z).toBe(0);

          // Parking ignores every other piece: a board with only the station gives the same.
          const alone = buildTrackGraph([station]);
          const aloneSim = parkTrain(alone, station, startFacing);
          expect(snapshot(alone, aloneSim)).toEqual(snap);
          expect(aloneSim.loco).toEqual(parked.loco);
          expect(vehiclePoses(alone, aloneSim)[0]).toEqual(loco);

          // A Play-mode run, then the return to Build mode (Requirement 18.5).
          let sim: TrainSim = startPlay(g, parked).sim;
          for (const frame of frames) sim = stepTrain(g, sim, frame.input, frame.dt).sim;
          expect(pieces).toEqual(before);
          const g2 = buildTrackGraph(pieces);
          const reparked = parkTrain(g2, station, startFacing);
          expect(snapshot(g2, reparked)).toEqual(snap);
          expect(vehiclePoses(g2, reparked)).toEqual(poses);
          // The parked state used to start the run was not changed by it.
          expect(snapshot(g, parked)).toEqual(snap);
        },
      ),
      { numRuns: 100 },
    );
  });
});
