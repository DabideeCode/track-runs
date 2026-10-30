// Feature: track-diorama-builder, Property 38: Vehicles stay on the centreline at fixed spacing
/**
 * **Validates: Requirements 17.8, 19.3, 19.4, 19.5, 19.6, 19.10, 39.13**
 *
 * For any layout containing a station and any simulation run (random drive
 * mode, key schedule and duration), every vehicle that is on track has its
 * centre on the centreline (within 0.02) and its heading within 5° of the
 * tangent; the centreline distance from the locomotive centre to carriage 1
 * is 0.95 and from carriage 1 to carriage 2 is 0.9 (within 0.02), including
 * trailing vehicles on the straight extension past an open end; the
 * locomotive is furthest along the direction of travel when moving forward
 * and carriage 2 when moving in reverse; no vehicle moves more than
 * speed × dt + 1e-6 in one sub-step; and the snapshot has `progress` in
 * [0, 1] and `speed` ≥ 0.
 *
 * How the run is observed. Each random frame is replayed as the sub-steps
 * `stepTrain` uses internally (the frame dt clamped to 0.1 s, then 1/120 s
 * sub-steps plus a shorter remainder, D-17), by calling `stepTrain` once per
 * sub-step. The composed result must equal one `stepTrain` call with the
 * whole frame dt, which also checks the clamp. After every sub-step:
 *
 * - Centreline (Requirements 19.3, 19.8, 19.9): each on-track vehicle lies on
 *   the centreline of the piece it reports, checked with this file's own
 *   geometry (distance 0.5 from the curve's rotated south-east corner and
 *   inside the tile; on the segment between connector midpoints for
 *   straight-type pieces; on the segment from the S midpoint to the stop face
 *   for the buffer), and its heading is a unit vector parallel to the
 *   centreline tangent. Tolerances are 1e-7, far inside 0.02 and 5°.
 * - Spacing (Requirements 19.4, 19.10): an independent walker over the board
 *   (its own connection rule, lengths and curve parametrisation, no
 *   `trackGraph.ts`) walks 0.95 and 1.85 back from the locomotive centre and
 *   must land on the reported carriage poses, past a dead end on the straight
 *   extension along the end's outward direction (`onTrack: false`,
 *   `pieceId: null`). The facing must equal the locomotive's facing carried
 *   along the track.
 * - Leading vehicle (Requirements 17.8, 19.5, 19.6): the walker finds the
 *   locomotive's new position along its facing when the train moves Forward
 *   and against it in Reverse. Since the carriages sit 0.95 and 1.85 behind
 *   the locomotive along its facing, this makes the locomotive the furthest
 *   vehicle along the travel direction in Forward and carriage 2 in Reverse.
 * - Step bound: the distance moved along the track in a sub-step of length h
 *   is at most speed × h + 1e-9, where speed is the speed after the sub-step.
 *   When the sub-step ends at speed 0 (arrival at a dead end), the speed used
 *   during the sub-step is not observable: the design's arrival snap
 *   (design §1.10, "when D falls below 1e-4 the train snaps to the dead end")
 *   may add up to 1e-4, and the sub-step speed is at most the previous speed
 *   plus the largest acceleration (6 tiles/s², D-16) × h. Every vehicle's
 *   straight-line displacement is at most the same bound.
 * - Snapshot (Requirement 39.13): `pieceId` is the locomotive's piece,
 *   `progress` is in [0, 1] and equals s / L with this file's lengths,
 *   `speed` ≥ 0 and `moving` is `speed > 0`.
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { buildTrackGraph } from '@/domain/trackGraph';
import {
  parkTrain,
  snapshot,
  startPlay,
  stepTrain,
  vehiclePoses,
  type DriveInput,
  type StepResult,
  type TrainEvent,
  type TrainSim,
  type VehiclePose,
} from '@/domain/train';
import type { TrackGraph, TrackLoc } from '@/domain/trackGraph';
import type { Piece, PieceType, Rotation } from '@/domain/types';
import { arbLayout, arbLayoutWith, arbLoop } from '../arbitraries';

/** Geometry tolerance: far tighter than the 0.02 tiles and 5° the requirements allow. */
const TOL = 1e-7;
/** Distance within which a walk snaps to a piece end (matches the walk semantics). */
const SNAP = 1e-9;

