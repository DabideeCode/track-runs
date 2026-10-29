// The running train (D17): mutated every frame by the scene, read by the test hook.
import { createTrain, trainInfo, type TrainInfo, type TrainSim } from './train'
import type { Mode, Piece, StartFacing } from './types'

export const trainRuntime: { sim: TrainSim | null } = { sim: null }

/** Start a fresh run from the station (entering Play mode). */
export function startTrain(pieces: Piece[], startFacing: StartFacing) {
  trainRuntime.sim = createTrain(pieces, startFacing)
}

export function stopTrain() {
  trainRuntime.sim = null
}

/** The train as §10.2 `getTrain()` reports it: running in Play mode, parked at the station in Build mode. */
export function getTrainInfo(mode: Mode, pieces: Piece[], startFacing: StartFacing): TrainInfo | null {
  const sim = mode === 'play' && trainRuntime.sim ? trainRuntime.sim : createTrain(pieces, startFacing)
  return sim ? trainInfo(sim, pieces) : null
}
