// Feature: track-diorama-builder, Property 40: Auto driving cruises, pauses and reverses
/**
 * **Validates: Requirements 17.8, 18.3, 20.2, 20.4, 20.5, 21.8**
 *
 * For any layout with a station in Auto mode: after the 0.25 s departure ramp
 * the speed is 1.5 whenever the train is neither braking nor paused; on any
 * closed loop the train never stops or changes direction during a 30-second
 * run; on an open layout, each stop at a dead end is followed by exactly
 * 1 second (± one sub-step) with `moving: false`, then motion in the opposite
 * direction unless that direction is also blocked; and held W or S keys do
 * not change the run.
 *
 * How the checks observe the run:
 * - Time is the simulation clock (`sim.clock`), so frames longer than 0.1 s
 *   count as the clamped 0.1 s (D-17). Frames have random lengths.
 * - "Braking" is not read from the simulator's phase label. Instead, inside
 *   each stretch of motion, any frame below 1.5 tiles/s must either lie in the
 *   departure ramp (at most 0.25 s plus the departure frame after the train
 *   last stood still) or start a descent whose speed never rises again before
 *   the train next comes to rest.
 * - Every rest after motion must be at a dead end: the leading end (the
 *   locomotive front going Forward, the rear of carriage 2 in Reverse) has no
 *   free track left in the direction of travel. This rules out stopping
 *   mid-track (Requirement 20.3, 20.4).
 * - The pause is seen only at frame ends. The arrival happens inside the first
 *   rest frame and the departure inside the first moving frame after it, so a
 *   pause of 1 s (+ less than one sub-step) shows as a gap between the last
 *   and first rest frame ends in (1 − both frame lengths, 1 + one sub-step).
 * - A rest that lasts longer than 1 s + one sub-step is accepted only as the
 *   D-18 "blocked" case: the opposite direction has no free track either, and
 *   no sound event fires after the arrival frame.
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { advance, buildTrackGraph, distanceToDeadEnd, type TrackGraph, type TrackLoc } from '@/domain/trackGraph';
import {
  AUTO_CRUISE_SPEED,
  SUB_STEP,
  parkTrain,
  snapshot,
  startPlay,
  stepTrain,
  type TrainDirection,
  type TrainEvent,
  type TrainSim,
  type TrainSnapshot,
} from '@/domain/train';
import type { Piece } from '@/domain/types';
import { arbLayout, arbLayoutWith, arbLoop } from '../arbitraries';

/** Departure ramp from Section 1.10 of design.md: 0 to 1.5 at 6 tiles/s². */
const RAMP = 0.25;
/** Pause at a dead end (AC-10.6). */
const PAUSE = 1;
/** Locomotive front ahead of its centre, and carriage 2's rear behind it (0.95 + 0.9 + 0.4). */
const FRONT = 0.45;
const REAR = 2.25;
const EPS = 1e-9;
const AT_END = 1e-6;

const LOOP_SECONDS = 30;
const OPEN_SECONDS = 15;

// ---------------------------------------------------------------------------
// Simulation harness
// ---------------------------------------------------------------------------

interface Keys {
  w: boolean;
  s: boolean;
}

interface Frame {
  /** Simulation clock at the end of the frame. */
  clock: number;
  /** Simulated length of the frame (after the 0.1 s clamp). */
  dt: number;
  snap: TrainSnapshot;
  events: TrainEvent[];
  sim: TrainSim;
}

/** Runs Auto driving until the clock reaches `seconds`, cycling through the frame lengths and key states. */
function simulate(
  g: TrackGraph,
  start: TrainSim,
  dts: readonly number[],
  seconds: number,
  keys: readonly Keys[] = [{ w: false, s: false }],
): Frame[] {
  const frames: Frame[] = [];
  let sim = start;
  for (let i = 0; sim.clock < seconds - EPS; i++) {
    const k = keys[i % keys.length]!;
    const r = stepTrain(g, sim, { driveMode: 'auto', w: k.w, s: k.s }, dts[i % dts.length]!);
    frames.push({ clock: r.sim.clock, dt: r.sim.clock - sim.clock, snap: snapshot(g, r.sim), events: r.events, sim: r.sim });
    sim = r.sim;
  }
  return frames;
}

function flip(d: TrainDirection): TrainDirection {
  return d === 'forward' ? 'reverse' : 'forward';
}

/**
 * Free track ahead of the leading end in `dir` (Infinity when there is no dead
 * end). In Reverse, a rear that already hangs past an open end has none.
 */
