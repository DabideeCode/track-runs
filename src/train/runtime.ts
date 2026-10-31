import { emitSound, setChugLevel } from '@/audio/soundLog';
import { buildRoute, routeSample, type Route } from '@/domain/route';
import { createTrain, isMoving, stepTrain, type TrainState } from '@/domain/trainSim';
import type { GameState, Piece, TrainSnapshot } from '@/domain/types';

const TOP_SPEED = 2;

interface TrainRuntime {
  route: Route | null;
  train: TrainState | null;
  held: { forward: boolean; reverse: boolean };
  chugging: boolean;
}

/** Changes every frame and is not Section 9 game state, so it lives outside the store. */
const runtime: TrainRuntime = {
  route: null,
  train: null,
  held: { forward: false, reverse: false },
  chugging: false,
};

function updateChug(drive: GameState['driveMode']): void {
  const moving = runtime.train !== null && isMoving(runtime.train, drive);
  if (moving && !runtime.chugging) emitSound('chug');
  runtime.chugging = moving;
  setChugLevel(moving ? Math.max(0.25, (runtime.train?.speed ?? 0) / TOP_SPEED) : 0);
}

export function startTrain(pieces: readonly Piece[], startFacing: GameState['startFacing']): void {
  runtime.route = buildRoute(pieces, startFacing);
  runtime.train = runtime.route ? createTrain(runtime.route) : null;
  runtime.held = { forward: false, reverse: false };
  runtime.chugging = false;
  updateChug('auto');
}

export function parkTrain(): void {
  runtime.route = null;
  runtime.train = null;
  runtime.held = { forward: false, reverse: false };
  runtime.chugging = false;
  setChugLevel(0);
}

export function advanceTrain(dt: number, drive: GameState['driveMode']): void {
  const { route, train, held } = runtime;
  if (!route || !train) return;
  const { bump } = stepTrain(train, route, { drive, ...held }, dt);
  if (bump) emitSound('bump');
  updateChug(drive);
}

export function setHeld(direction: 'forward' | 'reverse', held: boolean): void {
  runtime.held[direction] = held;
}

export function releaseHeld(): void {
  runtime.held = { forward: false, reverse: false };
}

/** The route and position while running, or null when parked. */
export function runningTrain(): { route: Route; s: number } | null {
  return runtime.route && runtime.train ? { route: runtime.route, s: runtime.train.s } : null;
}

export function getTrainSnapshot(state: Pick<GameState, 'pieces' | 'mode' | 'driveMode'>): TrainSnapshot | null {
  const { route, train } = runtime;
  if (state.mode === 'play' && route && train) {
    const sample = routeSample(route, train.s);
    return {
      pieceId: sample.pieceId,
      progress: sample.progress,
      moving: isMoving(train, state.driveMode),
      direction: train.direction,
      speed: train.speed,
    };
  }
  const station = state.pieces.find((piece) => piece.type === 'station');
  if (!station) return null;
  return { pieceId: station.id, progress: 0.5, moving: false, direction: 'forward', speed: 0 };
}
