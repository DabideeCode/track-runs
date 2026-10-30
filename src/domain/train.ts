/**
 * Train simulation (design.md §1.10, decisions D-15 to D-18).
 *
 * A pure, deterministic stepper. Nothing here mutates its inputs: every
 * function returns new objects. `TrainRuntime` (src/runtime) owns the current
 * `TrainSim`, calls `stepTrain` from `useFrame` and forwards the events to the
 * audio manager.
 *
 * Conventions (shared with `trackGraph.ts`):
 *
 * - `loco` is the locomotive centre. `loco.heading` is the way the locomotive
 *   faces, in terms of s. It never changes while running: Forward motion walks
 *   along the heading, Reverse motion walks against it.
 * - The leading end is the locomotive front (0.45 ahead of the centre) when
 *   moving Forward and the rear of carriage 2 (2.25 behind the centre) when
 *   moving in Reverse. Dead ends are measured from the leading end.
 * - The speed is capped by the envelope sqrt(2 × a × D), D being the free
 *   distance ahead of the leading end, so the train slows monotonically to 0
 *   exactly at the dead end and never passes it.
 */
import { advance, distanceToDeadEnd, walkPose, type TrackGraph, type TrackLoc } from './trackGraph';
import type { Vec2 } from './trackPath';
import type { Piece } from './types';

// ---------------------------------------------------------------------------
// Constants (tiles, seconds)
// ---------------------------------------------------------------------------

/** Locomotive length (Section 6). */
export const LOCO_LENGTH = 0.9;
/** Carriage length (Section 6). */
export const CARRIAGE_LENGTH = 0.8;
/** Gap between coupled vehicles (D-15). */
export const COUPLING_GAP = 0.1;
/** Centreline distance from the locomotive centre to carriage 1's centre: 0.45 + 0.1 + 0.4. */
export const LOCO_TO_CARRIAGE1 = 0.95;
/** Centreline distance from carriage 1's centre to carriage 2's centre: 0.4 + 0.1 + 0.4. */
export const CARRIAGE1_TO_CARRIAGE2 = 0.9;
/** Distance from the locomotive centre to its front: half the locomotive length. */
export const LOCO_FRONT_OFFSET = 0.45;
/** Distance from the locomotive centre back to carriage 2's rear: 0.95 + 0.9 + 0.4. */
export const TRAIN_REAR_OFFSET = 2.25;

/** Auto driving cruise speed (AC-10.6). */
export const AUTO_CRUISE_SPEED = 1.5;
/** Auto departure acceleration, 0 to cruise in 0.25 s (D-16). */
export const AUTO_DEPARTURE_ACCEL = 6;
/** Deceleration used by the dead-end speed envelope in Auto driving (D-16). */
export const DEAD_END_BRAKING = 3;
/** Manual acceleration, 0 to 2 in 1 s (Requirement 21.3). */
export const MANUAL_ACCEL = 2;
/** Manual top speed (AC-10.7). */
export const MANUAL_TOP_SPEED = 2;
/** Manual coast and reverse braking, 2 to 0 in 0.4 s (Requirement 21.4). */
export const MANUAL_BRAKING = 5;
/**
 * Deceleration used by the dead-end speed envelope in Manual driving. With the
 * Auto value of 3, a train needs 1.67 tiles of free track to reach 2 tiles/s,
 * so Property 41 ("at least 1.5 tiles reaches 2 within 1 second") could not
 * hold. Manual driving therefore brakes for dead ends at its own braking rate.
 */
export const MANUAL_DEAD_END_BRAKING = MANUAL_BRAKING;
/** Pause at a dead end in Auto driving before reversing (AC-10.6). */
export const AUTO_PAUSE = 1;
/** Minimum simulation time between two whistles (Requirement 26.1). */
export const WHISTLE_THROTTLE = 3;
/** Fixed integration sub-step (D-17). */
export const SUB_STEP = 1 / 120;
/** Frame times above this are clamped (D-17). */
export const MAX_FRAME_DT = 0.1;
/** Free distance below which the leading end counts as resting at the dead end. */
export const DEAD_END_SNAP = 1e-4;

/**
 * Free distance beyond which the envelope cannot matter: the highest speed is
 * 2 and sqrt(2 × 3 × 4) ≈ 4.9 > 2. Looking further is wasted work.
 */
