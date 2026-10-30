// Feature: track-diorama-builder, Property 42: Train sounds match the motion
/**
 * **Validates: Requirements 26.1, 26.2, 26.4, 26.5, 26.6**
 *
 * For any simulation run, `chug` is logged exactly when the speed rises from 0
 * and a chug stop happens exactly when the speed returns to 0; `bump` is
 * logged exactly once for each stop at a dead end and never for a stop
 * elsewhere; and `whistle` is logged only at departures from standstill and
 * never twice within 3 seconds.
 *
 * Method. Each run starts Play mode from the parked train (`startPlay`) and
 * then plays random frames (drive-mode switches, W/S patterns, frame times
 * including 0 and values above the 0.1 s clamp) through `stepTrain`. Every
 * frame is replayed in single sub-steps (one `dt = 0` call for the drive-mode
 * switch, then the same 1/120 s sub-steps and remainder `stepTrain` uses).
 * The replay must reproduce the frame exactly (same state, same events in the
 * same order); it then exposes the speed before and after every sub-step, so
 * the model below checks each event against the motion at the moment it
 * fired, not only at frame boundaries.
 *
 * Model checks over the whole run:
 * - `chugStart` and `chugStop` alternate strictly, starting with `chugStart`
 *   (so there is at most one more start than stop); `sim.chugging` is true
 *   exactly between them, and after any sub-step it equals `speed > 0`.
 * - A sub-step emits `chugStart` exactly when the chug was off and the speed
 *   ends above 0 (Requirement 26.2), and `chugStop` exactly when the chug was
 *   on and the speed ends at 0 (Requirement 26.5). At frame level, a frame
 *   whose last chug event is `chugStop` ends at speed 0, and a frame that ends
 *   at 0 after starting above 0 contains `chugStop`.
 * - `bump` fires only in a sub-step where the train was moving and came to
 *   rest with the leading end at a dead end (`freeDistance` ≈ 0 in the
 *   direction of travel), once per stop: never again while it keeps resting
 *   there, even with a key held toward the dead end (Requirement 26.4). Every
 *   stop with the leading end at a dead end bumps; stops mid-track never do
 *   (Requirement 26.6).
 * - `whistle` fires only on entering Play mode or at a departure from
 *   standstill (speed 0 → > 0), whistles are at least 3 s of simulation time
 *   apart, and every departure at least 3 s after the previous whistle
 *   whistles (Requirement 26.1).
 * - No events at all while the train is in the `blocked` phase (D-18).
 *
 * The chug stop on returning to Build mode (the other half of Requirement
 * 26.5) is `TrainRuntime.exitPlay`, outside the domain, and is tested with the
 * runtime (task 11.5).
 */
