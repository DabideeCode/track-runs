import { describe, expect, it } from 'vitest';
import {
  dampingRatio,
  smoothTowards,
  springFromFrequency,
  springOvershoot,
  springStep,
  springStepVec,
  type SpringParams,
} from '../../../src/scene/animation/spring';
import {
  DELETE_DURATION,
  DRAG_SETTLE_LIMIT,
  DRAG_SPRING,
  DROP_BOUNCE_HEIGHT,
  DROP_DURATION,
  DROP_FALL_DURATION,
  HOVER_DURATION,
  HOVER_LIFT,
  LIFT_DURATION,
  LIFT_HEIGHT,
  MAX_TILT_DEG,
  ROTATE_DURATION,
  SHAKE_DURATION,
  deleteFrame,
  dropHeight,
  hoverLift,
  liftHeight,
  nextRotationTarget,
  restAngleFor,
  rotateAngle,
  rotationTargetFor,
  shakeOffset,
  tiltAngleDeg,
  tiltRotation,
} from '../../../src/scene/animation/tactile';
import {
  DPR_CAP,
  SHADOW_MAP_SIZE,
  dprFor,
  qualityProfile,
} from '../../../src/scene/quality';

const FRAME = 1 / 60;
const mod360 = (a: number) => ((a % 360) + 360) % 360;

/** Run a 2-D spring at 60 fps toward a fixed target; return the settle time. */
function settleTime(
  pos: [number, number],
  vel: [number, number],
  target: [number, number],
  params: SpringParams,
  maxTime = 2,
): number {
  let s = { pos: pos as number[], vel: vel as number[] };
  for (let t = FRAME; t <= maxTime + 1e-9; t += FRAME) {
    const r = springStepVec(s, target, params, FRAME);
    s = r;
    if (r.settled) return t;
  }
  return Infinity;
}