const LOOKAHEAD = 4;
/** Tolerance for snapping speeds onto their targets and for the pause timer. */
const EPS = 1e-9;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TrainDirection = 'forward' | 'reverse';
export type DriveMode = 'auto' | 'manual';
export type TrainPhase = 'parked' | 'running' | 'braking' | 'paused' | 'stopped' | 'blocked';

export interface TrainSim {
  /** Locomotive centre; heading = the way the locomotive faces. */
  loco: TrackLoc;
  /** Speed magnitude, ≥ 0. */
  speed: number;
  direction: TrainDirection;
  phase: TrainPhase;
  /** Seconds left in the Auto pause. */
  pauseLeft: number;
  /** Direction in which the train is resting against a dead end, or null. */
  deadEnd: TrainDirection | null;
  /** Simulation clock of the last whistle; −Infinity initially. */
  lastWhistleAt: number;
  /** Simulation clock in seconds. */
  clock: number;
  /** Drive mode seen by the previous step, used to detect drive-mode switches. */
  driveMode: DriveMode;
  /** True while the looping chug is running (between `chugStart` and `chugStop`). */
  chugging: boolean;
}

export interface DriveInput {
  driveMode: DriveMode;
  w: boolean;
  s: boolean;
}

export type TrainEvent = 'whistle' | 'chugStart' | 'chugStop' | 'bump';

export interface StepResult {
  sim: TrainSim;
  events: TrainEvent[];
}

export type VehicleKind = 'locomotive' | 'carriage1' | 'carriage2';

export interface VehiclePose {
  vehicle: VehicleKind;
  x: number;
  z: number;
  /** Unit vector the vehicle faces (the locomotive's facing carried along the track). */
  tangent: Vec2;
  /** False when the vehicle centre lies on the straight extension past a dead end. */
  onTrack: boolean;
  /** Track piece under the vehicle centre, or null on the extension. */
  pieceId: string | null;
}

