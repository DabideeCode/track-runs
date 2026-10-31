import type { Route } from './route';
import type { GameState } from './types';

export const FIRST_CARRIAGE_OFFSET = -0.95;
export const SECOND_CARRIAGE_OFFSET = -1.85;

const FRONT_REACH = 0.45;
const REAR_REACH = 2.25;
const FIT_LENGTH = 2.95;

const AUTO_CRUISE = 1.5;
const AUTO_ACCELERATE = 5;
const AUTO_BRAKE = 3;
const MANUAL_CRUISE = 2;
const MANUAL_ACCELERATE = 2.5;
const MANUAL_BRAKE = 5;

const AUTO_PAUSE = 1;
const MAX_STEP = 0.25;
const SUB_STEP = 1 / 120;
const ARRIVED = 0.001;

export interface TrainState {
  s: number;
  speed: number;
  direction: 'forward' | 'reverse';
  phase: 'running' | 'pausing' | 'stopped';
  pauseLeft: number;
}

export interface TrainInput {
  drive: GameState['driveMode'];
  forward: boolean;
  reverse: boolean;
}

export function createTrain(route: Route): TrainState {
  return { s: route.stationS, speed: 0, direction: 'forward', phase: 'running', pauseLeft: 0 };
}

export function isMoving(train: TrainState, drive: GameState['driveMode']): boolean {
  return drive === 'auto' ? train.phase === 'running' : train.speed > 0;
}

/** How far the locomotive's centre may go along a line. A loop has no limits. */
export function trainLimits(route: Route): { min: number; max: number } | null {
  if (route.kind === 'loop') return null;
  return {
    min: route.length >= FIT_LENGTH ? REAR_REACH : FRONT_REACH,
    max: route.length - FRONT_REACH,
  };
}

function distanceToLimit(train: TrainState, route: Route): number {
  const limits = trainLimits(route);
  if (!limits) return Infinity;
  return train.direction === 'forward' ? limits.max - train.s : train.s - limits.min;
}

function moveBy(train: TrainState, distance: number): void {
  train.s += train.direction === 'forward' ? distance : -distance;
}

/** Moves toward the current limit under a speed profile. Returns true on arrival. */
function drive(
  train: TrainState,
  route: Route,
  cruise: number,
  accelerate: number,
  brake: number,
  dt: number,
): boolean {
  const distance = distanceToLimit(train, route);
  if (distance <= ARRIVED) {
    if (distance > -ARRIVED) train.s += train.direction === 'forward' ? distance : -distance;
    train.speed = 0;
    return true;
  }
  const rising = Math.min(train.speed + accelerate * dt, cruise);
  const falling = Math.max(train.speed - brake * dt, cruise);
  const target = train.speed > cruise ? falling : rising;
  const speed = Math.min(target, Math.sqrt(2 * brake * distance));
  const travel = speed * dt;
  if (travel >= distance) {
    moveBy(train, distance);
    train.speed = 0;
    return true;
  }
  moveBy(train, travel);
  train.speed = speed;
  return false;
}

function brakeToStop(train: TrainState, route: Route, dt: number): void {
  const distance = distanceToLimit(train, route);
  train.speed = Math.max(0, train.speed - MANUAL_BRAKE * dt);
  moveBy(train, Math.min(train.speed * dt, Math.max(distance, 0)));
}

function stepAuto(train: TrainState, route: Route, dt: number): boolean {
  if (train.phase === 'pausing') {
    train.pauseLeft -= dt;
    if (train.pauseLeft <= 0) {
      train.direction = train.direction === 'forward' ? 'reverse' : 'forward';
      train.phase = 'running';
    }
    return false;
  }
  train.phase = 'running';
  const wasMoving = train.speed > 0;
  if (!drive(train, route, AUTO_CRUISE, AUTO_ACCELERATE, AUTO_BRAKE, dt)) return false;
  train.phase = 'pausing';
  train.pauseLeft = AUTO_PAUSE;
  return wasMoving;
}

function stepManual(train: TrainState, route: Route, input: TrainInput, dt: number): boolean {
  const wanted = input.forward === input.reverse ? null : input.forward ? 'forward' : 'reverse';
  let bump = false;
  if (wanted && (wanted === train.direction || train.speed === 0)) {
    train.direction = wanted;
    const wasMoving = train.speed > 0;
    bump = drive(train, route, MANUAL_CRUISE, MANUAL_ACCELERATE, MANUAL_BRAKE, dt) && wasMoving;
  } else {
    brakeToStop(train, route, dt);
  }
  train.phase = train.speed > 0 ? 'running' : 'stopped';
  return bump;
}

/** Advances the train. Long gaps, such as a hidden tab, are clamped, so the train never jumps. */
export function stepTrain(train: TrainState, route: Route, input: TrainInput, dt: number): { bump: boolean } {
  const total = Math.min(dt, MAX_STEP);
  const steps = Math.max(1, Math.ceil(total / SUB_STEP));
  let bump = false;
  for (let index = 0; index < steps; index++) {
    const stopped =
      input.drive === 'auto'
        ? stepAuto(train, route, total / steps)
        : stepManual(train, route, input, total / steps);
    bump ||= stopped;
  }
  return { bump };
}
