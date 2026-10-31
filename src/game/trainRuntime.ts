import { playSound, setTrainSoundSpeed } from '@/audio/log'
import { buildChain, type Chain, type Pose } from './trackPath'
import {
  createTrain,
  stepTrain,
  trainPoses,
  trainReport,
  type TrainState,
} from './train'
import type { DriveMode, Piece, StartFacing, TrainReport } from './types'

const MAX_FRAME = 0.5

let train: TrainState | null = null
let getDriveMode: () => DriveMode = () => 'auto'
let wasMoving = false
let frame = 0
let lastTime = 0
const keys = { forward: false, reverse: false }

const chainFor = (pieces: Piece[], facing: StartFacing): Chain | null => {
  const station = pieces.find((piece) => piece.type === 'station')
  return station ? buildChain(pieces, station.id, facing) : null
}

const tick = (dt: number) => {
  if (!train) return
  const events = stepTrain(train, Math.min(dt, MAX_FRAME), { driveMode: getDriveMode(), ...keys })
  for (const event of events) playSound(event)
  const report = trainReport(train)
  if (report.moving && !wasMoving) playSound('chug')
  wasMoving = report.moving
  setTrainSoundSpeed(report.speed)
}

const loop = (time: number) => {
  tick((time - lastTime) / 1000)
  lastTime = time
  frame = requestAnimationFrame(loop)
}

/** The train in Play mode. It runs on its own frame loop so it never depends on WebGL. */
export const trainRuntime = {
  tick,

  start(pieces: Piece[], facing: StartFacing, driveMode: () => DriveMode) {
    const chain = chainFor(pieces, facing)
    if (!chain) return
    train = createTrain(chain)
    getDriveMode = driveMode
    wasMoving = false
    this.clearKeys()
    if (typeof requestAnimationFrame === 'function') {
      lastTime = performance.now()
      frame = requestAnimationFrame(loop)
    }
  },

  stop() {
    if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame)
    train = null
    wasMoving = false
    this.clearKeys()
    setTrainSoundSpeed(0)
  },

  setKey(key: keyof typeof keys, down: boolean) {
    keys[key] = down
  },

  clearKeys() {
    keys.forward = false
    keys.reverse = false
  },

  report(pieces: Piece[], facing: StartFacing): TrainReport | null {
    if (train) return trainReport(train)
    const chain = chainFor(pieces, facing)
    return chain ? trainReport(createTrain(chain)) : null
  },

  /** Poses for the three vehicles, parked at the station outside Play mode. */
  poses(pieces: Piece[], facing: StartFacing): Pose[] | null {
    if (train) return trainPoses(train)
    const chain = chainFor(pieces, facing)
    return chain ? trainPoses(createTrain(chain)) : null
  },

  speed: () => train?.speed ?? 0,
  direction: () => train?.dir ?? 1,
}
