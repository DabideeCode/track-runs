/**
 * Unit tests for train scenarios (task 5.11).
 *
 * Requirements 19.10, 20.4, 20.7, 21.6, plus the frame clamp from D-17 and the
 * blocked phase from D-18. Boards are built by hand; the expected positions
 * come from the catalogue geometry (tile centre at gridX − 7.5, gridZ − 7.5,
 * straights and stations from the N to the S edge midpoint at 0°, the buffer
 * stop face 0.25 north of its tile centre at 0°) and the train dimensions in
 * Section 6 (locomotive 0.9 long, carriages 0.8 long, couplings 0.1).
 */
import { describe, expect, it } from 'vitest';
import { buildTrackGraph, type TrackGraph } from '@/domain/trackGraph';
import {
  parkTrain,
  snapshot,
  startPlay,
  stepTrain,
  vehiclePoses,
  type DriveInput,
  type TrainEvent,
  type TrainSim,
  type TrainSnapshot,
} from '@/domain/train';
import type { Piece, Rotation, PieceType } from '@/domain/types';

const FRAME = 1 / 60;
const POS_TOL = 1e-6;

const AUTO: DriveInput = { driveMode: 'auto', w: false, s: false };
const MANUAL_NONE: DriveInput = { driveMode: 'manual', w: false, s: false };
const MANUAL_W: DriveInput = { driveMode: 'manual', w: true, s: false };
const MANUAL_S: DriveInput = { driveMode: 'manual', w: false, s: true };

function piece(id: string, type: PieceType, gridX: number, gridZ: number, rotation: Rotation = 0): Piece {
  return { id, type, gridX, gridZ, rotation };
}

interface Frame {
  /** Simulation time since the start of this run, at the end of the frame. */
  t: number;
  events: TrainEvent[];
  sim: TrainSim;
  snap: TrainSnapshot;
}

/** Steps `sim` for `seconds` at 60 fps with a fixed input and records every frame. */
function run(g: TrackGraph, sim: TrainSim, input: DriveInput, seconds: number): { sim: TrainSim; frames: Frame[] } {
  const frames: Frame[] = [];
  let current = sim;
  const n = Math.round(seconds / FRAME);
  for (let i = 1; i <= n; i++) {
    const r = stepTrain(g, current, input, FRAME);
    current = r.sim;
    frames.push({ t: i * FRAME, events: r.events, sim: current, snap: snapshot(g, current) });
  }
  return { sim: current, frames };
}

function allEvents(frames: Frame[]): TrainEvent[] {
  return frames.flatMap((f) => f.events);
}

function locoPose(g: TrackGraph, sim: TrainSim) {
  return vehiclePoses(g, sim)[0]!;
}

// ---------------------------------------------------------------------------
// Boards
// ---------------------------------------------------------------------------

/** A lone station on tile (8, 8): world centre (0.5, 0.5), N edge at z = 0, S edge at z = 1. */
function loneStation() {
  const station = piece('st', 'station', 8, 8, 0);
  return { g: buildTrackGraph([station]), station };
}

/**
 * A north–south line in column 8 with a buffer at each end:
 * buffer (8, 4) at 0° (stop face at z = −3.75), straights at rows 5 and 6,
 * the station at row 7 (centre z = −0.5), straights at rows 8 to 12 and a
 * buffer (8, 13) at 180° (stop face at z = 5.75). All x = 0.5.
 */
function bufferLine() {
  const station = piece('st', 'station', 8, 7, 0);
  const pieces: Piece[] = [
    piece('bn', 'buffer', 8, 4, 0),
    piece('s5', 'straight', 8, 5),
    piece('s6', 'straight', 8, 6),
    station,
    piece('s8', 'straight', 8, 8),
    piece('s9', 'straight', 8, 9),
    piece('s10', 'straight', 8, 10),
    piece('s11', 'straight', 8, 11),
    piece('s12', 'straight', 8, 12),
    piece('bs', 'buffer', 8, 13, 180),
  ];
  return { g: buildTrackGraph(pieces), station };
}

