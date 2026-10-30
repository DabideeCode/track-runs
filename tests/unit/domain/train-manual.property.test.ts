// Feature: track-diorama-builder, Property 41: Manual driving respects its speed limits
/**
 * **Validates: Requirements 20.8, 21.1, 21.2, 21.3, 21.4, 21.7**
 *
 * For any layout and any key schedule in Manual mode, the speed never exceeds
 * 2; holding one key from standstill with at least 1.5 tiles of free track
 * reaches 2 within 1 second; from any state, 0.5 seconds without thrust (no
 * key, or both keys) brings the speed to 0; the reported direction is forward
 * while W alone is the thrust and reverse while S alone is, and it changes
 * only while the speed is 0; switching from Auto to Manual with no key held
 * also stops the train within 0.5 seconds.
 *
 * How the run is built
 * - Layouts: closed loops with a station (`arbLoop`, unlimited free track) and
 *   random open layouts (`arbLayout`, dead ends and buffers).
 * - The train is parked with a random start facing and Play mode starts
 *   (`startPlay`, Auto). A first Auto segment of 0 to 3 s gives a random
 *   starting state (cruising, braking, paused or blocked), then a random
 *   schedule of segments follows. Each segment has a drive mode (mostly
 *   Manual), held keys (none, W, S or both), a duration and a cycle of frame
 *   times between 1/500 s and 0.1 s (no frame clamping).
 * - Every frame is stepped with `stepTrain(dt)` as the app does. To observe
 *   the instants inside a frame, the same frame is replayed as its 1/120 s
 *   sub-steps (plus the shorter remainder), and the replay must end in the
 *   identical state, so the observations are of the real simulation.
 *
 * Checks, at every sub-step
 * - speed ≤ 2 (Requirement 21.3).
 * - `direction` changes only when the speed before the change is exactly 0
 *   (Requirement 21.7).
 * - In Manual with one key held, any rise in speed happens in the requested
 *   direction (Requirements 21.1, 21.2).
 * - In Manual with no thrust (no key or both keys), the speed never rises.
 *
 * Checks per Manual segment, timed from the segment start (the moment thrust
 * ended, the key changed or Manual was entered)
 * - No thrust, starting speed v0: speed is 0 once v0 / 5 + one sub-step has
 *   passed, so from any state (v0 ≤ 2) within 0.4 s + one sub-step, inside
 *   the 0.5 s of Requirements 21.4 and 20.8. Right after an Auto segment at
 *   or below the 1.5 cruise speed, within 0.3 s + one sub-step. (A short Auto
 *   segment that follows Manual top speed can still be above 1.5 while it
 *   brakes toward cruise; then the 0.4 s bound applies.)
 * - One key held, starting speed v0: once v0 / 5 + two sub-steps have passed
 *   (brake through 0, then switch), `direction` is the requested one
 *   (forward for W, reverse for S), whether or not the train can move
 *   (Requirements 21.1, 21.2, 21.7). Since the direction changes only at
 *   speed 0, an opposite key therefore brings the train to 0 within
 *   0.4 s + two sub-steps.
 * - One key held from standstill with at least 1.5 tiles of free track ahead
 *   of the leading end in the requested direction: the speed reaches 2 within
 *   1 s + one sub-step (Requirement 21.3).
 *
 * Free track is measured by an oracle built on `trackGraph.ts` walks: from the
 * locomotive front (0.45 ahead of the centre) forward, or from the rear of
 * carriage 2 (2.25 behind the centre) backward, to the first dead end; 0 when
 * the leading end itself is off the track.
 *
 * Dependence on the documented deviation: `train.ts` uses a dead-end braking
 * envelope of 5 tiles/s² in Manual (MANUAL_DEAD_END_BRAKING) instead of the
 * design's 3. The "1.5 tiles reaches 2 within 1 second" clause needs it: the
 * train covers 1 tile while accelerating to 2, and the envelope sqrt(2aD)
 * must stay ≥ 2 for the remaining D, which needs D ≥ 0.4 with a = 5 (1.4
 * tiles in total) but D ≥ 0.67 with a = 3 (1.67 tiles in total).
 *
 * Coverage counters make sure each timed check actually ran in the 100 cases.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { advance, buildTrackGraph, type TrackGraph, type TrackLoc } from '@/domain/trackGraph';
import {
  AUTO_CRUISE_SPEED,
  MANUAL_BRAKING,
  MANUAL_TOP_SPEED,
  SUB_STEP,
  parkTrain,
  snapshot,
  startPlay,
  stepTrain,
  type DriveInput,
  type TrainDirection,
  type TrainSim,
} from '@/domain/train';
import type { Piece } from '@/domain/types';
import { arbLayout, arbLoop } from '../arbitraries';

const TOL = 1e-9;
/** Locomotive centre to its front, and to the rear of carriage 2 (Section 6, D-15). */
const FRONT = 0.45;
const REAR = 0.95 + 0.9 + 0.4;