/** D-15: centre spacings loco → carriage 1 and carriage 1 → carriage 2. */
const SPACING_1 = 0.95;
const SPACING_2 = 0.9;
/** D-17: sub-step and frame clamp. */
const H = 1 / 120;
const FRAME_CLAMP = 0.1;
/** D-16: the largest acceleration in any phase (Auto departure). */
const MAX_ACCEL = 6;
/** Design §1.10: arrival snap distance at a dead end. */
const ARRIVAL_SNAP = 1e-4;

// ---------------------------------------------------------------------------
// Independent board geometry
// ---------------------------------------------------------------------------

type V = { x: number; z: number };
/** 0 = N (−z), 1 = E (+x), 2 = S (+z), 3 = W (−x). */
type Compass = 0 | 1 | 2 | 3;

const VEC: Record<Compass, V> = {
  0: { x: 0, z: -1 },
  1: { x: 1, z: 0 },
  2: { x: 0, z: 1 },
  3: { x: -1, z: 0 },
};

/** Requirement 28.4, in progress order. */
const CONNECTORS_AT_0: Partial<Record<PieceType, Compass[]>> = {
  straight: [0, 2],
  tunnel: [0, 2],
  station: [0, 2],
  curve: [2, 1],
  buffer: [2],
};

const turn = (c: Compass, r: Rotation): Compass => ((c + r / 90) % 4) as Compass;
const back = (c: Compass): Compass => ((c + 2) % 4) as Compass;
const add = (a: V, b: V, k = 1): V => ({ x: a.x + b.x * k, z: a.z + b.z * k });
const sub = (a: V, b: V): V => ({ x: a.x - b.x, z: a.z - b.z });
const scale = (a: V, k: number): V => ({ x: a.x * k, z: a.z * k });
const dot = (a: V, b: V): number => a.x * b.x + a.z * b.z;
const cross = (a: V, b: V): number => a.x * b.z - a.z * b.x;
const len = (a: V): number => Math.hypot(a.x, a.z);

/** One track piece with its centreline, built from the requirements only. */
interface OTrack {
  piece: Piece;
  cs: Compass[];
  L: number;
  centre: V;
  /** Point at arc length s (0 ≤ s ≤ L). */
  point(s: number): V;
  /** Unit tangent toward increasing s. */
  tangent(s: number): V;
}

function makeTrack(piece: Piece): OTrack | null {
  const at0 = CONNECTORS_AT_0[piece.type];
  if (!at0) return null;
  const cs = at0.map((c) => turn(c, piece.rotation));
  const centre = { x: piece.gridX - 7.5, z: piece.gridZ - 7.5 };
  const a = add(centre, VEC[cs[0]!], 0.5);
  if (piece.type === 'buffer') {
    // From the S connector midpoint to the stop face 0.25 past the centre.
    const u = scale(VEC[cs[0]!], -1);
    return { piece, cs, L: 0.75, centre, point: (s) => add(a, u, s), tangent: () => u };
  }
  const b = add(centre, VEC[cs[1]!], 0.5);
  if (piece.type === 'curve') {
    // Quarter circle of radius 0.5 about the corner shared by the two connector edges.
    const k = add(add(centre, VEC[cs[0]!], 0.5), VEC[cs[1]!], 0.5);
    const va = sub(a, k);
    const vb = sub(b, k);
    return {
      piece,
      cs,
      L: Math.PI / 4,
      centre,
      point: (s) => {
        const th = s / 0.5;
        return add(add(k, va, Math.cos(th)), vb, Math.sin(th));
      },
      tangent: (s) => {
        const th = s / 0.5;
        return scale(add(scale(va, -Math.sin(th)), vb, Math.cos(th)), 1 / 0.5);
      },
    };
  }
  const u = sub(b, a);
  return { piece, cs, L: 1, centre, point: (s) => add(a, u, s), tangent: () => u };
}