describe('springStep', () => {
  it('converges to the target and then stays exactly still', () => {
    let s = { pos: 0, vel: 0 };
    for (let i = 0; i < 60; i++) s = springStep(s, 1, DRAG_SPRING, FRAME);
    expect(s.pos).toBe(1);
    expect(s.vel).toBe(0);
    const again = springStep(s, 1, DRAG_SPRING, FRAME);
    expect(again).toEqual({ pos: 1, vel: 0, settled: true });
  });

  it('settles the drag spring within 250 ms for large offsets and velocities', () => {
    const cases: Array<[[number, number], [number, number]]> = [
      [[1, 0], [0, 0]],
      [[16, 0], [0, 0]],
      [[-16, 0], [-20, 0]],
      [[16, 0], [20, 0]],
      [[16 / Math.SQRT2, 16 / Math.SQRT2], [20 / Math.SQRT2, 20 / Math.SQRT2]],
      [[0, 0.5], [20, 0]],
    ];
    for (const [offset, vel] of cases) {
      const t = settleTime([3 + offset[0], -2 + offset[1]], vel, [3, -2], DRAG_SPRING);
      expect(t).toBeLessThanOrEqual(DRAG_SETTLE_LIMIT + 1e-9);
    }
  });

  it('the drag spring is critically damped and never overshoots from rest', () => {
    expect(dampingRatio(DRAG_SPRING)).toBeCloseTo(1, 12);
    expect(springOvershoot(DRAG_SPRING)).toBe(0);
    let s = { pos: -5, vel: 0 };
    for (let i = 0; i < 60; i++) {
      s = springStep(s, 0, DRAG_SPRING, FRAME);
      expect(s.pos).toBeLessThanOrEqual(0);
    }
  });

  it('an under-damped spring overshoots no more than its configured amount', () => {
    const params = springFromFrequency(20, 0.5);
    const bound = springOvershoot(params);
    expect(bound).toBeCloseTo(Math.exp(-Math.PI * 0.5 / Math.sqrt(0.75)), 12);
    let s = { pos: -1, vel: 0 };
    let maxPos = -Infinity;
    for (let i = 0; i < 2000; i++) {
      s = springStep(s, 0, params, 1 / 1000);
      maxPos = Math.max(maxPos, s.pos);
    }
    expect(maxPos).toBeGreaterThan(0);
    expect(maxPos).toBeLessThanOrEqual(bound + 1e-9);
    expect(maxPos).toBeGreaterThan(bound * 0.99);
  });

  it('over-damped springs approach without crossing the target', () => {
    const params = springFromFrequency(30, 2);
    let s = { pos: 2, vel: 0 };
    for (let i = 0; i < 120; i++) {
      s = springStep(s, 0, params, FRAME);
      expect(s.pos).toBeGreaterThanOrEqual(0);
    }
  });

  it('is deterministic and independent of how a time span is split', () => {
    const a = springStep({ pos: 0, vel: 3 }, 2, DRAG_SPRING, 0.05);
    const b = springStep({ pos: 0, vel: 3 }, 2, DRAG_SPRING, 0.05);
    expect(a).toEqual(b);
    let c = { pos: 0, vel: 3 };
    for (let i = 0; i < 5; i++) c = springStep(c, 2, DRAG_SPRING, 0.01);
    expect(c.pos).toBeCloseTo(a.pos, 9);
    expect(c.vel).toBeCloseTo(a.vel, 9);
  });

  it('stays finite for huge, zero, negative and NaN time steps', () => {
    const start = { pos: 4, vel: -7 };
    expect(springStep(start, 0, DRAG_SPRING, 0)).toEqual({ ...start, settled: false });
    expect(springStep(start, 0, DRAG_SPRING, -1)).toEqual({ ...start, settled: false });
    expect(springStep(start, 0, DRAG_SPRING, Number.NaN)).toEqual({ ...start, settled: false });
    const big = springStep(start, 0, DRAG_SPRING, 1e6);
    expect(big).toEqual({ pos: 0, vel: 0, settled: true });
    const stiff = springStep(start, 0, { stiffness: 1e8, damping: 1 }, 10);
    expect(Number.isFinite(stiff.pos)).toBe(true);
    expect(Number.isFinite(stiff.vel)).toBe(true);
  });

  it('rejects invalid parameters and mismatched vector lengths', () => {
    expect(() => springStep({ pos: 0, vel: 0 }, 1, { stiffness: 0, damping: 1 }, FRAME)).toThrow(
      RangeError,
    );
    expect(() => springStep({ pos: 0, vel: 0 }, 1, { stiffness: 1, damping: -1 }, FRAME)).toThrow(
      RangeError,
    );
    expect(() => springStepVec({ pos: [0, 0], vel: [0] }, [1, 1], DRAG_SPRING, FRAME)).toThrow(
      RangeError,
    );
  });

  it('settles all axes of a vector spring in the same frame', () => {
    let s = { pos: [0, 0, 0] as number[], vel: [0, 0, 0] as number[] };
    let settled = false;
    for (let i = 0; i < 30 && !settled; i++) {
      const r = springStepVec(s, [1, -2, 0.5], DRAG_SPRING, FRAME);
      s = r;
      settled = r.settled;
    }
    expect(settled).toBe(true);
    expect(s.pos).toEqual([1, -2, 0.5]);
    expect(s.vel).toEqual([0, 0, 0]);
  });

  it('smoothTowards eases toward the target and is frame-rate independent', () => {
    const once = smoothTowards(8, 0, 0.1, 0.05);
    let twice = smoothTowards(8, 0, 0.05, 0.05);
    twice = smoothTowards(twice, 0, 0.05, 0.05);
    expect(once).toBeCloseTo(twice, 12);
    expect(once).toBeGreaterThan(0);
    expect(once).toBeLessThan(8);
    expect(smoothTowards(8, 0, 0.1, 0)).toBe(0);
  });
});

