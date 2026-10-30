import type { Route } from './route';
import type { DriveMode } from './types';

export const CARRIAGE_OFFSETS = [0.95, 1.85] as const;
const NOSE_AHEAD = 0.45;
const REAR_BEHIND = 2.25;
const AUTO_SPEED = 1.5;
const MANUAL_TOP_SPEED = 2;
const AUTO_RATE = 3;
const MANUAL_ACCELERATION = 4;
const MANUAL_BRAKING = 5;
const PAUSE_SECONDS = 1;
const ARRIVAL_EPSILON = 0.001;
const MIN_CREEP_SPEED = 0.05;

export type TrainDirection = 'forward' | 'reverse';

export interface TrainSimState {
  s: number;
  velocity: number; // tiles per second, positive means forward
  direction: TrainDirection;
  pauseLeft: number;
}

export interface TrainInput {
  driveMode: DriveMode;
  forwardHeld: boolean;
  reverseHeld: boolean;
}

export interface TrainLimits {
  minS: number;
  maxS: number;
}

export function createTrainState(): TrainSimState {
  return { s: 0, velocity: 0, direction: 'forward', pauseLeft: 0 };
}

export function travelLimits(route: Route): TrainLimits {
  if (route.closed) return { minS: -Infinity, maxS: Infinity };
  return {
    minS: Math.min(0, route.sMin + REAR_BEHIND),
    maxS: route.sMax - NOSE_AHEAD,
  };
}

function approach(value: number, target: number, step: number) {
  return value < target ? Math.min(target, value + step) : Math.max(target, value - step);
}

function sign(direction: TrainDirection) {
  return direction === 'forward' ? 1 : -1;
}

// Moves the train and reports whether it just came to rest at a dead end.
function advance(state: TrainSimState, limits: TrainLimits, dt: number) {
  const moved = state.s + state.velocity * dt;
  const limit = state.velocity > 0 ? limits.maxS : limits.minS;
  const reached = state.velocity !== 0 && (state.velocity > 0 ? moved >= limit - ARRIVAL_EPSILON : moved <= limit + ARRIVAL_EPSILON);
  if (reached) {
    state.s = limit;
    state.velocity = 0;
    return true;
  }
  state.s = moved;
  return false;
}

function distanceToLimit(state: TrainSimState, limits: TrainLimits, heading: number) {
  return heading > 0 ? limits.maxS - state.s : state.s - limits.minS;
}

// The curve brakes a little softer than the real rate, so stepped braking can always keep up with it.
function brakingCap(state: TrainSimState, limits: TrainLimits, heading: number, braking: number) {
  const distance = distanceToLimit(state, limits, heading);
  if (!Number.isFinite(distance)) return Infinity;
  return Math.max(MIN_CREEP_SPEED, Math.sqrt(2 * 0.8 * braking * Math.max(0, distance)));
}

function stepAuto(state: TrainSimState, limits: TrainLimits, dt: number): boolean {
  if (state.pauseLeft > 0) {
    state.pauseLeft -= dt;
    if (state.pauseLeft <= 0) {
      state.pauseLeft = 0;
      state.direction = state.direction === 'forward' ? 'reverse' : 'forward';
    }
    return false;
  }

  const heading = sign(state.direction);
  if (state.velocity === 0 && distanceToLimit(state, limits, heading) <= ARRIVAL_EPSILON) {
    state.pauseLeft = PAUSE_SECONDS;
    return false;
  }

  const target = heading * Math.min(AUTO_SPEED, brakingCap(state, limits, heading, AUTO_RATE));
  state.velocity = approach(state.velocity, target, AUTO_RATE * dt);
  const arrived = advance(state, limits, dt);
  if (arrived) state.pauseLeft = PAUSE_SECONDS;
  return arrived;
}

function stepManual(state: TrainSimState, limits: TrainLimits, dt: number, input: TrainInput): boolean {
  state.pauseLeft = 0;
  const want = Number(input.forwardHeld) - Number(input.reverseHeld);
  if (want !== 0) state.direction = want > 0 ? 'forward' : 'reverse';

  const heading = state.velocity !== 0 ? Math.sign(state.velocity) : want;
  if (heading === 0) return false;
  if (state.velocity === 0 && distanceToLimit(state, limits, heading) <= ARRIVAL_EPSILON) return false;

  const cap = brakingCap(state, limits, heading, MANUAL_BRAKING);
  const speedTarget = want * Math.min(MANUAL_TOP_SPEED, want === heading ? cap : MANUAL_TOP_SPEED);
  const slowing = Math.abs(speedTarget) < Math.abs(state.velocity) || speedTarget * state.velocity < 0;
  state.velocity = approach(state.velocity, speedTarget, (slowing ? MANUAL_BRAKING : MANUAL_ACCELERATION) * dt);
  if (want === 0 && Math.abs(state.velocity) > cap) {
    state.velocity = Math.sign(state.velocity) * cap;
  }
  return advance(state, limits, dt);
}

export function stepTrain(state: TrainSimState, limits: TrainLimits, dt: number, input: TrainInput): boolean {
  return input.driveMode === 'auto'
    ? stepAuto(state, limits, dt)
    : stepManual(state, limits, dt, input);
}
