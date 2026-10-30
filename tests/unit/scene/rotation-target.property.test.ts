// Feature: track-diorama-builder, Property 44: Rotation animation always turns clockwise to the stored rotation
/**
 * **Validates: Requirements 31.7**
 *
 * For any sequence of rotations applied to a piece, each animation target
 * angle is the previous target minus 90°, and the final target angle is
 * congruent (mod 360°) to −rotation, so the piece ends exactly at its stored
 * rotation.
 *
 * What is checked, for random sequences of stored-rotation changes (R presses,
 * undo and redo of rotations, arbitrary jumps such as reopening a diorama),
 * starting from any rotation and any number of earlier full turns:
 *
 * - Congruence. After every change the target angle is ≡ −rotation (mod 360),
 *   so the piece always rests at its stored rotation.
 * - Clockwise step. A change of +90° (an R press, or a redo of a rotate)
 *   animates and turns exactly −90°, so 270 → 0 goes −270° → −360° and never
 *   +270°. `nextRotationTarget` agrees with it.
 * - Other changes. No change keeps the target and does not animate. Any other
 *   change (undo, ±180° jumps) does not animate (allowed by Requirement 31.11)
 *   and picks a congruent angle nearest the previous target, found by a
 *   brute-force search over nearby multiples of 90°.
 * - Tween. For an animated step, `rotateAngle` starts exactly at the previous
 *   target, never increases (always clockwise), stays within the two angles,
 *   is strictly between them on the first 60 fps frame (no one-frame jump),
 *   is past half-way at half time (ease-out), and ends exactly on the target
 *   at ROTATE_DURATION (112 to 188 ms) and after it.
 * - Bounds. Angles are finite integers that are multiples of 90°, and each
 *   change moves the target by at most 180°, so the target stays within
 *   180° × (number of changes) of the start.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  ROTATE_DURATION,
  nextRotationTarget,
  restAngleFor,
  rotateAngle,
  rotationTargetFor,
} from '@/scene/animation/tactile';
import type { Rotation } from '@/domain/types';

const ROTATIONS: readonly Rotation[] = [0, 90, 180, 270];

type Change =
  | { kind: 'press' } // R key: +90 clockwise
  | { kind: 'undo' } // undo of a rotate: −90
  | { kind: 'redo' } // redo of a rotate: +90
  | { kind: 'jump'; to: Rotation }; // arbitrary change (reopen, undo of a rotating move, ...)

const arbChange: fc.Arbitrary<Change> = fc.oneof(
  { weight: 4, arbitrary: fc.constant<Change>({ kind: 'press' }) },
  { weight: 2, arbitrary: fc.constant<Change>({ kind: 'undo' }) },
  { weight: 2, arbitrary: fc.constant<Change>({ kind: 'redo' }) },
  {
    weight: 2,
    arbitrary: fc.constantFrom(...ROTATIONS).map((to): Change => ({ kind: 'jump', to })),
  },
);

/** Oracle: the next stored rotation after a change (independent of the code under test). */
function applyChange(r: Rotation, c: Change): Rotation {
  switch (c.kind) {
    case 'press':
    case 'redo':
      return ROTATIONS[(ROTATIONS.indexOf(r) + 1) % 4]!;
    case 'undo':
      return ROTATIONS[(ROTATIONS.indexOf(r) + 3) % 4]!;
    case 'jump':
      return c.to;
  }
}

/** Oracle: true when angle a (degrees) shows stored rotation r, i.e. a ≡ −r (mod 360). */
function shows(a: number, r: Rotation): boolean {
  return Math.abs((a + r) % 360) === 0;
}

/** Oracle: the smallest distance from prev to any angle congruent to −r, by brute force. */
function nearestDistance(prev: number, r: Rotation): number {
  let best = Infinity;
  for (let d = -360; d <= 360; d += 90) {
    if (shows(prev + d, r)) best = Math.min(best, Math.abs(d));
  }
  return best;
}

