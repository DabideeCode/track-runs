/**
 * Pure damped-spring integrator for the per-frame drag follow (DD-8).
 *
 * The step uses the exact closed-form solution of the linear mass-spring-damper
 * equation m·x'' + c·x' + k·x = 0 (x = position − target), so it is stable and
 * deterministic for any dt ≥ 0. Large frame times are split into equal sub-steps
 * of at most `maxSubstep` seconds. The exact solution does not need them for
 * stability; they give the settle check (below) a fixed cadence that does not
 * depend on the frame rate.
 *
 * Settle: when the distance to the target and the speed both fall below the
 * `settle` thresholds, the state snaps to exactly { pos: target, vel: 0 } and
 * stays there while the target is unchanged (Requirement 31.2: no frame-to-frame
 * change once settled).
 *
 * No React, Three.js or DOM imports, so this runs in Node tests.
 */

export interface SpringParams {
  /** Spring constant k (> 0). */
  stiffness: number;
  /** Damping coefficient c (≥ 0). */
  damping: number;
  /** Mass m (> 0). Defaults to 1. */
  mass?: number;
  /** Snap thresholds. Defaults to SETTLE_POSITION and SETTLE_SPEED. */
  settle?: { position: number; speed: number };
  /** Longest sub-step in seconds. Defaults to DEFAULT_MAX_SUBSTEP. */
  maxSubstep?: number;
}

export interface SpringState {
  pos: number;
  vel: number;
}

export interface SpringVecState {
  pos: readonly number[];
  vel: readonly number[];
}

/** Distance to the target below which a spring may snap (tiles). */
export const SETTLE_POSITION = 0.002;
/** Speed below which a spring may snap (tiles per second). */
export const SETTLE_SPEED = 0.01;
/** Default sub-step: 1/120 s, the same cadence as the train simulation. */
export const DEFAULT_MAX_SUBSTEP = 1 / 120;
/** Upper bound on sub-steps per call; a longer dt uses longer (still exact) sub-steps. */
export const MAX_SUBSTEPS = 240;

/** Build spring params from a natural frequency ω (rad/s) and damping ratio ζ. */
export function springFromFrequency(
  omega: number,
  dampingRatio: number,
  mass = 1,
): { stiffness: number; damping: number; mass: number } {
  return {
    stiffness: mass * omega * omega,
    damping: 2 * dampingRatio * mass * omega,
    mass,
  };
}

/** Damping ratio ζ = c / (2·√(k·m)). */
export function dampingRatio(p: SpringParams): number {
  const m = p.mass ?? 1;
  return p.damping / (2 * Math.sqrt(p.stiffness * m));
}

/**
 * Largest overshoot past the target, as a fraction of the initial offset, for a
 * spring released from rest: exp(−πζ / √(1 − ζ²)) when under-damped, else 0.
 */
export function springOvershoot(p: SpringParams): number {
  const z = dampingRatio(p);
  if (z >= 1) return 0;
  return Math.exp((-Math.PI * z) / Math.sqrt(1 - z * z));
}

function assertParams(p: SpringParams): void {
  const m = p.mass ?? 1;
  if (!(p.stiffness > 0) || !Number.isFinite(p.stiffness)) {
    throw new RangeError('spring stiffness must be a finite number > 0');
  }
  if (!(p.damping >= 0) || !Number.isFinite(p.damping)) {
    throw new RangeError('spring damping must be a finite number ≥ 0');
  }
  if (!(m > 0) || !Number.isFinite(m)) {
    throw new RangeError('spring mass must be a finite number > 0');
  }
}

