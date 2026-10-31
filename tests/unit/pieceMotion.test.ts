import { describe, expect, it } from 'vitest';
import { createMotion, stepMotion, type MotionGoal } from '@/scene/pieceMotion';

const STEP = 1 / 60;
const deg = (radians: number) => (radians * 180) / Math.PI;

function run(state: ReturnType<typeof createMotion>, goal: MotionGoal, seconds: number) {
  let finished = false;
  for (let t = 0; t < seconds - 1e-9; t += STEP) finished = stepMotion(state, goal, STEP) || finished;
  return finished;
}

const dragGoal: MotionGoal = { kind: 'drag', x: 0, z: 0, yaw: 0 };

describe('section 7.2 timings', () => {
  it('grab lifts 0.3 tiles within 150 ms', () => {
    const state = createMotion(0, 0, 0);
    run(state, dragGoal, 0.15);
    expect(state.y).toBeGreaterThan(0.29);
  });

  it('drag settles on the target within 250 ms with no overshoot', () => {
    const state = createMotion(0, 0, 0);
    const goal = { ...dragGoal, x: 1 };
    let peak = 0;
    for (let t = 0; t < 0.25; t += STEP) {
      stepMotion(state, goal, STEP);
      peak = Math.max(peak, state.x);
    }
    expect(state.x).toBeGreaterThan(0.98);
    expect(peak).toBeLessThanOrEqual(1.0001);
  });

  it('drag tilts toward movement, by at most 8 degrees', () => {
    const state = createMotion(0, 0, 0);
    const goal = { ...dragGoal, x: 12 };
    let maxTilt = 0;
    for (let t = 0; t < 0.25; t += STEP) {
      stepMotion(state, goal, STEP);
      maxTilt = Math.max(maxTilt, Math.abs(deg(state.tiltZ)));
    }
    expect(maxTilt).toBeGreaterThan(4);
    expect(maxTilt).toBeLessThanOrEqual(8.0001);
    expect(state.tiltZ).toBeLessThan(0);
  });

  it('valid drop lands and finishes in under 300 ms', () => {
    const state = createMotion(0, 0.3, 0);
    expect(run(state, { kind: 'drop', x: 0, z: 0, yaw: 0 }, 0.29)).toBe(true);
    expect(state.y).toBeCloseTo(0, 2);
  });

  it('invalid drop from the palette shakes for about 200 ms, then disappears', () => {
    const state = createMotion(0, 0.3, 0);
    const goal: MotionGoal = { kind: 'rejectNew', x: 0, z: 0, yaw: 0 };
    run(state, goal, 0.1);
    expect(Math.abs(state.shake)).toBeGreaterThan(0);
    expect(run(state, goal, 0.1)).toBe(false);
    expect(run(state, goal, 0.15)).toBe(true);
    expect(state.scale).toBeLessThan(0.05);
  });

  it('invalid drop from the board shakes, then returns to its origin', () => {
    const state = createMotion(3, 0.3, 0);
    const goal: MotionGoal = { kind: 'rejectBoard', x: 3, z: 0, yaw: 0, returnX: 0, returnZ: 0 };
    run(state, goal, 0.2);
    expect(state.x).toBeCloseTo(3, 1);
    expect(run(state, goal, 0.6)).toBe(true);
    expect(state.x).toBeCloseTo(0, 1);
    expect(state.y).toBeCloseTo(0, 2);
  });

  it('rotate turns 90 degrees with an ease-out over about 150 ms', () => {
    const state = createMotion(0, 0, 0);
    const goal: MotionGoal = { kind: 'rest', x: 0, z: 0, yaw: -Math.PI / 2 };
    run(state, goal, 0.075);
    expect(Math.abs(deg(state.yaw))).toBeGreaterThan(55);
    run(state, goal, 0.09);
    expect(deg(state.yaw)).toBeCloseTo(-90, 3);
  });

  it('rotate takes the short way around from 270 back to 0', () => {
    const state = createMotion(0, 0, 0, (-3 * Math.PI) / 2);
    run(state, { kind: 'rest', x: 0, z: 0, yaw: 0 }, 0.2);
    expect(Math.abs(Math.cos(state.yaw) - 1)).toBeLessThan(1e-6);
    expect(deg(state.yaw)).toBeCloseTo(-360, 3);
  });

  it('delete shrinks, fades and finishes in about 200 ms', () => {
    const state = createMotion(0, 0, 0);
    const goal: MotionGoal = { kind: 'delete', x: 0, z: 0, yaw: 0 };
    expect(run(state, goal, 0.15)).toBe(false);
    expect(run(state, goal, 0.07)).toBe(true);
    expect(state.opacity).toBeLessThan(0.05);
    expect(state.scale).toBeLessThan(0.1);
  });

  it('hover rises 0.05 tiles', () => {
    const state = createMotion(0, 0, 0);
    run(state, { kind: 'hover', x: 0, z: 0, yaw: 0 }, 0.2);
    expect(state.y).toBeCloseTo(0.05, 3);
  });

  it('keeps speed accurate at a low frame rate', () => {
    const state = createMotion(0, 0, 0);
    const goal = { ...dragGoal, x: 1 };
    for (let i = 0; i < 3; i++) stepMotion(state, goal, 0.1);
    expect(state.x).toBeGreaterThan(0.95);
    expect(state.x).toBeLessThanOrEqual(1.0001);
  });
});
