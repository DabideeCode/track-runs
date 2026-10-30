import { play, setChugSpeed } from '@/audio/audioEngine';
import { buildRoute, progressOn, segmentAt, type Route } from '@/domain/route';
import {
  createTrainState,
  stepTrain,
  travelLimits,
  type TrainDirection,
  type TrainInput,
  type TrainLimits,
  type TrainSimState,
} from '@/domain/trainSim';
import type { DriveMode, Piece, StartFacing } from '@/domain/types';

const STEP_SECONDS = 1 / 120;
const MAX_FRAME_SECONDS = 0.5;

export interface TrainInfo {
  pieceId: string;
  progress: number;
  moving: boolean;
  direction: TrainDirection;
  speed: number;
}

interface RunningTrain {
  route: Route;
  limits: TrainLimits;
  sim: TrainSimState;
}

const input: TrainInput = { driveMode: 'auto', forwardHeld: false, reverseHeld: false };
let running: RunningTrain | null = null;
let frame: number | null = null;
let lastTime: number | null = null;
let backlog = 0;
let chugging = false;

function updateChug(speed: number) {
  if (speed > 0 && !chugging) {
    chugging = true;
    play('chug');
  } else if (speed === 0) {
    chugging = false;
  }
  setChugSpeed(speed);
}

function tick(time: number) {
  if (!running) return;
  const elapsed = lastTime === null ? 0 : (time - lastTime) / 1000;
  lastTime = time;
  backlog += Math.min(elapsed, MAX_FRAME_SECONDS);
  while (backlog >= STEP_SECONDS) {
    backlog -= STEP_SECONDS;
    if (stepTrain(running.sim, running.limits, STEP_SECONDS, input)) play('bump');
  }
  updateChug(Math.abs(running.sim.velocity));
  frame = requestAnimationFrame(tick);
}

export function startTrain(pieces: readonly Piece[], startFacing: StartFacing) {
  const route = buildRoute(pieces, startFacing);
  if (!route) return;
  stopTrain();
  input.driveMode = 'auto';
  running = { route, limits: travelLimits(route), sim: createTrainState() };
  frame = requestAnimationFrame(tick);
}

export function stopTrain() {
  if (frame !== null) cancelAnimationFrame(frame);
  frame = null;
  lastTime = null;
  backlog = 0;
  running = null;
  input.forwardHeld = false;
  input.reverseHeld = false;
  updateChug(0);
}

export function setDriveStyle(mode: DriveMode) {
  input.driveMode = mode;
}

export function setDriveKey(key: 'forward' | 'reverse', held: boolean) {
  if (key === 'forward') input.forwardHeld = held;
  else input.reverseHeld = held;
}

export function releaseDriveKeys() {
  input.forwardHeld = false;
  input.reverseHeld = false;
}

export function runningTrain() {
  return running;
}

export function readRunningTrain(): TrainInfo | null {
  if (!running) return null;
  const { route, sim } = running;
  const segment = segmentAt(route, sim.s);
  const speed = Math.abs(sim.velocity);
  return {
    pieceId: segment.pieceId,
    progress: progressOn(segment, sim.s, route),
    moving: speed > 0 || (input.driveMode === 'auto' && sim.pauseLeft === 0),
    direction: sim.direction,
    speed,
  };
}
