// Feature: track-diorama-builder, Property 39: The train never passes a dead end
/**
 * **Validates: Requirements 20.3, 21.5**
 *
 * For any layout with at least one dead end and any simulation run in either
 * drive mode, the leading end of the train (the locomotive front when moving
 * forward, the rear of carriage 2 when moving in reverse) never moves beyond
 * an open end or a buffer stop face, and while the train approaches a dead
 * end its speed never increases.
 *
 * Independent oracle. Positions are measured with this file's own walk over
 * the graph links (`buildTrackGraph` supplies only the links and piece
 * lengths): from the locomotive centre, sum piece lengths along the links
 * until a `null` link. That gives, in each direction of travel, the clearance
 * of the leading end:
 *
 *   forward  c_f = (centreline distance from the loco centre along its heading to the dead end) − 0.45
 *   reverse  c_r = (centreline distance from the loco centre against its heading to the dead end) − 2.25
 *
 * A clearance below 0 means the leading end is past the dead end. That only
 * happens when the train is parked with its carriages hanging over an open end
 * (for example a lone station, Requirement 19.10); the train must then never
 * move further that way. So after every frame each clearance must be at least
 * min(its value before the frame, 0), within 1e-9.
 *
 * Further checks after every frame:
 * - Speed envelope: the speed in the last sub-step was capped by
 *   sqrt(2 × a × D) with D the free distance at the start of that sub-step,
 *   which is at most D_end + speed × SUB_STEP. a = 3 in Auto and 5 in Manual
 *   (MANUAL_DEAD_END_BRAKING: the implementation's documented deviation from
 *   the single value 3 in design.md, so that Property 41 can hold). `a` is the
 *   drive mode of the last sub-step that actually ran, detected by the
 *   simulation clock advancing. A frame that runs no sub-step (dt = 0) only
 *   applies a drive-mode switch: the train neither moves nor changes speed, so
 *   its speed is still the one the previous mode produced, and the new mode's
 *   envelope first applies in its first sub-step.
 * - Coming to rest at a dead end: a frame that emits `bump` and ends with
 *   speed 0 leaves the leading end within [−1e-9, 1e-4] of that dead end.
 * - Auto approach (Requirement 20.3): once the speed has started to fall
 *   while moving, it does not rise again until the train stops, changes
 *   direction or changes drive mode.
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { buildTrackGraph, type TrackGraph, type TrackLoc } from '@/domain/trackGraph';
import {
  DEAD_END_BRAKING,
  MANUAL_DEAD_END_BRAKING,
  SUB_STEP,
  parkTrain,
  startPlay,
  stepTrain,
  type DriveInput,
  type TrainDirection,
  type TrainSim,
} from '@/domain/train';
import type { Piece } from '@/domain/types';
import { arbLayout, arbLayoutWith } from '../arbitraries';

/** Floating-point slack for positions. */
const EPS = 1e-9;
/** Rest tolerance at a dead end (Requirement 21.5, DEAD_END_SNAP). */
const REST_TOL = 1e-4;
/** Front of the locomotive ahead of its centre (half of 0.9). */
const FRONT = 0.45;
/** Rear of carriage 2 behind the locomotive centre: 0.95 + 0.9 + 0.4. */
const REAR = 2.25;
/** Walks longer than this count as "no dead end" (closed loops). */
const WALK_CAP = 100;

// ---------------------------------------------------------------------------
// Independent walker over the graph links
// ---------------------------------------------------------------------------

/**
 * Centreline distance from (pieceId, s) travelling `dirS` in s (+1 toward
 * s = L) to the first null link, or Infinity beyond WALK_CAP.
 */
