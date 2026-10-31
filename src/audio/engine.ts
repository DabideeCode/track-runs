import { Howl, Howler } from 'howler'
import { useGame } from '@/game/store'
import type { SoundName } from '@/game/types'
import { setSoundOutput } from './log'

const SFX_NAMES = [
  'pickup',
  'place',
  'move',
  'rotate',
  'delete',
  'snap',
  'invalid',
  'ui',
  'whistle',
  'bump',
] as const

const sfxUrl = (name: string, extension = 'mp3') => `/assets/audio/sfx/${name}.${extension}`

const MUSIC_URL = '/assets/audio/music/life-of-riley.mp3'
const CHUG_TOP_SPEED = 2

let sfx: Partial<Record<SoundName, Howl>> = {}
let chug: Howl | null = null
let chugId: number | undefined
let music: Howl | null = null

const settings = () => useGame.getState().audio

const applySettings = () => {
  const { muted, musicVolume } = settings()
  Howler.mute(muted)
  music?.volume(musicVolume)
}

const createSounds = () => {
  // Howler builds its AudioContext on the first Howl, so nothing here runs before a user gesture.
  sfx = Object.fromEntries(
    SFX_NAMES.map((name) => [name, new Howl({ src: [sfxUrl(name)], preload: true })]),
  )
  chug = new Howl({ src: [sfxUrl('chug', 'ogg'), sfxUrl('chug')], loop: true, preload: true })
  music = new Howl({
    src: [MUSIC_URL],
    loop: true,
    html5: true,
    volume: settings().musicVolume,
  })
  applySettings()
  music.play()
}

const stopChug = () => {
  if (chugId === undefined) return
  chug?.stop(chugId)
  chugId = undefined
}

const setChugSpeed = (speed: number) => {
  if (!chug) return
  if (speed <= 0 || document.hidden) {
    stopChug()
    return
  }
  chugId ??= chug.play()
  const pace = Math.min(1, speed / CHUG_TOP_SPEED)
  chug.volume(settings().sfxVolume * (0.2 + 0.8 * pace), chugId)
  chug.rate(0.75 + 0.55 * pace, chugId)
}

const play = (name: SoundName) => {
  if (name === 'chug') return
  const howl = sfx[name]
  if (!howl) return
  howl.play()
  howl.volume(settings().sfxVolume)
}

/** Waits for the first user gesture, then starts audio. Safe to call once at startup. */
export const startAudioEngine = () => {
  setSoundOutput({ play, trainSpeed: setChugSpeed })

  const unlock = () => {
    window.removeEventListener('pointerdown', unlock, true)
    window.removeEventListener('keydown', unlock, true)
    createSounds()
  }
  window.addEventListener('pointerdown', unlock, true)
  window.addEventListener('keydown', unlock, true)

  useGame.subscribe((state, previous) => {
    if (state.audio !== previous.audio) applySettings()
  })
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopChug()
  })
}