type Keys = 'none' | 'w' | 's' | 'both';

interface Segment {
  driveMode: 'auto' | 'manual';
  keys: Keys;
  duration: number;
  dts: number[];
}

function inputOf(seg: Segment): DriveInput {
  return {
    driveMode: seg.driveMode,
    w: seg.keys === 'w' || seg.keys === 'both',
    s: seg.keys === 's' || seg.keys === 'both',
  };
}

function requested(keys: Keys): TrainDirection | null {
  if (keys === 'w') return 'forward';
  if (keys === 's') return 'reverse';
  return null;
}

/** Free track ahead of the leading end in `direction`, by walking the graph. */
function freeTrack(g: TrackGraph, loco: TrackLoc, direction: TrainDirection): number {
  const toLead = direction === 'forward' ? FRONT : -REAR;
  const lead = advance(g, loco, toLead);
  if (lead.blocked) return 0;
  const rest = advance(g, lead.loc, direction === 'forward' ? Infinity : -Infinity);
  return rest.blocked ? rest.moved : Infinity;
}

/** Replays one frame as the sub-steps `stepTrain` integrates, returning the state after each. */
function subSteps(g: TrackGraph, sim: TrainSim, input: DriveInput, dt: number): TrainSim[] {
  const whole = Math.floor(dt / SUB_STEP + 1e-9);
  const rest = dt - whole * SUB_STEP;
  const pieces: number[] = Array.from({ length: whole }, () => SUB_STEP);
  if (rest > 1e-12) pieces.push(rest);
  const out: TrainSim[] = [];
  let cur = sim;
  for (const h of pieces) {
    cur = stepTrain(g, cur, input, h).sim;
    out.push(cur);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

const arbDt: fc.Arbitrary<number> = fc.oneof(
  { arbitrary: fc.constantFrom(1 / 30, 1 / 60, 1 / 90, 1 / 120, 1 / 144, 1 / 240, 0.05, 0.1), weight: 3 },
  { arbitrary: fc.double({ min: 0.002, max: 0.1, noNaN: true }), weight: 1 },
);

const arbDuration: fc.Arbitrary<number> = fc.oneof(
  { arbitrary: fc.double({ min: 0.02, max: 0.3, noNaN: true }), weight: 1 },
  { arbitrary: fc.double({ min: 0.3, max: 0.8, noNaN: true }), weight: 1 },
  { arbitrary: fc.double({ min: 1.05, max: 1.8, noNaN: true }), weight: 2 },
);

const arbKeys: fc.Arbitrary<Keys> = fc.oneof(
  { arbitrary: fc.constant<Keys>('none'), weight: 3 },
  { arbitrary: fc.constant<Keys>('w'), weight: 3 },
  { arbitrary: fc.constant<Keys>('s'), weight: 3 },
  { arbitrary: fc.constant<Keys>('both'), weight: 1 },
);

const arbSegment: fc.Arbitrary<Segment> = fc.record({
  driveMode: fc.oneof(
    { arbitrary: fc.constant<'manual'>('manual'), weight: 6 },
    { arbitrary: fc.constant<'auto'>('auto'), weight: 1 },
  ),
  keys: arbKeys,
  duration: arbDuration,
  dts: fc.array(arbDt, { minLength: 1, maxLength: 3 }),
});

const arbAutoLead: fc.Arbitrary<Segment> = fc.record({
  driveMode: fc.constant<'auto'>('auto'),
  keys: arbKeys,
  duration: fc.double({ min: 0, max: 3, noNaN: true }),
  dts: fc.array(arbDt, { minLength: 1, maxLength: 3 }),
});

const arbPieces: fc.Arbitrary<Piece[]> = fc.oneof(
  arbLoop({ station: 'always' }).map((l) => l.pieces),
  arbLayout,
);

/** The first segment after the Auto lead: Manual, usually with no key (the Auto → Manual switch of 20.8). */
const arbFirstManual: fc.Arbitrary<Segment> = fc.record({
  driveMode: fc.constant<'manual'>('manual'),
  keys: fc.oneof(
    { arbitrary: fc.constant<Keys>('none'), weight: 3 },
    { arbitrary: fc.constantFrom<Keys>('w', 's', 'both'), weight: 2 },
  ),
  duration: arbDuration,
  dts: fc.array(arbDt, { minLength: 1, maxLength: 3 }),
});

interface Case {
  pieces: Piece[];
  startFacing: 0 | 180;
  lead: Segment;
  segments: Segment[];
}

const arbCase: fc.Arbitrary<Case> = fc.record({
  pieces: arbPieces,
  startFacing: fc.constantFrom<0 | 180>(0, 180),
  lead: arbAutoLead,
  segments: fc
    .tuple(arbFirstManual, fc.array(arbSegment, { maxLength: 7 }))
    .map(([first, rest]) => [first, ...rest]),
});

// ---------------------------------------------------------------------------
// Fixed coverage cases
// ---------------------------------------------------------------------------

/**
 * A 3 × 3 loop with one station (the `arbLoop` layout for one straight per
 * side, north-west corner at (5, 5)), so free track is unlimited.
 */
const FIXED_LOOP: Piece[] = [
  { id: 'L1', type: 'curve', gridX: 5, gridZ: 5, rotation: 0 },
  { id: 'L2', type: 'straight', gridX: 6, gridZ: 5, rotation: 90 },
  { id: 'L3', type: 'curve', gridX: 7, gridZ: 5, rotation: 90 },
  { id: 'L4', type: 'station', gridX: 7, gridZ: 6, rotation: 0 },
  { id: 'L5', type: 'curve', gridX: 7, gridZ: 7, rotation: 180 },
  { id: 'L6', type: 'straight', gridX: 6, gridZ: 7, rotation: 90 },
  { id: 'L7', type: 'curve', gridX: 5, gridZ: 7, rotation: 270 },
  { id: 'L8', type: 'straight', gridX: 5, gridZ: 6, rotation: 0 },
];

/**
 * Eight segments after a 2 s Auto lead: Auto → Manual with no key (coast from
 * cruise), then W from standstill (accelerate), S at top speed (reversal), both
 * keys (coast), W, S, no key, W. Durations and frame times are in the
 * generators' ranges, so each case is a value of `arbCase`.
 */
function coverageCase(startFacing: 0 | 180, dts: number[]): Case {
  const seg = (driveMode: 'auto' | 'manual', keys: Keys, duration: number): Segment => ({
    driveMode,
    keys,
    duration,
    dts,
  });
  return {
    pieces: FIXED_LOOP,
    startFacing,
    lead: seg('auto', 'none', 2),
    segments: [
      seg('manual', 'none', 0.6),
      seg('manual', 'w', 1.2),
      seg('manual', 's', 1.2),
      seg('manual', 'both', 0.6),
      seg('manual', 'w', 1.2),
      seg('manual', 's', 1.2),
      seg('manual', 'none', 0.6),
      seg('manual', 'w', 1.2),
    ],
  };
}

/**
 * Fixed cases that reach every coverage threshold below on their own, for
 * every seed. fast-check runs `examples` first, inside `numRuns`.
 */
const COVERAGE_CASES: Case[] = [
  coverageCase(0, [1 / 60]),
  coverageCase(180, [1 / 60]),
  coverageCase(0, [1 / 144, 1 / 30]),
  coverageCase(180, [0.05, 1 / 120]),
];

// ---------------------------------------------------------------------------
// Property
// ---------------------------------------------------------------------------

describe('Property 41: Manual driving respects its speed limits', () => {
  it('caps speed at 2, reaches 2 within 1 s, stops within 0.4 s without thrust and only flips direction at 0', () => {
    const coverage = { accel: 0, coast: 0, bothKeys: 0, autoToManual: 0, reversal: 0, directionSettled: 0 };
    // The same counters for the fixed cases only (fast-check runs them first).
    const exampleCoverage = { ...coverage };
    let runs = 0;

    fc.assert(
      fc.property(arbCase, ({ pieces, startFacing, lead, segments }) => {
        const isExample = runs++ < COVERAGE_CASES.length;
        const count = (key: keyof typeof coverage) => {
          coverage[key]++;
          if (isExample) exampleCoverage[key]++;
        };
        const g = buildTrackGraph(pieces);
        const station = pieces.find((p) => p.type === 'station')!;
        let sim = startPlay(g, parkTrain(g, station, startFacing)).sim;
        let prevDriveMode: 'auto' | 'manual' = 'auto';

        for (const seg of [lead, ...segments]) {
          const input = inputOf(seg);
          const manual = seg.driveMode === 'manual';
          const want = requested(seg.keys);
          const thrust = manual && want !== null;
          const fromAuto = manual && prevDriveMode === 'auto';
          const v0 = sim.speed;
          const dir0 = sim.direction;
          const free0 = want !== null ? freeTrack(g, sim.loco, want) : 0;
          const startClock = sim.clock;

          let maxSpeedBy1s = 0;
          let observedUntil = 0;

          for (let f = 0; sim.clock - startClock < seg.duration - TOL; f++) {
            const dt = seg.dts[f % seg.dts.length]!;
            const real = stepTrain(g, sim, input, dt).sim;
            const subs = subSteps(g, sim, input, dt);
            expect(subs[subs.length - 1]).toEqual(real);

            let prev = sim;
            for (const next of subs) {
              const e = next.clock - startClock;
              // Speed cap (21.3).
              expect(next.speed).toBeLessThanOrEqual(MANUAL_TOP_SPEED + TOL);
              // Direction changes only at speed 0 (21.7).
              if (next.direction !== prev.direction) expect(prev.speed).toBe(0);

              if (thrust) {
                // Speed rises only in the requested direction (21.1, 21.2).
                if (next.speed > prev.speed) expect(next.direction).toBe(want);
                // After braking through 0, the reported direction is the requested one.
                if (e >= v0 / MANUAL_BRAKING + 2 * SUB_STEP + TOL) expect(next.direction).toBe(want);
                if (e <= 1 + SUB_STEP + TOL) maxSpeedBy1s = Math.max(maxSpeedBy1s, next.speed);
              } else if (manual) {
                // No thrust: never speeds up, stops within v0 / 5 + one sub-step (21.4, 20.8).
                expect(next.speed).toBeLessThanOrEqual(prev.speed + TOL);
                if (e >= v0 / MANUAL_BRAKING + SUB_STEP + TOL) expect(next.speed).toBe(0);
                if (e >= 0.4 + SUB_STEP + TOL) expect(next.speed).toBe(0);
                if (e >= 0.5) expect(snapshot(g, next).moving).toBe(false);
                // From Auto cruise (≤ 1.5): within 0.3 s; Requirement 20.8's 0.5 s holds through the 0.4 s check.
                if (fromAuto && v0 <= AUTO_CRUISE_SPEED + TOL && e >= 0.3 + SUB_STEP + TOL) {
                  expect(next.speed).toBe(0);
                }
              }
              prev = next;
              observedUntil = e;
            }
            sim = real;
          }

          // Per-segment checks that need the whole window to have been observed.
          if (thrust) {
            if (observedUntil >= v0 / MANUAL_BRAKING + 2 * SUB_STEP + TOL) {
              count('directionSettled');
              if (v0 > 0 && dir0 !== want) count('reversal');
            }
            if (v0 === 0 && free0 >= 1.5 && observedUntil >= 1 + SUB_STEP + TOL) {
              // From standstill with ≥ 1.5 tiles free: 2 tiles/s within 1 s (21.3).
              expect(maxSpeedBy1s).toBeGreaterThanOrEqual(MANUAL_TOP_SPEED - TOL);
              count('accel');
            }
          } else if (manual && v0 > 0 && observedUntil >= v0 / MANUAL_BRAKING + SUB_STEP + TOL) {
            count('coast');
            if (seg.keys === 'both') count('bothKeys');
            if (fromAuto && v0 <= AUTO_CRUISE_SPEED + TOL) count('autoToManual');
          }
          prevDriveMode = seg.driveMode;
        }
      }),
      { numRuns: 100, examples: COVERAGE_CASES.map((c): [Case] => [c]) },
    );

    // The fixed cases alone reach every threshold below, whatever the seed.
    // (The examples are counted within numRuns.)
    expect(runs).toBe(100);
    expect(exampleCoverage.accel).toBeGreaterThanOrEqual(10);
    expect(exampleCoverage.coast).toBeGreaterThanOrEqual(10);
    expect(exampleCoverage.bothKeys).toBeGreaterThanOrEqual(1);
    expect(exampleCoverage.autoToManual).toBeGreaterThanOrEqual(3);
    expect(exampleCoverage.reversal).toBeGreaterThanOrEqual(5);
    expect(exampleCoverage.directionSettled).toBeGreaterThanOrEqual(20);

    // Each timed check must have run on real cases, not only vacuously.
    expect(coverage.accel).toBeGreaterThanOrEqual(10);
    expect(coverage.coast).toBeGreaterThanOrEqual(10);
    expect(coverage.bothKeys).toBeGreaterThanOrEqual(1);
    expect(coverage.autoToManual).toBeGreaterThanOrEqual(3);
    expect(coverage.reversal).toBeGreaterThanOrEqual(5);
    expect(coverage.directionSettled).toBeGreaterThanOrEqual(20);
  });
});