function distanceToEnd(g: TrackGraph, pieceId: string, s0: number, dirS: 1 | -1): number {
  let node = g.nodes.get(pieceId);
  if (!node) throw new Error(`oracle: unknown piece ${pieceId}`);
  const s = Math.min(Math.max(s0, 0), node.length);
  let total = dirS === 1 ? node.length - s : s;
  let dir = dirS;
  for (let i = 0; i < 10_000; i++) {
    if (total > WALK_CAP) return Infinity;
    const link = node.links[dir === 1 ? 1 : 0];
    if (!link) return total;
    node = g.nodes.get(link.pieceId);
    if (!node) throw new Error(`oracle: link to unknown piece ${link.pieceId}`);
    // Entering through end 0 travels toward +s, through end 1 toward −s; the whole piece lies ahead.
    dir = link.end === 0 ? 1 : -1;
    total += node.length;
  }
  return Infinity;
}

/** Clearance of the leading end in `direction`; negative means past the dead end. */
function clearance(g: TrackGraph, loco: TrackLoc, direction: TrainDirection): number {
  if (direction === 'forward') return distanceToEnd(g, loco.pieceId, loco.s, loco.heading) - FRONT;
  const against: 1 | -1 = loco.heading === 1 ? -1 : 1;
  return distanceToEnd(g, loco.pieceId, loco.s, against) - REAR;
}