interface Board {
  byId: Map<string, OTrack>;
  /** Track on each tile, keyed "x,z" (tracks are 1 × 1). */
  byTile: Map<string, OTrack>;
}

function makeBoard(pieces: readonly Piece[]): Board {
  const byId = new Map<string, OTrack>();
  const byTile = new Map<string, OTrack>();
  for (const p of pieces) {
    const t = makeTrack(p);
    if (!t) continue;
    byId.set(p.id, t);
    byTile.set(`${p.gridX},${p.gridZ}`, t);
  }
  return { byId, byTile };
}

/** The neighbour end joined through end k of t, or null (open end or the buffer's stop block). */
function link(board: Board, t: OTrack, k: 0 | 1): { t: OTrack; end: 0 | 1 } | null {
  if (k >= t.cs.length) return null;
  const c = t.cs[k]!;
  const n = board.byTile.get(`${t.piece.gridX + VEC[c].x},${t.piece.gridZ + VEC[c].z}`);
  if (!n) return null;
  const j = n.cs.indexOf(back(c));
  if (j !== 0 && j !== 1) return null;
  return { t: n, end: j };
}

/** Unit vector out of the piece at an end (across the connector edge, or toward the stop block). */
function outward(t: OTrack, end: 0 | 1): V {
  if (end === 0) return VEC[t.cs[0]!];
  if (t.piece.type === 'buffer') return scale(VEC[t.cs[0]!], -1);
  return VEC[t.cs[1]!];
}

interface OraclePose {
  p: V;
  /** Facing of the original location carried along the track. */
  facing: V;
  onTrack: boolean;
  /** True when the pose sits within TOL of a dead end, where onTrack may go either way. */
  atDeadEnd: boolean;
}

/** Walks `dist` from loc (positive along its heading, negative against it). */
function oracleWalk(board: Board, loc: TrackLoc, dist: number): OraclePose {
  let t = board.byId.get(loc.pieceId)!;
  let s = loc.s;
  const backward = dist < 0;
  let dir: 1 | -1 = backward ? (loc.heading === 1 ? -1 : 1) : loc.heading;
  let d = Math.abs(dist);
  const facingSign = backward ? -1 : 1;
  for (;;) {
    const room = dir === 1 ? t.L - s : s;
    if (d <= room + SNAP) {
      const s2 = d >= room - SNAP ? (dir === 1 ? t.L : 0) : s + dir * d;
      const endHere = dir === 1 ? t.L - s2 : s2;
      const atDeadEnd = endHere <= TOL && link(board, t, dir === 1 ? 1 : 0) === null;
      return { p: t.point(s2), facing: scale(t.tangent(s2), facingSign * dir), onTrack: true, atDeadEnd };
    }
    d -= room;
    const end: 0 | 1 = dir === 1 ? 1 : 0;
    const next = link(board, t, end);
    if (!next) {
      const out = outward(t, end);
      return {
        p: add(t.point(dir === 1 ? t.L : 0), out, d),
        facing: scale(out, facingSign),
        onTrack: false,
        atDeadEnd: d <= TOL,
      };
    }
    t = next.t;
    if (next.end === 0) {
      s = 0;
      dir = 1;
    } else {
      s = t.L;
      dir = -1;
    }
  }
}

/**
 * Distance along the track from `from` to `to`, walking `walkDir` in s, if
 * reached within `max`; also returns the facing heading carried to `to`.
 */