/** Exact evolution of offset x and velocity v over time t (no settle check). */
function evolve(x0: number, v0: number, p: SpringParams, t: number): SpringState {
  if (t <= 0 || (x0 === 0 && v0 === 0)) return { pos: x0, vel: v0 };
  const m = p.mass ?? 1;
  const w0 = Math.sqrt(p.stiffness / m);
  const z = p.damping / (2 * Math.sqrt(p.stiffness * m));

  if (Math.abs(z - 1) < 1e-9) {
    // Critically damped.
    const e = Math.exp(-w0 * t);
    const b = v0 + w0 * x0;
    return { pos: (x0 + b * t) * e, vel: (v0 - w0 * b * t) * e };
  }
  if (z < 1) {
    // Under-damped.
    const a = z * w0;
    const wd = w0 * Math.sqrt(1 - z * z);
    const e = Math.exp(-a * t);
    const c = Math.cos(wd * t);
    const s = Math.sin(wd * t);
    const b = (v0 + a * x0) / wd;
    return {
      pos: e * (x0 * c + b * s),
      vel: e * (v0 * c - (a * b + x0 * wd) * s),
    };
  }
  // Over-damped.
  const root = Math.sqrt(z * z - 1);
  const r1 = -w0 * (z - root);
  const r2 = -w0 * (z + root);
  const c2 = (v0 - r1 * x0) / (r2 - r1);
  const c1 = x0 - c2;
  const e1 = Math.exp(r1 * t);
  const e2 = Math.exp(r2 * t);
  return { pos: c1 * e1 + c2 * e2, vel: r1 * c1 * e1 + r2 * c2 * e2 };
}

function sanitiseDt(dt: number): number {
  return Number.isFinite(dt) && dt > 0 ? dt : 0;
}

/**
 * Advance an N-dimensional spring (one independent spring per axis) by dt
 * seconds. The settle check uses the Euclidean distance and speed over all
 * axes, so the object comes to rest on every axis in the same frame.
 * `state.pos`, `state.vel` and `target` must have the same length.
 */
export function springStepVec(
  state: SpringVecState,
  target: readonly number[],
  params: SpringParams,
  dt: number,
): { pos: number[]; vel: number[]; settled: boolean } {
  assertParams(params);
  const n = target.length;
  if (state.pos.length !== n || state.vel.length !== n) {
    throw new RangeError('spring state and target must have the same length');
  }
  const settlePos = params.settle?.position ?? SETTLE_POSITION;
  const settleSpeed = params.settle?.speed ?? SETTLE_SPEED;
  const maxSub = params.maxSubstep ?? DEFAULT_MAX_SUBSTEP;

  // Work in offsets from the target.
  const x = state.pos.map((p, i) => p - target[i]);
  const v = state.vel.slice();

  const isSettled = (): boolean => {
    let d2 = 0;
    let s2 = 0;
    for (let i = 0; i < n; i++) {
      d2 += x[i] * x[i];
      s2 += v[i] * v[i];
    }
    return d2 < settlePos * settlePos && s2 < settleSpeed * settleSpeed;
  };
  const snap = () => {
    for (let i = 0; i < n; i++) {
      x[i] = 0;
      v[i] = 0;
    }
  };

  const total = sanitiseDt(dt);
  let settled = isSettled();
  if (settled) snap();

  if (total > 0 && !settled) {
    const steps =
      maxSub > 0 ? Math.min(MAX_SUBSTEPS, Math.max(1, Math.ceil(total / maxSub - 1e-9))) : 1;
    const h = total / steps;
    for (let k = 0; k < steps; k++) {
      for (let i = 0; i < n; i++) {
        const next = evolve(x[i], v[i], params, h);
        x[i] = next.pos;
        v[i] = next.vel;
      }
      if (isSettled()) {
        snap();
        settled = true;
        break;
      }
    }
  }

  return {
    pos: x.map((xi, i) => xi + target[i]),
    vel: v,
    settled,
  };
}

/** Advance a 1-D spring by dt seconds. See `springStepVec`. */
export function springStep(
  state: SpringState,
  target: number,
  params: SpringParams,
  dt: number,
): SpringState & { settled: boolean } {
  const r = springStepVec({ pos: [state.pos], vel: [state.vel] }, [target], params, dt);
  return { pos: r.pos[0], vel: r.vel[0], settled: r.settled };
}

/**
 * Frame-rate independent exponential smoothing toward a target with time
 * constant `tau` seconds (used to ease the drag tilt back to 0°).
 */
export function smoothTowards(current: number, target: number, dt: number, tau: number): number {
  const t = sanitiseDt(dt);
  if (!(tau > 0)) return target;
  return target + (current - target) * Math.exp(-t / tau);
}