function hasDeadEnd(g: TrackGraph): boolean {
  for (const node of g.nodes.values()) if (node.links[0] === null || node.links[1] === null) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

const arbDeadEndLayout: fc.Arbitrary<Piece[]> = fc
  .oneof({ arbitrary: arbLayout, weight: 3 }, { arbitrary: arbLayoutWith({ decorations: true }), weight: 1 })
  .filter((pieces) => hasDeadEnd(buildTrackGraph(pieces)));

const arbKeys = fc.oneof(
  { arbitrary: fc.constant({ w: true, s: false }), weight: 3 },
  { arbitrary: fc.constant({ w: false, s: true }), weight: 3 },
  { arbitrary: fc.constant({ w: false, s: false }), weight: 1 },
  { arbitrary: fc.constant({ w: true, s: true }), weight: 1 },
);

/** A stretch of frames with one drive mode and one held-key pattern. */
const arbSegment = fc.record({
  driveMode: fc.constantFrom<'auto' | 'manual'>('auto', 'manual'),
  keys: arbKeys,
  dts: fc.array(fc.double({ min: 0, max: 0.12, noNaN: true }), { minLength: 1, maxLength: 40 }),
});

// ---------------------------------------------------------------------------
// Property
// ---------------------------------------------------------------------------
type Segment = {
  driveMode: DriveInput['driveMode'];
  keys: { w: boolean; s: boolean };
  dts: number[];
};

/** Parks the train on the layout's station, starts Play and checks every frame of `segments`. */
function checkRun(pieces: Piece[], startFacing: 0 | 180, segments: Segment[]): void {
  const g = buildTrackGraph(pieces);
  const station = pieces.find((p) => p.type === 'station')!;
  let sim: TrainSim = startPlay(g, parkTrain(g, station, startFacing)).sim;

  let cf = clearance(g, sim.loco, 'forward');
  let cr = clearance(g, sim.loco, 'reverse');
  // The locomotive front starts on the station, never past a dead end.
  expect(cf).toBeGreaterThanOrEqual(-EPS);

  let prevMode: DriveInput['driveMode'] | null = null;
  // Drive mode of the last sub-step that ran; startPlay puts the train in Auto.
  let subStepMode: DriveInput['driveMode'] = 'auto';
  let autoBraking = false;
  let frame = 0;

  for (const seg of segments) {
    const input: DriveInput = { driveMode: seg.driveMode, w: seg.keys.w, s: seg.keys.s };
    for (const dt of seg.dts) {
      frame++;
      const before = sim;
      const { sim: next, events } = stepTrain(g, sim, input, dt);
      sim = next;
      // The clock advances exactly when at least one sub-step ran.
      if (sim.clock !== before.clock) subStepMode = input.driveMode;
      const ctx = `frame ${frame} ${JSON.stringify({ input, dt, before, after: sim, events })}`;

      // 1. The leading end never moves beyond a dead end, in either direction.
      const cf1 = clearance(g, sim.loco, 'forward');
      const cr1 = clearance(g, sim.loco, 'reverse');
      expect(cf1, `forward clearance ${cf} → ${cf1}; ${ctx}`).toBeGreaterThanOrEqual(Math.min(cf, 0) - EPS);
      expect(cr1, `reverse clearance ${cr} → ${cr1}; ${ctx}`).toBeGreaterThanOrEqual(Math.min(cr, 0) - EPS);
      cf = cf1;
      cr = cr1;

      expect(sim.speed, ctx).toBeGreaterThanOrEqual(0);

      // 2. Speed envelope sqrt(2 × a × D), D at the start of the last sub-step,
      //    a from the drive mode of that sub-step.
      if (sim.speed > 0) {
        const a = subStepMode === 'auto' ? DEAD_END_BRAKING : MANUAL_DEAD_END_BRAKING;
        const c = sim.direction === 'forward' ? cf : cr;
        const D = Math.max(0, c);
        if (D !== Infinity) {
          const limit = Math.sqrt(2 * a * (D + sim.speed * SUB_STEP));
          expect(sim.speed, `envelope ${limit} at D ${D} (a = ${a}); ${ctx}`).toBeLessThanOrEqual(limit + 1e-9);
        }
      }

      // 3. Coming to rest at a dead end puts the leading end on it.
      if (events.includes('bump') && sim.speed === 0 && sim.deadEnd !== null) {
        const c = sim.deadEnd === 'forward' ? cf : cr;
        expect(c, `rest clearance; ${ctx}`).toBeGreaterThanOrEqual(-EPS);
        expect(c, `rest clearance; ${ctx}`).toBeLessThanOrEqual(REST_TOL);
      }

      // 4. Auto: once slowing while moving, the speed does not rise until a stop.
      const continuing =
        input.driveMode === 'auto' &&
        prevMode === 'auto' &&
        before.speed > 0 &&
        sim.speed > 0 &&
        before.direction === sim.direction;
      if (!continuing) {
        autoBraking = false;
      } else {
        if (autoBraking) {
          expect(sim.speed, `speed rose while braking; ${ctx}`).toBeLessThanOrEqual(before.speed + 1e-12);
        }
        if (sim.speed < before.speed - 1e-12) autoBraking = true;
      }
      if (input.driveMode === 'auto' && prevMode !== 'auto' && sim.speed > 0 && sim.speed < before.speed - 1e-12) {
        // Slowing in the frame of a switch to Auto also starts a braking run.
        autoBraking = true;
      }
      prevMode = input.driveMode;
    }
  }
}

describe('Property 39: The train never passes a dead end', () => {
  it('keeps the leading end behind every dead end, under the speed envelope, and at rest on it', () => {
    fc.assert(
      fc.property(
        arbDeadEndLayout,
        fc.constantFrom<0 | 180>(0, 180),
        fc.array(arbSegment, { minLength: 1, maxLength: 12 }),
        (pieces, startFacing, segments) => {
          checkRun(pieces, startFacing, segments);
        },
      ),
      { numRuns: 100 },
    );
  });

  describe('regression: Manual → Auto switch in a frame with dt = 0 (seed -434154563)', () => {
    const loneStation: Piece[] = [{ id: 'p1', type: 'station', gridX: 0, gridZ: 0, rotation: 0 }];
    const manualW: Segment = {
      driveMode: 'manual',
      keys: { w: true, s: false },
      dts: [0.07573276750922643, 0.09999999999166666, 0],
    };

    it('passes the shrunk counterexample', () => {
      checkRun(loneStation, 0, [manualW, { driveMode: 'auto', keys: { w: false, s: true }, dts: [0] }]);
    });

    it('holds the Auto envelope from the first Auto sub-step on, until the train rests at the dead end', () => {
      // Speed 0.3415 after 0.2 s of Manual is 0.077 above the Auto envelope; the
      // dt = 0 frame keeps it, the next sub-step must bring it under a = 3.
      const heavier: Segment = { ...manualW, dts: [0.1, 0.1, 0] };
      const auto: Segment = { driveMode: 'auto', keys: { w: false, s: true }, dts: [0, SUB_STEP, 0.05, 0.1, 0.1] };
      checkRun(loneStation, 0, [heavier, auto]);
    });
  });
});
