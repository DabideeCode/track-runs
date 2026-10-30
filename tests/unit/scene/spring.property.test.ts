// Feature: track-diorama-builder, Property 43: Drag spring settles and tilt stays bounded
/**
 * **Validates: Requirements 31.2, 31.3**
 *
 * For any start offset up to 16 tiles and start velocity up to 20 tiles per
 * second, `springStep` at 60 fps brings the dragged object to the target tile
 * centre within 250 ms of the target changing and then keeps it exactly still;
 * and for any horizontal velocity, the tilt angle is between 0° and 8°.
 *
 * What is checked:
 *
 * - Settle deadline. A 2D drag (x, z) starts at a random offset (≤ 16 tiles)
 *   from a random tile centre with a random velocity (≤ 20 tiles/s). The
 *   target may then change up to 4 times to other tile centres after random
 *   numbers of frames, so the last change can happen mid-flight. Frames use
 *   random dts (1/144 s to 1/30 s, exactly 1/60 s, and occasional long frames
 *   up to 0.1 s). Every frame that ends at or after DRAG_SETTLE_LIMIT (250 ms)
 *   past the last target change must report `settled` with the position
 *   exactly at the tile centre: the settle completes within 250 ms, allowing
 *   for the frame in progress at the deadline.
 * - Exact rest. After the deadline, more frames with the same target leave the
 *   position bit-for-bit unchanged and the velocity exactly 0.
 * - Finite values for every frame, and for any dt (0, negative, NaN,
 *   Infinity, tiny and huge values).
 * - No overshoot from rest. The drag spring is critically damped, so from
 *   rest each axis approaches the target without crossing it and the distance
 *   never grows.
 * - Independent oracle. One `springStep` call (settle snap disabled) matches a
 *   fine-step RK4 integration of m·x'' = −k·x − c·x' over the same dt, for
 *   the drag spring and for under- and over-damped springs.
 * - Tilt. `tiltAngleDeg` is in [0°, 8°] and follows clamp(0.9 × speed, 0, 8);
 *   `tiltRotation` has a total angle ≤ 8°, leans the top toward the velocity
 *   and is 0 at rest; easing the tilt back with `smoothTowards` toward 0 never
 *   increases its size or flips its sign.
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  smoothTowards,
  springFromFrequency,
  springStep,
  springStepVec,
  type SpringParams,
} from '@/scene/animation/spring';
import {
  DRAG_SETTLE_LIMIT,
  DRAG_SPRING,
  MAX_TILT_DEG,
  TILT_DEG_PER_SPEED,
  TILT_EASE_TAU,
  degToRad,
  tiltAngleDeg,
  tiltRotation,
} from '@/scene/animation/tactile';

const NUM_RUNS = 100;

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

const MAX_OFFSET = 16;
const MAX_SPEED = 20;

/** A tile centre on the 16 × 16 grid: index − 7.5 on each axis. */
const arbTileCentre = fc
  .tuple(fc.integer({ min: 0, max: 15 }), fc.integer({ min: 0, max: 15 }))
  .map(([gx, gz]) => [gx - 7.5, gz - 7.5] as [number, number]);

/** A 2D vector with magnitude in [0, max], biased toward the bounds. */
const arbVec = (max: number) =>
  fc
    .tuple(
      fc.oneof(
        fc.constant(0),
        fc.constant(max),
        fc.double({ min: 0, max, noNaN: true }),
      ),
      fc.double({ min: 0, max: 2 * Math.PI, noNaN: true }),
    )
    .map(([r, a]) => [r * Math.cos(a), r * Math.sin(a)] as [number, number]);

/** Frame times: mostly 1/144 to 1/30 s, often exactly 1/60 s, sometimes a long frame. */
const arbFrameDt = fc.oneof(
  { arbitrary: fc.double({ min: 1 / 144, max: 1 / 30, noNaN: true }), weight: 6 },
  { arbitrary: fc.constant(1 / 60), weight: 3 },
  { arbitrary: fc.double({ min: 1 / 30, max: 0.1, noNaN: true }), weight: 1 },
);

const arbDragRun = fc.record({
  target: arbTileCentre,
  offset: arbVec(MAX_OFFSET),
  velocity: arbVec(MAX_SPEED),
  changes: fc.array(
    fc.record({ framesBefore: fc.integer({ min: 0, max: 20 }), target: arbTileCentre }),
    { maxLength: 4 },
  ),
  dts: fc.array(arbFrameDt, { minLength: 1, maxLength: 48 }),
  restFrames: fc.integer({ min: 1, max: 30 }),
});

const allFinite = (xs: readonly number[]) => xs.every((x) => Number.isFinite(x));

// ---------------------------------------------------------------------------
// Independent oracle: fine-step RK4 of m·x'' = −k·x − c·x'
// ---------------------------------------------------------------------------