import { afterAll, describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { buildTrackGraph, type TrackGraph } from '@/domain/trackGraph';
import {
  DEAD_END_SNAP,
  MAX_FRAME_DT,
  SUB_STEP,
  WHISTLE_THROTTLE,
  freeDistance,
  parkTrain,
  startPlay,
  stepTrain,
  type DriveInput,
  type TrainEvent,
  type TrainSim,
} from '@/domain/train';
import type { Piece } from '@/domain/types';
import { arbLayout, arbLayoutWith, arbLoop } from '../arbitraries';

/** After the snap onto a dead end, the free distance ahead is 0 up to rounding. */
const AT_DEAD_END = 1e-6;
const TIME_EPS = 1e-9;

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/**
 * Closed loops (never a dead end), open layouts (dead ends and buffers) and
 * short layouts of 0 to 2 extra pieces, where the train is often shut in at
 * both ends and ends up `blocked`.
 */
const arbStationBoard: fc.Arbitrary<Piece[]> = fc.oneof(
  arbLoop({ station: 'always' }).map((l) => l.pieces),
  arbLayout,
  arbLayoutWith({ maxSteps: 2 }),
);

const arbInput: fc.Arbitrary<DriveInput> = fc.record({
  driveMode: fc.oneof(
    { arbitrary: fc.constant<'auto' | 'manual'>('auto'), weight: 1 },
    { arbitrary: fc.constant<'auto' | 'manual'>('manual'), weight: 2 },
  ),
  w: fc.boolean(),
  s: fc.boolean(),
});

const arbDt: fc.Arbitrary<number> = fc.oneof(
  { arbitrary: fc.constant(1 / 60), weight: 4 },
  { arbitrary: fc.constant(1 / 30), weight: 1 },
  { arbitrary: fc.double({ min: 0, max: 0.15, noNaN: true }), weight: 2 },
  { arbitrary: fc.constantFrom(0, 0.1, 0.25), weight: 1 },
);

/** A held input for a number of frames: long enough to reach dead ends, short enough to toggle keys quickly. */
const arbSegment = fc.record({
  input: arbInput,
  frames: fc.oneof(
    { arbitrary: fc.integer({ min: 1, max: 6 }), weight: 2 },
    { arbitrary: fc.integer({ min: 7, max: 60 }), weight: 3 },
  ),
  dt: arbDt,
});

// ---------------------------------------------------------------------------
// Sub-step replay
// ---------------------------------------------------------------------------

interface Micro {
  prev: TrainSim;
  next: TrainSim;
  events: TrainEvent[];
}

/**
 * Replays one `stepTrain(g, sim, input, dt)` frame as a `dt = 0` call (the
 * drive-mode switch, no motion) followed by one call per sub-step, with the
 * same sub-step split as `stepTrain`.
 */
function replay(g: TrackGraph, sim: TrainSim, input: DriveInput, dt: number) {
  const switched = stepTrain(g, sim, input, 0);
  expect(switched.events).toEqual([]);
  const total = Number.isFinite(dt) && dt > 0 ? Math.min(dt, MAX_FRAME_DT) : 0;
  const whole = Math.floor(total / SUB_STEP + 1e-9);
  const rest = total - whole * SUB_STEP;
  const hs: number[] = Array.from({ length: whole }, () => SUB_STEP);
  if (rest > 1e-12) hs.push(rest);
  const micros: Micro[] = [];
  let current = switched.sim;
  for (const h of hs) {
    const r = stepTrain(g, current, input, h);
    micros.push({ prev: current, next: r.sim, events: r.events });
    current = r.sim;
  }
  return { sim: current, events: micros.flatMap((m) => m.events), micros };
}

// ---------------------------------------------------------------------------
// Coverage counters (guard against a vacuous property)
// ---------------------------------------------------------------------------

const seen = { bumps: 0, midTrackStops: 0, departureWhistles: 0, throttledDepartures: 0, blockedSubSteps: 0 };
let propertyRan = false;

// ---------------------------------------------------------------------------
// Property
// ---------------------------------------------------------------------------

describe('Property 42: Train sounds match the motion', () => {
  it('chug, bump and whistle events follow the motion over any run', () => {
    propertyRan = true;
    fc.assert(
      fc.property(
        arbStationBoard,
        fc.constantFrom<0 | 180>(0, 180),
        fc.array(arbSegment, { minLength: 1, maxLength: 20 }),
        (pieces, startFacing, segments) => {
          const station = pieces.find((p) => p.type === 'station')!;
          const g = buildTrackGraph(pieces);

          // Entering Play mode: whistle, then the chug unless the train cannot move forward.
          const started = startPlay(g, parkTrain(g, station, startFacing));
          expect(started.events).toEqual(started.sim.phase === 'running' ? ['whistle', 'chugStart'] : ['whistle']);
          let chug = started.events.includes('chugStart');
          expect(started.sim.chugging).toBe(chug);
          let lastWhistle = started.sim.clock;
          expect(started.sim.lastWhistleAt).toBe(lastWhistle);
          /** Direction of the dead end the train rests against after its bump, until it moves or turns. */
          let restingBumped: TrainSim['direction'] | null = null;

          let sim = started.sim;
          for (const seg of segments) {
            for (let f = 0; f < seg.frames; f++) {
              const frame = stepTrain(g, sim, seg.input, seg.dt);
              const r = replay(g, sim, seg.input, seg.dt);
              expect(r.sim).toEqual(frame.sim);
              expect(r.events).toEqual(frame.events);

              for (const { prev: p, next: n, events: e } of r.micros) {
                const has = (ev: TrainEvent) => e.includes(ev);
                expect(n.clock).toBeGreaterThan(p.clock);

                // Blocked: still and silent.
                if (p.phase === 'blocked') {
                  seen.blockedSubSteps++;
                  expect(e).toEqual([]);
                  expect(n.phase).toBe('blocked');
                  expect(n.speed).toBe(0);
                }

                // Strict chug alternation over the whole stream.
                for (const ev of e) {
                  if (ev === 'chugStart') {
                    expect(chug).toBe(false);
                    chug = true;
                  } else if (ev === 'chugStop') {
                    expect(chug).toBe(true);
                    chug = false;
                  }
                }
                expect(n.chugging).toBe(chug);
                expect(n.chugging).toBe(n.speed > 0);

                // chug starts exactly when the speed rises from 0, stops exactly when it returns to 0.
                expect(has('chugStart')).toBe(!p.chugging && n.speed > 0);
                expect(has('chugStop')).toBe(p.chugging && n.speed === 0);
                expect(e.filter((ev) => ev === 'chugStart' || ev === 'chugStop').length).toBeLessThanOrEqual(1);

                // Whistle: only at departures from standstill, at least 3 s apart; every
                // departure at least 3 s after the previous whistle whistles.
                const departure = p.speed === 0 && n.speed > 0;
                if (has('whistle')) {
                  expect(departure).toBe(true);
                  expect(n.clock - lastWhistle).toBeGreaterThanOrEqual(WHISTLE_THROTTLE - TIME_EPS);
                  expect(e.filter((ev) => ev === 'whistle')).toHaveLength(1);
                  lastWhistle = n.clock;
                  seen.departureWhistles++;
                } else if (departure) {
                  expect(n.clock - lastWhistle).toBeLessThan(WHISTLE_THROTTLE);
                  seen.throttledDepartures++;
                }
                expect(n.lastWhistleAt).toBe(lastWhistle);

                // Bump: once per stop with the leading end at a dead end, never mid-track.
                if (n.speed > 0 || n.direction !== restingBumped) restingBumped = null;
                const freeAhead = freeDistance(g, n.loco, n.direction);
                const moved =
                  p.speed > 0 ||
                  p.loco.pieceId !== n.loco.pieceId ||
                  p.loco.s !== n.loco.s ||
                  p.loco.heading !== n.loco.heading;
                if (has('bump')) {
                  expect(e.filter((ev) => ev === 'bump')).toHaveLength(1);
                  expect(n.speed).toBe(0);
                  expect(moved).toBe(true);
                  expect(freeAhead).toBeLessThanOrEqual(AT_DEAD_END);
                  expect(n.deadEnd).toBe(n.direction);
                  expect(restingBumped).toBeNull();
                  restingBumped = n.direction;
                  seen.bumps++;
                } else if (p.speed > 0 && n.speed === 0) {
                  // Came to rest without a bump: must be away from any dead end.
                  expect(freeAhead).toBeGreaterThan(DEAD_END_SNAP);
                  seen.midTrackStops++;
                }
              }

              // Frame-level view of the chug rules.
              const chugEvents = frame.events.filter((ev) => ev === 'chugStart' || ev === 'chugStop');
              if (chugEvents[chugEvents.length - 1] === 'chugStop') expect(frame.sim.speed).toBe(0);
              if (sim.speed > 0 && frame.sim.speed === 0) expect(frame.events).toContain('chugStop');
              if (sim.phase === 'blocked' && frame.sim.phase === 'blocked') expect(frame.events).toEqual([]);

              sim = frame.sim;
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('regression: W held against a dead end after the snap bumps once and keeps the train still', () => {
    // Counterexample found by the property: the snap onto the north dead end
    // left a free distance of about 5.6e-17. With W held, the next sub-step
    // read that residue as room to move, crept onto the dead end and bumped
    // a second time without the train having moved.
    const pieces: Piece[] = [
      { id: 'st', type: 'station', gridX: 0, gridZ: 2, rotation: 0 },
      { id: 'a', type: 'straight', gridX: 0, gridZ: 1, rotation: 0 },
      { id: 'b', type: 'straight', gridX: 0, gridZ: 0, rotation: 180 },
    ];
    const g = buildTrackGraph(pieces);
    let sim = startPlay(g, parkTrain(g, pieces[0]!, 0)).sim;
    for (let f = 0; f < 9; f++) sim = stepTrain(g, sim, { driveMode: 'auto', w: false, s: false }, 1 / 60).sim;

    const events: TrainEvent[] = [];
    let restingAt: TrainSim['loco'] | null = null;
    for (let f = 0; f < 14; f++) {
      const r = stepTrain(g, sim, { driveMode: 'manual', w: true, s: false }, 0.1);
      events.push(...r.events);
      if (restingAt) {
        // Once resting against the dead end, W keeps the train still and silent.
        expect(r.events).toEqual([]);
        expect(r.sim.speed).toBe(0);
        expect(r.sim.loco).toEqual(restingAt);
        expect(r.sim.deadEnd).toBe('forward');
      } else if (r.events.includes('bump')) {
        restingAt = r.sim.loco;
      }
      sim = r.sim;
    }
    expect(events.filter((e) => e === 'bump')).toHaveLength(1);
    expect(events[events.length - 1]).toBe('chugStop');
    expect(sim.speed).toBe(0);
    expect(freeDistance(g, sim.loco, 'forward')).toBeLessThanOrEqual(AT_DEAD_END);
  });

  afterAll(() => {
    // The generators must actually exercise every rule checked above
    // (skipped when the property itself was filtered out, e.g. with -t).
    if (!propertyRan) return;
    expect(seen.bumps).toBeGreaterThan(0);
    expect(seen.midTrackStops).toBeGreaterThan(0);
    expect(seen.departureWhistles).toBeGreaterThan(0);
    expect(seen.throttledDepartures).toBeGreaterThan(0);
    expect(seen.blockedSubSteps).toBeGreaterThan(0);
  });
});