describe('tactile timing constants', () => {
  it('match the Section 7.2 limits', () => {
    expect(LIFT_HEIGHT).toBe(0.3);
    expect(LIFT_DURATION).toBeLessThanOrEqual(0.15);
    expect(DRAG_SETTLE_LIMIT).toBe(0.25);
    expect(MAX_TILT_DEG).toBe(8);
    expect(DROP_DURATION).toBeLessThan(0.3);
    expect(SHAKE_DURATION).toBeGreaterThanOrEqual(0.15);
    expect(SHAKE_DURATION).toBeLessThanOrEqual(0.25);
    expect(ROTATE_DURATION).toBeGreaterThanOrEqual(0.112);
    expect(ROTATE_DURATION).toBeLessThanOrEqual(0.188);
    expect(DELETE_DURATION).toBeGreaterThanOrEqual(0.15);
    expect(DELETE_DURATION).toBeLessThanOrEqual(0.25);
    expect(HOVER_LIFT).toBe(0.05);
  });
});

describe('tactile curves', () => {
  it('lift reaches 0.3 tiles by the end of the lift and holds it', () => {
    expect(liftHeight(0)).toBe(0);
    expect(liftHeight(LIFT_DURATION / 2)).toBeGreaterThan(LIFT_HEIGHT / 2); // ease-out
    expect(liftHeight(LIFT_DURATION)).toBe(LIFT_HEIGHT);
    expect(liftHeight(1)).toBe(LIFT_HEIGHT);
  });

  it('drop falls to contact, bounces at most 0.04 and rests at exactly 0', () => {
    expect(dropHeight(0)).toBe(LIFT_HEIGHT);
    expect(dropHeight(DROP_FALL_DURATION)).toBeCloseTo(0, 12);
    let peak = 0;
    let prev = LIFT_HEIGHT;
    for (let t = 0.001; t < DROP_FALL_DURATION; t += 0.001) {
      const h = dropHeight(t);
      expect(h).toBeLessThanOrEqual(prev);
      prev = h;
    }
    for (let t = DROP_FALL_DURATION; t <= DROP_DURATION; t += 0.001) {
      const h = dropHeight(t);
      expect(h).toBeGreaterThanOrEqual(0);
      peak = Math.max(peak, h);
    }
    expect(peak).toBeCloseTo(DROP_BOUNCE_HEIGHT, 4);
    expect(peak).toBeLessThanOrEqual(DROP_BOUNCE_HEIGHT);
    expect(dropHeight(DROP_DURATION)).toBe(0);
    expect(dropHeight(5)).toBe(0);
  });

  it('shake follows 0.06·sin(2π·5t)·(1 − t/0.2) and is 0 outside 0..200 ms', () => {
    expect(shakeOffset(0)).toBe(0);
    expect(shakeOffset(-0.1)).toBe(0);
    expect(shakeOffset(SHAKE_DURATION)).toBe(0);
    expect(shakeOffset(0.3)).toBe(0);
    const t = 0.05;
    expect(shakeOffset(t)).toBeCloseTo(0.06 * Math.sin(2 * Math.PI * 5 * t) * (1 - t / 0.2), 12);
    for (let s = 0; s <= 0.2; s += 0.005) expect(Math.abs(shakeOffset(s))).toBeLessThanOrEqual(0.06);
  });

  it('delete shrinks to 0.6, rises 0.2 and ends fully transparent', () => {
    expect(deleteFrame(0)).toEqual({ scale: 1, rise: 0, opacity: 1 });
    const end = deleteFrame(DELETE_DURATION);
    expect(end.scale).toBeCloseTo(0.6, 12);
    expect(end.rise).toBeCloseTo(0.2, 12);
    expect(end.opacity).toBe(0);
  });

  it('hover lifts to 0.05 and lowers back to 0', () => {
    expect(hoverLift(0, true, 0)).toBe(0);
    expect(hoverLift(HOVER_DURATION, true, 0)).toBe(HOVER_LIFT);
    expect(hoverLift(HOVER_DURATION, false, HOVER_LIFT)).toBe(0);
  });

  it('tilt is clamped to 0..8° and leans toward the movement', () => {
    expect(tiltAngleDeg(0)).toBe(0);
    expect(tiltAngleDeg(-3)).toBe(0);
    expect(tiltAngleDeg(5)).toBeCloseTo(4.5, 12);
    expect(tiltAngleDeg(1000)).toBe(8);
    expect(tiltRotation(0, 0)).toEqual({ x: 0, z: 0 });
    // Moving south (+z): positive rotation about +X tips the top toward +z.
    const south = tiltRotation(0, 100);
    expect(south.x).toBeCloseTo((8 * Math.PI) / 180, 12);
    expect(south.z).toBeCloseTo(0, 12);
    // Moving east (+x): negative rotation about +Z tips the top toward +x.
    const east = tiltRotation(2, 0);
    expect(east.z).toBeCloseTo((-1.8 * Math.PI) / 180, 12);
    const diag = tiltRotation(50, -50);
    expect(Math.hypot(diag.x, diag.z)).toBeLessThanOrEqual((8 * Math.PI) / 180 + 1e-12);
  });
});