function rk4(x0: number, v0: number, p: SpringParams, t: number, h = 2e-5) {
  const m = p.mass ?? 1;
  const acc = (x: number, v: number) => (-p.stiffness * x - p.damping * v) / m;
  let x = x0;
  let v = v0;
  const n = Math.max(1, Math.ceil(t / h));
  const dt = t / n;
  for (let i = 0; i < n; i++) {
    const k1x = v;
    const k1v = acc(x, v);
    const k2x = v + (dt / 2) * k1v;
    const k2v = acc(x + (dt / 2) * k1x, v + (dt / 2) * k1v);
    const k3x = v + (dt / 2) * k2v;
    const k3v = acc(x + (dt / 2) * k2x, v + (dt / 2) * k2v);
    const k4x = v + dt * k3v;
    const k4v = acc(x + dt * k3x, v + dt * k3v);
    x += (dt / 6) * (k1x + 2 * k2x + 2 * k3x + k4x);
    v += (dt / 6) * (k1v + 2 * k2v + 2 * k3v + k4v);
  }
  return { pos: x, vel: v };
}

// ---------------------------------------------------------------------------
// Property 43
// ---------------------------------------------------------------------------

describe('Property 43: Drag spring settles and tilt stays bounded', () => {
  it('settles on the tile centre within 250 ms of the last target change and then stays exactly still', () => {
    fc.assert(
      fc.property(arbDragRun, (run) => {
        let frame = 0;
        const nextDt = () => run.dts[frame++ % run.dts.length];

        let state: { pos: readonly number[]; vel: readonly number[] } = {
          pos: [run.target[0] + run.offset[0], run.target[1] + run.offset[1]],
          vel: run.velocity,
        };
        let target: readonly number[] = run.target;

        // Earlier targets: the pointer moves on before the spring settles.
        for (const change of run.changes) {
          for (let i = 0; i < change.framesBefore; i++) {
            const r = springStepVec(state, target, DRAG_SPRING, nextDt());
            expect(allFinite(r.pos) && allFinite(r.vel)).toBe(true);
            state = r;
          }
          target = change.target;
        }

        // Last target: run until the first frame ending at or after the deadline.
        let elapsed = 0;
        let checkedDeadline = false;
        while (!checkedDeadline) {
          const dt = nextDt();
          const r = springStepVec(state, target, DRAG_SPRING, dt);
          elapsed += dt;
          expect(allFinite(r.pos) && allFinite(r.vel)).toBe(true);
          state = r;
          if (elapsed >= DRAG_SETTLE_LIMIT) {
            expect(r.settled).toBe(true);
            expect(r.pos).toEqual(target);
            checkedDeadline = true;
          }
        }

        // Exact rest while the target stays the same.
        for (let i = 0; i < run.restFrames; i++) {
          const r = springStepVec(state, target, DRAG_SPRING, nextDt());
          expect(r.settled).toBe(true);
          expect(r.pos[0]).toBe(state.pos[0]);
          expect(r.pos[1]).toBe(state.pos[1]);
          expect(r.pos[0]).toBe(target[0]);
          expect(r.pos[1]).toBe(target[1]);
          expect(r.vel[0] === 0 && r.vel[1] === 0).toBe(true);
          state = r;
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('does not overshoot the target when the drag starts from rest', () => {
    fc.assert(
      fc.property(
        arbTileCentre,
        arbVec(MAX_OFFSET),
        fc.array(arbFrameDt, { minLength: 1, maxLength: 48 }),
        (target, offset, dts) => {
          let state: { pos: readonly number[]; vel: readonly number[] } = {
            pos: [target[0] + offset[0], target[1] + offset[1]],
            vel: [0, 0],
          };
          let prevDist = Math.hypot(offset[0], offset[1]);
          for (let i = 0; i < 40; i++) {
            const r = springStepVec(state, target, DRAG_SPRING, dts[i % dts.length]);
            for (let a = 0; a < 2; a++) {
              // Same side of the target as at the start (or exactly on it).
              expect((r.pos[a] - target[a]) * offset[a]).toBeGreaterThanOrEqual(0);
            }
            const dist = Math.hypot(r.pos[0] - target[0], r.pos[1] - target[1]);
            expect(dist).toBeLessThanOrEqual(prevDist + 1e-12);
            prevDist = dist;
            state = r;
          }
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('returns finite values for any dt', () => {
    const arbAnyDt = fc.oneof(
      fc.constantFrom(0, -0, -1, 1e-12, 1e6, Number.NaN, Infinity, -Infinity, Number.MIN_VALUE),
      fc.double({ min: -10, max: 10, noNaN: true }),
      fc.double({ min: 0, max: 1e9, noNaN: true }),
    );
    fc.assert(
      fc.property(arbTileCentre, arbVec(MAX_OFFSET), arbVec(MAX_SPEED), arbAnyDt, (target, offset, vel, dt) => {
        const start = { pos: [target[0] + offset[0], target[1] + offset[1]], vel };
        const r = springStepVec(start, target, DRAG_SPRING, dt);
        expect(allFinite(r.pos) && allFinite(r.vel)).toBe(true);
        expect(typeof r.settled).toBe('boolean');
        if (!(dt > 0) || !Number.isFinite(dt)) {
          // No time passes: unchanged, unless already inside the snap thresholds.
          if (!r.settled) {
            for (let a = 0; a < 2; a++) {
              expect(Math.abs(r.pos[a] - start.pos[a])).toBeLessThanOrEqual(1e-12);
              expect(r.vel[a]).toBe(start.vel[a]);
            }
          }
        }
        const r1 = springStep({ pos: start.pos[0], vel: vel[0] }, target[0], DRAG_SPRING, dt);
        expect(Number.isFinite(r1.pos) && Number.isFinite(r1.vel)).toBe(true);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('matches a fine-step numerical integration of the spring equation', () => {
    const arbParams = fc.oneof(
      fc.constant<SpringParams>(DRAG_SPRING),
      fc
        .tuple(
          fc.double({ min: 5, max: 80, noNaN: true }),
          fc.double({ min: 0.2, max: 3, noNaN: true }),
          fc.double({ min: 0.5, max: 2, noNaN: true }),
        )
        .map(([omega, zeta, mass]): SpringParams => springFromFrequency(omega, zeta, mass)),
    );
    fc.assert(
      fc.property(
        arbParams,
        fc.double({ min: -MAX_OFFSET, max: MAX_OFFSET, noNaN: true }),
        fc.double({ min: -MAX_SPEED, max: MAX_SPEED, noNaN: true }),
        fc.double({ min: -8, max: 8, noNaN: true }),
        fc.double({ min: 1 / 240, max: 0.1, noNaN: true }),
        (params, offset, vel, target, dt) => {
          // Settle snap disabled, so the result is the pure spring motion.
          const p: SpringParams = { ...params, settle: { position: 0, speed: 0 } };
          const got = springStep({ pos: target + offset, vel }, target, p, dt);
          const want = rk4(offset, vel, params, dt);
          const omega = Math.sqrt(params.stiffness / (params.mass ?? 1));
          const scale = 1 + Math.abs(offset) + Math.abs(vel) / omega;
          expect(Math.abs(got.pos - target - want.pos)).toBeLessThanOrEqual(1e-6 * scale);
          expect(Math.abs(got.vel - want.vel)).toBeLessThanOrEqual(1e-6 * scale * omega);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('keeps the tilt between 0° and 8°, leaning toward the velocity, and 0 at rest', () => {
    const maxRad = degToRad(MAX_TILT_DEG);
    const arbComponent = fc.oneof(
      { arbitrary: fc.double({ min: -40, max: 40, noNaN: true }), weight: 4 },
      { arbitrary: fc.double({ min: -1e200, max: 1e200, noNaN: true }), weight: 1 },
      { arbitrary: fc.constantFrom(0, -0, Number.MIN_VALUE, -Number.MIN_VALUE), weight: 1 },
    );
    fc.assert(
      fc.property(arbComponent, arbComponent, (vx, vz) => {
        const speed = Math.hypot(vx, vz);

        const deg = tiltAngleDeg(speed);
        expect(deg).toBeGreaterThanOrEqual(0);
        expect(deg).toBeLessThanOrEqual(MAX_TILT_DEG);
        // Oracle: clamp(0.9 × speed, 0, 8).
        expect(deg).toBeCloseTo(Math.min(MAX_TILT_DEG, Math.max(0, TILT_DEG_PER_SPEED * speed)), 12);

        const rot = tiltRotation(vx, vz);
        expect(Number.isFinite(rot.x) && Number.isFinite(rot.z)).toBe(true);
        const total = Math.hypot(rot.x, rot.z);
        expect(total).toBeLessThanOrEqual(maxRad * (1 + 1e-12));

        if (speed === 0) {
          expect(rot.x === 0 && rot.z === 0).toBe(true);
          return;
        }
        // Small-angle lean of the top: rotation about +X tips +Y toward +Z,
        // rotation about +Z tips +Y toward −X. So the lean is (−rot.z, rot.x).
        const leanX = -rot.z;
        const leanZ = rot.x;
        const expected = degToRad(deg);
        expect(total).toBeCloseTo(expected, 12);
        if (expected > 0) {
          const ux = vx / speed;
          const uz = vz / speed;
          // Points along the velocity: parallel and same direction.
          expect(leanX * ux + leanZ * uz).toBeCloseTo(expected, 12);
          expect(leanX * uz - leanZ * ux).toBeCloseTo(0, 12);
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('eases the tilt back toward 0° without growing or flipping sign', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -MAX_TILT_DEG, max: MAX_TILT_DEG, noNaN: true }),
        fc.array(arbFrameDt, { minLength: 1, maxLength: 60 }),
        (start, dts) => {
          let tilt = start;
          for (const dt of dts) {
            const next = smoothTowards(tilt, 0, dt, TILT_EASE_TAU);
            expect(Math.abs(next)).toBeLessThanOrEqual(Math.abs(tilt));
            expect(next * start).toBeGreaterThanOrEqual(0);
            expect(Math.abs(next)).toBeLessThanOrEqual(MAX_TILT_DEG);
            tilt = next;
          }
          // Still easing, not jumping: one 1/60 s frame removes only part of the tilt.
          if (Math.abs(start) > 1e-6) {
            const oneFrame = smoothTowards(start, 0, 1 / 60, TILT_EASE_TAU);
            expect(Math.abs(oneFrame)).toBeGreaterThan(0);
          }
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});