function leadingFree(g: TrackGraph, loco: TrackLoc, dir: TrainDirection): number {
  if (dir === 'forward') {
    const d = distanceToDeadEnd(g, loco, 1000);
    return d === Infinity ? Infinity : d - FRONT;
  }
  const rear = advance(g, loco, -REAR);
  if (rear.blocked) return 0;
  const walkingBack: TrackLoc = { ...rear.loc, heading: rear.loc.heading === 1 ? -1 : 1 };
  return distanceToDeadEnd(g, walkingBack, 1000);
}

function startRun(pieces: readonly Piece[], facing: 0 | 180) {
  const g = buildTrackGraph(pieces);
  const station = pieces.find((p) => p.type === 'station');
  if (!station) throw new Error('layout without a station');
  const started = startPlay(g, parkTrain(g, station, facing));
  return { g, started };
}

interface RunStats {
  departures: number;
  blocked: boolean;
}

/** Checks one Auto run on any layout; returns what happened, for coverage counting. */
function checkAutoRun(g: TrackGraph, frames: readonly Frame[]): RunStats {
  const stats: RunStats = { departures: 0, blocked: false };
  const n = frames.length;

  for (const f of frames) {
    expect(f.snap.speed).toBeGreaterThanOrEqual(0);
    expect(f.snap.speed).toBeLessThanOrEqual(AUTO_CRUISE_SPEED + EPS);
    expect(f.snap.moving).toBe(f.snap.speed > 0);
  }

  // Requirement 18.3: moving Forward within 1 second of entering Play mode.
  const firstMoving = frames.findIndex((f) => f.snap.moving);
  expect(firstMoving).toBeGreaterThanOrEqual(0);
  expect(frames[firstMoving]!.clock).toBeLessThanOrEqual(1 + EPS);
  expect(frames[firstMoving]!.snap.direction).toBe('forward');

  let i = firstMoving;
  let expectedDir: TrainDirection = 'forward';
  let restEnd = firstMoving === 0 ? 0 : frames[firstMoving - 1]!.clock;
  let departDt = frames[firstMoving]!.dt;

  while (i < n) {
    let j = i;
    if (frames[i]!.snap.moving) {
      while (j < n && frames[j]!.snap.moving) j++;
      // A stretch of motion [i, j).
      for (let k = i; k < j; k++) expect(frames[k]!.snap.direction).toBe(expectedDir);
      for (let k = i; k < j; k++) {
        const f = frames[k]!;
        if (f.snap.speed >= AUTO_CRUISE_SPEED - EPS) continue;
        if (f.clock - restEnd <= RAMP + departDt + EPS) continue;
        // Below cruise after the ramp: braking, so the speed never rises before the next rest.
        for (let m = k + 1; m < j; m++) {
          expect(frames[m]!.snap.speed).toBeLessThanOrEqual(frames[m - 1]!.snap.speed + EPS);
        }
        break;
      }
      i = j;
      continue;
    }

    // A rest [i, j) after motion: the train must be at a dead end in its direction of travel.
    while (j < n && !frames[j]!.snap.moving) j++;
    const arrival = frames[i]!;
    const arrivalDir = frames[i - 1]!.snap.direction;
    expect(leadingFree(g, arrival.sim.loco, arrivalDir)).toBeLessThanOrEqual(AT_END);
    for (let k = i; k < j; k++) {
      expect(frames[k]!.snap.speed).toBe(0);
      expect(frames[k]!.sim.loco).toEqual(arrival.sim.loco);
    }

    if (j < n) {
      // Departed: 1 s pause (± one sub-step, seen at frame ends), then the opposite direction.
      const lastRest = frames[j - 1]!;
      const depart = frames[j]!;
      const gap = lastRest.clock - arrival.clock;
      expect(gap).toBeLessThanOrEqual(PAUSE + SUB_STEP + EPS);
      expect(gap).toBeGreaterThanOrEqual(PAUSE - arrival.dt - depart.dt - EPS);
      expect(depart.snap.direction).toBe(flip(arrivalDir));
      expectedDir = flip(arrivalDir);
      restEnd = lastRest.clock;
      departDt = depart.dt;
      stats.departures++;
    } else if (frames[n - 1]!.clock - arrival.clock > PAUSE + SUB_STEP + EPS) {
      // Still standing after the pause has run out: only allowed when blocked both ways (D-18), silently.
      expect(leadingFree(g, arrival.sim.loco, flip(arrivalDir))).toBeLessThanOrEqual(AT_END);
      expect(frames.slice(i + 1).flatMap((f) => f.events)).toEqual([]);
      stats.blocked = true;
    }
    i = j;
  }
  return stats;
}

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