/** North buffer stop face; the locomotive front rests here, its centre 0.45 further south. */
const NORTH_STOP_Z = 4 - 7.5 - 0.25;
const LOCO_AT_NORTH_STOP_Z = NORTH_STOP_Z + 0.45;

/** Drives the line board in Manual with W from the station (facing north) until it rests at the north buffer. */
function restAtNorthBuffer() {
  const { g, station } = bufferLine();
  const started = startPlay(g, parkTrain(g, station, 0));
  const driven = run(g, started.sim, MANUAL_W, 5);
  return { g, sim: driven.sim, frames: driven.frames };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('lone station in Auto driving (Requirements 19.10, 20.4, D-18)', () => {
  const cases = [
    {
      facing: 0 as const,
      // Faces north: front stops at the N edge (z = 0), so the locomotive centre is at z = 0.45.
      loco: { x: 0.5, z: 0.45 },
      tangent: { x: 0, z: -1 },
      // Carriages trail south past the S edge (z = 1): 0.95 and 1.85 behind the centre.
      carriages: [1.4, 2.3],
      progress: 0.45,
    },
    {
      facing: 180 as const,
      loco: { x: 0.5, z: 0.55 },
      tangent: { x: 0, z: 1 },
      carriages: [-0.4, -1.3],
      progress: 0.55,
    },
  ];

  for (const c of cases) {
    it(`startFacing ${c.facing}: runs forward to the open end, bumps, pauses 1 s, then stays blocked and silent`, () => {
      const { g, station } = loneStation();
      const started = startPlay(g, parkTrain(g, station, c.facing));
      expect(started.events).toEqual(['whistle', 'chugStart']);
      expect(started.sim.direction).toBe('forward');

      const { frames } = run(g, started.sim, AUTO, 1);
      const bumpIndex = frames.findIndex((f) => f.events.includes('bump'));
      expect(bumpIndex).toBeGreaterThanOrEqual(0);
      const bumpFrame = frames[bumpIndex]!;

      // Before the bump the train only moves forward: no other sounds.
      expect(allEvents(frames.slice(0, bumpIndex))).toEqual([]);
      expect(bumpFrame.events).toEqual(['bump', 'chugStop']);
      expect(bumpFrame.snap.moving).toBe(false);
      expect(bumpFrame.snap.speed).toBe(0);
      expect(bumpFrame.snap.direction).toBe('forward');
      expect(bumpFrame.snap.pieceId).toBe('st');
      expect(bumpFrame.snap.progress).toBeCloseTo(c.progress, 6);

      // Front at the open end; trailing vehicles on the straight extension (19.10).
      const poses = vehiclePoses(g, bumpFrame.sim);
      expect(poses.map((p) => p.vehicle)).toEqual(['locomotive', 'carriage1', 'carriage2']);
      const [loco, c1, c2] = poses;
      expect(loco!.onTrack).toBe(true);
      expect(loco!.pieceId).toBe('st');
      expect(loco!.x).toBeCloseTo(c.loco.x, 6);
      expect(loco!.z).toBeCloseTo(c.loco.z, 6);
      expect(loco!.tangent.x).toBeCloseTo(c.tangent.x, 9);
      expect(loco!.tangent.z).toBeCloseTo(c.tangent.z, 9);
      for (const [i, car] of [c1!, c2!].entries()) {
        expect(car.onTrack).toBe(false);
        expect(car.pieceId).toBeNull();
        expect(car.x).toBeCloseTo(0.5, 6);
        expect(car.z).toBeCloseTo(c.carriages[i]!, 6);
        expect(car.tangent.x).toBeCloseTo(c.tangent.x, 9);
        expect(car.tangent.z).toBeCloseTo(c.tangent.z, 9);
      }
      // Same spacing as on track (Requirement 19.4): 0.95 and 0.9 on a straight line.
      expect(Math.hypot(c1!.x - loco!.x, c1!.z - loco!.z)).toBeCloseTo(0.95, 6);
      expect(Math.hypot(c2!.x - c1!.x, c2!.z - c1!.z)).toBeCloseTo(0.9, 6);

      // The 1-second pause, then blocked: still and silent for a long time.
      const after = run(g, bumpFrame.sim, AUTO, 12);
      const at = (seconds: number) => after.frames[Math.round(seconds / FRAME) - 1]!;
      expect(at(0.9).sim.phase).toBe('paused');
      expect(at(1.1).sim.phase).toBe('blocked');
      expect(after.sim.phase).toBe('blocked');
      expect(allEvents(after.frames)).toEqual([]);
      for (const f of after.frames) {
        expect(f.snap.moving).toBe(false);
        expect(f.snap.speed).toBe(0);
        expect(f.sim.loco).toEqual(bumpFrame.sim.loco);
      }
    });
  }
});

describe('Auto driving at a buffer (Requirement 20.4)', () => {
  it('stops at the stop block, holds 1 s with moving false, then runs in reverse at 1.5', () => {
    const { g, station } = bufferLine();
    const started = startPlay(g, parkTrain(g, station, 0));
    const { frames } = run(g, started.sim, AUTO, 4);
    const bumpIndex = frames.findIndex((f) => f.events.includes('bump'));
    expect(bumpIndex).toBeGreaterThanOrEqual(0);
    const bumpFrame = frames[bumpIndex]!;
    expect(locoPose(g, bumpFrame.sim).z).toBeCloseTo(LOCO_AT_NORTH_STOP_Z, 6);
    expect(bumpFrame.snap.direction).toBe('forward');

    const after = run(g, bumpFrame.sim, AUTO, 2);
    const departIndex = after.frames.findIndex((f) => f.snap.moving);
    expect(departIndex).toBeGreaterThanOrEqual(0);
    const departT = after.frames[departIndex]!.t;
    expect(departT).toBeGreaterThanOrEqual(1 - FRAME - 1e-9);
    expect(departT).toBeLessThanOrEqual(1 + FRAME + 1e-9);
    for (const f of after.frames.slice(0, departIndex)) {
      expect(f.snap.moving).toBe(false);
      expect(f.snap.speed).toBe(0);
      expect(f.snap.direction).toBe('forward');
    }
    const depart = after.frames[departIndex]!;
    expect(depart.snap.direction).toBe('reverse');
    expect(depart.events).toContain('chugStart');

    // Cruising in reverse at 1.5, moving south (away from the buffer).
    const last = after.frames[after.frames.length - 1]!;
    expect(last.snap.direction).toBe('reverse');
    expect(last.snap.moving).toBe(true);
    expect(last.snap.speed).toBeCloseTo(1.5, 9);
    expect(locoPose(g, last.sim).z).toBeGreaterThan(LOCO_AT_NORTH_STOP_Z);
  });
});

describe('Manual driving at a dead end (Requirement 21.6)', () => {
  it('holding W stops the front at the buffer and then keeps the train still and silent', () => {
    const { g, sim, frames } = restAtNorthBuffer();
    expect(allEvents(frames).filter((e) => e === 'bump')).toHaveLength(1);
    const snap = snapshot(g, sim);
    expect(snap.moving).toBe(false);
    expect(snap.speed).toBe(0);
    expect(snap.direction).toBe('forward');
    expect(locoPose(g, sim).z).toBeCloseTo(LOCO_AT_NORTH_STOP_Z, 6);

    // Keep holding W; release; press W again: never moves, never sounds.
    let current = sim;
    for (const input of [MANUAL_W, MANUAL_NONE, MANUAL_W]) {
      const r = run(g, current, input, 2);
      expect(allEvents(r.frames)).toEqual([]);
      for (const f of r.frames) {
        expect(f.snap.speed).toBe(0);
        expect(f.snap.moving).toBe(false);
        expect(f.snap.direction).toBe('forward');
        expect(f.sim.loco).toEqual(sim.loco);
      }
      current = r.sim;
    }
  });

  it('holding S moves the train away from the buffer in reverse', () => {
    const { g, sim } = restAtNorthBuffer();
    const r = run(g, sim, MANUAL_S, 0.5);
    const first = r.frames[0]!;
    expect(first.snap.moving).toBe(true);
    expect(first.snap.direction).toBe('reverse');
    expect(allEvents(r.frames)).toContain('chugStart');
    expect(allEvents(r.frames)).not.toContain('bump');
    // Accelerating at 2 per s² from rest: about 1.0 after 0.5 s, moving south.
    expect(r.frames[r.frames.length - 1]!.snap.speed).toBeCloseTo(1, 6);
    let prevZ = locoPose(g, sim).z;
    for (const f of r.frames) {
      const z = locoPose(g, f.sim).z;
      expect(z).toBeGreaterThan(prevZ);
      prevZ = z;
    }
  });
});

describe('Manual to Auto switch (Requirement 20.7)', () => {
  it('at rest against a dead end in the current direction: pauses 1 s, then reverses at 1.5', () => {
    const { g, sim } = restAtNorthBuffer();
    const r = run(g, sim, AUTO, 2);
    const departIndex = r.frames.findIndex((f) => f.snap.moving);
    expect(departIndex).toBeGreaterThanOrEqual(0);
    const departT = r.frames[departIndex]!.t;
    expect(departT).toBeGreaterThanOrEqual(1 - FRAME - 1e-9);
    expect(departT).toBeLessThanOrEqual(1 + FRAME + 1e-9);
    for (const f of r.frames.slice(0, departIndex)) {
      expect(f.snap.moving).toBe(false);
      expect(f.snap.speed).toBe(0);
      expect(f.sim.loco).toEqual(sim.loco);
    }
    expect(allEvents(r.frames.slice(0, departIndex))).toEqual([]);
    const depart = r.frames[departIndex]!;
    expect(depart.snap.direction).toBe('reverse');
    // More than 3 s have passed since the last whistle, so the departure whistles.
    expect(depart.events).toEqual(expect.arrayContaining(['whistle', 'chugStart']));
    const last = r.frames[r.frames.length - 1]!;
    expect(last.snap.direction).toBe('reverse');
    expect(last.snap.speed).toBeCloseTo(1.5, 9);
    expect(locoPose(g, last.sim).z).toBeGreaterThan(LOCO_AT_NORTH_STOP_Z);
  });

  it('stopped mid-track: runs at once in the current direction at 1.5 without a pause', () => {
    const { g, sim } = restAtNorthBuffer();
    const away = run(g, sim, MANUAL_S, 0.5);
    const coasted = run(g, away.sim, MANUAL_NONE, 1);
    const rest = snapshot(g, coasted.sim);
    expect(rest.moving).toBe(false);
    expect(rest.direction).toBe('reverse');

    const r = run(g, coasted.sim, AUTO, 1);
    expect(r.frames[0]!.snap.moving).toBe(true);
    for (const f of r.frames) {
      expect(f.snap.direction).toBe('reverse');
      expect(f.snap.moving).toBe(true);
    }
    expect(r.frames[r.frames.length - 1]!.snap.speed).toBeCloseTo(1.5, 9);
  });
});

describe('frame time clamp (D-17)', () => {
  it('a frame longer than 0.1 s advances exactly as much as a 0.1 s frame', () => {
    const { g, station } = bufferLine();
    const started = startPlay(g, parkTrain(g, station, 0)).sim;
    expect(stepTrain(g, started, AUTO, 0.5)).toEqual(stepTrain(g, started, AUTO, 0.1));
    expect(stepTrain(g, started, AUTO, 5)).toEqual(stepTrain(g, started, AUTO, 0.1));
  });

  it('while cruising, a 0.5 s frame moves the locomotive 1.5 × 0.1 = 0.15 tiles', () => {
    const { g, station } = bufferLine();
    const started = startPlay(g, parkTrain(g, station, 0)).sim;
    const cruising = run(g, started, AUTO, 0.5).sim;
    expect(snapshot(g, cruising).speed).toBeCloseTo(1.5, 9);
    const before = locoPose(g, cruising);
    const after = locoPose(g, stepTrain(g, cruising, AUTO, 0.5).sim);
    expect(Math.hypot(after.x - before.x, after.z - before.z)).toBeCloseTo(0.15, 9);
    expect(after.z).toBeLessThan(before.z);
    expect(Math.abs(after.x - before.x)).toBeLessThanOrEqual(POS_TOL);
  });
});
