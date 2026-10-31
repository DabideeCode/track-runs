import { locateOnChain, samplePath, type Chain, type Pose } from './trackPath'
import type { DriveMode, TrainReport } from './types'

export const CRUISE_SPEED = 1.5
export const MANUAL_TOP_SPEED = 2
const AUTO_PAUSE = 1
const ACCELERATION = 3
const AUTO_BRAKE = 1.5
const MANUAL_BRAKE = 5
const ARRIVED = 0.002
const MAX_STEP = 1 / 60
const MOVING = 0.001

/** Half the locomotive: its nose is this far ahead of its centre. */
const LOCO_HALF = 0.45
const CARRIAGE_OFFSETS = [0.95, 1.85]
/** Locomotive centre to the tail of the last carriage. */
const TRAIN_TAIL = 2.25

export interface TrainState {
  chain: Chain
  s: number
  speed: number
  /** +1 is forward, the locomotive leading. */
  dir: 1 | -1
  pause: number
  arrived: boolean
  minS: number
  maxS: number
}

export interface DriveInput {
  driveMode: DriveMode
  forward: boolean
  reverse: boolean
}

export type TrainEvent = 'bump'

export const createTrain = (chain: Chain): TrainState => {
  const s = chain.stationS
  return {
    chain,
    s,
    speed: 0,
    dir: 1,
    pause: 0,
    arrived: false,
    // Starting from a short stub, reverse only as far as the start point.
    minS: Math.min(TRAIN_TAIL, s),
    maxS: Math.max(chain.length - LOCO_HALF, s),
  }
}

/** Distance left in the given direction before the leading end reaches the end of the track. */
const roomAhead = (train: TrainState, dir: 1 | -1) => {
  if (train.chain.closed) return Infinity
  return dir > 0 ? train.maxS - train.s : train.s - train.minS
}

const arriveIfAtEnd = (train: TrainState, room: number, events: TrainEvent[]) => {
  if (room > ARRIVED) {
    train.arrived = false
    return false
  }
  train.s = train.dir > 0 ? train.maxS : train.minS
  train.speed = 0
  if (!train.arrived) events.push('bump')
  train.arrived = true
  return true
}

const advance = (train: TrainState, dt: number) => {
  train.s += train.dir * train.speed * dt
}

const stepAuto = (train: TrainState, dt: number, events: TrainEvent[]) => {
  if (train.pause > 0) {
    train.pause -= dt
    if (train.pause <= 0) {
      train.pause = 0
      train.dir = train.dir > 0 ? -1 : 1
      train.arrived = false
    }
    return
  }
  const room = roomAhead(train, train.dir)
  if (arriveIfAtEnd(train, room, events)) {
    train.pause = AUTO_PAUSE
    return
  }
  train.speed = Math.min(
    train.speed + ACCELERATION * dt,
    CRUISE_SPEED,
    Math.sqrt(2 * AUTO_BRAKE * room),
  )
  advance(train, dt)
}

const stepManual = (train: TrainState, dt: number, input: DriveInput, events: TrainEvent[]) => {
  train.pause = 0
  const wanted = input.forward === input.reverse ? 0 : input.forward ? 1 : -1

  if (wanted === 0 || (wanted !== train.dir && train.speed > 0)) {
    train.speed = Math.max(0, train.speed - MANUAL_BRAKE * dt)
  } else {
    train.dir = wanted
    train.speed = Math.min(train.speed + ACCELERATION * dt, MANUAL_TOP_SPEED)
  }

  const room = roomAhead(train, train.dir)
  if (train.speed === 0 && wanted === 0) return
  if (arriveIfAtEnd(train, room, events)) return
  train.speed = Math.min(train.speed, Math.sqrt(2 * MANUAL_BRAKE * room))
  advance(train, dt)
}

export const stepTrain = (train: TrainState, dt: number, input: DriveInput): TrainEvent[] => {
  const events: TrainEvent[] = []
  let left = dt
  while (left > 1e-9) {
    const step = Math.min(left, MAX_STEP)
    if (input.driveMode === 'auto') stepAuto(train, step, events)
    else stepManual(train, step, input, events)
    left -= step
  }
  return events
}

export const trainReport = (train: TrainState): TrainReport => ({
  ...locateOnChain(train.chain, train.s),
  moving: train.speed > MOVING,
  direction: train.dir > 0 ? 'forward' : 'reverse',
  speed: train.speed,
})

/** Locomotive then carriages. */
export const trainPoses = (train: TrainState): Pose[] => [
  samplePath(train.chain, train.s, 0.5),
  ...CARRIAGE_OFFSETS.map((offset) => samplePath(train.chain, train.s - offset, 0.45)),
]
