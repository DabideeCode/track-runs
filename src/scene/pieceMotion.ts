/**
 * Motion for a single piece, with the timings of requirement.md Section 7.2. This is pure, so each
 * timing has a unit test. The spring uses an exact solution, so it stays accurate at low frame rates.
 */

export const LIFT_HEIGHT = 0.3;
export const HOVER_HEIGHT = 0.05;
const MAX_TILT = (8 * Math.PI) / 180;
const SPRING_RATE = 24; // settles within 2% in 250 ms, with no overshoot
const HEIGHT_RATE = 26; // reaches 97% in 150 ms
const TILT_RATE = 30;
const TILT_PER_SPEED = MAX_TILT / 6;
const ROTATE_TIME = 0.15;
const FALL_TIME = 0.08; // keeps the place sound within 100 ms of contact
const SETTLE_TIME = 0.18;
const SETTLE_HEIGHT = 0.035;
const DROP_TIME = FALL_TIME + SETTLE_TIME;
const SHAKE_TIME = 0.2;
const SHAKE_SIZE = 0.07;
const SHAKE_HZ = 22;
const VANISH_TIME = 0.12;
const RETURN_TIME = 0.32;
const SLIDE_TIME = 0.28;
const DELETE_TIME = 0.2;
const DELETE_RISE = 0.2;

export type MotionKind =
  | 'rest'
  | 'hover'
  | 'drag'
  | 'drop'
  | 'slide'
  | 'rotate'
  | 'rejectNew'
  | 'rejectBoard'
  | 'delete';

export interface MotionGoal {
  kind: MotionKind;
  x: number;
  z: number;
  yaw: number;
  returnX?: number;
  returnZ?: number;
}

export interface MotionState {
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  yaw: number;
  tiltX: number;
  tiltZ: number;
  shake: number;
  scale: number;
  opacity: number;
  kind: MotionKind;
  elapsed: number;
  fromY: number;
  yawFrom: number;
  yawTarget: number;
  yawTime: number;
}

export function createMotion(x: number, y: number, z: number, yaw = 0): MotionState {
  return {
    x,
    y,
    z,
    vx: 0,
    vz: 0,
    yaw,
    tiltX: 0,
    tiltZ: 0,
    shake: 0,
    scale: 1,
    opacity: 1,
    kind: 'rest',
    elapsed: 0,
    fromY: y,
    yawFrom: yaw,
    yawTarget: yaw,
    yawTime: ROTATE_TIME,
  };
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;
const approach = (value: number, target: number, rate: number, dt: number) =>
  target + (value - target) * Math.exp(-rate * dt);

/** Critically damped spring, solved exactly so it never overshoots at any time step. */
function spring(position: number, velocity: number, target: number, dt: number): [number, number] {
  const decay = Math.exp(-SPRING_RATE * dt);
  const offset = position - target;
  const term = (velocity + SPRING_RATE * offset) * dt;
  return [target + (offset + term) * decay, (velocity - SPRING_RATE * term) * decay];
}

/** The shortest signed turn from one yaw to another, in the range -PI to PI. */
function shortestTurn(from: number, to: number): number {
  const turn = (to - from) % (2 * Math.PI);
  if (turn > Math.PI) return turn - 2 * Math.PI;
  if (turn < -Math.PI) return turn + 2 * Math.PI;
  return turn;
}

function stepYaw(state: MotionState, goalYaw: number, dt: number): void {
  const turn = shortestTurn(state.yawTarget, goalYaw);
  if (Math.abs(turn) > 1e-6) {
    state.yawFrom = state.yaw;
    state.yawTarget += turn;
    state.yawTime = 0;
  }
  state.yawTime += dt;
  const progress = easeOutCubic(clamp(state.yawTime / ROTATE_TIME, 0, 1));
  state.yaw = state.yawFrom + (state.yawTarget - state.yawFrom) * progress;
}

function fallAndSettle(from: number, t: number): number {
  if (t < FALL_TIME) return from * (1 - (t / FALL_TIME) ** 2);
  const settle = clamp((t - FALL_TIME) / SETTLE_TIME, 0, 1);
  return SETTLE_HEIGHT * Math.sin(Math.PI * settle);
}

/** Advances one frame. Returns true once a timed motion has finished. */
export function stepMotion(state: MotionState, goal: MotionGoal, dt: number): boolean {
  if (state.kind !== goal.kind) {
    state.kind = goal.kind;
    state.elapsed = 0;
    state.fromY = state.y;
  }
  state.elapsed += dt;
  const t = state.elapsed;

  const rejecting = goal.kind === 'rejectBoard' && t >= SHAKE_TIME;
  const targetX = rejecting ? (goal.returnX ?? goal.x) : goal.x;
  const targetZ = rejecting ? (goal.returnZ ?? goal.z) : goal.z;
  [state.x, state.vx] = spring(state.x, state.vx, targetX, dt);
  [state.z, state.vz] = spring(state.z, state.vz, targetZ, dt);
  stepYaw(state, goal.yaw, dt);

  const dragging = goal.kind === 'drag';
  const tiltZ = dragging ? clamp(-state.vx * TILT_PER_SPEED, -MAX_TILT, MAX_TILT) : 0;
  const tiltX = dragging ? clamp(state.vz * TILT_PER_SPEED, -MAX_TILT, MAX_TILT) : 0;
  state.tiltZ = approach(state.tiltZ, tiltZ, TILT_RATE, dt);
  state.tiltX = approach(state.tiltX, tiltX, TILT_RATE, dt);

  const shaking = (goal.kind === 'rejectNew' || goal.kind === 'rejectBoard') && t < SHAKE_TIME;
  state.shake = shaking ? SHAKE_SIZE * (1 - t / SHAKE_TIME) * Math.sin(2 * Math.PI * SHAKE_HZ * t) : 0;

  switch (goal.kind) {
    case 'rest':
      state.y = approach(state.y, 0, HEIGHT_RATE, dt);
      return false;
    case 'hover':
      state.y = approach(state.y, HOVER_HEIGHT, HEIGHT_RATE, dt);
      return false;
    case 'drag':
      state.y = approach(state.y, LIFT_HEIGHT, HEIGHT_RATE, dt);
      return false;
    case 'drop':
      state.y = fallAndSettle(state.fromY, t);
      if (t >= DROP_TIME) state.y = 0;
      return t >= DROP_TIME;
    case 'slide':
      state.y = approach(state.y, 0, HEIGHT_RATE, dt);
      return t >= SLIDE_TIME;
    case 'rotate':
      state.y = approach(state.y, 0, HEIGHT_RATE, dt);
      return t >= ROTATE_TIME + dt;
    case 'rejectNew': {
      const vanish = clamp((t - SHAKE_TIME) / VANISH_TIME, 0, 1);
      state.scale = 1 - vanish;
      state.opacity = 1 - vanish;
      return vanish >= 1;
    }
    case 'rejectBoard': {
      if (t < SHAKE_TIME) return false;
      const home = clamp((t - SHAKE_TIME) / RETURN_TIME, 0, 1);
      state.y = state.fromY * (1 - easeOutCubic(home));
      return home >= 1;
    }
    case 'delete': {
      const gone = clamp(t / DELETE_TIME, 0, 1);
      state.scale = 1 - gone * gone;
      state.opacity = 1 - gone;
      state.y = DELETE_RISE * gone;
      return gone >= 1;
    }
  }
}