function oracleDistance(
  board: Board,
  from: TrackLoc,
  to: TrackLoc,
  walkDir: 1 | -1,
  max: number,
): { dist: number; heading: 1 | -1 } | null {
  let t = board.byId.get(from.pieceId)!;
  let s = from.s;
  let dir = walkDir;
  let acc = 0;
  const sameAsFacing = walkDir === from.heading;
  for (let i = 0; i < 64; i++) {
    if (t.piece.id === to.pieceId) {
      const delta = dir === 1 ? to.s - s : s - to.s;
      if (delta >= -SNAP) {
        return { dist: acc + Math.max(0, delta), heading: sameAsFacing ? dir : dir === 1 ? -1 : 1 };
      }
    }
    acc += dir === 1 ? t.L - s : s;
    if (acc > max) return null;
    const next = link(board, t, dir === 1 ? 1 : 0);
    if (!next) return null;
    t = next.t;
    if (next.end === 0) {
      s = 0;
      dir = 1;
    } else {
      s = t.L;
      dir = -1;
    }
  }
  return null;
}

/** Distance from p to the centreline of t, and the |sin| of the angle between v and the centreline tangent. */
function centrelineError(t: OTrack, p: V, v: V): { dist: number; angle: number } {
  if (t.piece.type === 'curve') {
    const k = add(add(t.centre, VEC[t.cs[0]!], 0.5), VEC[t.cs[1]!], 0.5);
    const r = sub(p, k);
    const inTile = Math.max(Math.abs(p.x - t.centre.x), Math.abs(p.z - t.centre.z)) - 0.5;
    const dist = Math.max(Math.abs(len(r) - 0.5), inTile, 0);
    // The tangent of a circle is perpendicular to the radius.
    return { dist, angle: Math.abs(dot(v, r)) / (len(r) || 1) };
  }
  const a = t.point(0);
  const b = t.point(t.L);
  const ab = sub(b, a);
  const u = Math.min(1, Math.max(0, dot(sub(p, a), ab) / dot(ab, ab)));
  const dist = len(sub(p, add(a, ab, u)));
  return { dist, angle: Math.abs(cross(v, ab)) / len(ab) };
}

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

function near(a: V, b: V): boolean {
  return Math.abs(a.x - b.x) <= TOL && Math.abs(a.z - b.z) <= TOL;
}

/**
 * A cheap assertion for the hot loop (thousands of checks per run): the
 * message is built only when the check fails, and fast-check reports it with
 * the counterexample.
 */
function check(cond: boolean, what: string, detail: () => string): void {
  if (!cond) throw new Error(`${what}\n${detail()}`);
}

