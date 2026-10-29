// Every sound goes through here so the test hook sees exactly what the user hears (§10.2).

export type SoundName =
  | 'pickup'
  | 'place'
  | 'move'
  | 'rotate'
  | 'delete'
  | 'snap'
  | 'invalid'
  | 'ui'
  | 'whistle'
  | 'chug'
  | 'bump'

const LOG_LIMIT = 2000
let log: SoundName[] = []
let player: ((name: SoundName) => void) | null = null

export function playSound(name: SoundName) {
  log.push(name)
  if (log.length > LOG_LIMIT) log = log.slice(-LOG_LIMIT)
  player?.(name)
}

export function getSoundLog(): string[] {
  return [...log]
}

export function clearSoundLog() {
  log = []
}

export function setSoundPlayer(fn: ((name: SoundName) => void) | null) {
  player = fn
}
