import { useGameStore } from '@/store/gameStore'
import type { AudioSettings } from '@/game/persistence'
import { setMusicVolume, startMusic } from './music'
import { ensureSfxContext, playSfx, resumeSfx, setSfxVolume } from './sfx'
import { setSoundPlayer } from './soundBus'

export function applyAudioSettings(s: AudioSettings) {
  setSfxVolume(s.muted ? 0 : s.sfx / 100)
  setMusicVolume(s.music / 100, s.muted)
}

let installed = false

/** Wire the sound bus to the synthesiser and start audio on the first user gesture (AC-12.6). */
export function installAudio() {
  if (installed) return
  installed = true
  setSoundPlayer(playSfx)
  applyAudioSettings(useGameStore.getState().audio)
  useGameStore.subscribe((s, prev) => {
    if (s.audio !== prev.audio) applyAudioSettings(s.audio)
  })

  const unlock = () => {
    window.removeEventListener('pointerdown', unlock, true)
    window.removeEventListener('keydown', unlock, true)
    ensureSfxContext()
    resumeSfx()
    startMusic().catch((err) => console.warn('[Track] Music could not start.', err))
  }
  window.addEventListener('pointerdown', unlock, true)
  window.addEventListener('keydown', unlock, true)
}