function checkState(g: TrackGraph, board: Board, sim: TrainSim, ctx: string): VehiclePose[] {
  const poses = vehiclePoses(g, sim);
  check(
    poses.length === 3 &&
      poses[0]!.vehicle === 'locomotive' &&
      poses[1]!.vehicle === 'carriage1' &&
      poses[2]!.vehicle === 'carriage2',
    'vehicle order is locomotive, carriage1, carriage2',
    () => `${ctx} ${JSON.stringify(poses)}`,
  );

  const offsets = [0, -SPACING_1, -(SPACING_1 + SPACING_2)];
  poses.forEach((pose, i) => {
    const at = { x: pose.x, z: pose.z };
    // Spacing along the centreline, extension past a dead end and carried facing.
    const want = oracleWalk(board, sim.loco, offsets[i]!);
    const detail = () =>
      `${ctx} ${pose.vehicle}: got ${JSON.stringify(pose)}, expected ${JSON.stringify(want)}, loco ${JSON.stringify(sim.loco)}`;

    check(Number.isFinite(pose.x) && Number.isFinite(pose.z), 'pose is finite', detail);
    check(Math.abs(len(pose.tangent) - 1) <= TOL, 'heading is a unit vector', detail);
    check(near(at, want.p), `centre is ${-offsets[i]!} along the track behind the locomotive centre`, detail);
    check(near(pose.tangent, want.facing), 'heading is the locomotive facing carried along the track', detail);
    if (!want.atDeadEnd) check(pose.onTrack === want.onTrack, 'onTrack matches the walk', detail);

    if (pose.onTrack) {
      // On the centreline of the reported piece, heading along its tangent.
      const t = pose.pieceId === null ? undefined : board.byId.get(pose.pieceId);
      check(t !== undefined, 'an on-track vehicle reports a track piece', detail);
      const err = centrelineError(t!, at, pose.tangent);
      check(err.dist <= TOL, `centre on the reported piece's centreline (off by ${err.dist})`, detail);
      check(err.angle <= TOL, `heading along the centreline tangent (sin ${err.angle})`, detail);
    } else {
      check(pose.pieceId === null, 'a vehicle on the extension reports pieceId null', detail);
    }
  });

  const locoDetail = () => `${ctx} ${JSON.stringify(poses)} sim ${JSON.stringify(sim)}`;
  // The locomotive centre never leaves the track.
  check(poses[0]!.onTrack && poses[0]!.pieceId === sim.loco.pieceId, 'locomotive on its piece', locoDetail);
  // Straight-line distances can only be shorter than the along-track spacing.
  const p = poses.map((q) => ({ x: q.x, z: q.z }));
  check(len(sub(p[0]!, p[1]!)) <= SPACING_1 + TOL, 'loco to carriage 1 chord ≤ 0.95', locoDetail);
  check(len(sub(p[1]!, p[2]!)) <= SPACING_2 + TOL, 'carriage 1 to carriage 2 chord ≤ 0.9', locoDetail);

  // Snapshot (Requirement 39.13).
  const snap = snapshot(g, sim);
  const L = board.byId.get(sim.loco.pieceId)!.L;
  const snapDetail = () => `${ctx} snapshot ${JSON.stringify(snap)} sim ${JSON.stringify(sim)}`;
  check(snap.pieceId === sim.loco.pieceId, 'snapshot pieceId is the locomotive piece', snapDetail);
  check(snap.progress >= 0 && snap.progress <= 1, 'progress in [0, 1]', snapDetail);
  check(Math.abs(snap.progress - sim.loco.s / L) <= TOL, 'progress = s / L', snapDetail);
  check(snap.speed >= 0 && snap.speed === sim.speed, 'speed ≥ 0 and equals the simulation speed', snapDetail);
  check(snap.moving === sim.speed > 0, 'moving = speed > 0', snapDetail);
  check(snap.direction === sim.direction, 'direction matches', snapDetail);
  return poses;
}

function checkSubStep(
  board: Board,
  before: TrainSim,
  after: TrainSim,
  posesBefore: VehiclePose[],
  posesAfter: VehiclePose[],
  h: number,
  ctx: string,
): void {
  const bound =
    after.speed > 0
      ? after.speed * h + SNAP
      : (before.speed + MAX_ACCEL * h) * h + ARRIVAL_SNAP + SNAP;
  const detail = () => `${ctx}: before ${JSON.stringify(before)} after ${JSON.stringify(after)} h ${h} bound ${bound}`;

  // Travel direction for the sub-step: along the facing in Forward, against it in Reverse.
  const walkDir: 1 | -1 =
    after.direction === 'forward' ? before.loco.heading : before.loco.heading === 1 ? -1 : 1;
  const found = oracleDistance(board, before.loco, after.loco, walkDir, bound + TOL);
  check(found !== null, 'locomotive moved along the travel direction, within speed × h', detail);
  check(found!.dist <= bound, `locomotive moved ${found!.dist}, more than the bound`, detail);
  // The locomotive keeps facing the same way along the track.
  check(after.loco.heading === found!.heading, 'locomotive keeps its facing along the track', detail);

  for (let i = 0; i < 3; i++) {
    const a = posesBefore[i]!;
    const b = posesAfter[i]!;
    const moved = len({ x: b.x - a.x, z: b.z - a.z });
    check(moved <= bound + TOL, `${a.vehicle} moved ${moved}, more than the bound`, detail);
  }
}

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

const arbStationBoard: fc.Arbitrary<Piece[]> = fc.oneof(
  arbLayout,
  arbLayoutWith({ decorations: true }),
  arbLoop({ station: 'always' }).map((l) => l.pieces),
);

