import { isTrack } from './catalogue'
import { buildTileIndex, trackNeighbour, type TileIndex } from './connections'
import { opposite } from './grid'
import { pathEnds, pathLength, samplePath, type PathSample } from './trackPath'
import type { DriveMode, Piece, StartFacing } from './types'

// Train geometry (D14): loco 0.9 long, carriages 0.8, gaps 0.1.
export const NOSE = 0.45
export const TAIL = 2.25
export const CARRIAGE_OFFSETS = [0, 0.95, 1.85] as const

// Kinematics (D15), tiles/s and tiles/s².
export const AUTO_SPEED = 1.5
export const AUTO_ACCEL = 3
export const MANUAL_SPEED = 2
export const MANUAL_ACCEL = 2.5
export const MANUAL_BRAKE = 5
export const END_PAUSE = 1
const LOOKAHEAD = 12
const EPS = 1e-4

export interface TrackCursor {
  pieceId: string
  u: number
}

export interface TrainSim {
  cursor: TrackCursor
  /** +1 when the locomotive faces +u on its current piece. */
  facing: 1 | -1
  /** Signed speed: positive = forward (locomotive leads). */
  v: number
  autoDir: 1 | -1
  pauseLeft: number
  wasMoving: boolean
  lastDir: 1 | -1
  lastDrive: DriveMode
}

export interface TrainInput {
  drive: DriveMode
  fwd: boolean
  rev: boolean
}

export type TrainEvent = 'chug' | 'bump'

export interface TrainInfo {
  pieceId: string
  progress: number
  moving: boolean
  direction: 'forward' | 'reverse'
  speed: number
}

const indexCache = new WeakMap<Piece[], { index: TileIndex; byId: Map<string, Piece> }>()

function lookup(pieces: Piece[]) {
  let entry = indexCache.get(pieces)
  if (!entry) {
    entry = { index: buildTileIndex(pieces), byId: new Map(pieces.map((p) => [p.id, p])) }
    indexCache.set(pieces, entry)
  }
  return entry
}

export function createTrain(pieces: Piece[], startFacing: StartFacing): TrainSim | null {
  const station = pieces.find((p) => p.type === 'station')
  if (!station) return null
  return {
    cursor: { pieceId: station.id, u: pathLength('station') / 2 },
    // The station's first canonical connector is its (rotated) north one, at u = 0.
    facing: startFacing === 0 ? -1 : 1,
    v: 0,
    autoDir: 1,
    pauseLeft: 0,
    wasMoving: false,
    lastDir: 1,
    lastDrive: 'auto',
  }
}

export interface WalkResult {
  cursor: TrackCursor
  /** Travel sign in the final piece's canonical frame. */
  sign: 1 | -1
  moved: number
  blocked: boolean
}

/** Follow connected track from `cursor` for `distance` tiles, travelling in the `sign` direction of u. */
export function walk(pieces: Piece[], cursor: TrackCursor, distance: number, sign: 1 | -1): WalkResult {
  const { index, byId } = lookup(pieces)
  const startPiece = byId.get(cursor.pieceId)
  let u = cursor.u
  let s = sign
  let left = Math.max(0, distance)
  let moved = 0
  if (!startPiece) return { cursor, sign, moved: 0, blocked: true }
  let piece: Piece = startPiece

  for (;;) {
    const length = pathLength(piece.type)
    const room = s > 0 ? length - u : u
    if (left <= room) {
      u += s * left
      return { cursor: { pieceId: piece.id, u }, sign: s, moved: moved + left, blocked: false }
    }
    left -= room
    moved += room
    u = s > 0 ? length : 0
    const ends = pathEnds(piece)
    const exit = s > 0 ? ends.endDir : ends.startDir
    const next: Piece | null = exit ? trackNeighbour(index, piece, exit) : null
    if (!exit || !next || !isTrack(next.type)) {
      return { cursor: { pieceId: piece.id, u }, sign: s, moved, blocked: true }
    }
    const entry = opposite(exit)
    piece = next
    if (pathEnds(next).startDir === entry) {
      u = 0
      s = 1
    } else {
      u = pathLength(next.type)
      s = -1
    }
  }
}

/** Track distance available from `cursor` travelling in `sign` direction, capped at `max`. */
export function distanceToEnd(pieces: Piece[], cursor: TrackCursor, sign: 1 | -1, max = LOOKAHEAD): number {
  const r = walk(pieces, cursor, max, sign)
  return r.blocked ? r.moved : max
}

const approach = (value: number, target: number, step: number) =>
  value < target ? Math.min(target, value + step) : Math.max(target, value - step)