/** The `getTrain()` shape from Section 10.2 of requirement.md. */
export interface TrainSnapshot {
  pieceId: string;
  progress: number;
  moving: boolean;
  direction: TrainDirection;
  speed: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function cloneSim(sim: TrainSim): TrainSim {
  return { ...sim, loco: { ...sim.loco } };
}

function flip(d: TrainDirection): TrainDirection {
  return d === 'forward' ? 'reverse' : 'forward';
}

/** Moves v toward target by at most maxDelta, landing exactly on the target when within EPS. */
function towards(v: number, target: number, maxDelta: number): number {
  if (v < target) {
    const next = v + maxDelta;
    return next >= target - EPS ? target : next;
  }
  if (v > target) {
    const next = v - maxDelta;
    return next <= target + EPS ? target : next;
  }
  return v;
}

function lengthOf(g: TrackGraph, pieceId: string): number {
  const node = g.nodes.get(pieceId);
  if (!node) throw new Error(`Not a track piece in the graph: ${pieceId}`);
  return node.length;
}

/**
 * Free distance ahead of the leading end in `direction`, or Infinity when no
 * dead end lies within `max` (default 4 tiles) or the track is a closed loop.
 * In Reverse, if the walk back from the locomotive centre leaves the track
 * before reaching the rear of carriage 2 (trailing vehicles on the extension
 * past an open end), the free distance is 0.
 */
export function freeDistance(
  g: TrackGraph,
  loco: TrackLoc,
  direction: TrainDirection,
  max: number = LOOKAHEAD,
): number {
  if (direction === 'forward') {
    const d = distanceToDeadEnd(g, loco, max + LOCO_FRONT_OFFSET);
    return d === Infinity ? Infinity : Math.max(0, d - LOCO_FRONT_OFFSET);
  }
  const rear = advance(g, loco, -TRAIN_REAR_OFFSET);
  if (rear.blocked) return 0;
  const walkingBack: TrackLoc = { ...rear.loc, heading: rear.loc.heading === 1 ? -1 : 1 };
  return distanceToDeadEnd(g, walkingBack, max);
}

/** Moves the locomotive centre `dist` (≥ 0) in the direction of travel. */
function moveLoco(g: TrackGraph, sim: TrainSim, dist: number): void {
  if (dist <= 0) return;
  const signed = sim.direction === 'forward' ? dist : -dist;
  sim.loco = advance(g, sim.loco, signed).loc;
}

function emitDeparture(sim: TrainSim, events: TrainEvent[]): void {
  if (sim.clock - sim.lastWhistleAt >= WHISTLE_THROTTLE - EPS) {
    events.push('whistle');
    sim.lastWhistleAt = sim.clock;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * The train parked on the station: locomotive centre at progress 0.5, facing
 * connector 0 (s = 0) for startFacing 0 and connector 1 (s = L) for 180.
 */
export function parkTrain(g: TrackGraph, station: Piece, startFacing: 0 | 180): TrainSim {
  const length = lengthOf(g, station.id);
  return {
    loco: { pieceId: station.id, s: length / 2, heading: startFacing === 0 ? -1 : 1 },
    speed: 0,
    direction: 'forward',
    phase: 'parked',
    pauseLeft: 0,
    deadEnd: null,
    lastWhistleAt: -Infinity,
    clock: 0,
    driveMode: 'auto',
    chugging: false,
  };
}

/**
 * Starts Play mode from a parked train: Auto driving, Forward. Emits `whistle`
 * (Requirement 18.3) and `chugStart`, so the chug is already running when the
 * first step raises the speed above 0; that first rise emits nothing more. If
 * the train cannot move Forward at all, it starts with the Auto pause instead
 * (no chug).
 */
export function startPlay(g: TrackGraph, sim: TrainSim): StepResult {
  const s = cloneSim(sim);
  const events: TrainEvent[] = [];
  s.speed = 0;
  s.direction = 'forward';
  s.driveMode = 'auto';
  s.pauseLeft = 0;
  s.deadEnd = null;
  emitDeparture(s, events);
  if (freeDistance(g, s.loco, 'forward') <= DEAD_END_SNAP) {
    s.phase = 'paused';
    s.pauseLeft = AUTO_PAUSE;
    s.deadEnd = 'forward';
    if (s.chugging) {
      events.push('chugStop');
      s.chugging = false;
    }
    return { sim: s, events };
  }
  s.phase = 'running';
  if (!s.chugging) {
    events.push('chugStart');
    s.chugging = true;
  }
  return { sim: s, events };
}

/** Applies a change of drive mode seen at the start of a step. */
function switchDriveMode(g: TrackGraph, s: TrainSim, mode: DriveMode): void {
  if (mode === s.driveMode) return;
  s.driveMode = mode;
  s.pauseLeft = 0;
  if (mode === 'manual') {
    // Manual takes over from any Auto phase; with no key held it brakes to a stop.
    s.phase = s.speed > 0 ? 'running' : 'stopped';
    return;
  }
  // Manual → Auto: keep the direction and cruise, unless the train rests at a
  // dead end in that direction, in which case pause and reverse (Requirement 20.7).
  if (s.speed === 0 && freeDistance(g, s.loco, s.direction) <= DEAD_END_SNAP) {
    s.phase = 'paused';
    s.pauseLeft = AUTO_PAUSE;
    s.deadEnd = s.direction;
  } else {
    s.phase = 'running';
  }
}

/** One integration sub-step of length h. Mutates the local copy `s` only. */
function subStep(g: TrackGraph, s: TrainSim, input: DriveInput, h: number, events: TrainEvent[]): void {
  s.clock += h;
  if (s.phase === 'parked' || s.phase === 'blocked') return;

  if (s.phase === 'paused') {
    s.pauseLeft -= h;
    if (s.pauseLeft > EPS) return;
    s.pauseLeft = 0;
    s.direction = flip(s.direction);
    if (freeDistance(g, s.loco, s.direction) <= DEAD_END_SNAP) {
      // D-18: no way out in either direction; stay still and silent.
      s.phase = 'blocked';
      s.deadEnd = s.direction;
      return;
    }
    s.phase = 'running';
    s.deadEnd = null;
    // Fall through: the departure starts in this sub-step.
  }

  const prevSpeed = s.speed;
  const auto = input.driveMode === 'auto';
  let target: number;
  if (auto) {
    target =
      s.speed <= AUTO_CRUISE_SPEED
        ? towards(s.speed, AUTO_CRUISE_SPEED, AUTO_DEPARTURE_ACCEL * h)
        : towards(s.speed, AUTO_CRUISE_SPEED, MANUAL_BRAKING * h);
  } else {
    const thrust: TrainDirection | null =
      input.w !== input.s ? (input.w ? 'forward' : 'reverse') : null;
    // The direction only ever changes while the train stands still (Requirement 21.7).
    if (thrust !== null && thrust !== s.direction && s.speed === 0) s.direction = thrust;
    target =
      thrust === s.direction
        ? towards(s.speed, MANUAL_TOP_SPEED, MANUAL_ACCEL * h)
        : towards(s.speed, 0, MANUAL_BRAKING * h);
  }

  const braking = auto ? DEAD_END_BRAKING : MANUAL_DEAD_END_BRAKING;
  const free = freeDistance(g, s.loco, s.direction);
  const envelope = free === Infinity ? Infinity : Math.sqrt(2 * braking * free);
  // A train standing within DEAD_END_SNAP of the dead end ahead is resting
  // against it (the snap can leave a rounding residue such as 1e-17). It
  // stays still, so a key held toward the dead end neither creeps nor
  // bumps again (Requirements 21.6, 26.4).
  const resting = prevSpeed === 0 && free <= DEAD_END_SNAP;
  let speed = resting ? 0 : Math.min(target, envelope);
  const step = Math.min(speed * h, free);
  moveLoco(g, s, step);

  // Arrival: the leading end reached (or came to rest within DEAD_END_SNAP of)
  // the dead end while the train was moving. Snap exactly onto it.
  const remaining = free - step;
  const arrived = remaining <= DEAD_END_SNAP && (prevSpeed > 0 || speed > 0);
  if (arrived) {
    moveLoco(g, s, remaining);
    speed = 0;
  }
  s.speed = speed;

  if (arrived) s.deadEnd = s.direction;
  else if (step > 0) s.deadEnd = null;

  // Phase bookkeeping.
  if (auto) {
    if (arrived) {
      s.phase = 'paused';
      s.pauseLeft = AUTO_PAUSE;
    } else if (envelope < target) {
      s.phase = 'braking';
    } else {
      s.phase = speed > 0 ? 'running' : 'stopped';
    }
  } else if (speed === 0) {
    s.phase = 'stopped';
  } else {
    s.phase = speed < prevSpeed ? 'braking' : 'running';
  }

  // Events.
  if (prevSpeed === 0 && speed > 0) emitDeparture(s, events);
  if (speed > 0 && !s.chugging) {
    events.push('chugStart');
    s.chugging = true;
  }
  if (arrived) events.push('bump');
  if (speed === 0 && s.chugging) {
    events.push('chugStop');
    s.chugging = false;
  }
}

/**
 * Advances the simulation by one frame. `dt` is clamped to 0.1 s and
 * integrated in 1/120 s sub-steps plus one shorter sub-step for the
 * remainder. Non-finite or non-positive `dt` advances nothing (a drive-mode
 * switch still applies). A parked train does not move.
 */
export function stepTrain(g: TrackGraph, sim: TrainSim, input: DriveInput, dt: number): StepResult {
  const s = cloneSim(sim);
  const events: TrainEvent[] = [];
  if (s.phase === 'parked') return { sim: s, events };

  switchDriveMode(g, s, input.driveMode);

  const total = Number.isFinite(dt) && dt > 0 ? Math.min(dt, MAX_FRAME_DT) : 0;
  const whole = Math.floor(total / SUB_STEP + EPS);
  const rest = total - whole * SUB_STEP;
  for (let i = 0; i < whole; i++) subStep(g, s, input, SUB_STEP, events);
  if (rest > 1e-12) subStep(g, s, input, rest, events);
  return { sim: s, events };
}

/**
 * World poses of [locomotive, carriage 1, carriage 2]. Carriage centres lie
 * 0.95 and 1.85 behind the locomotive centre along the track; past a dead end
 * they continue on the straight extension (Requirement 19.10).
 */
export function vehiclePoses(g: TrackGraph, sim: TrainSim): VehiclePose[] {
  const offsets: Array<[VehicleKind, number]> = [
    ['locomotive', 0],
    ['carriage1', -LOCO_TO_CARRIAGE1],
    ['carriage2', -(LOCO_TO_CARRIAGE1 + CARRIAGE1_TO_CARRIAGE2)],
  ];
  return offsets.map(([vehicle, dist]) => {
    const p = walkPose(g, sim.loco, dist);
    return { vehicle, x: p.x, z: p.z, tangent: p.tangent, onTrack: p.onTrack, pieceId: p.pieceId };
  });
}

/** The `getTrain()` result for this simulation state. */
export function snapshot(g: TrackGraph, sim: TrainSim): TrainSnapshot {
  const length = lengthOf(g, sim.loco.pieceId);
  const raw = length > 0 ? sim.loco.s / length : 0;
  const progress = Number.isFinite(raw) ? Math.min(1, Math.max(0, raw)) : 0;
  return {
    pieceId: sim.loco.pieceId,
    progress,
    moving: sim.speed > 0,
    direction: sim.direction,
    speed: sim.speed,
  };
}