/**
 * Frame times from 0 to 0.12 s. `fc.double` alone is biased toward tiny and
 * subnormal values, which would leave the train almost still, so most frame
 * times are spread evenly; a few are exact boundary values and arbitrary
 * doubles. Values above 0.1 exercise the frame clamp.
 */
const arbDt: fc.Arbitrary<number> = fc.oneof(
  { arbitrary: fc.integer({ min: 0, max: 12_000 }).map((n) => n / 100_000), weight: 8 },
  { arbitrary: fc.constantFrom(0, 1 / 120, 1 / 60, 0.05, 0.1, 0.11, 0.12), weight: 1 },
  { arbitrary: fc.double({ min: 0, max: 0.12, noNaN: true }), weight: 1 },
);

/** A held drive mode and key state for a run of frames. */
const arbSegment: fc.Arbitrary<{ input: DriveInput; dts: number[] }> = fc.record({
  input: fc.record({
    driveMode: fc.constantFrom<'auto' | 'manual'>('auto', 'manual'),
    w: fc.boolean(),
    s: fc.boolean(),
  }),
  dts: fc.array(arbDt, { minLength: 1, maxLength: 60, size: 'max' }),
});

// ---------------------------------------------------------------------------
// Property
// ---------------------------------------------------------------------------

/** Runs one frame as its sub-steps, checking after each one. */
function runFrame(
  g: TrackGraph,
  board: Board,
  sim: TrainSim,
  input: DriveInput,
  dt: number,
  ctx: string,
): StepResult {
  const events: TrainEvent[] = [];
  // Applies a drive-mode switch without moving, as the start of every frame does.
  let r = stepTrain(g, sim, input, 0);
  expect(r.sim.loco, ctx).toEqual(sim.loco);
  events.push(...r.events);
  let cur = r.sim;
  let poses = checkState(g, board, cur, ctx);

  const total = Number.isFinite(dt) && dt > 0 ? Math.min(dt, FRAME_CLAMP) : 0;
  const whole = Math.floor(total / H + 1e-9);
  const rest = total - whole * H;
  const steps: number[] = Array.from({ length: whole }, () => H);
  if (rest > 1e-12) steps.push(rest);
  steps.forEach((h, i) => {
    r = stepTrain(g, cur, input, h);
    const sctx = `${ctx} sub-step ${i} (h ${h})`;
    const next = checkState(g, board, r.sim, sctx);
    checkSubStep(board, cur, r.sim, poses, next, h, sctx);
    events.push(...r.events);
    cur = r.sim;
    poses = next;
  });
  return { sim: cur, events };
}

describe('Property 38: Vehicles stay on the centreline at fixed spacing', () => {
  it('keeps every vehicle on the centreline, 0.95 and 0.9 apart, led correctly and moving at most speed × dt', () => {
    fc.assert(
      fc.property(
        arbStationBoard,
        fc.constantFrom<0 | 180>(0, 180),
        fc.array(arbSegment, { minLength: 1, maxLength: 6, size: 'max' }),
        (pieces, startFacing, segments) => {
          const station = pieces.find((p) => p.type === 'station')!;
          const g = buildTrackGraph(pieces);
          const board = makeBoard(pieces);

          let sim = parkTrain(g, station, startFacing);
          checkState(g, board, sim, 'parked');
          sim = startPlay(g, sim).sim;
          checkState(g, board, sim, 'startPlay');

          let frame = 0;
          for (const seg of segments) {
            for (const dt of seg.dts) {
              const ctx = `frame ${frame} ${JSON.stringify(seg.input)} dt ${dt}`;
              const composed = runFrame(g, board, sim, seg.input, dt, ctx);
              // One call with the whole frame dt (clamped to 0.1 s) gives the same result.
              const whole = stepTrain(g, sim, seg.input, dt);
              expect(whole.sim, ctx).toEqual(composed.sim);
              expect(whole.events, ctx).toEqual(composed.events);
              sim = whole.sim;
              frame++;
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  }, 120_000);
});
