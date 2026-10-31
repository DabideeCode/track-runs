import type { SoundName } from '@/game/types'

export interface SoundOutput {
  play(name: SoundName): void
  /** Called each frame in Play mode with the train's speed; 0 stops the loop. */
  trainSpeed(speed: number): void
}

const log: SoundName[] = []
let output: SoundOutput | null = null

export const setSoundOutput = (next: SoundOutput | null) => {
  output = next
}

/** Records the event and plays it. The log is kept even while muted or before audio can start. */
export const playSound = (name: SoundName) => {
  log.push(name)
  output?.play(name)
}

export const setTrainSoundSpeed = (speed: number) => output?.trainSpeed(speed)

export const getSoundLog = () => [...log]

export const clearSoundLog = () => {
  log.length = 0
}