/** Advance the simulation by dt seconds. Mutates `sim`; returns sound events. */
export function stepTrain(sim: TrainSim, pieces: Piece[], dt: number, input: TrainInput): TrainEvent[] {
  const events: TrainEvent[] = []
  if (input.drive !== sim.lastDrive) {
    if (input.drive === 'auto') {
      sim.autoDir = sim.lastDir
      sim.pauseLeft = 0
    }
    sim.lastDrive = input.drive
  }

  const front = distanceToEnd(pieces, sim.cursor, sim.facing, LOOKAHEAD + NOSE) - NOSE
  const back = distanceToEnd(pieces, sim.cursor, (-sim.facing) as 1 | -1, LOOKAHEAD + TAIL) - TAIL
  const roomFwd = Math.max(0, front)
  const roomRev = Math.max(0, back)

  let v = sim.v
  let brake: number
  if (input.drive === 'auto') {
    brake = AUTO_ACCEL
    if (sim.pauseLeft > 0) {
      sim.pauseLeft -= dt
      v = 0
      if (sim.pauseLeft <= 0) {
        sim.pauseLeft = 0
        sim.autoDir = (-sim.autoDir) as 1 | -1
      }
    } else {
      v = approach(v, sim.autoDir * AUTO_SPEED, AUTO_ACCEL * dt)
    }
  } else {
    brake = MANUAL_BRAKE
    const target = input.fwd && !input.rev ? MANUAL_SPEED : input.rev && !input.fwd ? -MANUAL_SPEED : 0
    const speedingUp = target !== 0 && Math.sign(target) === Math.sign(v || target) && Math.abs(target) > Math.abs(v)
    v = approach(v, target, (speedingUp ? MANUAL_ACCEL : MANUAL_BRAKE) * dt)
  }

  // Ease to a stop at the end of the line: never faster than the braking curve allows.
  v = Math.min(v, Math.sqrt(2 * brake * roomFwd))
  v = Math.max(v, -Math.sqrt(2 * brake * roomRev))

  if (v > 0) {
    const r = walk(pieces, sim.cursor, Math.min(v * dt, roomFwd), sim.facing)
    sim.cursor = r.cursor
    sim.facing = r.sign
  } else if (v < 0) {
    const r = walk(pieces, sim.cursor, Math.min(-v * dt, roomRev), (-sim.facing) as 1 | -1)
    sim.cursor = r.cursor
    sim.facing = (-r.sign) as 1 | -1
  }

  // Which way the train is trying to go; used to detect arriving at (or waiting at) an end.
  const intended =
    v !== 0 ? Math.sign(v) : input.drive === 'auto' ? sim.autoDir : input.fwd !== input.rev ? (input.fwd ? 1 : -1) : sim.lastDir
  const room = intended > 0 ? roomFwd - Math.max(0, v) * dt : roomRev + Math.min(0, v) * dt
  const arrived = room <= EPS && Math.abs(v) < 0.05
  if (arrived) v = 0

  const moving = Math.abs(v) > EPS
  if (moving && !sim.wasMoving) events.push('chug')
  if (arrived && sim.wasMoving) events.push('bump')
  // Auto: pause at the end, then reverse. If the other way is blocked too, keep waiting silently.
  if (input.drive === 'auto' && arrived && sim.pauseLeft === 0) sim.pauseLeft = END_PAUSE

  sim.v = v
  sim.wasMoving = moving
  if (v !== 0) sim.lastDir = v > 0 ? 1 : -1
  return events
}

function poseAt(pieces: Piece[], cursor: TrackCursor, back: number, facing: 1 | -1): PathSample {
  const { byId } = lookup(pieces)
  const r = walk(pieces, cursor, back, (-facing) as 1 | -1)
  const piece = byId.get(r.cursor.pieceId)!
  const at = samplePath(piece, r.cursor.u)
  // Heading of the vehicle's front: opposite to the direction we walked to reach it.
  const travel = r.sign > 0 ? at.heading : at.heading + Math.PI
  const remaining = back - r.moved
  return {
    x: at.x + Math.sin(travel) * remaining,
    z: at.z + Math.cos(travel) * remaining,
    heading: travel + Math.PI,
  }
}

/** World poses for the locomotive and both carriages; headings point to each vehicle's front. */
export function trainPoses(sim: TrainSim, pieces: Piece[]): PathSample[] {
  return CARRIAGE_OFFSETS.map((offset) => poseAt(pieces, sim.cursor, offset, sim.facing))
}

export function trainInfo(sim: TrainSim, pieces: Piece[]): TrainInfo {
  const { pieceId, u } = sim.cursor
  return {
    pieceId,
    progress: u / pathLength(lookup(pieces).byId.get(pieceId)?.type ?? 'straight'),
    moving: Math.abs(sim.v) > EPS,
    direction: sim.lastDir > 0 ? 'forward' : 'reverse',
    speed: Math.abs(sim.v),
  }
}