describe('rotation targets', () => {
  it('each step subtracts 90° and ends congruent to −rotation', () => {
    let target = restAngleFor(0);
    let rotation = 0;
    for (let i = 0; i < 9; i++) {
      const next = nextRotationTarget(target);
      expect(next).toBe(target - 90);
      target = next;
      rotation = (rotation + 90) % 360;
      expect(mod360(target)).toBe(mod360(-rotation));
    }
  });

  it('270 → 0 turns a further 90° clockwise instead of spinning back', () => {
    const at270 = restAngleFor(270);
    expect(at270).toBe(-270);
    const r = rotationTargetFor(at270, 0);
    expect(r).toEqual({ target: -360, animate: true });
    expect(rotateAngle(0, at270, r.target)).toBe(-270);
    expect(rotateAngle(ROTATE_DURATION, at270, r.target)).toBe(-360);
    // The tween is monotonic: it never turns counter-clockwise on the way.
    let prev = at270;
    for (let t = 0; t <= ROTATE_DURATION; t += 0.01) {
      const a = rotateAngle(t, at270, r.target);
      expect(a).toBeLessThanOrEqual(prev);
      prev = a;
    }
  });

  it('jumps without animation for undo (counter-clockwise) and other changes', () => {
    expect(rotationTargetFor(-90, 90)).toEqual({ target: -90, animate: false });
    expect(rotationTargetFor(-90, 0)).toEqual({ target: 0, animate: false });
    expect(rotationTargetFor(-360, 180)).toEqual({ target: -540, animate: false });
    expect(rotationTargetFor(-720, 90)).toEqual({ target: -810, animate: true });
  });
});

describe('quality', () => {
  it('caps the pixel ratio at 1.5, or 1 in Low quality', () => {
    expect(DPR_CAP).toBe(1.5);
    expect(dprFor(1, false)).toBe(1);
    expect(dprFor(2, false)).toBe(1.5);
    expect(dprFor(3, true)).toBe(1);
    expect(dprFor(0.75, true)).toBe(0.75);
    expect(dprFor(1.25, false)).toBe(1.25);
    expect(dprFor(Number.NaN, false)).toBe(1);
    expect(dprFor(0, false)).toBe(1);
    expect(dprFor(Infinity, false)).toBe(1.5);
  });

  it('turns shadows off in Low quality and keeps one 2048 shadow map otherwise', () => {
    const normal = qualityProfile(false);
    expect(normal).toMatchObject({
      dprCap: 1.5,
      shadows: true,
      shadowType: 'pcf',
      contactShadows: true,
    });
    expect(normal.shadowMapSize).toBe(SHADOW_MAP_SIZE);
    expect(SHADOW_MAP_SIZE).toBeLessThanOrEqual(2048);
    const low = qualityProfile(true);
    expect(low).toMatchObject({
      dprCap: 1,
      shadows: false,
      shadowType: false,
      contactShadows: false,
    });
    // Same antialias in both, so toggling never recreates the WebGL context.
    expect(low.antialias).toBe(normal.antialias);
  });
});