const arbFacing = fc.constantFrom<0 | 180>(0, 180);

/** Frame lengths: common refresh rates, anything between 144 and 30 fps, and long frames that get clamped. */
const arbFrameDt = fc.oneof(
  { weight: 4, arbitrary: fc.constantFrom(1 / 30, 1 / 60, 1 / 120, 1 / 144) },
  { weight: 3, arbitrary: fc.double({ min: 1 / 144, max: 1 / 30, noNaN: true }) },
  { weight: 1, arbitrary: fc.constantFrom(0.1, 0.15, 0.25, 0.5) },
);
const arbFrameDts = fc.array(arbFrameDt, { minLength: 1, maxLength: 6 });
const arbKeys = fc.array(fc.record({ w: fc.boolean(), s: fc.boolean() }), { minLength: 1, maxLength: 8 });

/** Open layouts of all sizes (short ones make blocked trains likely), plus some closed loops. */
const arbAnyLayout: fc.Arbitrary<Piece[]> = fc.oneof(
  { weight: 3, arbitrary: arbLayout },
  { weight: 2, arbitrary: arbLayoutWith({ maxSteps: 3 }) },
  { weight: 1, arbitrary: arbLoop({ station: 'always' }).map((l) => l.pieces) },
);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Property 40: Auto driving cruises, pauses and reverses', () => {
  it('on a closed loop the train ramps to 1.5 within 0.25 s and cruises Forward for 30 s without stopping', () => {
    fc.assert(
      fc.property(arbLoop({ station: 'always' }), arbFacing, arbFrameDts, (loop, facing, dts) => {
        const { g, started } = startRun(loop.pieces, facing);
        expect(started.sim.direction).toBe('forward');
        expect(started.events).toContain('whistle');

        const frames = simulate(g, started.sim, dts, LOOP_SECONDS);
        let prevSpeed = 0;
        for (const f of frames) {
          expect(f.snap.moving).toBe(true);
          expect(f.snap.direction).toBe('forward');
          expect(f.snap.speed).toBeLessThanOrEqual(AUTO_CRUISE_SPEED + EPS);
          expect(f.snap.speed).toBeGreaterThanOrEqual(prevSpeed - EPS);
          if (f.clock >= RAMP + EPS) expect(Math.abs(f.snap.speed - AUTO_CRUISE_SPEED)).toBeLessThanOrEqual(EPS);
          expect(f.events).not.toContain('bump');
          expect(f.events).not.toContain('chugStop');
          prevSpeed = f.snap.speed;
        }
        expect(frames[frames.length - 1]!.clock).toBeGreaterThanOrEqual(LOOP_SECONDS - EPS);
      }),
      { numRuns: 100 },
    );
  }, 300_000);

  it('on any layout it cruises at 1.5, stops only at dead ends, pauses 1 s and reverses unless blocked, ignoring W and S', () => {
    const totals = { runs: 0, departures: 0, blocked: 0 };
    fc.assert(
      fc.property(arbAnyLayout, arbFacing, arbFrameDts, arbKeys, (pieces, facing, dts, keys) => {
        const { g, started } = startRun(pieces, facing);
        expect(started.sim.direction).toBe('forward');
        expect(started.events).toContain('whistle');

        const frames = simulate(g, started.sim, dts, OPEN_SECONDS);
        const stats = checkAutoRun(g, frames);
        totals.runs++;
        totals.departures += stats.departures;
        if (stats.blocked) totals.blocked++;

        // Requirement 21.8: W and S held in Auto driving change nothing.
        const withKeys = simulate(g, started.sim, dts, OPEN_SECONDS, keys);
        expect(withKeys.length).toBe(frames.length);
        expect(withKeys.map((f) => f.sim)).toEqual(frames.map((f) => f.sim));
        expect(withKeys.map((f) => f.events)).toEqual(frames.map((f) => f.events));
      }),
      { numRuns: 100 },
    );
    // The generators must exercise pauses with reversals and blocked trains, or the checks above are vacuous.
    expect(totals.departures).toBeGreaterThan(0);
    expect(totals.blocked).toBeGreaterThan(0);
  }, 300_000);
});