/** Checks the rotate tween from `from` to `to` (an animated clockwise step). */
function checkTween(from: number, to: number, times: number[]): void {
  expect(rotateAngle(0, from, to)).toBe(from);
  expect(rotateAngle(ROTATE_DURATION, from, to)).toBe(to);
  expect(rotateAngle(ROTATE_DURATION * 2, from, to)).toBe(to);

  // No one-frame jump: the first 60 fps frame is strictly between the angles.
  const first = rotateAngle(1 / 60, from, to);
  expect(first).toBeLessThan(from);
  expect(first).toBeGreaterThan(to);

  // Ease-out: more than half of the turn is done at half time.
  expect(rotateAngle(ROTATE_DURATION / 2, from, to)).toBeLessThan((from + to) / 2);

  // Monotonic (clockwise only) and bounded by the two angles.
  const ts = [0, ...times.map((u) => u * ROTATE_DURATION * 1.2), ROTATE_DURATION].sort(
    (a, b) => a - b,
  );
  let prevAngle = from;
  for (const t of ts) {
    const a = rotateAngle(t, from, to);
    expect(Number.isFinite(a)).toBe(true);
    expect(a).toBeLessThanOrEqual(prevAngle);
    expect(a).toBeLessThanOrEqual(from);
    expect(a).toBeGreaterThanOrEqual(to);
    prevAngle = a;
  }
  expect(prevAngle).toBe(to);
}

describe('Property 44: Rotation animation always turns clockwise to the stored rotation', () => {
  it('the rotate duration is within Requirement 31.7 (112 to 188 ms)', () => {
    expect(ROTATE_DURATION).toBeGreaterThanOrEqual(0.112);
    expect(ROTATE_DURATION).toBeLessThanOrEqual(0.188);
  });

  it('targets follow every stored rotation, turning clockwise on each +90° step', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ROTATIONS),
        fc.nat({ max: 1000 }), // full clockwise turns already made before the sequence
        fc.array(arbChange, { minLength: 1, maxLength: 60 }),
        fc.array(fc.double({ min: 0, max: 1, noNaN: true }), { minLength: 1, maxLength: 8 }),
        (r0, turns, changes, times) => {
          // Rest angle for the starting rotation.
          const rest = restAngleFor(r0);
          expect(Number.isFinite(rest)).toBe(true);
          expect(shows(rest, r0)).toBe(true);
          expect(rest).toBeLessThanOrEqual(0);
          expect(rest).toBeGreaterThan(-360);

          const start = rest - 360 * turns;
          let rotation: Rotation = r0;
          let target = start;

          changes.forEach((change, i) => {
            const prev = target;
            const next = applyChange(rotation, change);
            const result = rotationTargetFor(prev, next);

            // Congruence: the piece rests at its stored rotation.
            expect(Number.isFinite(result.target)).toBe(true);
            expect(Number.isInteger(result.target)).toBe(true);
            expect(Math.abs(result.target % 90)).toBe(0); // abs: −90 % 90 is −0
            expect(shows(result.target, next)).toBe(true);

            const delta = (ROTATIONS.indexOf(next) - ROTATIONS.indexOf(rotation) + 4) % 4;
            if (delta === 1) {
              // One clockwise step: animate exactly −90°, never +270°.
              expect(result.animate).toBe(true);
              expect(result.target).toBe(prev - 90);
              expect(nextRotationTarget(prev)).toBe(result.target);
              checkTween(prev, result.target, times);
            } else if (delta === 0) {
              expect(result).toEqual({ target: prev, animate: false });
            } else {
              // Undo or jump: instant, to the nearest congruent angle.
              expect(result.animate).toBe(false);
              expect(Math.abs(result.target - prev)).toBe(nearestDistance(prev, next));
              expect(Math.abs(result.target - prev)).toBeLessThanOrEqual(180);
            }

            target = result.target;
            rotation = next;
            // Bounded growth: at most 180° per change.
            expect(Math.abs(target - start)).toBeLessThanOrEqual(180 * (i + 1));
          });

          // Final target shows the final stored rotation.
          expect(shows(target, rotation)).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('a run of R presses lowers the target by 90° each time and stays congruent', () => {
    fc.assert(
      fc.property(fc.constantFrom(...ROTATIONS), fc.integer({ min: 1, max: 200 }), (r0, presses) => {
        let rotation: Rotation = r0;
        let target = restAngleFor(r0);
        const start = target;
        for (let i = 0; i < presses; i++) {
          const next = applyChange(rotation, { kind: 'press' });
          const pressed = nextRotationTarget(target);
          expect(pressed).toBe(target - 90);
          expect(rotationTargetFor(target, next)).toEqual({ target: pressed, animate: true });
          target = pressed;
          rotation = next;
          expect(shows(target, rotation)).toBe(true);
        }
        expect(target).toBe(start - 90 * presses);
      }),
      { numRuns: 100 },
    );
  });
});
